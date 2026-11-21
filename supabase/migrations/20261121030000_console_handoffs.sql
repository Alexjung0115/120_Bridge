begin;

create table public.bridge_console_handoffs (
  session_id uuid primary key references public.bridge_session_snapshots(consultation_id) on delete cascade,
  handoff_id uuid not null unique,
  payload jsonb not null
);
alter table public.bridge_console_handoffs enable row level security;
revoke all on public.bridge_console_handoffs from public, anon, authenticated;

create function public.bridge_deliver_handoff(p_session uuid, p_base bigint, p_handoff jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  snapshot jsonb;
  existing jsonb;
  stored jsonb;
begin
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select payload into existing from public.bridge_console_handoffs where session_id = p_session;
  if found then
    if existing->>'idempotencyKey' = p_handoff->>'idempotencyKey' then
      return jsonb_build_object('status', 'replayed', 'handoff', existing);
    end if;
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  if p_base is null or p_base < 0 or p_base >= 9007199254740991
    or snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from 'sending' then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;
  if p_handoff->'summary'->'sessionRevision' is distinct from to_jsonb(p_base)
    or p_handoff->'summary'->'revision' is distinct from p_handoff->'summaryRevision'
    or p_handoff->'summary'->>'id' is distinct from p_handoff->>'summaryId'
    or not coalesce(
      (p_handoff->'summary'->>'confirmation' = 'confirmed' and
        nullif(p_handoff->'summary'->>'confirmedAt', '') is not null)
      or (p_handoff->'summary'->>'confirmation' = 'unconfirmed' and
        nullif(btrim(p_handoff->'summary'->>'skipReason'), '') is not null), false)
    or jsonb_path_exists(p_handoff, '$.**.citizenToken')
    or jsonb_path_exists(p_handoff, '$.**.citizenTokenHash') then
    raise invalid_parameter_value;
  end if;

  if not exists (select 1 from public.bridge_handoff_approvals
    where session_id = p_session and summary = p_handoff->'summary') then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  stored := p_handoff || jsonb_build_object(
    'sessionId', p_session, 'status', 'sending', 'receivedAt', null,
    'deliveryRevision', 1, 'acknowledgedRevision', 0, 'pendingCorrection', null, 'summaryHistory', '[]'::jsonb,
    'transcriptSnapshot', coalesce((select jsonb_agg(turn order by ord) from
      jsonb_array_elements(snapshot->'transcript') with ordinality as entry(turn, ord)
      where turn->>'outputStatus' = 'committed'), '[]'::jsonb),
    'claimedAt', null, 'completedAt', null, 'agentId', null,
    'selectedCandidateId', null, 'resolutionNote', null, 'repeatExplanationCount', null
  );
  insert into public.bridge_console_handoffs(session_id, handoff_id, payload)
    values (p_session, (stored->>'id')::uuid, stored);

  return jsonb_build_object('status', 'sending', 'handoff', stored);
end;
$$;

create function public.bridge_console_queue(p_after uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  with page as (
    select session_id, handoff_id, payload
    from public.bridge_console_handoffs
    where payload->>'status' = 'queued' and (p_after is null or session_id > p_after)
    order by session_id limit 51
  ), numbered as (
    select *, row_number() over (order by session_id) as position from page
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object('sessionId', session_id, 'handoffId', handoff_id,
      'status', payload->>'status', 'receivedAt', payload->'receivedAt')
      order by session_id) filter (where position <= 50), '[]'::jsonb),
    'nextCursor', max(session_id::text) filter (where position = 50 and (select count(*) from page) > 50)
  ) from numbered
$$;

create function public.bridge_console_detail(p_session uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'sessionId', handoff.session_id, 'handoffId', handoff.handoff_id,
    'revision', snapshot.session_snapshot->'revision', 'state', snapshot.session_snapshot->'state',
    'transcript', handoff.payload->'transcriptSnapshot', 'summary', handoff.payload->'summary',
    'candidates', handoff.payload->'candidates', 'summaryHistory', handoff.payload->'summaryHistory',
    'unresolvedIssueIds', handoff.payload->'unresolvedIssueIds',
    'resolvedContextIds', handoff.payload->'resolvedContextIds',
    'deliveryRevision', handoff.payload->'deliveryRevision',
    'pendingCorrection', handoff.payload->'pendingCorrection',
    'correctionConflicts', coalesce(handoff.payload->'correctionConflicts', '[]'::jsonb),
    'acknowledgedRevision', handoff.payload->'acknowledgedRevision'
  )
  from public.bridge_console_handoffs handoff
  join public.bridge_session_snapshots snapshot on snapshot.consultation_id = handoff.session_id
  where handoff.session_id = p_session and (handoff.payload->>'acknowledgedRevision')::bigint >= 1
