begin;
-- Separate monitor can read fixed operational health even when the worker stops.
-- It cannot consume jobs, mutate health, control workers or access customer tables.
do $$ begin
 if not exists(select from pg_roles where rolname='loyalty_monitor') then
  create role loyalty_monitor nologin nosuperuser nocreatedb nocreaterole nobypassrls;
 end if;
end $$;
grant usage on schema public to loyalty_monitor;
grant execute on function public.worker_health_status() to loyalty_monitor;
commit;
