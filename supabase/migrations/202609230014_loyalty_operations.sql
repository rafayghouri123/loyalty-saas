begin;

create function app_private.sha256(p_value text) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(p_value,'UTF8'),'sha256'),'hex')
$$;
create function app_private.value_request(p_business uuid,p_operation text,p_key text,p_body jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare h text; existing app_private.value_requests; actor uuid;
begin
 actor:=app_private.actor();
 if p_key is null or char_length(p_key) not between 8 and 128 then raise exception 'invalid_input' using errcode='22023'; end if;
 h:=app_private.sha256((p_body-'idempotencyKey')::text);
 insert into app_private.value_requests(business_id,operation,idempotency_key,request_hash,actor_user_id)
 values(p_business,p_operation,p_key,h,actor) on conflict(business_id,operation,idempotency_key) do nothing;
 select * into existing from app_private.value_requests where business_id=p_business and operation=p_operation and idempotency_key=p_key for update;
 if existing.request_hash<>h or existing.actor_user_id<>actor then raise exception 'idempotency_conflict' using errcode='23505'; end if;
 return existing.result;
end $$;
create function app_private.value_finish(p_business uuid,p_operation text,p_key text,p_result jsonb,p_entity uuid)
returns jsonb language plpgsql set search_path='' as $$
begin
 update app_private.value_requests set result=p_result where business_id=p_business and operation=p_operation and idempotency_key=p_key and result is null;
 insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload)
 values(p_business,'loyalty.'||p_operation,p_business::text||':'||p_operation||':'||p_key,1,jsonb_build_object('businessId',p_business,'entityId',p_entity))
 on conflict(event_type,event_key) do nothing;
 return p_result;
end $$;
create function app_private.validate_ledger() returns trigger language plpgsql set search_path='' as $$
declare original public.ledger_entries; source_member uuid; source_business uuid;
begin
 if new.entry_kind in ('purchase_base','promotion_bonus','referral_bonus') then
  select membership_id,business_id into source_member,source_business from public.purchases where id=new.purchase_id;
  if new.entry_kind<>'referral_bonus' and (source_member<>new.membership_id or source_business<>new.business_id) then raise exception 'ledger_source' using errcode='23514'; end if;
 elsif new.entry_kind='redemption' then
  select membership_id,business_id into source_member,source_business from public.redemptions where id=new.redemption_id;
  if source_member<>new.membership_id or source_business<>new.business_id then raise exception 'ledger_source' using errcode='23514'; end if;
 elsif new.entry_kind='adjustment' then
  select membership_id,business_id into source_member,source_business from public.adjustments where id=new.adjustment_id;
  if source_member<>new.membership_id or source_business<>new.business_id then raise exception 'ledger_source' using errcode='23514'; end if;
 elsif new.entry_kind='reversal' then
  select * into original from public.ledger_entries where id=new.reverses_entry_id;
  if original.id is null or original.entry_kind='reversal' or original.business_id<>new.business_id
   or original.membership_id<>new.membership_id or original.units<>-new.units
   or new.purchase_id is distinct from original.purchase_id or new.redemption_id is distinct from original.redemption_id
   or new.referral_claim_id is distinct from original.referral_claim_id then raise exception 'invalid_reversal' using errcode='23514'; end if;
  if new.purchase_reversal_id is not null and (original.entry_kind not in ('purchase_base','promotion_bonus','referral_bonus')
    or not exists(select from public.purchase_reversals r where r.id=new.purchase_reversal_id and r.business_id=new.business_id and r.purchase_id=original.purchase_id)) then
   raise exception 'invalid_purchase_reversal' using errcode='23514'; end if;
  if new.redemption_reversal_id is not null and (original.entry_kind<>'redemption'
    or not exists(select from public.redemption_reversals r where r.id=new.redemption_reversal_id and r.business_id=new.business_id and r.redemption_id=original.redemption_id)) then
   raise exception 'invalid_redemption_reversal' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger ledger_validate before insert on public.ledger_entries for each row execute function app_private.validate_ledger();
create function app_private.apply_ledger() returns trigger language plpgsql set search_path='' as $$
begin
 update public.balances set units=(units::numeric+new.units)::bigint,ledger_version=ledger_version+1,
 row_version=row_version+1,updated_at=clock_timestamp()
 where business_id=new.business_id and membership_id=new.membership_id and abs(units::numeric+new.units)<=9000000000000;
 if not found then raise exception 'balance_bound' using errcode='23514'; end if;
 return new;
end $$;
create trigger ledger_apply after insert on public.ledger_entries for each row execute function app_private.apply_ledger();

