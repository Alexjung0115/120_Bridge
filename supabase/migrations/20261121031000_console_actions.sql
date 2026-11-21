begin;

create table public.bridge_metric_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.bridge_session_snapshots(consultation_id) on delete cascade,
  event_type text not null check (event_type in ('agent_claimed','case_completed','repeat_explanation_recorded','session_ended')),
  occurred_at timestamptz not null,
  actor_pseudonym text,
  reason text,
  measurement_mode text not null default 'simulation' check (measurement_mode = 'simulation'),
  corpus_version text not null,
  repeat_explanation_count integer check (repeat_explanation_count >= 0),
  unique (session_id, event_type)
);
alter table public.bridge_metric_events enable row level security;
revoke all on public.bridge_metric_events from public, anon, authenticated;

create function public.bridge_apply_console_action(
  p_session uuid, p_command uuid, p_base bigint, p_agent text, p_action text,
  p_candidate uuid, p_outcome jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  snapshot jsonb;
  handoff jsonb;
  replay jsonb;
  fingerprint text;
  outcome jsonb;
  next_state text;
  next_revision bigint;
  occurred timestamptz;
  repeats integer;
begin
  if p_command is null or p_agent is null or btrim(p_agent) = ''
    or p_action is null or p_action not in ('claim','transfer_demo','complete_case')
    or p_base is null or p_base < 0 or p_base >= 9007199254740991 then
    raise invalid_parameter_value;
  end if;

  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select payload into handoff from public.bridge_console_handoffs where session_id = p_session;
  if not found or (handoff->>'acknowledgedRevision')::bigint = 0 then
    return jsonb_build_object('status','not_found');
  end if;

  fingerprint := encode(sha256(convert_to(jsonb_build_array(
    p_base, p_agent, p_action, p_candidate, p_outcome)::text, 'UTF8')), 'hex');
  select response into replay from public.bridge_session_commands
    where consultation_id = p_session and command_id = p_command;
  if found then
    if replay->>'requestFingerprint' = fingerprint then
      return jsonb_build_object('status','replayed','data',replay->'value');
    end if;
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  if snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from handoff->>'status'
    or handoff->'deliveryRevision' is distinct from handoff->'acknowledgedRevision'
    or handoff->'pendingCorrection' is distinct from 'null'::jsonb then
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  occurred := clock_timestamp();
  if p_action = 'claim' and snapshot->>'state' = 'queued' then
    next_state := 'serving';
    handoff := handoff || jsonb_build_object('agentId', p_agent, 'claimedAt', occurred);
  elsif handoff->>'agentId' is distinct from p_agent then
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  elsif p_action = 'transfer_demo' and snapshot->>'state' = 'serving' then
    if p_candidate is null or not exists (
      select 1 from jsonb_array_elements(handoff->'candidates') c
      where c->>'id' = p_candidate::text
    ) then return jsonb_build_object('status','invalid_candidate'); end if;
    next_state := 'transferred_demo';
    handoff := handoff || jsonb_build_object('selectedCandidateId', p_candidate);
  elsif p_action = 'complete_case' and snapshot->>'state' in ('serving','transferred_demo') then
    next_state := 'completed_demo';
    repeats := (p_outcome->>'repeatExplanationCount')::integer;
    handoff := handoff || jsonb_build_object('completedAt', occurred,
      'resolutionNote', p_outcome->'resolutionNote', 'repeatExplanationCount', repeats,
      'outcome', jsonb_build_object('gapReason', p_outcome->'gapReason',
        'proposedSourceUrls', coalesce(p_outcome->'proposedSourceUrls','[]'::jsonb)));
  else
    return jsonb_build_object('status','conflict','revision',snapshot->'revision');
  end if;

  next_revision := p_base + 1;
  update public.bridge_console_handoffs set payload = handoff || jsonb_build_object('status',next_state)
    where session_id = p_session;
  update public.bridge_session_snapshots set session_snapshot = snapshot || jsonb_build_object(
    'state',next_state,'revision',next_revision,'updatedAt',occurred,'outcome','handoff',
    'outcomeConfirmedAt',case when next_state = 'completed_demo' then to_jsonb(occurred) else snapshot->'outcomeConfirmedAt' end
  ) where consultation_id = p_session;

  if p_action = 'claim' then
    insert into public.bridge_metric_events(session_id,event_type,occurred_at,actor_pseudonym,corpus_version)
      values (p_session,'agent_claimed',occurred,p_agent,snapshot->>'corpusVersion');
  elsif p_action = 'complete_case' then
    insert into public.bridge_metric_events(session_id,event_type,occurred_at,actor_pseudonym,corpus_version,repeat_explanation_count)
      values
        (p_session,'case_completed',occurred,p_agent,snapshot->>'corpusVersion',null),
        (p_session,'session_ended',occurred,p_agent,snapshot->>'corpusVersion',null);
    if repeats is not null then
      insert into public.bridge_metric_events(session_id,event_type,occurred_at,actor_pseudonym,corpus_version,repeat_explanation_count)
        values (p_session,'repeat_explanation_recorded',occurred,p_agent,snapshot->>'corpusVersion',repeats);
    end if;
  end if;

  outcome := jsonb_build_object('action',p_action,'agentId',p_agent,'state',next_state,
    'revision',next_revision,'handoffId',handoff->'id',
    'selectedCandidateId',handoff->'selectedCandidateId','measurementMode','simulation');
  insert into public.bridge_session_commands values (
    p_session,p_command,next_revision,jsonb_build_object('value',outcome,'requestFingerprint',fingerprint));
  return jsonb_build_object('status','committed','data',outcome);
end;
$$;

revoke execute on function public.bridge_apply_console_action(uuid,uuid,bigint,text,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.bridge_apply_console_action(uuid,uuid,bigint,text,text,uuid,jsonb)
  to service_role;

commit;