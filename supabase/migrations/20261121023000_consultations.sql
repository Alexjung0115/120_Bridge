begin;

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  citizen_user_id uuid not null references auth.users(id),
  channel text not null check (channel in ('voice', 'text')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id),
  sequence integer not null check (sequence > 0),
  speaker text not null check (speaker in ('citizen', 'ai', 'counselor')),
  content text not null check (char_length(btrim(content)) between 1 and 8000),
  created_at timestamptz not null default now(),
  unique (consultation_id, sequence)
);

create table public.consultation_summaries (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id),
  version integer not null check (version > 0),
  program_name text not null check (char_length(btrim(program_name)) between 1 and 200),
  region text not null check (char_length(btrim(region)) between 1 and 200),
  application_date date,
  summary_text text not null check (char_length(btrim(summary_text)) between 1 and 2000),
  confirmed_at timestamptz not null default now(),
  unique (consultation_id, version),
  unique (consultation_id, id)
);

create table public.handoff_requests (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id),
  summary_id uuid,
  status text not null default 'waiting' check (status in ('waiting', 'accepted', 'expired', 'cancelled')),
  accepted_by uuid references auth.users(id),
  requested_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  foreign key (consultation_id, summary_id) references public.consultation_summaries(consultation_id, id),
  check (expires_at > requested_at),
  check ((status = 'accepted') = (accepted_by is not null)),
  check ((status = 'waiting') = (resolved_at is null))
);

create index consultations_by_citizen on public.consultations (citizen_user_id, created_at desc);
create index handoffs_by_consultation on public.handoff_requests (consultation_id, requested_at desc);
create index handoff_waiting_queue on public.handoff_requests (requested_at) where status = 'waiting';
create unique index one_waiting_handoff on public.handoff_requests (consultation_id) where status = 'waiting';

alter table public.consultations enable row level security;
alter table public.messages enable row level security;
alter table public.consultation_summaries enable row level security;
alter table public.handoff_requests enable row level security;

revoke all on public.consultations, public.messages, public.consultation_summaries, public.handoff_requests from public, anon, authenticated;
grant select on public.consultations, public.messages, public.consultation_summaries, public.handoff_requests to authenticated;

create function public.is_bridge_counselor() returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((auth.jwt()->'app_metadata'->>'bridge_role') = 'counselor', false)
    and coalesce((auth.jwt()->>'is_anonymous') = 'false', false);
$$;

-- Read helpers avoid a recursive consultation / handoff policy dependency.
create function public.owns_bridge_consultation(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consultations where id = p_id and citizen_user_id = (select auth.uid())
  );
$$;

