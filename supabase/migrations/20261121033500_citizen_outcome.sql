begin;

create function public.bridge_record_citizen_outcome(
  p_session uuid, p_command uuid, p_base bigint, p_token_hash text, p_decision text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare snapshot jsonb; receipt jsonb; result jsonb; now_at timestamptz; resolved boolean;
begin
  if p_command is null or p_base is null or p_base < 0 or p_base >= 9007199254740991
    or p_decision is null or p_decision not in ('resolved','need_more') then
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
    if receipt->>'operation' = 'citizen_outcome' and receipt->'input' = jsonb_build_array(p_base,p_decision) then
      return jsonb_build_object('status','replayed','data',receipt->'value');
    end if;
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;
  if snapshot->'revision' is distinct from to_jsonb(p_base) or snapshot->>'state' is distinct from 'active'
    or snapshot->>'pendingRequestId' is not null then
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  resolved := p_decision = 'resolved';
  if resolved and (
    coalesce(jsonb_array_length(snapshot->'issues'),0) = 0
    or jsonb_array_length(snapshot->'issues') is distinct from jsonb_array_length(snapshot->'issueIds')
    or exists (select 1 from jsonb_array_elements(snapshot->'issues') as t(issue)
      where issue->>'status' is distinct from 'advised' or not (snapshot->'issueIds' ? (issue->>'id')))
    or coalesce(jsonb_array_length(snapshot->'transcript'->-1->'factCitations'),0) = 0
  ) then
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  now_at := clock_timestamp();
  result := jsonb_build_object('state',case when resolved then 'ended' else 'active' end,
    'revision',p_base+1,'outcome',case when resolved then 'ai_confirmed' else 'unknown' end);
  update public.bridge_session_snapshots set session_snapshot = snapshot || result || jsonb_build_object(
    'updatedAt',now_at,'outcomeConfirmedAt',case when resolved then now_at else null end
  ) where consultation_id = p_session;
  if resolved then
    update public.consultations set closed_at = now_at where id = p_session;
    insert into public.bridge_metric_events (session_id,event_type,occurred_at,corpus_version)
      values (p_session,'session_ended',now_at,snapshot->>'corpusVersion');
  end if;
  insert into public.bridge_session_commands values (
    p_session,p_command,p_base+1,jsonb_build_object('operation','citizen_outcome',
      'input',jsonb_build_array(p_base,p_decision),'value',result)
  );
  return jsonb_build_object('status','committed','data',result);
end;
$$;

revoke execute on function public.bridge_record_citizen_outcome(uuid,uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.bridge_record_citizen_outcome(uuid,uuid,bigint,text,text) to service_role;

commit;
