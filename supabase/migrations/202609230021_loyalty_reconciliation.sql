begin;
create function public.worker_reconcile_balances() returns jsonb language plpgsql security definer set search_path='' as $$
declare mismatch bigint; scanned bigint; stamp timestamptz;
begin
 if not pg_has_role(current_user,'loyalty_worker','member') then raise exception 'forbidden' using errcode='42501'; end if;
 stamp:=clock_timestamp();
 select count(*),count(*) filter(where b.units is distinct from coalesce(s.units,0) or b.ledger_version is distinct from coalesce(s.entries,0))
 into scanned,mismatch from public.balances b left join lateral
  (select sum(e.units) as units,count(*) as entries from public.ledger_entries e where e.business_id=b.business_id and e.membership_id=b.membership_id) s on true;
 insert into public.operational_checks(name,checked_at,status,safe_details)
 values('ledger_reconciliation',stamp,case when mismatch=0 then 'ok' else 'degraded' end,jsonb_build_object('balancesScanned',scanned,'mismatches',mismatch))
 on conflict(name) do update set checked_at=excluded.checked_at,status=excluded.status,safe_details=excluded.safe_details;
 return jsonb_build_object('balancesScanned',scanned,'mismatches',mismatch,'checkedAt',stamp);
end $$;
revoke all on function public.worker_reconcile_balances() from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
grant execute on function public.worker_reconcile_balances() to loyalty_worker;
commit;
