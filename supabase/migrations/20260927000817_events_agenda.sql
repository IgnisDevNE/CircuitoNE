-- #118: eventos e agenda; todas as mutações respeitam primeiro a trava do coletivo.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  collective_id uuid not null references public.collectives(id),
  name text not null check (length(btrim(name)) between 1 and 200),
  kind text not null check (kind in ('festa','festival','evento-cultural','feira','encontro','capacitacao','outros')),
  other_kind text check (length(btrim(other_kind)) between 1 and 200),
  description text not null default '' check (length(description)<=20000),
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz check (isfinite(ends_at) and ends_at>starts_at),
  timezone text not null default 'America/Fortaleza' check (timezone='America/Fortaleza'),
  city text not null check (length(btrim(city)) between 1 and 150),
  state_code text not null check (state_code=any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  venue text not null check (length(btrim(venue)) between 1 and 500),
  is_free boolean not null,
  ticket_url text check (private.valid_web_url(ticket_url)),
  cover_url text check (private.valid_web_url(cover_url)),
  cover_path text check (cover_path ~ ('^'||id::text||'/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$')),
  cover_bytes integer,
  state text not null default 'draft' check (state in ('draft','published','cancelled')),
  first_published_at timestamptz,
  cancelled_at timestamptz,
  rescheduled_at timestamptz,
  previous_starts_at timestamptz,
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind='outros')=(other_kind is not null)),
  check (is_free=(ticket_url is null)),
  check (cover_url is null or cover_path is null),
  check ((cover_path is null and cover_bytes is null) or (cover_path is not null and cover_bytes between 1 and 5000000 and cover_bytes is not null)),
  check (state<>'published' or first_published_at is not null),
  check (state<>'draft' or first_published_at is null),
  check ((state='cancelled')=(cancelled_at is not null)),
  check ((rescheduled_at is null)=(previous_starts_at is null))
);
create index events_collective on public.events(collective_id,starts_at,id);
create index events_agenda on public.events(starts_at,id) where state='published';
alter table public.events enable row level security;
create table private.event_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  creator_id uuid references private.account_details(user_id) on delete set null,
  request_id uuid not null,
  request_hash text not null,
  unique (creator_id,request_id)
);
create table private.event_lineup (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  position integer not null check (position between 0 and 999),
  artist_id uuid references public.artist_profiles(profile_id) on delete set null,
  -- Crédito público histórico: permanece sem vínculo após excluir atuação/conta (RN-25/34).
  credited_name text not null check (length(btrim(credited_name)) between 1 and 200),
  unique (event_id,position)
);
create unique index event_artist_once on private.event_lineup(event_id,artist_id) where artist_id is not null;
create index event_lineup_artist on private.event_lineup(artist_id,event_id) where artist_id is not null;
create table private.event_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid references private.account_details(user_id) on delete set null,
  action text not null check (action in ('created','edited','rescheduled','published','cancelled')),
  version integer not null,
  created_at timestamptz not null default now(),
  unique(event_id,version)
);
create index event_audit_actor on private.event_audit(actor_id) where actor_id is not null;
alter table private.event_details enable row level security;
alter table private.event_lineup enable row level security;
alter table private.event_audit enable row level security;

create function private.event_period(starts_at timestamptz, ends_at timestamptz, at_time timestamptz) returns text
language sql immutable set search_path='' as $$
  select case when at_time<starts_at then 'future'
    when at_time<coalesce(ends_at,((starts_at at time zone 'America/Fortaleza')::date+1)::timestamp at time zone 'America/Fortaleza') then 'ongoing'
    else 'past' end
$$;
create function private.event_visible(target uuid, detail boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select (auth.uid() is null or private.active_account(auth.uid())) and exists(
    select from public.events e join public.collectives c on c.id=e.collective_id where e.id=target and c.state='approved'
      and (e.state='published' or (detail and e.state='cancelled' and e.first_published_at is not null)))
$$;
create function private.event_editor(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from public.events e where e.id=target and (
    private.collective_can(e.collective_id,'create_events') or private.collective_can(e.collective_id,'edit_events')
    or private.collective_can(e.collective_id,'publish_events') or private.collective_can(e.collective_id,'cancel_events')))
$$;
create policy events_read on public.events for select to anon,authenticated using (private.event_visible(id));

create function private.event_payload(original public.events, payload jsonb) returns public.events
language plpgsql set search_path='' as $$
declare field text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k where k not in
    ('name','kind','other_kind','description','starts_at','ends_at','city','state_code','venue','is_free','ticket_url','cover_url','cover_path','cover_bytes','lineup')) then
    raise exception using errcode='22023',message='Dados de evento inválidos'; end if;
  foreach field in array array['starts_at','ends_at'] loop
    if payload?field and payload->field<>'null'::jsonb and (jsonb_typeof(payload->field)<>'string' or payload->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$') then
      raise exception using errcode='22023',message='Data exige instante ISO com fuso'; end if;
  end loop;
  return jsonb_populate_record(original,payload-'lineup');
end $$;
create function private.replace_event_lineup(target uuid, payload jsonb) returns void
language plpgsql set search_path='' as $$
declare item record; artist uuid; credit text;
begin
  if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload)>1000 then raise exception using errcode='22023',message='Lineup inválido'; end if;
  delete from private.event_lineup where event_id=target;
  for item in select value,ordinality from jsonb_array_elements(payload) with ordinality loop
    if jsonb_typeof(item.value)<>'object' or exists(select from jsonb_object_keys(item.value) k where k not in ('artist_id','name'))
      or ((item.value?'artist_id')=(item.value?'name')) then raise exception using errcode='22023',message='Participação inválida'; end if;
    artist:=null; credit:=null;
    if item.value?'artist_id' then
      select p.id,p.name into artist,credit from public.profiles p join public.artist_profiles a on a.profile_id=p.id
        where p.id=(item.value->>'artist_id')::uuid and p.published and private.active_account(p.owner_id);
      if not found then raise exception using errcode='22023',message='Artista público indisponível'; end if;
    else
      if jsonb_typeof(item.value->'name') is distinct from 'string' then raise exception using errcode='22023',message='Crédito exige texto'; end if;
      credit:=item.value->>'name';
    end if;
    insert into private.event_lineup(event_id,position,artist_id,credited_name) values(target,item.ordinality-1,artist,credit);
  end loop;
