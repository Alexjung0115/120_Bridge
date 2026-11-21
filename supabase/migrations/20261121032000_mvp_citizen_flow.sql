begin;

create function public.bridge_mvp_citizen_command(
  p_session uuid, p_command uuid, p_base bigint, p_hash text, p_kind text, p_text text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  snapshot jsonb; receipt jsonb; fp text; result jsonb; summary jsonb;
  next_revision bigint; at_time timestamptz; item jsonb; step jsonb;
begin
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p_hash is null or snapshot->>'citizenTokenHash' is distinct from p_hash then
    return jsonb_build_object('status','forbidden');
  end if;
  if p_command is null or p_base is null or p_base < 0 or p_base >= 9007199254740990
    or p_kind is null or p_kind not in ('turn','direct_handoff') then
    raise invalid_parameter_value;
  end if;

  fp := encode(sha256(convert_to(jsonb_build_array(p_kind,p_base,p_text)::text,'UTF8')),'hex');
  select response into receipt from public.bridge_session_commands
    where consultation_id = p_session and command_id = p_command;
  if found then
    if receipt->>'mvpFingerprint' = fp then
      return jsonb_build_object('status','replayed','data',receipt->'value');
    end if;
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  if snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from 'active' then
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  next_revision := p_base+1;
  at_time := clock_timestamp();
  if p_kind = 'turn' then
    if p_text is null or btrim(p_text) = '' or char_length(p_text) > 2000 then
      raise invalid_parameter_value;
    end if;
    if jsonb_array_length(snapshot->'transcript') >= 100 then
      return jsonb_build_object('status','limit');
    end if;
    item := jsonb_build_object('id',p_command,'sessionId',p_session,
      'sequence',coalesce((select max((turn->>'sequence')::bigint) from
        jsonb_array_elements(snapshot->'transcript') t(turn)),0)+1,
      'role','citizen','inputMode','text','text',p_text,'timestamp',at_time,
      'issueIds','[]'::jsonb,'outputStatus','committed','factCitations','[]'::jsonb);
    update public.bridge_session_snapshots set session_snapshot = snapshot || jsonb_build_object(
      'revision',next_revision,'updatedAt',at_time,
      'transcript',snapshot->'transcript'||jsonb_build_array(item)
    ) where consultation_id = p_session;
    result := jsonb_build_object('turnId',p_command,'revision',next_revision,'state','active',
      'processing',false,'utterances','[]'::jsonb,'cards','[]'::jsonb,'issues','[]'::jsonb);
  else
    summary := jsonb_build_object('id',p_command,'revision',1,'sessionRevision',next_revision,
      'coreLines',coalesce((select jsonb_agg(line order by ord) from
        (select left(turn->>'text',200) line,ord from jsonb_array_elements(snapshot->'transcript')
          with ordinality t(turn,ord) where turn->>'role'='citizen' and turn->>'outputStatus'='committed'
          order by ord desc limit 3) recent),'[]'::jsonb),
      'confirmation','unconfirmed','confirmedAt',null,'skipReason','시민이 요약 확인 없이 연결 요청',
      'fieldConfirmations','[]'::jsonb);
    update public.bridge_session_snapshots set session_snapshot = snapshot || jsonb_build_object(
      'state','sending','revision',next_revision,'updatedAt',at_time
    ) where consultation_id = p_session;
    if not public.bridge_record_handoff_approval(p_session,next_revision,summary) then
      raise exception 'Unable to record direct handoff';
    end if;
    step := public.bridge_deliver_handoff(p_session,next_revision,jsonb_build_object(
      'id',p_command,'idempotencyKey',p_command,'summaryId',p_command,'summaryRevision',1,'summary',summary,
      'unresolvedIssueIds','[]'::jsonb,'resolvedContextIds','[]'::jsonb,'candidates','[]'::jsonb));
    if step->>'status' is distinct from 'sending' then raise exception 'Unable to stage direct handoff'; end if;
    step := public.bridge_acknowledge_handoff(p_session,next_revision,p_command);
    if step->>'status' is distinct from 'queued' then raise exception 'Unable to acknowledge direct handoff'; end if;
    next_revision := next_revision+1;
    result := jsonb_build_object('state','queued','revision',next_revision,'handoffId',p_command,
      'presentationState','waiting','delivery', (step->'handoff') - 'transcriptSnapshot'::text);
  end if;

  insert into public.bridge_session_commands values (
    p_session,p_command,next_revision,jsonb_build_object('mvpFingerprint',fp,'value',result));
  return jsonb_build_object('status','committed','data',result);
end;
$$;
revoke execute on function public.bridge_mvp_citizen_command(uuid,uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.bridge_mvp_citizen_command(uuid,uuid,bigint,text,text,text) to service_role;

commit;