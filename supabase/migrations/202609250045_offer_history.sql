begin;
create or replace function public.my_offers(p_business uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.actor();
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'businessId',o.business_id,'businessName',b.display_name,
  'title',o.title,'kind',o.kind,'description',o.description,'terms',o.terms,'startsAt',o.starts_at,
  'expiresAt',o.expires_at,'status',o.status,'imagePath',(select a.business_id::text||'/'||a.id::text||'/v1.webp'
   from public.media_assets a where a.business_id=o.business_id and a.id=o.image_asset_id
    and a.validation_status='accepted' and a.visibility='public_brand'),
  'minimumSpendPaisa',o.minimum_spend_paisa::text,
  'discountPercent',o.discount_percent,'maxDiscountPaisa',o.max_discount_paisa::text,
  'claimId',c.id,'claimStatus',c.status) order by o.expires_at desc,o.id)
  from public.memberships m join public.offers o on o.business_id=m.business_id
  join public.businesses b on b.id=m.business_id
  left join public.offer_claims c on c.offer_id=o.id and c.membership_id=m.id
  where m.customer_user_id=actor and m.status='active' and b.status='active'
   and (p_business is null or p_business=m.business_id) and not o.is_automation_template
   and (c.id is not null or (o.status='published' and o.starts_at<=clock_timestamp()
    and o.expires_at>clock_timestamp() and (o.audience='all_members' or exists(
     select from public.offer_recipients r where r.offer_id=o.id and r.membership_id=m.id
      and r.valid_from<=clock_timestamp() and r.valid_until>clock_timestamp()))))),'[]'::jsonb);
end $$;
commit;
