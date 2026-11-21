begin;
create table public.bridge_citizen_summary_drafts (
  session_id uuid primary key references public.bridge_session_snapshots(consultation_id) on delete cascade,
  summary jsonb not null
);
alter table public.bridge_citizen_summary_drafts enable row level security;
revoke all on public.bridge_citizen_summary_drafts from public, anon, authenticated;

create function public.bridge_citizen_summary_command(
  p_session uuid, p_command uuid, p_base bigint, p_hash text, p_summary_revision bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s jsonb; draft jsonb; receipt jsonb; result jsonb; step jsonb; next_revision bigint;
begin
  select session_snapshot into s from public.bridge_session_snapshots
    where consultation_id=p_session for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if p_hash is null or s->>'citizenTokenHash' is distinct from p_hash then
    return jsonb_build_object('status','forbidden');
  end if;
  if p_command is null or p_base is null or p_base < 0 or p_base >= 9007199254740990 then
    raise invalid_parameter_value;
  end if;
  select response into receipt from public.bridge_session_commands
    where consultation_id=p_session and command_id=p_command;
  if found then
    if receipt->>'operation'='citizen_summary'
      and receipt->'input'=jsonb_build_array(p_base,p_summary_revision) then
      return jsonb_build_object('status','replayed','data',receipt->'value');
    end if;
    return jsonb_build_object('status','conflict','revision',s->'revision');
  end if;
  if s->'revision' is distinct from to_jsonb(p_base) then
    return jsonb_build_object('status','conflict','revision',s->'revision');
  end if;

  next_revision := p_base+1;
  if p_summary_revision is null and s->>'state' in ('active','handoff_offered') then
    draft := jsonb_build_object('id',p_command,'revision',1,'sessionRevision',next_revision,
      'confirmation','pending','confirmedAt',null,'skipReason',null,'fieldConfirmations','[]'::jsonb,
      'coreLines',coalesce((select jsonb_agg(line order by ord) from (
        select left(turn->>'text',200) line,ord
        from jsonb_array_elements(s->'transcript') with ordinality t(turn,ord)
        where turn->>'role'='citizen' and turn->>'outputStatus'='committed'
        order by ord desc limit 3) recent),'[]'::jsonb));
    insert into public.bridge_citizen_summary_drafts values (p_session,draft)
      on conflict (session_id) do update set summary=excluded.summary;
    update public.bridge_session_snapshots set session_snapshot=s||jsonb_build_object(
      'state','summary_confirm','revision',next_revision,'updatedAt',clock_timestamp(),'pendingRequestId',null)
      where consultation_id=p_session;
    result := jsonb_build_object('state','summary_confirm','revision',next_revision,'summary',draft);
  elsif p_summary_revision is not null and s->>'state'='summary_confirm' then
    select summary into draft from public.bridge_citizen_summary_drafts where session_id=p_session;
    if draft->'revision' is distinct from to_jsonb(p_summary_revision)
       or draft->'sessionRevision' is distinct from to_jsonb(p_base) then
      return jsonb_build_object('status','conflict','revision',s->'revision');
    end if;
    draft := draft||jsonb_build_object('sessionRevision',next_revision,'confirmation','confirmed',
      'confirmedAt',clock_timestamp());
    update public.bridge_session_snapshots set session_snapshot=s||jsonb_build_object(
      'state','sending','revision',next_revision,'updatedAt',clock_timestamp())
      where consultation_id=p_session;
    if not public.bridge_record_handoff_approval(p_session,next_revision,draft) then
      raise exception 'Unable to record citizen approval';
    end if;
    step := public.bridge_deliver_handoff(p_session,next_revision,jsonb_build_object(
      'id',p_command,'idempotencyKey',p_command,'summaryId',draft->'id','summaryRevision',p_summary_revision,
      'summary',draft,'unresolvedIssueIds','[]'::jsonb,'resolvedContextIds','[]'::jsonb,'candidates','[]'::jsonb));
    if step->>'status' is distinct from 'sending' then raise exception 'Unable to stage approved handoff'; end if;
    step := public.bridge_acknowledge_handoff(p_session,next_revision,p_command);
    if step->>'status' is distinct from 'queued' then raise exception 'Unable to acknowledge approved handoff'; end if;
    next_revision := next_revision+1;
    result := jsonb_build_object('state','queued','revision',next_revision,'handoffId',p_command,'presentationState','waiting');
  else
    return jsonb_build_object('status','conflict','revision',s->'revision');
  end if;

  insert into public.bridge_session_commands values (p_session,p_command,next_revision,
    jsonb_build_object('operation','citizen_summary','input',jsonb_build_array(p_base,p_summary_revision),'value',result));
  return jsonb_build_object('status','committed','data',result);
end;
$$;
revoke execute on function public.bridge_citizen_summary_command(uuid,uuid,bigint,text,bigint) from public, anon, authenticated;
grant execute on function public.bridge_citizen_summary_command(uuid,uuid,bigint,text,bigint) to service_role;
create function public.bridge_load_citizen_summary(p_session uuid, p_revision bigint)
returns jsonb language sql security definer set search_path = ''
as $$
  select summary from public.bridge_citizen_summary_drafts
    where session_id=p_session and summary->'sessionRevision'=to_jsonb(p_revision)
$$;
revoke execute on function public.bridge_load_citizen_summary(uuid,bigint) from public, anon, authenticated;
grant execute on function public.bridge_load_citizen_summary(uuid,bigint) to service_role;
commit;