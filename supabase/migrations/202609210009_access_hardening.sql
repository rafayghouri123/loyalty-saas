begin;
create function public.resend_staff_invitation(p_business_id uuid,p_invitation_id uuid,p_row_version integer,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw text; inv public.staff_invitations; limited jsonb;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 perform app_private.authorize(p_business_id,null,true);
 limited:=app_private.limit_action('staff_invite',p_business_id,5); if limited is not null then return limited; end if;
 begin
 if not app_private.entitled(p_business_id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 raw:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 update public.staff_invitations set token_hash=encode(extensions.digest(raw,'sha256'),'hex'),expires_at=clock_timestamp()+interval '72 hours',updated_at=clock_timestamp(),row_version=row_version+1
 where business_id=p_business_id and id=p_invitation_id and row_version=p_row_version and status='pending' and expires_at>clock_timestamp() returning * into inv;
 if not found then raise exception 'conflict' using errcode='40001'; end if;
 perform app_private.audit(p_business_id,'staff.invitation_renewed','staff_invitation',inv.id,p_correlation_id);
 return jsonb_build_object('invitationId',inv.id,'token',raw,'expiresAt',inv.expires_at,'rowVersion',inv.row_version);
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $$;
revoke all on function public.resend_staff_invitation(uuid,uuid,integer,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.resend_staff_invitation(uuid,uuid,integer,uuid) to authenticated;

create or replace function app_private.exact_owner() returns trigger language plpgsql set search_path='' as $$
declare bid uuid; ids uuid[];
begin
 if tg_table_name='businesses' then ids:=array[coalesce(new.id,old.id)];
 elsif tg_op='UPDATE' then ids:=array[old.business_id,new.business_id];
 elsif tg_op='DELETE' then ids:=array[old.business_id]; else ids:=array[new.business_id]; end if;
 foreach bid in array ids loop
 if exists(select from public.businesses where id=bid and status<>'archived') and
 (select count(*) from public.business_users where business_id=bid and role='owner' and status='active')<>1 then
 raise exception 'exactly_one_owner_required' using errcode='23514'; end if;
 end loop;
 return null;
end $$;
create function app_private.enrollment_proof() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select from public.policy_documents where id=new.platform_terms_document_id and kind='platform_terms' and published_at<=new.accepted_at and business_id is null)
 or not exists(select from public.policy_documents where id=new.privacy_document_id and kind='privacy' and published_at<=new.accepted_at and business_id is null)
 or not exists(select from public.programme_versions where business_id=new.business_id and id=new.programme_version_id and status='published')
 or not exists(select from public.memberships where business_id=new.business_id and id=new.membership_id and customer_user_id is not distinct from new.customer_user_id) then
 raise exception 'invalid_enrollment_proof' using errcode='23514'; end if;
 return new;
end $$;
create trigger enrollment_proof before insert on public.enrollment_acceptances for each row execute function app_private.enrollment_proof();
create function app_private.reward_branch_commitment() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from public.rewards r where r.published_version_id in (new.reward_version_id,old.reward_version_id)) then
 raise exception 'published_immutable' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger reward_branch_commitment before insert or update or delete on public.reward_branches for each row execute function app_private.reward_branch_commitment();

create table public.platform_admins (
 user_id uuid primary key references public.profiles(user_id),active boolean not null,
 can_reconcile_billing boolean not null,can_manage_support boolean not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1 check(row_version>0)
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
create function app_private.admin(p_fresh boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.actor(true);
 perform 1 from public.platform_admins where user_id=actor and active and can_manage_support for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if p_fresh and not exists(select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
 where a->>'method' in ('oauth','otp','totp','mfa/totp') and (a->>'timestamp') ~ '^[0-9]{1,12}$'
 and to_timestamp((a->>'timestamp')::double precision) between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '30 seconds') then
 raise exception 'reauthentication_required' using errcode='42501'; end if;
 return actor;
end $$;
-- Operator-only workflow, deliberately absent from self-service web forms. The
-- operator records the replacement's independently verified acceptance in reason.
create function public.operator_transfer_owner(p_business_id uuid,p_current_owner uuid,p_replacement_owner uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; replacement public.business_users;
begin
 actor:=app_private.admin(true);
 if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 or p_current_owner=p_replacement_owner then raise exception 'invalid_input' using errcode='22023'; end if;
 perform 1 from public.businesses where id=p_business_id and status<>'archived' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform 1 from public.business_users where business_id=p_business_id and user_id in (p_current_owner,p_replacement_owner) order by user_id for update;
 if not exists(select from public.business_users where business_id=p_business_id and user_id=p_current_owner and role='owner' and status='active') then raise exception 'conflict' using errcode='40001'; end if;
 select bu.* into replacement from public.business_users bu join public.profiles p on p.user_id=bu.user_id
 join auth.users u on u.id=p.auth_user_id where bu.business_id=p_business_id and bu.user_id=p_replacement_owner and bu.status='active'
 and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and u.deleted_at is null and p.anonymized_at is null;
 if not found then raise exception 'invalid_replacement' using errcode='22023'; end if;
 update public.business_users set status='revoked',updated_at=clock_timestamp(),row_version=row_version+1 where business_id=p_business_id and user_id=p_current_owner;
 update public.business_users set role='owner',can_manage_campaigns=false,can_contact_customers=false,can_reverse_transactions=false,can_export_reports=false,
 updated_at=clock_timestamp(),row_version=row_version+1 where id=replacement.id;
 insert into public.audit_events(business_id,actor_user_id,action,target_type,target_id,reason,safe_changes,correlation_id,occurred_at)
 values(p_business_id,actor,'business.ownership_transferred','business',p_business_id,btrim(p_reason),jsonb_build_object('previousOwner',p_current_owner,'replacementOwner',p_replacement_owner),p_correlation_id::text,clock_timestamp());
 return jsonb_build_object('businessId',p_business_id);
end $$;
create function public.my_admin_access() returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform app_private.actor(true);
 return exists(select from public.platform_admins where user_id=app_private.actor() and active);
end $$;
revoke all on function public.operator_transfer_owner(uuid,uuid,uuid,text,uuid),public.my_admin_access() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.operator_transfer_owner(uuid,uuid,uuid,text,uuid),public.my_admin_access() to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
