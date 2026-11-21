begin;

-- T035: redacted improvement candidates. One per session; the conversation itself stays in the protected
-- session tables. Verification, approval and corpus publishing happen in the CLI/file workflow (T036).
create table public.bridge_improvement_candidates (
  id uuid primary key,
  session_id uuid not null unique references public.bridge_session_snapshots(consultation_id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.bridge_improvement_candidates enable row level security;
revoke all on public.bridge_improvement_candidates from public, anon, authenticated;

create function public.bridge_record_improvement(p_candidate jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare saved jsonb;
begin
  if p_candidate is null or p_candidate->>'status' is distinct from 'open' then
    raise invalid_parameter_value;
  end if;
  insert into public.bridge_improvement_candidates(id, session_id, payload)
    values ((p_candidate->>'id')::uuid, (p_candidate->>'sessionId')::uuid, p_candidate)
    on conflict (session_id) do nothing;
  select payload into saved from public.bridge_improvement_candidates
    where session_id = (p_candidate->>'sessionId')::uuid;
  return saved;
end;
$$;

create function public.bridge_list_improvements()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(payload order by created_at, id), '[]'::jsonb)
  from (select payload, created_at, id from public.bridge_improvement_candidates
        order by created_at desc, id limit 200) recent
$$;

revoke execute on function public.bridge_record_improvement(jsonb), public.bridge_list_improvements()
  from public, anon, authenticated;
grant execute on function public.bridge_record_improvement(jsonb), public.bridge_list_improvements()
  to service_role;

commit;
