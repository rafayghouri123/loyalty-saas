begin;
-- Auth ingress buckets are hourly; report the actual rolling set of live buckets.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.worker_health_status()'::regprocedure);
 execute replace(replace(definition,'authAttempts1m','authAttempts1h'),$old$operation in ('email_ip','google_ip') and window_start>clock_timestamp()-interval '1 minute'$old$,$new$operation='magic_link_ip' and expires_at>clock_timestamp()$new$);
end $$;
commit;
