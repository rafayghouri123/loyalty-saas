begin;
-- Match the UI's Unicode whitespace rule when extracting the shared first name.
create function app_private.manual_first_name(p_name text) returns text
language sql immutable set search_path='' as $$
 select split_part(regexp_replace(app_private.manual_trim(p_name),
 '['||E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)||']+', ' ', 'g'), ' ', 1)
$$;
revoke all on function app_private.manual_first_name(text) from public,anon,authenticated,loyalty_worker;

-- Preserve the already-applied migration definitions; alter only these two expressions.
do $$
declare definition text;before_text text;after_text text;
begin
 before_text:=$old$first_name:=split_part(regexp_replace(app_private.manual_trim(member.display_name),'[[:space:]]+',' ','g'),' ',1);$old$;
 after_text:='first_name:=app_private.manual_first_name(member.display_name);';
 definition:=pg_get_functiondef('app_private.followup_preview(uuid,jsonb,public.business_users)'::regprocedure);
 if position(before_text in definition)=0 then raise exception 'unexpected_followup_preview_definition'; end if;
 execute replace(definition,before_text,after_text);

 -- Replays must return the same exclusion count as the original successful creation.
 before_text:=$old$'createdTasks',(select count(*) from public.followup_tasks where batch_id=b.id),'replayed',true$old$;
 after_text:=$new$'createdTasks',(select count(*) from public.followup_tasks where batch_id=b.id),'excluded',(b.preview_snapshot->>'excluded')::integer,'replayed',true$new$;
 definition:=pg_get_functiondef('public.create_followup_batch(uuid,jsonb,uuid,uuid)'::regprocedure);
 if position(before_text in definition)=0 then raise exception 'unexpected_followup_create_definition'; end if;
 execute replace(definition,before_text,after_text);
end $$;
commit;
