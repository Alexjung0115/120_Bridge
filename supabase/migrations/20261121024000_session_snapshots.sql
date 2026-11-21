begin;

create table public.bridge_session_snapshots (
  consultation_id uuid primary key references public.consultations(id) on delete cascade,
  session_snapshot jsonb not null
);
alter table public.bridge_session_snapshots enable row level security;
revoke all on public.bridge_session_snapshots from public, anon, authenticated;

create table public.bridge_session_commands (
  consultation_id uuid not null references public.bridge_session_snapshots(consultation_id) on delete cascade,
  command_id uuid not null,
  revision bigint not null,
  response jsonb not null,
  primary key (consultation_id, command_id)
);
alter table public.bridge_session_commands enable row level security;
revoke all on public.bridge_session_commands from public, anon, authenticated;

create function public.bridge_load_session(p_session uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select session_snapshot from public.bridge_session_snapshots where consultation_id = p_session
$$;

create function public.bridge_read_session_command(p_session uuid, p_command uuid)
returns jsonb language sql security definer set search_path = ''
as $$
  select jsonb_build_object('status', 'replayed', 'revision', revision, 'result', response->'value')
  from public.bridge_session_commands where consultation_id = p_session and command_id = p_command
$$;

create function public.bridge_initialize_session(p_session uuid, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare stored jsonb;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot->>'id' is distinct from p_session::text
    or p_snapshot->'revision' is distinct from '0'::jsonb
    or coalesce(p_snapshot->>'citizenTokenHash', '') = ''
    or jsonb_path_exists(p_snapshot, '$.**.citizenToken') then
    raise invalid_parameter_value;
  end if;

  perform 1 from public.consultations where id = p_session for key share;
  if not found then return null; end if;

  insert into public.bridge_session_snapshots (consultation_id, session_snapshot)
    values (p_session, p_snapshot) on conflict (consultation_id) do nothing;
  select session_snapshot into stored from public.bridge_session_snapshots
    where consultation_id = p_session;
  return stored;
end;
$$;

create function public.bridge_commit_session_command(
  p_session uuid, p_command uuid, p_base bigint, p_snapshot jsonb, p_result jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  stored jsonb;
  replay jsonb;
  revision_after bigint;
begin
  select session_snapshot into stored from public.bridge_session_snapshots
  where consultation_id = p_session for update;
  if stored is null then return jsonb_build_object('status', 'not_found'); end if;

  replay := public.bridge_read_session_command(p_session, p_command);
  if replay is not null then return replay; end if;

  if p_base is null or p_base < 0 or p_base >= 9007199254740991 then
    raise invalid_parameter_value;
  end if;
  if stored->'revision' is distinct from to_jsonb(p_base) then
    return jsonb_build_object('status', 'conflict', 'revision', stored->'revision');
  end if;

  revision_after := p_base + 1;
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot->>'id' is distinct from p_session::text
    or p_snapshot->'revision' is distinct from to_jsonb(revision_after)
    or p_snapshot->'citizenTokenHash' is distinct from stored->'citizenTokenHash'
    or jsonb_path_exists(p_snapshot, '$.**.citizenToken')
    or jsonb_path_exists(p_result, '$.**.citizenToken')
    or jsonb_path_exists(p_result, '$.**.citizenTokenHash') then
    raise invalid_parameter_value;
  end if;

  update public.bridge_session_snapshots set session_snapshot = p_snapshot where consultation_id = p_session;
  insert into public.bridge_session_commands values (
    p_session, p_command, revision_after, jsonb_build_object('value', p_result)
  );

  return jsonb_build_object('status', 'committed', 'revision', revision_after, 'result', p_result);
end;
$$;

revoke execute on function public.bridge_load_session(uuid),
  public.bridge_read_session_command(uuid, uuid), public.bridge_initialize_session(uuid, jsonb),
  public.bridge_commit_session_command(uuid, uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bridge_load_session(uuid),
  public.bridge_read_session_command(uuid, uuid), public.bridge_initialize_session(uuid, jsonb),
  public.bridge_commit_session_command(uuid, uuid, bigint, jsonb, jsonb) to service_role;

commit;