create function public.set_membership_handle(p_member uuid,p_hash text,p_ciphertext text,p_key_id text,p_rotate boolean,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; current_handle public.membership_handles; new_id uuid;
begin
 perform app_private.actor();
 select * into m from public.memberships where id=p_member and customer_user_id=app_private.actor() and status='active' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or char_length(p_ciphertext)>1024 or char_length(p_key_id) not between 1 and 80 then raise exception 'invalid_input' using errcode='22023'; end if;
 select * into current_handle from public.membership_handles where business_id=m.business_id and membership_id=m.id and status='active' for update;
 if current_handle.id is not null and not p_rotate then
  return jsonb_build_object('id',current_handle.id,'ciphertext',current_handle.handle_ciphertext,'keyId',current_handle.encryption_key_id,'created',false);
 end if;
 if current_handle.id is not null then update public.membership_handles set status='revoked',revoked_at=clock_timestamp() where id=current_handle.id; end if;
 insert into public.membership_handles(business_id,membership_id,handle_hash,handle_ciphertext,encryption_key_id)
 values(m.business_id,m.id,p_hash,p_ciphertext,p_key_id) returning id into new_id;
 perform app_private.audit(m.business_id,case when p_rotate then 'handle.rotated' else 'handle.created' end,'membership',m.id,p_correlation_id);
 return jsonb_build_object('id',new_id,'ciphertext',p_ciphertext,'keyId',p_key_id,'created',true);
end $$;
create function public.create_scanner_code(p_member uuid,p_purpose text,p_intent uuid,p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; intent public.redemption_intents; expiry timestamptz; limited jsonb;
begin
 perform app_private.actor();
 limited:=app_private.limit_action('scanner_code',null,12); if limited is not null then return limited; end if;
 begin
 select * into m from public.memberships where id=p_member and customer_user_id=app_private.actor() and status='active' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input' using errcode='22023'; end if;
 expiry:=clock_timestamp()+interval '5 minutes';
 if p_purpose='redemption_lookup' then
  select * into intent from public.redemption_intents where business_id=m.business_id and id=p_intent and membership_id=m.id and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
  if not found then raise exception 'expired' using errcode='P0001'; end if;
  expiry:=least(expiry,intent.expires_at);
 elsif p_purpose<>'membership_lookup' or p_intent is not null then raise exception 'invalid_input' using errcode='22023'; end if;
 insert into public.scanner_codes(business_id,membership_id,code_hash,expires_at,purpose,redemption_intent_id)
 values(m.business_id,m.id,p_code_hash,expiry,p_purpose,p_intent);
 return jsonb_build_object('expiresAt',expiry);
 exception when others then
  return jsonb_build_object('error',jsonb_build_object('code',case SQLSTATE when 'P0002' then 'not_found' when 'P0001' then 'expired'
   when '22023' then 'invalid_input' when '23505' then 'conflict' else 'temporary_failure' end));
 end;
end $$;
create function public.resolve_scanner(p_business uuid,p_branch uuid,p_kind text,p_raw text,p_context_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; m public.memberships; intent public.redemption_intents; code public.scanner_codes; expiry timestamptz; limited jsonb; context_id uuid;
begin
 staff:=app_private.authorize(p_business,p_branch);
 if staff.role='owner' then perform app_private.actor(true); end if;
 limited:=app_private.limit_action('scanner_lookup',p_business,30); if limited is not null then return limited; end if;
 begin
 if p_context_hash !~ '^[a-f0-9]{64}$' or char_length(p_raw)>512 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_kind='earningHandle' and p_raw ~ '^LOYALTY:EARN:v1:[A-Za-z0-9_-]{43}$' then
  select member_row.* into m from public.membership_handles h join public.memberships member_row on member_row.business_id=h.business_id and member_row.id=h.membership_id
  where h.business_id=p_business and h.handle_hash=app_private.sha256(p_raw) and h.status='active' and member_row.status='active';
 elsif p_kind='redemptionIntent' and p_raw ~ '^LOYALTY:REDEEM:v1:[A-Za-z0-9_-]{43}$' then
  select * into intent from public.redemption_intents where business_id=p_business and token_hash=app_private.sha256(p_raw) for update;
  if intent.id is not null and (intent.consumed_at is not null or intent.canceled_at is not null or intent.expires_at<=clock_timestamp()) then
   raise exception 'expired' using errcode='P0001'; end if;
  if intent.id is not null then select * into m from public.memberships where business_id=p_business and id=intent.membership_id and status='active'; end if;
 elsif p_kind='typedCode' and p_raw ~ '^[A-HJ-NP-Z2-9]{8}$' then
  select * into code from public.scanner_codes where business_id=p_business and code_hash=app_private.sha256(p_raw) for update;
  if code.id is not null and (code.consumed_at is not null or code.expires_at<=clock_timestamp()) then raise exception 'expired' using errcode='P0001'; end if;
  if code.id is not null then
   if code.purpose='redemption_lookup' then
    select * into intent from public.redemption_intents where business_id=p_business and id=code.redemption_intent_id and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
    if intent.id is null then raise exception 'expired' using errcode='P0001'; end if;
   end if;
   select * into m from public.memberships where business_id=p_business and id=code.membership_id and status='active';
   update public.scanner_codes set consumed_at=clock_timestamp() where id=code.id;
  end if;
 else raise exception 'invalid_input' using errcode='22023'; end if;
 if m.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 expiry:=least(clock_timestamp()+interval '5 minutes',coalesce(intent.expires_at,'infinity'::timestamptz));
 insert into app_private.checkout_contexts(business_id,branch_id,membership_id,staff_user_id,session_id,token_hash,kind,redemption_intent_id,expires_at)
 values(p_business,p_branch,m.id,staff.user_id,(auth.jwt()->>'session_id')::uuid,p_context_hash,
 case when intent.id is null then 'earning' else 'redemption' end,intent.id,expiry) returning id into context_id;
 return jsonb_build_object('contextId',context_id,'kind',case when intent.id is null then 'earning' else 'redemption' end,
 'memberName',m.display_name,'businessId',p_business,'branchId',p_branch,'balance',(select units::text from public.balances where membership_id=m.id),
 'rewardTitle',case when intent.id is not null then (select title from public.reward_versions where id=intent.reward_version_id) end,
 'rewardUnitCost',case when intent.id is not null then (select unit_cost::text from public.reward_versions where id=intent.reward_version_id) end,'expiresAt',expiry);
 exception when others then
  return jsonb_build_object('error',jsonb_build_object('code',case SQLSTATE when 'P0002' then 'not_found' when 'P0001' then 'expired'
   when '22023' then 'invalid_input' when '23505' then 'conflict' else 'temporary_failure' end));
 end;
end $$;
create function app_private.checkout(p_hash text,p_kind text) returns app_private.checkout_contexts
language plpgsql set search_path='' as $$
declare c app_private.checkout_contexts;
begin
 select * into c from app_private.checkout_contexts where token_hash=p_hash;
 if c.id is null or c.kind<>p_kind or c.consumed_at is not null or c.expires_at<=clock_timestamp()
 or c.staff_user_id<>app_private.actor() or c.session_id is distinct from (auth.jwt()->>'session_id')::uuid then
 raise exception 'expired' using errcode='P0001'; end if;
 return c;
end $$;
create function app_private.purchase_effect(p_context_hash text,p_bill bigint,p_eligible bigint,p_confirmed boolean,p_receipt text,p_corrects uuid)
returns jsonb language plpgsql set search_path='' as $$
declare c app_private.checkout_contexts; b public.businesses; prog public.loyalty_programmes; v public.programme_versions; bal public.balances; base_units bigint; raw_units numeric; qualifies boolean; effect_hash text;
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
 qualifies:=p_bill>0 and p_eligible>0 and p_eligible>=v.minimum_spend_paisa and (prog.type='points' or p_confirmed);
 if qualifies and prog.type='stamps' then base_units:=v.stamps_per_purchase;
 elsif qualifies then
  raw_units:=floor(p_eligible::numeric/v.spend_step_paisa)*v.units_per_step;
  base_units:=least(raw_units,v.max_base_units_per_purchase)::bigint;
 else base_units:=0; end if;
 select * into bal from public.balances where business_id=c.business_id and membership_id=c.membership_id for update;
 if bal.membership_id is null then raise exception 'balance_missing' using errcode='P0002'; end if;
 effect_hash:=app_private.sha256(concat_ws(':',c.id,v.id,p_bill,p_eligible,p_confirmed,coalesce(p_receipt,''),coalesce(p_corrects::text,''),bal.ledger_version,base_units));
 return jsonb_build_object('businessId',c.business_id,'branchId',c.branch_id,'membershipId',c.membership_id,'programmeVersionId',v.id,
 'programmeType',prog.type,'recordedBillPaisa',p_bill::text,'eligibleSpendPaisa',p_eligible::text,'baseUnits',base_units::text,
 'promotionBonusUnits','0','referralBonusUnits','0','qualifiesForLoyalty',qualifies,'capReduced',qualifies and prog.type='points' and raw_units>v.max_base_units_per_purchase,
 'balance',bal.units::text,'ledgerVersion',bal.ledger_version::text,'evaluatedAt',clock_timestamp(),'expectedEffectHash',effect_hash);
end $$;
create function public.preview_purchase(p_context_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.strict_keys(p_input,array['recordedBillPaisa','eligibleSpendPaisa','qualifyingPurchaseConfirmed','receiptReference','correctsPurchaseId']);
 return app_private.purchase_effect(p_context_hash,(p_input->>'recordedBillPaisa')::bigint,(p_input->>'eligibleSpendPaisa')::bigint,
 (p_input->>'qualifyingPurchaseConfirmed')::boolean,p_input->>'receiptReference',(p_input->>'correctsPurchaseId')::uuid);
end $$;

commit;