create function public.handles_bridge_consultation(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_bridge_counselor() and exists (
    select 1 from public.handoff_requests
    where consultation_id = p_id and status = 'accepted' and accepted_by = (select auth.uid())
  );
$$;

create policy consultation_read on public.consultations for select to authenticated
  using (citizen_user_id = (select auth.uid()) or public.handles_bridge_consultation(id));
create policy message_read on public.messages for select to authenticated
  using (public.owns_bridge_consultation(consultation_id) or public.handles_bridge_consultation(consultation_id));
create policy summary_read on public.consultation_summaries for select to authenticated
  using (public.owns_bridge_consultation(consultation_id) or (
    (select public.is_bridge_counselor()) and exists (
      select 1 from public.handoff_requests h
      where h.summary_id = consultation_summaries.id and h.accepted_by = (select auth.uid())
    )
  ));
create policy handoff_read on public.handoff_requests for select to authenticated
  using (public.owns_bridge_consultation(consultation_id) or (
    (select public.is_bridge_counselor()) and (
      (status = 'waiting' and expires_at > statement_timestamp()) or accepted_by = (select auth.uid())
    )
  ));

create view public.bridge_handoff_status with (security_invoker = true) as
  select id, consultation_id, summary_id, accepted_by, requested_at, expires_at,
    case when status = 'waiting' and expires_at <= statement_timestamp() then 'expired' else status end as status,
    case when status = 'waiting' and expires_at <= statement_timestamp() then expires_at else resolved_at end as resolved_at
  from public.handoff_requests;
revoke all on public.bridge_handoff_status from public, anon, authenticated;
grant select on public.bridge_handoff_status to authenticated;

create function public.open_bridge_consultation(p_id uuid, p_channel text)
returns public.consultations
language plpgsql security definer set search_path = ''
as $$
declare result public.consultations;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.consultations (id, citizen_user_id, channel)
    values (p_id, auth.uid(), p_channel) on conflict (id) do nothing;
  select * into result from public.consultations where id = p_id and citizen_user_id = auth.uid();
  if not found then raise insufficient_privilege; end if;
  if result.channel <> p_channel then raise invalid_parameter_value; end if;
  return result;
end;
$$;

create function public.append_bridge_message(p_id uuid, p_consultation uuid, p_content text)
returns public.messages
language plpgsql security definer set search_path = ''
as $$
declare result public.messages;
  author text;
begin
  if public.owns_bridge_consultation(p_consultation) then author := 'citizen';
  elsif public.handles_bridge_consultation(p_consultation) then author := 'counselor';
  else raise insufficient_privilege; end if;
  perform 1 from public.consultations where id = p_consultation and closed_at is null for update;
  if not found then raise no_data_found; end if;
  insert into public.messages (id, consultation_id, sequence, speaker, content)
    select p_id, p_consultation, coalesce(max(sequence), 0) + 1, author, p_content
    from public.messages where consultation_id = p_consultation
    on conflict (id) do nothing returning * into result;
  if found then return result; end if;
  select * into result from public.messages
    where id = p_id and consultation_id = p_consultation and speaker = author and content = p_content;
  if not found then raise invalid_parameter_value; end if;
  return result;
end;
$$;

create function public.confirm_bridge_summary(
  p_consultation uuid, p_program text, p_region text, p_date date, p_summary text
) returns public.consultation_summaries
language plpgsql security definer set search_path = ''
as $$
declare result public.consultation_summaries;
begin
  if not public.owns_bridge_consultation(p_consultation) then raise insufficient_privilege; end if;
  perform 1 from public.consultations where id = p_consultation and closed_at is null for update;
  if not found then raise no_data_found; end if;
  select * into result from public.consultation_summaries
    where consultation_id = p_consultation order by version desc limit 1;
  if found and (result.program_name, result.region, result.application_date, result.summary_text)
      is not distinct from (btrim(p_program), btrim(p_region), p_date, btrim(p_summary)) then
    return result;
  end if;
  insert into public.consultation_summaries
    (consultation_id, version, program_name, region, application_date, summary_text)
    values (p_consultation, coalesce(result.version, 0) + 1, btrim(p_program), btrim(p_region), p_date, btrim(p_summary))
    returning * into result;
  return result;
end;
$$;

create function public.request_bridge_handoff(p_id uuid, p_consultation uuid)
returns public.handoff_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.handoff_requests;
  pinned_summary uuid;
  at_time timestamptz;
begin
  if not public.owns_bridge_consultation(p_consultation) then raise insufficient_privilege; end if;
  perform 1 from public.consultations where id = p_consultation and closed_at is null for update;
  if not found then raise no_data_found; end if;

  at_time := clock_timestamp();
  update public.handoff_requests set status = 'expired', resolved_at = expires_at
    where consultation_id = p_consultation and status = 'waiting' and expires_at <= at_time;
  select * into result from public.handoff_requests
    where consultation_id = p_consultation and (id = p_id or status in ('waiting', 'accepted'))
    order by (id = p_id) desc, requested_at desc limit 1;
  if found then return result; end if;

  select id into pinned_summary from public.consultation_summaries
    where consultation_id = p_consultation order by version desc limit 1;
  insert into public.handoff_requests (id, consultation_id, summary_id, requested_at, expires_at)
    values (p_id, p_consultation, pinned_summary, at_time, at_time + interval '15 seconds')
    returning * into result;
  return result;
end;
$$;

create function public.resolve_bridge_handoff(p_id uuid, p_action text)
returns public.handoff_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.handoff_requests;
  owner_id uuid;
  at_time timestamptz;
begin
  if p_action is null or p_action not in ('accept', 'cancel', 'expire') then
    raise invalid_parameter_value;
  end if;
  select h.* into result from public.handoff_requests h where h.id = p_id for update;
  if not found then raise no_data_found; end if;
  select citizen_user_id into owner_id from public.consultations where id = result.consultation_id;

  if p_action = 'accept' then
    if not public.is_bridge_counselor() then raise insufficient_privilege; end if;
    if result.status <> 'waiting' and result.accepted_by is distinct from auth.uid() then
      raise insufficient_privilege;
    end if;
  elsif owner_id is distinct from auth.uid() and (p_action <> 'expire' or not public.is_bridge_counselor()) then
    raise insufficient_privilege;
  end if;
  if result.status <> 'waiting' then return result; end if;

  at_time := clock_timestamp();
  if result.expires_at <= at_time then
    update public.handoff_requests set status = 'expired', resolved_at = expires_at
      where id = p_id returning * into result;
  elsif p_action <> 'expire' then
    update public.handoff_requests
      set status = case when p_action = 'accept' then 'accepted' else 'cancelled' end,
          accepted_by = case when p_action = 'accept' then auth.uid() end,
          resolved_at = at_time
      where id = p_id returning * into result;
  end if;
  return result;
end;
$$;

revoke execute on function public.is_bridge_counselor(), public.owns_bridge_consultation(uuid),
  public.handles_bridge_consultation(uuid), public.open_bridge_consultation(uuid, text),
  public.append_bridge_message(uuid, uuid, text), public.confirm_bridge_summary(uuid, text, text, date, text),
  public.request_bridge_handoff(uuid, uuid), public.resolve_bridge_handoff(uuid, text) from public, anon;
grant execute on function public.is_bridge_counselor(), public.owns_bridge_consultation(uuid),
  public.handles_bridge_consultation(uuid), public.open_bridge_consultation(uuid, text),
  public.append_bridge_message(uuid, uuid, text), public.confirm_bridge_summary(uuid, text, text, date, text),
  public.request_bridge_handoff(uuid, uuid), public.resolve_bridge_handoff(uuid, text) to authenticated;

alter publication supabase_realtime add table public.handoff_requests;

commit;
