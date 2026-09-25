begin;
alter table public.campaigns add column snapshot_cursor uuid;
alter table public.campaign_recipients add column next_attempt_at timestamptz not null default now();
create index campaign_recipients_due on public.campaign_recipients(next_attempt_at,id) where status='pending';
create table app_private.campaign_schedule_keys (
 business_id uuid not null,campaign_id uuid not null,key text not null,actor_user_id uuid not null,
 request_hash text not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(business_id,key),foreign key(business_id,campaign_id) references public.campaigns(business_id,id)
);
alter table app_private.campaign_schedule_keys enable row level security;
revoke all on app_private.campaign_schedule_keys from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function public.campaign_configuration(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.communication_staff(p_business);
 return jsonb_build_object('businessId',p_business,'businessName',(select display_name from public.businesses where id=p_business),
  'timezone',(select timezone from public.businesses where id=p_business),
  'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb)
   from public.branches b where b.business_id=p_business and b.status='active' and
   (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business and a.business_user_id=staff.id and a.branch_id=b.id))),
  'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'unitCost',v.unit_cost) order by v.title),'[]'::jsonb)
   from public.rewards r join public.reward_versions v on v.id=r.published_version_id where r.business_id=p_business and r.status='published'),
  'images',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'path',a.business_id::text||'/'||a.id::text||'/v1.webp') order by a.created_at desc),'[]'::jsonb)
   from public.media_assets a where a.business_id=p_business and a.kind='offer' and a.validation_status='accepted' and a.visibility='public_brand'),
  'offers',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'expiresAt',o.expires_at) order by o.title),'[]'::jsonb)
   from public.offers o where o.business_id=p_business and o.status='published' and not o.is_automation_template
   and o.expires_at>clock_timestamp()),
  'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'status',c.status,'rowVersion',c.row_version,
   'scheduledAt',c.scheduled_at,'startedAt',c.started_at,'completedAt',c.completed_at,
   'version',v.version,'title',v.title,'body',v.body,'imageAssetId',v.image_asset_id,'destination',v.destination,'offerId',v.offer_id,
   'audience',v.audience,'inactiveDays',v.inactive_days,'nearRewardUnits',v.near_reward_units,
   'targetRewardVersionId',v.target_reward_version_id,'expiresAt',v.expires_at,
   'branchIds',(select coalesce(jsonb_agg(cb.branch_id),'[]'::jsonb) from public.campaign_branches cb where cb.campaign_version_id=v.id),
   'eligibleAudience',(select count(*) from public.campaign_recipients cr where cr.campaign_id=c.id),
   'suppressed',(select count(*) from public.campaign_recipients cr where cr.campaign_id=c.id and cr.status='suppressed'),
   'deviceAttempts',(select count(*) from public.delivery_attempts da join public.campaign_recipients cr on cr.id=da.campaign_recipient_id where cr.campaign_id=c.id),
   'providerAccepted',(select count(*) from public.delivery_attempts da join public.campaign_recipients cr on cr.id=da.campaign_recipient_id where cr.campaign_id=c.id and da.state='provider_accepted'),
   'failures',(select count(*) from public.delivery_attempts da join public.campaign_recipients cr on cr.id=da.campaign_recipient_id where cr.campaign_id=c.id and da.state in ('failed','unknown')),
   'observedClicks',(select count(*) from public.campaign_recipients cr where cr.campaign_id=c.id and cr.observed_clicked_at is not null),
   'fulfilledClaims',(select count(*) from public.offer_claims oc where oc.campaign_id=c.id and oc.status='fulfilled'))
   order by c.created_at desc,c.id desc),'[]'::jsonb)
   from public.campaigns c left join public.campaign_versions v on v.id=c.current_version_id where c.business_id=p_business));
end $$;

