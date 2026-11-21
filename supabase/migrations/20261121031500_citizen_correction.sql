begin;

create function public.bridge_submit_citizen_correction(
  p_session uuid, p_base bigint, p_command uuid, p_handoff uuid,
  p_summary_revision bigint, p_text text, p_token_hash text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare snapshot jsonb; current_handoff jsonb; receipt jsonb; fingerprint text; result jsonb;
begin
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if p_token_hash is null or snapshot->>'citizenTokenHash' is distinct from p_token_hash then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select payload into current_handoff from public.bridge_console_handoffs
    where session_id = p_session and handoff_id = p_handoff;
  if not found then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  if p_command is null or p_base is null or p_summary_revision is null or p_text is null then
    raise invalid_parameter_value;
  end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_array(
    p_handoff, p_base, p_summary_revision, p_text)::text, 'UTF8')), 'hex');
  select response into receipt from public.bridge_session_commands
    where consultation_id = p_session and command_id = p_command;
  if found and (receipt->>'operation' is distinct from 'citizen_correction'
    or receipt->>'requestFingerprint' is distinct from fingerprint) then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  if current_handoff->'summaryRevision' is distinct from to_jsonb(p_summary_revision)
    and not exists (select 1 from jsonb_array_elements(current_handoff->'summaryHistory') as h(entry)
      where entry->>'correctionId' = p_command::text) then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  result := public.bridge_stage_handoff_correction(p_session, p_base, p_command, p_text);
  if receipt is null and (result->>'status' = 'pending_confirmation' or exists (
    select 1 from public.bridge_console_handoffs h,
      lateral jsonb_array_elements(coalesce(h.payload->'correctionConflicts', '[]'::jsonb)) as c(entry)
    where h.session_id = p_session and c.entry->>'id' = p_command::text
  )) then
    insert into public.bridge_session_commands values (
      p_session, p_command, coalesce((result->>'revision')::bigint, (snapshot->>'revision')::bigint),
      jsonb_build_object('operation', 'citizen_correction', 'requestFingerprint', fingerprint, 'value', result)
    );
  end if;
  return result;
end;
$$;

revoke execute on function public.bridge_submit_citizen_correction(uuid,bigint,uuid,uuid,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.bridge_submit_citizen_correction(uuid,bigint,uuid,uuid,bigint,text,text)
  to service_role;

commit;