end $$;
create function private.lock_event(target uuid, permission text) returns public.events
language plpgsql set search_path='' as $$
declare collective uuid; e public.events;
begin
  select collective_id into collective from public.events where id=target;
  perform private.lock_collective(collective,permission);
  select * into e from public.events where id=target for update;
  if not found then raise exception using errcode='42501',message='Evento indisponível'; end if;
  return e;
end $$;

create function public.create_event(collective uuid, payload jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.events; existing private.event_details; fingerprint text;
begin
  perform private.lock_collective(collective,'create_events');
  if request_id is null then raise exception using errcode='22023',message='Solicitação necessária'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(collective,payload)::text,'UTF8')),'hex');
  select * into existing from private.event_details d where d.creator_id=auth.uid() and d.request_id=create_event.request_id;
  if found then
    if existing.request_hash=fingerprint then return existing.event_id; end if;
    raise exception using errcode='22023',message='Solicitação reutilizada com outros dados'; end if;
  e:=private.event_payload(e,payload);
  insert into public.events(collective_id,name,kind,other_kind,description,starts_at,ends_at,city,state_code,venue,is_free,ticket_url,cover_url,cover_path,cover_bytes)
    values(collective,e.name,e.kind,e.other_kind,coalesce(e.description,''),e.starts_at,e.ends_at,e.city,e.state_code,e.venue,e.is_free,e.ticket_url,e.cover_url,e.cover_path,e.cover_bytes) returning * into e;
  insert into private.event_details(event_id,creator_id,request_id,request_hash) values(e.id,auth.uid(),request_id,fingerprint);
  perform private.replace_event_lineup(e.id,coalesce(payload->'lineup','[]'));
  insert into private.event_audit(event_id,actor_id,action,version) values(e.id,auth.uid(),'created',e.version);
  return e.id;
