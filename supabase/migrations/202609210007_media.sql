begin;
create table public.media_assets (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 storage_path text not null unique, kind text not null check(kind in ('logo','cover','offer','payment_proof')),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')), bytes bigint not null check(bytes between 1 and 5242880),
 width integer check(width>0), height integer check(height>0), uploaded_by uuid not null references public.profiles(user_id),
 validation_status text not null default 'pending' check(validation_status in ('pending','accepted','rejected')),
 visibility text not null check(visibility in ('public_brand','private')), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0), unique(business_id,id),
 check(kind<>'payment_proof' or visibility='private'), check((width is null)=(height is null)),
 check(width::bigint*height::bigint<=20000000), check(validation_status<>'accepted' or (width is not null and height is not null)),
 check(validation_status<>'accepted' or visibility<>'private' or bytes<=3145728)
);
alter table public.businesses add foreign key(id,logo_asset_id) references public.media_assets(business_id,id),
 add foreign key(id,cover_asset_id) references public.media_assets(business_id,id);
create table app_private.media_uploads (
 asset_id uuid primary key references public.media_assets, original_path text not null unique,
 expires_at timestamptz not null, submitted_at timestamptz, purged_at timestamptz
);
alter table public.media_assets enable row level security;
revoke all on public.media_assets from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
revoke all on app_private.media_uploads from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function app_private.asset_pointer() returns trigger language plpgsql set search_path='' as $$
begin
 if new.logo_asset_id is not null and not exists(select from public.media_assets where business_id=new.id and id=new.logo_asset_id and kind='logo' and validation_status='accepted' and visibility='public_brand')
 or new.cover_asset_id is not null and not exists(select from public.media_assets where business_id=new.id and id=new.cover_asset_id and kind='cover' and validation_status='accepted' and visibility='public_brand') then
 raise exception 'invalid_asset' using errcode='23514'; end if;
 return new;
end $$;
create trigger valid_asset_pointer before insert or update on public.businesses for each row execute function app_private.asset_pointer();

