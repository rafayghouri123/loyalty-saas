begin;

create function app_private.calculate_base_earning(p_mode text,p_minimum bigint,p_stamps integer,p_step bigint,p_per_step integer,p_cap integer,
 p_bill bigint,p_eligible bigint,p_confirmed boolean) returns jsonb language plpgsql immutable set search_path='' as $$
declare qualifies boolean; raw_units numeric:=0; base_units bigint;
begin
 if p_bill is null or p_eligible is null or p_bill<0 or p_bill>100000000 or p_eligible<0 or p_eligible>p_bill
 or p_minimum is null or p_minimum<0 or p_minimum>100000000 or p_cap is null or p_cap not between 1 and 100000
 or (p_mode='stamps' and (p_stamps is null or p_stamps not between 1 and 10 or p_stamps>p_cap or p_step is not null or p_per_step is not null))
 or (p_mode='points' and (p_stamps is not null or p_step is null or p_step<100 or p_step>100000000 or p_per_step is null or p_per_step not between 1 and 1000))
 or p_mode is null or p_mode not in ('stamps','points') then raise exception 'invalid_input' using errcode='22023'; end if;
 qualifies:=p_bill>0 and p_eligible>0 and p_eligible>=p_minimum and (p_mode='points' or coalesce(p_confirmed,false));
 if qualifies and p_mode='stamps' then raw_units:=p_stamps;
 elsif qualifies then raw_units:=floor(p_eligible::numeric/p_step)*p_per_step; end if;
 base_units:=least(raw_units,p_cap)::bigint;
 return jsonb_build_object('qualifiesForLoyalty',qualifies,'rawBaseUnits',raw_units::text,'baseUnits',base_units::text,
 'capReduced',p_mode='points' and raw_units>p_cap);
end $$;
revoke all on function app_private.calculate_base_earning(text,bigint,integer,bigint,integer,integer,bigint,bigint,boolean)
 from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create or replace function app_private.purchase_effect(p_context_hash text,p_bill bigint,p_eligible bigint,p_confirmed boolean,p_receipt text,p_corrects uuid)
returns jsonb language plpgsql set search_path='' as $$
declare c app_private.checkout_contexts; b public.businesses; prog public.loyalty_programmes; v public.programme_versions;
 bal public.balances; calc jsonb; base_units bigint; effect_hash text;
begin
 if p_bill is null or p_eligible is null or p_bill<0 or p_bill>100000000 or p_eligible<0 or p_eligible>p_bill
 or char_length(coalesce(p_receipt,''))>80 then raise exception 'invalid_input' using errcode='22023'; end if;
 c:=app_private.checkout(p_context_hash,'earning');
 perform app_private.authorize(c.business_id,c.branch_id);
 select * into b from public.businesses where id=c.business_id for share;
 select * into prog from public.loyalty_programmes where business_id=c.business_id for share;
 if b.status<>'active' or prog.status<>'published' or not app_private.entitled(c.business_id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select * into v from public.programme_versions where business_id=c.business_id and programme_id=prog.id and status='published' and effective_at<=clock_timestamp()
 order by effective_at desc,id desc limit 1;
 if v.id is null then raise exception 'rules_unavailable' using errcode='P0002'; end if;
 perform 1 from public.memberships where business_id=c.business_id and id=c.membership_id and status='active' for update;
 if not found then raise exception 'member_unavailable' using errcode='42501'; end if;
 if p_corrects is not null and not exists(select from public.purchases where business_id=c.business_id and id=p_corrects and membership_id=c.membership_id and branch_id=c.branch_id and status='reversed'
 and not exists(select from public.purchases x where x.business_id=c.business_id and x.corrects_purchase_id=p_corrects and x.status='committed')) then
 raise exception 'invalid_correction' using errcode='23514'; end if;
 calc:=app_private.calculate_base_earning(prog.type,v.minimum_spend_paisa,v.stamps_per_purchase,v.spend_step_paisa,v.units_per_step,
 v.max_base_units_per_purchase,p_bill,p_eligible,p_confirmed);
 base_units:=(calc->>'baseUnits')::bigint;
 select * into bal from public.balances where business_id=c.business_id and membership_id=c.membership_id for update;
 if bal.membership_id is null then raise exception 'balance_missing' using errcode='P0002'; end if;
 effect_hash:=app_private.sha256(concat_ws(':',c.id,v.id,p_bill,p_eligible,p_confirmed,coalesce(p_receipt,''),coalesce(p_corrects::text,''),bal.ledger_version,base_units));
 return jsonb_build_object('businessId',c.business_id,'branchId',c.branch_id,'membershipId',c.membership_id,'programmeVersionId',v.id,
 'programmeType',prog.type,'recordedBillPaisa',p_bill::text,'eligibleSpendPaisa',p_eligible::text,'baseUnits',base_units::text,
 'promotionBonusUnits','0','referralBonusUnits','0','qualifiesForLoyalty',calc->'qualifiesForLoyalty','capReduced',calc->'capReduced',
 'balance',bal.units::text,'ledgerVersion',bal.ledger_version::text,'evaluatedAt',clock_timestamp(),'expectedEffectHash',effect_hash);
end $$;

create function public.preview_programme_example(p_business uuid,p_mode text,p_minimum bigint,p_stamps integer,p_step bigint,p_per_step integer,
 p_cap integer,p_eligible bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare calc jsonb;
begin
 perform app_private.authorize(p_business,null,true);
 calc:=app_private.calculate_base_earning(p_mode,p_minimum,p_stamps,p_step,p_per_step,p_cap,p_eligible,p_eligible,true);
 return calc||jsonb_build_object('exampleEligibleSpendPaisa',p_eligible::text);
end $$;
revoke all on function public.preview_programme_example(uuid,text,bigint,integer,bigint,integer,integer,bigint)
 from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.preview_programme_example(uuid,text,bigint,integer,bigint,integer,integer,bigint) to authenticated;

create or replace function public.customer_card(p_membership uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; bal public.balances;
begin
 select * into m from public.memberships where id=p_membership and customer_user_id=app_private.actor();
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into bal from public.balances where business_id=m.business_id and membership_id=m.id;
 return jsonb_build_object('id',m.id,'businessId',m.business_id,'name',(select display_name from public.businesses where id=m.business_id),
 'memberName',m.display_name,'status',m.status,'units',bal.units::text,'ledgerVersion',bal.ledger_version::text,
 'programmeType',(select type from public.loyalty_programmes where business_id=m.business_id),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'description',v.description,'terms',v.terms,'unitCost',v.unit_cost::text,
 'available',bal.units>=v.unit_cost and m.status='active' and exists(select from public.businesses b where b.id=m.business_id and b.status<>'archived')
 and exists(select from public.reward_branches rb join public.branches br on br.business_id=rb.business_id and br.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=v.id and br.status='active'),
 'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id),
 'eligibleBranches',(select coalesce(jsonb_agg(br.name order by br.name),'[]'::jsonb) from public.reward_branches rb
 join public.branches br on br.business_id=rb.business_id and br.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=v.id and br.status='active')) order by v.unit_cost,v.id),'[]'::jsonb)
 from public.rewards r join public.reward_versions v on v.id=r.published_version_id where r.business_id=m.business_id and r.status='published'),
 'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,'units',e.units::text,'occurredAt',e.occurred_at) order by e.occurred_at desc,e.id desc),'[]'::jsonb)
 from (select * from public.ledger_entries where business_id=m.business_id and membership_id=m.id order by occurred_at desc,id desc limit 10) e));
end $$;

commit;
