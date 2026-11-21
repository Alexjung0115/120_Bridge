begin;

create function public.bridge_end_session(p_session uuid, p_command uuid, p_base bigint, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare snapshot jsonb; receipt jsonb; result jsonb; now_at timestamptz;
begin
  if p_command is null or p_base is null or p_base < 0 or p_base >= 9007199254740991 then
    raise invalid_parameter_value;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(120, 10);
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p_token_hash is null or snapshot->>'citizenTokenHash' is distinct from p_token_hash then
    return jsonb_build_object('status','forbidden');
  end if;
  select response into receipt from public.bridge_session_commands
    where consultation_id = p_session and command_id = p_command;
  if found then
    if receipt->>'operation' = 'citizen_end' and receipt->'baseRevision' = to_jsonb(p_base) then
      return jsonb_build_object('status','replayed','data',receipt->'value');
    end if;
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;
  if snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' not in ('active','handoff_offered','summary_confirm') then
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  now_at := clock_timestamp();
  result := jsonb_build_object('state','ended','revision',p_base+1,'outcome','unknown');
  update public.bridge_session_snapshots set session_snapshot = snapshot || result || jsonb_build_object(
    'updatedAt',now_at,'outcomeConfirmedAt',null,'pendingRequestId',null,
    'transcript',coalesce((select jsonb_agg(case when turn->>'outputStatus' = 'pending'
         then turn || '{"outputStatus":"discarded"}'::jsonb else turn end order by ord)
      from jsonb_array_elements(snapshot->'transcript') with ordinality as t(turn,ord)), '[]'::jsonb)
  ) where consultation_id = p_session;
  update public.consultations set closed_at = now_at where id = p_session;
  insert into public.bridge_session_commands values (
    p_session,p_command,p_base+1,jsonb_build_object('operation','citizen_end','baseRevision',p_base,'value',result)
  );
  return jsonb_build_object('status','committed','data',result);
end;
$$;

revoke execute on function public.bridge_end_session(uuid,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.bridge_end_session(uuid,uuid,bigint,text) to service_role;

commit;