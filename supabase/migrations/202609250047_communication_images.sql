begin;
alter table public.offers add foreign key(business_id,image_asset_id) references public.media_assets(business_id,id);
alter table public.campaign_versions add foreign key(business_id,image_asset_id) references public.media_assets(business_id,id);

create function app_private.communication_image_pointer() returns trigger language plpgsql set search_path='' as $$
begin
 if new.image_asset_id is not null and not exists(select from public.media_assets a
  where a.business_id=new.business_id and a.id=new.image_asset_id and a.kind='offer'
   and a.validation_status='accepted' and a.visibility='public_brand') then
  raise exception 'invalid_asset' using errcode='23514';
 end if;
 return new;
end $$;
create trigger offer_image_pointer before insert or update of image_asset_id on public.offers
 for each row execute function app_private.communication_image_pointer();
create trigger campaign_image_pointer before insert or update of image_asset_id on public.campaign_versions
 for each row execute function app_private.communication_image_pointer();

create function public.duplicate_offer(p_business uuid,p_offer uuid,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source public.offers;copy public.offers;new_start timestamptz;new_end timestamptz;
begin
 perform app_private.communication_staff(p_business);
 select * into source from public.offers where business_id=p_business and id=p_offer;
 if source.id is null or source.generated_by_run_id is not null then raise exception 'not_found' using errcode='P0002'; end if;
 new_start:=greatest(clock_timestamp()+interval '5 minutes',source.starts_at);
 new_end:=greatest(new_start+interval '1 day',source.expires_at);
 insert into public.offers(business_id,kind,title,description,terms,image_asset_id,starts_at,expires_at,
  audience,is_automation_template,discount_percent,minimum_spend_paisa,max_discount_paisa,created_by)
 values(p_business,source.kind,left(source.title||' copy',80),source.description,source.terms,source.image_asset_id,
  new_start,new_end,source.audience,source.is_automation_template,source.discount_percent,
  source.minimum_spend_paisa,source.max_discount_paisa,app_private.actor()) returning * into copy;
 insert into public.offer_branches(business_id,offer_id,branch_id)
  select p_business,copy.id,branch_id from public.offer_branches where offer_id=source.id;
 insert into public.offer_recipients(business_id,offer_id,membership_id,valid_from,valid_until)
  select p_business,copy.id,membership_id,new_start,new_end from public.offer_recipients where offer_id=source.id;
 perform app_private.audit(p_business,'offer.duplicated','offer',copy.id,p_correlation);
 return jsonb_build_object('offerId',copy.id,'rowVersion',copy.row_version,'status',copy.status);
end $$;
revoke all on function public.duplicate_offer(uuid,uuid,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.duplicate_offer(uuid,uuid,uuid) to authenticated;
commit;