create function public.reserve_media(p_business_id uuid,p_kind text,p_mime_type text,p_bytes bigint,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; asset uuid; path text; limited jsonb;
begin
 staff:=app_private.authorize(p_business_id,null,true);
 limited:=app_private.limit_action('media_upload',p_business_id,10); if limited is not null then return limited; end if;
 begin
 asset:=gen_random_uuid(); path:=p_business_id::text||'/'||asset::text||'/original';
 insert into public.media_assets(id,business_id,storage_path,kind,mime_type,bytes,uploaded_by,visibility)
 values(asset,p_business_id,path,p_kind,p_mime_type,p_bytes,staff.user_id,case when p_kind='payment_proof' then 'private' else 'public_brand' end);
 insert into app_private.media_uploads(asset_id,original_path,expires_at) values(asset,path,clock_timestamp()+interval '24 hours');
 perform app_private.audit(p_business_id,'media.reserved','media_asset',asset,p_correlation_id);
 return jsonb_build_object('assetId',asset,'bucket','loyalty-quarantine','path',path,'status','pending');
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $$;

-- Storage INSERT grants authorize only one exact reserved path, not a tenant prefix.
create function public.can_upload_media(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
declare asset public.media_assets;
begin
 select a.* into asset from public.media_assets a join app_private.media_uploads g on g.asset_id=a.id
 where g.original_path=p_path and g.expires_at>clock_timestamp() and g.submitted_at is null and a.validation_status='pending';
 if not found then return false; end if;
 perform app_private.authorize(asset.business_id,null,true);
 return asset.uploaded_by=app_private.actor(true);
exception when insufficient_privilege or no_data_found then return false;
end $$;
create function public.submit_media(p_asset_id uuid,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.media_assets;
begin
 select * into asset from public.media_assets where id=p_asset_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform app_private.authorize(asset.business_id,null,true);
 if asset.uploaded_by<>app_private.actor(true) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from app_private.media_uploads where asset_id=asset.id and expires_at>clock_timestamp() for update;
 if not found then raise exception 'expired' using errcode='22023'; end if;
 if not exists(select from storage.objects o where o.bucket_id='loyalty-quarantine' and o.name=asset.storage_path) then raise exception 'upload_missing' using errcode='22023'; end if;
 update app_private.media_uploads set submitted_at=coalesce(submitted_at,clock_timestamp()) where asset_id=asset.id;
 insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload)
 values(asset.business_id,'media.validate',asset.id::text,1,jsonb_build_object('assetId',asset.id)) on conflict(event_type,event_key) do nothing;
 perform app_private.audit(asset.business_id,'media.submitted','media_asset',asset.id,p_correlation_id);
 return jsonb_build_object('assetId',asset.id,'status',asset.validation_status);
end $$;
create function public.media_status(p_asset_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.media_assets;
begin
 select * into asset from public.media_assets where id=p_asset_id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform app_private.authorize(asset.business_id,null,true);
 return jsonb_build_object('assetId',asset.id,'status',asset.validation_status,'kind',asset.kind);
end $$;
create function public.attach_brand_media(p_business_id uuid,p_asset_id uuid,p_row_version integer,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.media_assets;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 perform app_private.authorize(p_business_id,null,true);
 select * into asset from public.media_assets where business_id=p_business_id and id=p_asset_id and kind in ('logo','cover') and validation_status='accepted';
 if not found then raise exception 'invalid_asset' using errcode='22023'; end if;
 update public.businesses set logo_asset_id=case when asset.kind='logo' then asset.id else logo_asset_id end,
 cover_asset_id=case when asset.kind='cover' then asset.id else cover_asset_id end,updated_at=clock_timestamp(),row_version=row_version+1
 where id=p_business_id and row_version=p_row_version;
 if not found then raise exception 'conflict' using errcode='40001'; end if;
 perform app_private.audit(p_business_id,'media.attached','media_asset',asset.id,p_correlation_id);
 return jsonb_build_object('assetId',asset.id);
end $$;

create function public.worker_media_job(p_outbox_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare event public.outbox_events; asset public.media_assets; grant_row app_private.media_uploads;
begin
 select * into strict event from public.outbox_events where id=p_outbox_id;
 if event.event_type<>'media.validate' or event.schema_version<>1 or event.payload<>jsonb_build_object('assetId',event.event_key::uuid) then raise exception 'invalid_event' using errcode='22023'; end if;
 select * into strict asset from public.media_assets where id=event.event_key::uuid and business_id=event.business_id;
 select * into strict grant_row from app_private.media_uploads where asset_id=asset.id;
 if asset.validation_status<>'pending' then return null; end if;
 return jsonb_build_object('id',asset.id,'businessId',asset.business_id,'kind',asset.kind,'mimeType',asset.mime_type,'bytes',asset.bytes::text,
 'originalPath',grant_row.original_path,'expired',grant_row.expires_at<=clock_timestamp(),'visibility',asset.visibility,
 'outputPath',asset.business_id::text||'/'||asset.id::text||'/v1.webp');
end $$;
create function public.worker_finish_media(p_outbox_id uuid,p_accepted boolean,p_bytes bigint,p_width integer,p_height integer)
returns void language plpgsql security definer set search_path='' as $$
declare job jsonb; asset uuid; bid uuid;
begin
 job:=public.worker_media_job(p_outbox_id); if job is null then return; end if;
 if (job->>'expired')::boolean then p_accepted:=false; end if;
 asset:=(job->>'id')::uuid; bid:=(job->>'businessId')::uuid;
 update public.media_assets set validation_status=case when p_accepted then 'accepted' else 'rejected' end,
 storage_path=case when p_accepted then job->>'outputPath' else storage_path end,
 mime_type=case when p_accepted then 'image/webp' else mime_type end,
 bytes=case when p_accepted then p_bytes else bytes end,width=case when p_accepted then p_width else null end,height=case when p_accepted then p_height else null end,
 updated_at=clock_timestamp(),row_version=row_version+1 where id=asset and validation_status='pending';
 insert into public.job_effect_receipts(business_id,handler_name,event_key,completed_at,result_reference)
 values(bid,'media.validate',asset::text,clock_timestamp(),asset) on conflict(handler_name,event_key) do nothing;
end $$;
create function public.worker_expired_media() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('assetId',asset_id,'path',original_path)),'[]'::jsonb) from
 (select asset_id,original_path from app_private.media_uploads where expires_at<=clock_timestamp() and purged_at is null order by expires_at limit 100) g
$$;
create function public.worker_mark_media_purged(p_asset_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update app_private.media_uploads set purged_at=clock_timestamp() where asset_id=p_asset_id and expires_at<=clock_timestamp();
 if found then update public.media_assets set validation_status='rejected',updated_at=clock_timestamp(),row_version=row_version+1 where id=p_asset_id and validation_status='pending'; end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('loyalty-quarantine','loyalty-quarantine',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('loyalty-brand','loyalty-brand',true,3145728,array['image/webp']),
 ('loyalty-private','loyalty-private',false,3145728,array['image/webp']);
create policy loyalty_quarantine_insert on storage.objects for insert to authenticated
 with check(bucket_id='loyalty-quarantine' and public.can_upload_media(name));
create policy loyalty_quarantine_returning on storage.objects for select to authenticated
 using(bucket_id='loyalty-quarantine' and public.can_upload_media(name));
-- SELECT is limited to the owner's unsubmitted original (Storage INSERT RETURNING).
-- No browser UPDATE/DELETE policies: never upsert an original or rendition.
-- Public renditions are read by the public object endpoint; bucket listing remains denied.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname=any(array['reserve_media','can_upload_media','submit_media','media_status','attach_brand_media','worker_media_job','worker_finish_media','worker_expired_media','worker_mark_media_purged']) loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 if f::text like '%worker_%' then execute format('grant execute on function %s to loyalty_worker',f);
 else execute format('grant execute on function %s to authenticated',f); end if;
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
