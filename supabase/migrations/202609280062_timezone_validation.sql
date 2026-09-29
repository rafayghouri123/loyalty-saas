begin;
-- The launch default is validated once at migration time. Enumerating the full
-- timezone catalog for every profile/unchanged business update made a 1,000-row
-- synthetic profile import exceed 120 seconds on the Windows PostgreSQL host.
do $$ begin
 if not exists(select from pg_catalog.pg_timezone_names where name='Asia/Karachi') then
  raise exception 'Required launch timezone is unavailable';
 end if;
end $$;
create or replace function app_private.valid_timezone() returns trigger language plpgsql set search_path='' as $$
declare tz text; field_name text;
begin
 field_name:=case when tg_table_name='profiles' then 'preferred_timezone' else 'timezone' end;
 tz:=to_jsonb(new)->>field_name;
 if tz='Asia/Karachi' then return new; end if;
 if tg_op='UPDATE' and tz is not distinct from (to_jsonb(old)->>field_name) then return new; end if;
 if not exists(select from pg_catalog.pg_timezone_names where name=tz) then
  raise exception 'invalid_input' using errcode='22023';
 end if;
 return new;
end $$;
commit;
