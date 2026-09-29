begin;
-- Vercel Workflows orchestrates bounded pg-boss consumers. Only the worker login
-- can control this singleton; no browser, gateway or general public RPC can.
create table app_private.vercel_worker_controller (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null,
 generation uuid not null,
 deployment_id text not null check(length(deployment_id) between 1 and 100),
 epoch integer not null default 0 check(epoch>=0),
 run_id text not null check(length(run_id) between 1 and 128),
 changed_at timestamptz not null default clock_timestamp()
);
revoke all on app_private.vercel_worker_controller from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
create function public.worker_vercel_status() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'generation',generation,'deploymentId',deployment_id,'epoch',epoch,'runId',run_id,
 'fresh',exists(select from public.operational_checks where name='worker_heartbeat' and status='ok' and checked_at>clock_timestamp()-interval '2 minutes'))
 from app_private.vercel_worker_controller where singleton;
$$;
create function public.worker_vercel_activate(p_generation uuid,p_deployment text,p_run text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_generation is null or p_deployment is null or p_run is null then raise exception 'invalid_worker_control' using errcode='22023';end if;
 insert into app_private.vercel_worker_controller(singleton,enabled,generation,deployment_id,epoch,run_id)
 values(true,true,p_generation,p_deployment,0,p_run)
 on conflict(singleton) do update set enabled=true,generation=excluded.generation,deployment_id=excluded.deployment_id,epoch=0,run_id=excluded.run_id,changed_at=clock_timestamp();
end $$;
create function public.worker_vercel_current(p_generation uuid,p_deployment text,p_epoch integer,p_run text) returns boolean language sql security definer set search_path='' as $$
 select exists(select from app_private.vercel_worker_controller where singleton and enabled and generation=p_generation and deployment_id=p_deployment and epoch=p_epoch and run_id=p_run);
$$;
create function public.worker_vercel_advance(p_generation uuid,p_epoch integer,p_previous text,p_next text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_next is null then raise exception 'invalid_worker_control' using errcode='22023';end if;
 update app_private.vercel_worker_controller set epoch=epoch+1,run_id=p_next,changed_at=clock_timestamp()
 where singleton and enabled and generation=p_generation and epoch=p_epoch and run_id=p_previous;
 return found;
end $$;
create function public.worker_vercel_disable() returns void language sql security definer set search_path='' as $$
 update app_private.vercel_worker_controller set enabled=false,changed_at=clock_timestamp() where singleton;
$$;
revoke all on function public.worker_vercel_status(),public.worker_vercel_activate(uuid,text,text),public.worker_vercel_current(uuid,text,integer,text),public.worker_vercel_advance(uuid,integer,text,text),public.worker_vercel_disable() from public,anon,authenticated,loyalty_web_gateway;
grant execute on function public.worker_vercel_status(),public.worker_vercel_activate(uuid,text,text),public.worker_vercel_current(uuid,text,integer,text),public.worker_vercel_advance(uuid,integer,text,text),public.worker_vercel_disable() to loyalty_worker;
commit;
