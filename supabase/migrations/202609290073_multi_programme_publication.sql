begin;

create or replace function public.publish_reward(p_business uuid,p_reward uuid,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reward public.rewards;
begin
 perform 1 from public.businesses where id=p_business for update;
 perform app_private.authorize(p_business,null,true);
 select * into reward from public.rewards where business_id=p_business and id=p_reward for update;
 if reward.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if not exists(select from public.loyalty_programmes p where p.business_id=p_business and p.id=reward.programme_id
   and p.status in ('published','paused')) then raise exception 'publish_complete_programme_first' using errcode='40001'; end if;
 if reward.status='published' or reward.row_version<>p_row_version or reward.draft_version_id is null
 or not exists(select from public.reward_branches rb join public.branches b on b.business_id=rb.business_id and b.id=rb.branch_id
 where rb.business_id=p_business and rb.reward_version_id=reward.draft_version_id and b.status='active') then raise exception 'conflict' using errcode='40001'; end if;
 update public.rewards set status='published',published_version_id=draft_version_id,draft_version_id=null,row_version=row_version+1,updated_at=clock_timestamp() where id=p_reward;
 perform app_private.audit(p_business,'reward.published','reward',p_reward,p_correlation);
 return jsonb_build_object('rewardId',p_reward,'rewardVersionId',reward.draft_version_id,'rowVersion',reward.row_version+1);
end $$;

commit;
