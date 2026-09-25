begin;
-- PostgREST forces deferred constraints after the RPC's definer context ends.
-- The owner invariant reads protected tables and therefore needs its own narrow
-- definer context; granting browser SELECT on those tables is not acceptable.
alter function app_private.exact_owner() security definer;
revoke all on function app_private.exact_owner() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
