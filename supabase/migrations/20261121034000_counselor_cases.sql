begin;

create function public.bridge_console_cases(p_status text, p_after uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if p_status is null or p_status not in ('all', 'queued', 'serving', 'completed') then
    raise invalid_parameter_value;
  end if;
  with page as (
    select session_id, payload
    from public.bridge_console_handoffs
    where payload->>'status' in ('queued', 'serving', 'transferred_demo', 'completed_demo')
      and (p_status = 'all' or (p_status = 'queued' and payload->>'status' = 'queued')
        or (p_status = 'serving' and payload->>'status' in ('serving', 'transferred_demo'))
        or (p_status = 'completed' and payload->>'status' = 'completed_demo'))
      and (p_after is null or session_id > p_after)
    order by session_id limit 51
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', session_id, 'payload', jsonb_build_object('status', payload->'status', 'receivedAt', payload->'receivedAt')
  ) order by session_id), '[]'::jsonb) into result from page;
  return result;
end;
$$;

revoke execute on function public.bridge_console_cases(text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_console_cases(text, uuid) to service_role;

commit;