create function public.save_campaign(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;c public.campaigns;v public.campaign_versions;branches uuid[];bid uuid;version_no integer;tz text;o public.offers;
begin
 perform app_private.strict_keys(p_input,array['campaignId','rowVersion','name','title','body','destination','offerId','audience',
  'inactiveDays','nearRewardUnits','targetRewardVersionId','branchIds','expiresAt','imageAssetId']);
 staff:=app_private.communication_staff(p_business);
 if not app_private.entitled(p_business) then raise exception 'subscription_inactive' using errcode='42501'; end if;
 branches:=array(select jsonb_array_elements_text(p_input->'branchIds')::uuid);
 if char_length(btrim(coalesce(p_input->>'name',''))) not between 2 and 100
  or char_length(btrim(coalesce(p_input->>'title',''))) not between 3 and 80
  or char_length(btrim(coalesce(p_input->>'body',''))) not between 10 and 500
  or p_input->>'destination' not in ('card','offer')
  or p_input->>'audience' not in ('all_opted_in','inactive','reward_ready','near_reward')
  or ((p_input->>'destination'='offer')<>(p_input->>'offerId' is not null))
  or ((p_input->>'audience'='inactive')<>(p_input->>'inactiveDays' is not null))
  or ((p_input->>'audience' in ('reward_ready','near_reward'))<>(p_input->>'targetRewardVersionId' is not null))
  or ((p_input->>'audience'='near_reward')<>(p_input->>'nearRewardUnits' is not null))
  or (p_input->>'inactiveDays' is not null and (p_input->>'inactiveDays')::integer not between 7 and 365)
  or (p_input->>'nearRewardUnits' is not null and (p_input->>'nearRewardUnits')::integer not between 1 and 1000)
  or (p_input->>'expiresAt')::timestamptz<=clock_timestamp()
  or cardinality(branches)=0 or cardinality(branches)<>cardinality(array(select distinct unnest(branches)))
  then raise exception 'invalid_input' using errcode='22023'; end if;
 foreach bid in array branches loop perform app_private.authorize(p_business,bid); end loop;
 if p_input->>'offerId' is not null then
  select * into o from public.offers where business_id=p_business and id=(p_input->>'offerId')::uuid;
  if o.id is null or o.status<>'published' or o.is_automation_template or o.expires_at<=(p_input->>'expiresAt')::timestamptz
  then raise exception 'invalid_offer' using errcode='22023'; end if;
 end if;
 if p_input->>'targetRewardVersionId' is not null and not exists(select from public.rewards r
  where r.business_id=p_business and r.status='published' and r.published_version_id=(p_input->>'targetRewardVersionId')::uuid)
 then raise exception 'invalid_reward' using errcode='22023'; end if;
 select timezone into tz from public.businesses where id=p_business for update;
 if p_input->>'campaignId' is null then
  insert into public.campaigns(business_id,name,created_by) values(p_business,btrim(p_input->>'name'),staff.user_id) returning * into c;
 else
  select * into c from public.campaigns where business_id=p_business and id=(p_input->>'campaignId')::uuid for update;
  if c.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  if c.status<>'draft' or c.row_version<>(p_input->>'rowVersion')::integer then raise exception 'stale' using errcode='40001'; end if;
  update public.campaigns set name=btrim(p_input->>'name'),row_version=row_version+1,updated_at=clock_timestamp()
   where id=c.id returning * into c;
 end if;
 select coalesce(max(version),0)+1 into version_no from public.campaign_versions where campaign_id=c.id;
 insert into public.campaign_versions(business_id,campaign_id,version,title,body,image_asset_id,destination,offer_id,audience,inactive_days,
  near_reward_units,target_reward_version_id,timezone,expires_at)
 values(p_business,c.id,version_no,btrim(p_input->>'title'),btrim(p_input->>'body'),(p_input->>'imageAssetId')::uuid,p_input->>'destination',
  (p_input->>'offerId')::uuid,p_input->>'audience',(p_input->>'inactiveDays')::integer,
  (p_input->>'nearRewardUnits')::integer,(p_input->>'targetRewardVersionId')::uuid,tz,(p_input->>'expiresAt')::timestamptz)
 returning * into v;
 insert into public.campaign_branches(business_id,campaign_version_id,branch_id) select p_business,v.id,unnest(branches);
 update public.campaigns set current_version_id=v.id where id=c.id;
 perform app_private.audit(p_business,'campaign.draft_saved','campaign',c.id,p_correlation);
 return jsonb_build_object('campaignId',c.id,'versionId',v.id,'rowVersion',c.row_version,'status',c.status);
end $$;

create function public.schedule_campaign(p_business uuid,p_campaign uuid,p_row_version integer,p_scheduled_at timestamptz,
 p_key text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users;c public.campaigns;v public.campaign_versions;replay app_private.campaign_schedule_keys;
 result jsonb;h text;monthly_limit integer;
begin
 staff:=app_private.communication_staff(p_business);
 if not app_private.entitled(p_business) then raise exception 'subscription_inactive' using errcode='42501'; end if;
 if p_key is null or char_length(p_key) not between 8 and 128 then raise exception 'invalid_input' using errcode='22023'; end if;
 h:=app_private.sha256(jsonb_build_object('campaignId',p_campaign,'scheduledAt',p_scheduled_at,'rowVersion',p_row_version)::text);
 select * into replay from app_private.campaign_schedule_keys where business_id=p_business and key=p_key for update;
 if replay.key is not null then
  if replay.actor_user_id<>staff.user_id or replay.request_hash<>h then raise exception 'idempotency_conflict' using errcode='23505'; end if;
  return replay.result;
 end if;
 select * into c from public.campaigns where business_id=p_business and id=p_campaign for update;
 if c.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if c.status<>'draft' or c.row_version<>p_row_version then raise exception 'stale' using errcode='40001'; end if;
 select * into v from public.campaign_versions where id=c.current_version_id;
 if v.id is null or p_scheduled_at<clock_timestamp()-interval '1 minute' or v.expires_at<=greatest(p_scheduled_at,clock_timestamp())
  or v.expires_at>greatest(p_scheduled_at,clock_timestamp())+interval '7 days'
  or (v.destination='card' and v.expires_at>greatest(p_scheduled_at,clock_timestamp())+interval '24 hours')
 then raise exception 'invalid_schedule' using errcode='22023'; end if;
 if not exists(select from public.campaign_branches where campaign_version_id=v.id) then raise exception 'invalid_branches' using errcode='22023'; end if;
 select pv.monthly_campaign_limit into monthly_limit from public.subscriptions s join public.plan_versions pv on pv.id=s.plan_version_id
  where s.business_id=p_business;
 if monthly_limit is not null and (select count(*) from public.campaigns x where x.business_id=p_business
  and x.status<>'draft' and x.scheduled_at>=date_trunc('month',clock_timestamp() at time zone v.timezone) at time zone v.timezone
  and x.scheduled_at<((date_trunc('month',clock_timestamp() at time zone v.timezone)+interval '1 month') at time zone v.timezone))>=monthly_limit
 then raise exception 'campaign_limit' using errcode='23514'; end if;
 update public.campaigns set status='scheduled',scheduled_at=p_scheduled_at,row_version=row_version+1,updated_at=clock_timestamp()
  where id=c.id returning * into c;
 result:=jsonb_build_object('campaignId',c.id,'status',c.status,'scheduledAt',c.scheduled_at,'expiresAt',v.expires_at,
  'versionId',v.id,'rowVersion',c.row_version);
 insert into app_private.campaign_schedule_keys(business_id,campaign_id,key,actor_user_id,request_hash,result)
 values(p_business,c.id,p_key,staff.user_id,h,result);
 insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload)
 values(p_business,'campaign.scheduled',c.id::text||':'||v.id::text,1,jsonb_build_object('campaignId',c.id))
 on conflict(event_type,event_key) do nothing;
 perform app_private.audit(p_business,'campaign.scheduled','campaign',c.id,p_correlation);
 return result;
end $$;

create function public.set_campaign_status(p_business uuid,p_campaign uuid,p_action text,p_row_version integer,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.campaigns;v public.campaign_versions;
begin
 perform app_private.communication_staff(p_business);
 select * into c from public.campaigns where business_id=p_business and id=p_campaign for update;
 if c.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if c.row_version<>p_row_version then raise exception 'stale' using errcode='40001'; end if;
 select * into v from public.campaign_versions where id=c.current_version_id;
 if not ((p_action='pause' and c.status in ('scheduled','processing'))
  or (p_action='resume' and c.status='paused' and v.expires_at>clock_timestamp())
  or (p_action='cancel' and c.status in ('draft','scheduled','processing','paused')))
 then raise exception 'invalid_transition' using errcode='22023'; end if;
 update public.campaigns set status=case p_action when 'pause' then 'paused' when 'resume' then
  case when started_at is null then 'scheduled' else 'processing' end else 'canceled' end,
  row_version=row_version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 if p_action='cancel' then
  update public.campaign_recipients set status='suppressed',suppression_reason='canceled'
   where campaign_id=c.id and status='pending';
 end if;
 perform app_private.audit(p_business,'campaign.'||p_action,'campaign',c.id,p_correlation);
 return jsonb_build_object('campaignId',c.id,'status',c.status,'rowVersion',c.row_version);
end $$;

create function public.duplicate_campaign(p_business uuid,p_campaign uuid,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original public.campaigns;v public.campaign_versions;new_campaign public.campaigns;new_version public.campaign_versions;
begin
 perform app_private.communication_staff(p_business);
 select * into original from public.campaigns where business_id=p_business and id=p_campaign;
 if original.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 select * into v from public.campaign_versions where id=original.current_version_id;
 insert into public.campaigns(business_id,name,created_by)
 values(p_business,left(original.name||' copy',100),app_private.actor()) returning * into new_campaign;
 insert into public.campaign_versions(business_id,campaign_id,version,title,body,image_asset_id,destination,offer_id,audience,
  inactive_days,near_reward_units,target_reward_version_id,timezone,expires_at)
 values(p_business,new_campaign.id,1,v.title,v.body,v.image_asset_id,v.destination,v.offer_id,v.audience,v.inactive_days,
  v.near_reward_units,v.target_reward_version_id,v.timezone,greatest(v.expires_at,clock_timestamp()+interval '1 day'))
 returning * into new_version;
 insert into public.campaign_branches(business_id,campaign_version_id,branch_id)
 select p_business,new_version.id,branch_id from public.campaign_branches where campaign_version_id=v.id;
 update public.campaigns set current_version_id=new_version.id where id=new_campaign.id;
 perform app_private.audit(p_business,'campaign.duplicated','campaign',new_campaign.id,p_correlation);
 return jsonb_build_object('campaignId',new_campaign.id,'rowVersion',new_campaign.row_version,'status','draft');
end $$;

create function app_private.campaign_audience(p_version uuid,p_member uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select from public.campaign_versions v join public.campaigns c on c.id=v.campaign_id
  join public.memberships m on m.business_id=v.business_id and m.id=p_member
  where v.id=p_version and m.status='active'
  and exists(select from public.consent_preferences cp where cp.business_id=m.business_id and cp.membership_id=m.id
   and cp.channel='push' and cp.purpose='marketing' and cp.allowed)
  and (exists(select from public.campaign_branches cb where cb.campaign_version_id=v.id and cb.branch_id=m.joined_branch_id)
   or exists(select from public.campaign_branches cb join public.purchases p on p.business_id=cb.business_id and p.branch_id=cb.branch_id
    where cb.campaign_version_id=v.id and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty))
  and (v.audience='all_opted_in'
   or (v.audience='inactive' and m.last_qualifying_purchase_at is not null
    and m.last_qualifying_purchase_at<=statement_timestamp()-make_interval(days=>v.inactive_days))
   or (v.audience='reward_ready' and exists(select from public.balances bal join public.reward_versions rv
    on rv.business_id=bal.business_id and rv.id=v.target_reward_version_id
    where bal.membership_id=m.id and bal.units>=rv.unit_cost))
   or (v.audience='near_reward' and exists(select from public.balances bal join public.reward_versions rv
    on rv.business_id=bal.business_id and rv.id=v.target_reward_version_id
    where bal.membership_id=m.id and bal.units<rv.unit_cost and bal.units>=rv.unit_cost-v.near_reward_units))))
$$;

create function public.worker_scan_campaigns() returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.campaigns;v public.campaign_versions;last_id uuid;seen integer;inserted integer:=0;completed integer:=0;
begin
 for c in select * from public.campaigns where status='scheduled' and scheduled_at<=clock_timestamp()
  order by scheduled_at,id limit 20 for update skip locked loop
  select * into v from public.campaign_versions where id=c.current_version_id;
  if v.expires_at<=clock_timestamp() or not exists(select from public.businesses b where b.id=c.business_id and b.status='active')
   or not app_private.entitled(c.business_id) then
   update public.campaigns set status='canceled',completed_at=clock_timestamp() where id=c.id;
   completed:=completed+1;continue;
  end if;
  if not exists(select from public.business_users u where u.business_id=c.business_id and u.user_id=c.created_by
   and u.status='active' and (u.role='owner' or (u.role='manager' and u.can_manage_campaigns))) then
   update public.campaigns set status='paused' where id=c.id;continue;
  end if;
  if c.started_at is null then
   update public.campaigns set started_at=clock_timestamp() where id=c.id returning * into c;
  end if;
  with page as (select m.id from public.memberships m where m.business_id=c.business_id and m.status='active'
   and m.joined_at<=c.started_at and (c.snapshot_cursor is null or m.id>c.snapshot_cursor)
   order by m.id limit 100)
  select count(*),(array_agg(id order by id desc))[1] into seen,last_id from page;
  insert into public.campaign_recipients(business_id,campaign_id,campaign_version_id,membership_id,snapshot_at)
  select c.business_id,c.id,v.id,m.id,c.started_at from public.memberships m where m.business_id=c.business_id
   and m.id>coalesce(c.snapshot_cursor,'00000000-0000-0000-0000-000000000000'::uuid)
   and m.id<=coalesce(last_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
   and app_private.campaign_audience(v.id,m.id) and seen>0
  on conflict(campaign_id,membership_id) do nothing;
  get diagnostics inserted=row_count;
  if seen<100 then
   update public.campaigns set status=case when exists(select from public.campaign_recipients where campaign_id=c.id)
    then 'processing' else 'completed' end,completed_at=case when exists(select from public.campaign_recipients where campaign_id=c.id)
    then null else clock_timestamp() end,snapshot_cursor=last_id where id=c.id;
   completed:=completed+1;
  else update public.campaigns set snapshot_cursor=last_id where id=c.id; end if;
 end loop;
 return jsonb_build_object('inserted',inserted,'completedScans',completed);
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('campaign_configuration','save_campaign','schedule_campaign','set_campaign_status','duplicate_campaign') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
revoke all on function public.worker_scan_campaigns() from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
grant execute on function public.worker_scan_campaigns() to loyalty_worker;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