$$;

revoke execute on function public.bridge_deliver_handoff(uuid, bigint, jsonb),
  public.bridge_console_queue(uuid), public.bridge_console_detail(uuid) from public, anon, authenticated;
grant execute on function public.bridge_deliver_handoff(uuid, bigint, jsonb),
  public.bridge_console_queue(uuid), public.bridge_console_detail(uuid) to service_role;

create function public.bridge_stage_handoff_correction(
  p_session uuid, p_base bigint, p_correction uuid, p_text text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare snapshot jsonb; handoff jsonb; version_after bigint;
begin
  if p_correction is null or p_text is null or btrim(p_text) = ''
    or char_length(p_text) > 2000 then raise invalid_parameter_value; end if;
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select payload into handoff from public.bridge_console_handoffs where session_id = p_session;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if handoff->'pendingCorrection'->>'id' = p_correction::text then
    return jsonb_build_object('status', 'pending_confirmation', 'handoffId', handoff->'id',
      'revision', snapshot->'revision', 'deliveryRevision', handoff->'deliveryRevision');
  end if;
  if exists (select 1 from jsonb_array_elements(handoff->'summaryHistory') as previous(entry)
      where entry->>'correctionId' = p_correction::text) then
    return jsonb_build_object('status', 'replayed', 'handoffId', handoff->'id');
  end if;

  if snapshot->>'state' in ('serving','completed_demo','transferred_demo') then
    if not exists (select 1 from jsonb_array_elements(coalesce(handoff->'correctionConflicts','[]'::jsonb)) as conflicts(entry)
        where entry->>'id' = p_correction::text) then
      update public.bridge_console_handoffs set payload = handoff || jsonb_build_object(
        'correctionConflicts', coalesce(handoff->'correctionConflicts','[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('id', p_correction, 'text', p_text))
      ) where session_id = p_session;
    end if;
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  if p_base is null or p_base < 0 or p_base >= 9007199254740991
    or snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from 'queued'
    or handoff->>'status' is distinct from 'queued'
    or handoff->'deliveryRevision' is distinct from handoff->'acknowledgedRevision' then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  version_after := (handoff->>'deliveryRevision')::bigint + 1;
  update public.bridge_console_handoffs set payload = handoff || jsonb_build_object(
    'deliveryRevision', version_after, 'pendingCorrection', jsonb_build_object('id', p_correction, 'text', p_text)
  ) where session_id = p_session;
  update public.bridge_session_snapshots set session_snapshot = snapshot || jsonb_build_object(
    'revision', p_base + 1, 'updatedAt', clock_timestamp()
  ) where consultation_id = p_session;
  return jsonb_build_object('status', 'pending_confirmation', 'handoffId', handoff->'id',
    'revision', p_base + 1, 'deliveryRevision', version_after);
end;
$$;

revoke execute on function public.bridge_stage_handoff_correction(uuid, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.bridge_stage_handoff_correction(uuid, bigint, uuid, text) to service_role;

create function public.bridge_correct_handoff(p_session uuid, p_base bigint, p_correction uuid, p_summary jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  snapshot jsonb;
  handoff jsonb;
  revision_after bigint;
  version_after bigint;
begin
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select payload into handoff from public.bridge_console_handoffs where session_id = p_session;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if p_correction is not null and exists (
    select 1 from jsonb_array_elements(handoff->'summaryHistory') as history(entry)
    where entry->>'correctionId' = p_correction::text
  ) then
    return jsonb_build_object('status', 'replayed', 'handoffId', handoff->'id');
  end if;
  if p_base is null or p_base < 0 or p_base >= 9007199254740991
    or snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from 'queued'
    or handoff->>'status' is distinct from 'queued'
    or handoff->'deliveryRevision' is not distinct from handoff->'acknowledgedRevision'
    or handoff->'pendingCorrection'->>'id' is distinct from p_correction::text then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;
  if p_correction is null
    or p_summary->'sessionRevision' is distinct from to_jsonb(p_base)
    or p_summary->>'id' is null
    or jsonb_typeof(p_summary->'revision') is distinct from 'number'
    or (p_summary->>'revision')::numeric <= (handoff->>'summaryRevision')::numeric
    or not coalesce(
      (p_summary->>'confirmation' = 'confirmed' and nullif(p_summary->>'confirmedAt', '') is not null)
      or (p_summary->>'confirmation' = 'unconfirmed' and nullif(btrim(p_summary->>'skipReason'), '') is not null), false)
    or jsonb_path_exists(p_summary, '$.**.citizenToken')
    or jsonb_path_exists(p_summary, '$.**.citizenTokenHash') then
    raise invalid_parameter_value;
  end if;

  revision_after := p_base + 1;
  version_after := (handoff->>'acknowledgedRevision')::bigint + 1;
  -- The amended summary becomes visible in the same transaction as its acknowledgement.
  update public.bridge_console_handoffs set payload = handoff || jsonb_build_object(
    'summary', p_summary, 'summaryId', p_summary->'id', 'summaryRevision', p_summary->'revision',
    'deliveryRevision', version_after, 'acknowledgedRevision', version_after, 'pendingCorrection', null,
    'summaryHistory', handoff->'summaryHistory' || jsonb_build_array(jsonb_build_object(
      'correctionId', p_correction, 'summary', handoff->'summary',
      'deliveryRevision', handoff->'acknowledgedRevision')))
    where session_id = p_session;
  update public.bridge_session_snapshots set session_snapshot = snapshot || jsonb_build_object(
    'revision', revision_after, 'updatedAt', clock_timestamp()
  ) where consultation_id = p_session;
  return jsonb_build_object('status', 'queued', 'handoffId', handoff->'id',
    'revision', revision_after, 'deliveryRevision', version_after);
end;
$$;

revoke execute on function public.bridge_correct_handoff(uuid, bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bridge_correct_handoff(uuid, bigint, uuid, jsonb) to service_role;

create table public.bridge_handoff_approvals (
  session_id uuid primary key references public.bridge_session_snapshots(consultation_id) on delete cascade,
  summary jsonb not null
);
alter table public.bridge_handoff_approvals enable row level security;
revoke all on public.bridge_handoff_approvals from public, anon, authenticated;

-- Called by the trusted citizen command handler after confirmation or a valid skip.
create function public.bridge_record_handoff_approval(p_session uuid, p_base bigint, p_summary jsonb)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare snapshot jsonb;
begin
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found or p_base is null or p_base < 0
    or snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from 'sending'
    or p_summary->'sessionRevision' is distinct from to_jsonb(p_base) then return false; end if;
  insert into public.bridge_handoff_approvals values (p_session, p_summary)
    on conflict (session_id) do update set summary = excluded.summary
    where bridge_handoff_approvals.summary->'sessionRevision' is distinct from to_jsonb(p_base);
  return exists (select 1 from public.bridge_handoff_approvals
    where session_id = p_session and summary = p_summary);
end;
$$;

create function public.bridge_acknowledge_handoff(p_session uuid, p_base bigint, p_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare snapshot jsonb; handoff jsonb;
begin
  select session_snapshot into snapshot from public.bridge_session_snapshots
    where consultation_id = p_session for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select payload into handoff from public.bridge_console_handoffs where session_id = p_session;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if handoff->>'idempotencyKey' is distinct from p_key::text then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;
  if (handoff->>'acknowledgedRevision')::bigint >= 1 then
    return jsonb_build_object('status', 'replayed', 'handoff', handoff);
  end if;
  if p_base is null or p_base < 0 or p_base >= 9007199254740991
    or snapshot->'revision' is distinct from to_jsonb(p_base)
    or snapshot->>'state' is distinct from 'sending'
    or handoff->>'status' is distinct from 'sending' then
    return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
  end if;

  handoff := handoff || jsonb_build_object('status','queued','acknowledgedRevision',1,'receivedAt',clock_timestamp());
  update public.bridge_console_handoffs set payload = handoff where session_id = p_session;
  update public.bridge_session_snapshots set session_snapshot = snapshot || jsonb_build_object(
    'state', 'queued', 'handoffId', handoff->'id', 'pendingRequestId', null,
    'revision', p_base + 1, 'updatedAt', clock_timestamp()
  ) where consultation_id = p_session;
  return jsonb_build_object('status', 'queued', 'handoff', handoff);
end;
$$;

revoke execute on function public.bridge_record_handoff_approval(uuid, bigint, jsonb),
  public.bridge_acknowledge_handoff(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.bridge_record_handoff_approval(uuid, bigint, jsonb),
  public.bridge_acknowledge_handoff(uuid, bigint, uuid) to service_role;

commit;