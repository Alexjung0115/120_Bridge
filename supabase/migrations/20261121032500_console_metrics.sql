begin;
create function public.bridge_console_metrics_input(p_end timestamptz)
returns jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.consultation_id, 'state',s.session_snapshot->'state',
      'outcome',s.session_snapshot->'outcome','outcomeConfirmedAt',s.session_snapshot->'outcomeConfirmedAt',
      'repeatExplanationCount',h.payload->'repeatExplanationCount'))
      from public.bridge_session_snapshots s left join public.bridge_console_handoffs h on h.session_id=s.consultation_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(event) from (
      select jsonb_build_object('id',e.id,'sessionId',e.session_id,'eventType',e.event_type,
        'timestamp',e.occurred_at,'actorPseudonym',e.actor_pseudonym,'reason',e.reason,
        'measurementMode',e.measurement_mode,'corpusVersion',e.corpus_version) as event
      from public.bridge_metric_events e where e.occurred_at < p_end
      union all
      select jsonb_build_object('id',h.handoff_id::text || ':received','sessionId',h.session_id,'eventType','queue_received',
        'timestamp',h.payload->'receivedAt','actorPseudonym',null,'reason',null,
        'measurementMode','simulation','corpusVersion',s.session_snapshot->'corpusVersion')
      from public.bridge_console_handoffs h join public.bridge_session_snapshots s on s.consultation_id=h.session_id
      where (h.payload->>'receivedAt')::timestamptz < p_end
    ) all_events), '[]'::jsonb)
  );
$$;
revoke execute on function public.bridge_console_metrics_input(timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_console_metrics_input(timestamptz) to service_role;
commit;