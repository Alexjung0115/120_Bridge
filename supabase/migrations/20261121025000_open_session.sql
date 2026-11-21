begin;

create function public.bridge_open_session(p_owner uuid, p_session uuid, p_mode text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare existing public.consultations%rowtype;
begin
  -- Serialize admission across server instances, including retries.
  perform pg_catalog.pg_advisory_xact_lock(120, 10);
  select * into existing from public.consultations where id = p_session;
  if found then
    if existing.citizen_user_id <> p_owner or existing.channel <> p_mode then
      return jsonb_build_object('status', 'conflict');
    end if;
    return jsonb_build_object('status', 'existing', 'snapshot', public.bridge_load_session(p_session));
  end if;
  if (select count(*) from public.bridge_session_snapshots
      where session_snapshot->>'state' not in ('ended','completed_demo','transferred_demo')) >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  insert into public.consultations(id, citizen_user_id, channel)
    values (p_session, p_owner, p_mode);
  return jsonb_build_object('status', 'created', 'snapshot',
    public.bridge_initialize_session(p_session, p_snapshot));
end;
$$;

revoke execute on function public.bridge_open_session(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bridge_open_session(uuid, uuid, text, jsonb) to service_role;

commit;