exception when integrity_constraint_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='Dados de evento/lineup inválidos';
end $$;
create function public.update_event(target uuid, expected_version integer, payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare original public.events; incoming public.events; rescheduled boolean;
begin
  original:=private.lock_event(target,'edit_events');
  if original.state='published' and not private.collective_can(original.collective_id,'publish_events') then raise exception using errcode='42501',message='Edição pública exige publicar'; end if;
  if original.version is distinct from expected_version then raise exception using errcode='40001',message='Evento alterado; recarregue'; end if;
  if original.state='cancelled' then raise exception using errcode='22023',message='Evento cancelado não aceita edição'; end if;
  incoming:=private.event_payload(original,payload);
  rescheduled:=original.state='published' and (original.starts_at is distinct from incoming.starts_at or original.ends_at is distinct from incoming.ends_at);
  update public.events set name=incoming.name,kind=incoming.kind,other_kind=incoming.other_kind,description=incoming.description,
    starts_at=incoming.starts_at,ends_at=incoming.ends_at,city=incoming.city,state_code=incoming.state_code,venue=incoming.venue,
    is_free=incoming.is_free,ticket_url=incoming.ticket_url,cover_url=incoming.cover_url,cover_path=incoming.cover_path,cover_bytes=incoming.cover_bytes,
    rescheduled_at=case when rescheduled then now() else rescheduled_at end,previous_starts_at=case when rescheduled then original.starts_at else previous_starts_at end,
    version=version+1,updated_at=now() where id=target;
  if payload?'lineup' then perform private.replace_event_lineup(target,payload->'lineup'); end if;
  insert into private.event_audit(event_id,actor_id,action,version) values(target,auth.uid(),case when rescheduled then 'rescheduled' else 'edited' end,original.version+1);
exception when integrity_constraint_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='Dados de evento/lineup inválidos';
end $$;
create function public.publish_event(target uuid, expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
  e:=private.lock_event(target,'publish_events');
  if e.version is distinct from expected_version then raise exception using errcode='40001',message='Evento alterado; recarregue'; end if;
  if e.state<>'draft' then raise exception using errcode='22023',message='Transição inválida'; end if;
  update public.events set state='published',first_published_at=now(),version=version+1,updated_at=now() where id=target;
  insert into private.event_audit(event_id,actor_id,action,version) values(target,auth.uid(),'published',e.version+1);
end $$;
create function public.cancel_event(target uuid, expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
  e:=private.lock_event(target,'cancel_events');
  if e.version is distinct from expected_version then raise exception using errcode='40001',message='Evento alterado; recarregue'; end if;
  if e.state='cancelled' then return; end if;
  update public.events set state='cancelled',cancelled_at=now(),version=version+1,updated_at=now() where id=target;
  insert into private.event_audit(event_id,actor_id,action,version) values(target,auth.uid(),'cancelled',e.version+1);
end $$;

create function public.get_event(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(e)||jsonb_build_object('period',private.event_period(e.starts_at,e.ends_at,now()),'lineup',
    coalesce((select jsonb_agg(jsonb_build_object('name',l.credited_name,'artist_id',case when p.published and private.active_account(p.owner_id) then p.id end) order by l.position)
      from private.event_lineup l left join public.profiles p on p.id=l.artist_id where l.event_id=e.id),'[]'))
    from public.events e where e.id=target and (private.event_visible(e.id,true) or private.event_editor(e.id))
$$;
create function public.list_events(period text default 'future', artist uuid default null, after_start timestamptz default null, after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if period is null or period not in ('future','ongoing','past') or ((after_start is null)<>(after_id is null)) or (after_start is not null and not isfinite(after_start)) then
    raise exception using errcode='22023',message='Filtro/cursor inválido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select e.id,e.collective_id,e.name,e.kind,e.starts_at,e.ends_at,e.timezone,e.city,e.state_code,e.venue,e.is_free,e.ticket_url,e.cover_url,e.cover_path,e.rescheduled_at
    from public.events e where e.state='published'
      and (case when period='future' then e.starts_at>now() else e.starts_at<=now() end)
      and private.event_visible(e.id) and private.event_period(e.starts_at,e.ends_at,now())=period
      and (artist is null or exists(select from private.event_lineup l join public.profiles p on p.id=l.artist_id
        where l.event_id=e.id and l.artist_id=artist and p.published and private.active_account(p.owner_id)))
      and (after_start is null or case when period='past' then (e.starts_at,e.id)<(after_start,after_id) else (e.starts_at,e.id)>(after_start,after_id) end)
    order by case when period='past' then e.starts_at end desc,case when period='past' then e.id end desc,
      case when period<>'past' then e.starts_at end,case when period<>'past' then e.id end limit 50
  ) page),'[]');
end $$;

-- Gestão inclui rascunhos/cancelados; não é a agenda pública.
create function public.list_collective_events(target uuid, period text default 'future', after_start timestamptz default null, after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if period is null or period not in ('future','ongoing','past') or ((after_start is null)<>(after_id is null)) or (after_start is not null and not isfinite(after_start)) then
    raise exception using errcode='22023',message='Filtro/cursor inválido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select e.id,e.name,e.state,e.starts_at,e.ends_at,e.version from public.events e
    where e.collective_id=target and private.event_editor(e.id) and private.event_period(e.starts_at,e.ends_at,now())=period
      and (after_start is null or case when period='past' then (e.starts_at,e.id)<(after_start,after_id) else (e.starts_at,e.id)>(after_start,after_id) end)
    order by case when period='past' then e.starts_at end desc,case when period='past' then e.id end desc,
      case when period<>'past' then e.starts_at end,case when period<>'past' then e.id end limit 50
  ) page),'[]');
end $$;

revoke all on public.events,private.event_details,private.event_lineup,private.event_audit from public,anon,authenticated,service_role;
revoke all on function private.event_period(timestamptz,timestamptz,timestamptz),private.event_visible(uuid,boolean),private.event_editor(uuid),
  private.event_payload(public.events,jsonb),private.replace_event_lineup(uuid,jsonb),private.lock_event(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.create_event(uuid,jsonb,uuid),public.update_event(uuid,integer,jsonb),public.publish_event(uuid,integer),public.cancel_event(uuid,integer),
  public.get_event(uuid),public.list_events(text,uuid,timestamptz,uuid),public.list_collective_events(uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant select on public.events to anon,authenticated;
grant execute on function private.event_visible(uuid,boolean),public.get_event(uuid),public.list_events(text,uuid,timestamptz,uuid) to anon,authenticated;
grant execute on function public.create_event(uuid,jsonb,uuid),public.update_event(uuid,integer,jsonb),public.publish_event(uuid,integer),public.cancel_event(uuid,integer),public.list_collective_events(uuid,text,timestamptz,uuid) to authenticated;
