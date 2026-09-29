begin;
-- Scrub personalized scheduled content immediately on relationship/account deletion.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('app_private.suppress_member(uuid,boolean)'::regprocedure);
 execute replace(definition,' update public.campaign_recipients set status=',$new$
 update public.automation_runs set state=case when state in ('pending','processing') then 'suppressed' else state end,suppression_reason='member_unavailable',rendered_title='Deleted personal content',rendered_body='Deleted personal content' where membership_id=m.id;
 update public.membership_handles set handle_ciphertext=repeat('x',40) where membership_id=m.id;
 update public.campaign_recipients set status=$new$);
 definition:=pg_get_functiondef('app_private.restore_privacy_replay(jsonb,jsonb,jsonb)'::regprocedure);
 execute replace(definition,$old$end if;count_no:=count_no+1;$old$,$new$end if;
 update public.privacy_requests set status='completed',completed_at=coalesce(completed_at,clock_timestamp()),database_completed_at=coalesce(database_completed_at,clock_timestamp()),auth_identity_id=null,error_code=null,processing_token=null where customer_user_id=pid and kind=entry->>'kind' and membership_id is not distinct from (entry->>'membershipId')::uuid and status<>'completed';
 count_no:=count_no+1;$new$);
end $$;
commit;
