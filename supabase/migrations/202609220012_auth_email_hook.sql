begin;
create table app_private.auth_email_key(singleton boolean primary key default true check(singleton),secret bytea not null check(octet_length(secret)=32));
insert into app_private.auth_email_key(secret) values(extensions.gen_random_bytes(32));
create table app_private.auth_email_grants(
 id uuid primary key default gen_random_uuid(),token_hash text not null unique,email_hash text not null,
 callback_url text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 minutes',
 state text not null default 'waiting' check(state in ('waiting','queued','provider_accepted','expired')),
 payload_ciphertext bytea,payload_hash text,provider_id text,sent_at timestamptz
);
create index auth_email_grant_expiry on app_private.auth_email_grants(created_at);
revoke all on app_private.auth_email_key,app_private.auth_email_grants from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function public.gateway_authorize_auth_email(p_email text,p_email_subject text,p_ip_subject text,p_callback_url text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare decision jsonb; token text; secret bytea; grant_id uuid;
begin
 if p_email is null or char_length(p_email)>254 or p_email<>lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_callback_url is null or char_length(p_callback_url)>3000 or p_callback_url !~ '^https?://[^/@[:space:]]+/auth/callback\?next=' then raise exception 'invalid_input' using errcode='22023'; end if;
 decision:=public.gateway_limit_magic_link(p_email_subject,p_ip_subject);
 if not (decision->>'allowed')::boolean then return decision; end if;
 token:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 select k.secret into strict secret from app_private.auth_email_key k;
 insert into app_private.auth_email_grants(token_hash,email_hash,callback_url)
 values(encode(extensions.digest(token,'sha256'),'hex'),encode(extensions.hmac(p_email,encode(secret,'hex'),'sha256'),'hex'),p_callback_url) returning id into grant_id;
 return decision||jsonb_build_object('token',token,'grantId',grant_id);
end $$;

-- Only Supabase Auth calls this hook. Direct /otp requests cannot manufacture a
-- gateway grant and therefore cannot bypass application email/IP limits.
create function public.auth_send_email_hook(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare token text; g app_private.auth_email_grants; secret bytea; payload jsonb; digest text; redirect_to text; action text;
begin
 redirect_to:=event->'email_data'->>'redirect_to';action:=event->'email_data'->>'email_action_type';
 token:=(regexp_match(redirect_to,'[?&]email_request=([A-Za-z0-9_-]{43})$'))[1];
 if token is null or action is null or action not in ('magiclink','signup') then
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Start email sign-in from the application.')); end if;
 select * into g from app_private.auth_email_grants where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
 select k.secret into strict secret from app_private.auth_email_key k;
 if g.id is null or g.expires_at<=clock_timestamp() or redirect_to<>g.callback_url||'&email_request='||token
 or g.email_hash is distinct from encode(extensions.hmac(lower(event->'user'->>'email'),encode(secret,'hex'),'sha256'),'hex')
 or coalesce(event->'email_data'->>'token_hash','') !~ '^[a-zA-Z0-9_-]{20,200}$' then
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Email request unavailable.')); end if;
 payload:=jsonb_build_object('email',lower(event->'user'->>'email'),'tokenHash',event->'email_data'->>'token_hash','action',action,'redirectTo',g.callback_url);
 digest:=encode(extensions.digest(payload::text,'sha256'),'hex');
 if g.state<>'waiting' then
 if g.payload_hash=digest then return '{}'::jsonb; end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Email request already consumed.')); end if;
 update app_private.auth_email_grants set state='queued',payload_hash=digest,payload_ciphertext=extensions.pgp_sym_encrypt(payload::text,encode(secret,'hex'),'cipher-algo=aes256') where id=g.id;
 insert into public.outbox_events(event_type,event_key,schema_version,payload) values('auth.email_requested',g.id::text,1,jsonb_build_object('grantId',g.id));
 return '{}'::jsonb;
end $$;

create function public.worker_auth_email_job(p_outbox_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.outbox_events; g app_private.auth_email_grants; secret bytea;
begin
 select * into strict e from public.outbox_events where id=p_outbox_id;
 if e.event_type<>'auth.email_requested' or e.business_id is not null or e.schema_version<>1 or e.payload<>jsonb_build_object('grantId',e.event_key::uuid) then raise exception 'invalid_event' using errcode='22023'; end if;
 select * into g from app_private.auth_email_grants where id=e.event_key::uuid;
 if g.id is null or g.state<>'queued' then return null; end if;
 if g.created_at<clock_timestamp()-interval '10 minutes' then update app_private.auth_email_grants set state='expired',payload_ciphertext=null where id=g.id;return null;end if;
 select k.secret into strict secret from app_private.auth_email_key k;
 return extensions.pgp_sym_decrypt(g.payload_ciphertext,encode(secret,'hex'))::jsonb||jsonb_build_object('id',g.id);
end $$;
create function public.worker_finish_auth_email(p_outbox_id uuid,p_provider_id text) returns void language plpgsql security definer set search_path='' as $$
declare job jsonb;
begin
 if p_provider_id is null or p_provider_id !~ '^[a-zA-Z0-9-]{1,100}$' then raise exception 'invalid_input' using errcode='22023';end if;
 job:=public.worker_auth_email_job(p_outbox_id);if job is null then return;end if;
 update app_private.auth_email_grants set state='provider_accepted',provider_id=p_provider_id,sent_at=clock_timestamp(),payload_ciphertext=null where id=(job->>'id')::uuid and state='queued';
 insert into public.job_effect_receipts(handler_name,event_key,completed_at,result_reference) values('auth.email_requested',job->>'id',clock_timestamp(),(job->>'id')::uuid) on conflict(handler_name,event_key) do nothing;
end $$;
create function public.worker_purge_auth_email() returns void language plpgsql security definer set search_path='' as $$
begin
 update app_private.auth_email_grants set state='expired',payload_ciphertext=null where state in ('waiting','queued') and created_at<clock_timestamp()-interval '10 minutes';
 delete from app_private.auth_email_grants where created_at<clock_timestamp()-interval '24 hours';
end $$;
revoke all on function public.gateway_authorize_auth_email(text,text,text,text),public.auth_send_email_hook(jsonb),public.worker_auth_email_job(uuid),public.worker_finish_auth_email(uuid,text),public.worker_purge_auth_email() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.gateway_authorize_auth_email(text,text,text,text) to loyalty_web_gateway;
grant execute on function public.auth_send_email_hook(jsonb) to supabase_auth_admin;
grant execute on function public.worker_auth_email_job(uuid),public.worker_finish_auth_email(uuid,text),public.worker_purge_auth_email() to loyalty_worker;
commit;
