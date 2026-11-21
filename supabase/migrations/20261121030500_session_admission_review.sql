begin;

alter table public.bridge_session_snapshots add column admission_source text;

create function public.bridge_open_session_limited(
  p_owner uuid, p_session uuid, p_mode text, p_snapshot jsonb, p_source text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb; expired_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(120, 10);
  expired_at := clock_timestamp();
  with expired as (
    update public.bridge_session_snapshots
    set session_snapshot = session_snapshot || jsonb_build_object(
      'state','ended','outcome','unknown','outcomeConfirmedAt',null,
      'revision',(session_snapshot->>'revision')::bigint + 1,
      'pendingRequestId',null,'updatedAt',expired_at,
      'transcript',coalesce((select jsonb_agg(case when turn->>'outputStatus' = 'pending'
        then turn || '{"outputStatus":"discarded"}'::jsonb else turn end order by ord)
        from jsonb_array_elements(session_snapshot->'transcript') with ordinality t(turn,ord)), '[]'::jsonb))
    where session_snapshot->>'state' in ('active','handoff_offered','summary_confirm')
      and (session_snapshot->>'updatedAt')::timestamptz < expired_at - interval '15 minutes'
    returning consultation_id
  )
  update public.consultations c set closed_at = expired_at
    from expired where c.id = expired.consultation_id;

  if p_source is not null
    and not exists (select 1 from public.consultations where id = p_session)
    and (select count(*) from public.bridge_session_snapshots
      where admission_source = p_source
        and session_snapshot->>'state' not in ('ended','completed_demo','transferred_demo')) >= 3 then
    return jsonb_build_object('status','limit');
  end if;

  result := public.bridge_open_session(p_owner,p_session,p_mode,p_snapshot);
  if result->>'status' = 'created' then
    update public.bridge_session_snapshots set admission_source = p_source where consultation_id = p_session;
  end if;
  return result;
end;
$$;

revoke execute on function public.bridge_open_session_limited(uuid,uuid,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.bridge_open_session_limited(uuid,uuid,text,jsonb,text) to service_role;

create or replace function public.bridge_stage_handoff_correction(
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
    if handoff->'pendingCorrection'->>'text' is distinct from p_text then
      return jsonb_build_object('status', 'conflict', 'revision', snapshot->'revision');
    end if;
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

commit;
