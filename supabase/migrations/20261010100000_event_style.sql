-- W13: vertente principal do evento (public.music_styles, sem subestilos).
-- Nulável para eventos já existentes; obrigatória na criação via create_event e editável depois.
alter table public.events add column style text references public.music_styles(name);
create index events_style on public.events(style) where style is not null;

create or replace function private.event_payload(original public.events, payload jsonb) returns public.events
language plpgsql set search_path='' as $$
declare field text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k where k not in
    ('name','kind','other_kind','description','starts_at','ends_at','city','state_code','venue','is_free','ticket_url','cover_url','cover_path','cover_bytes','style','lineup')) then
    raise exception using errcode='22023',message='Dados de evento inválidos'; end if;
  foreach field in array array['starts_at','ends_at'] loop
    if payload?field and payload->field<>'null'::jsonb and (jsonb_typeof(payload->field)<>'string' or payload->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$') then
      raise exception using errcode='22023',message='Data exige instante ISO com fuso'; end if;
  end loop;
  if payload?'style' and (jsonb_typeof(payload->'style') is distinct from 'string'
    or not exists(select from public.music_styles s where s.name=payload->>'style')) then
    raise exception using errcode='22023',message='Vertente principal inválida'; end if;
  return jsonb_populate_record(original,payload-'lineup');
end $$;

create or replace function public.create_event(collective uuid, payload jsonb, request_id uuid) returns uuid
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
  if e.style is null then raise exception using errcode='22023',message='Vertente principal obrigatória'; end if;
  insert into public.events(collective_id,name,kind,other_kind,description,starts_at,ends_at,city,state_code,venue,is_free,ticket_url,cover_url,cover_path,cover_bytes,style)
    values(collective,e.name,e.kind,e.other_kind,coalesce(e.description,''),e.starts_at,e.ends_at,e.city,e.state_code,e.venue,e.is_free,e.ticket_url,e.cover_url,e.cover_path,e.cover_bytes,e.style) returning * into e;
  insert into private.event_details(event_id,creator_id,request_id,request_hash) values(e.id,auth.uid(),request_id,fingerprint);
  perform private.replace_event_lineup(e.id,coalesce(payload->'lineup','[]'));
  insert into private.event_audit(event_id,actor_id,action,version) values(e.id,auth.uid(),'created',e.version);
  return e.id;
exception when integrity_constraint_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='Dados de evento/lineup inválidos';
end $$;

create or replace function public.update_event(target uuid, expected_version integer, payload jsonb) returns void
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
    style=incoming.style,
    rescheduled_at=case when rescheduled then now() else rescheduled_at end,previous_starts_at=case when rescheduled then original.starts_at else previous_starts_at end,
    version=version+1,updated_at=now() where id=target;
  if payload?'lineup' then perform private.replace_event_lineup(target,payload->'lineup'); end if;
  insert into private.event_audit(event_id,actor_id,action,version) values(target,auth.uid(),case when rescheduled then 'rescheduled' else 'edited' end,original.version+1);
exception when integrity_constraint_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='Dados de evento/lineup inválidos';
end $$;

-- get_event já devolve to_jsonb(e): a coluna nova entra sozinha. As listagens têm lista explícita de colunas.
create or replace function public.list_events(period text default 'future', artist uuid default null, after_start timestamptz default null, after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if period is null or period not in ('future','ongoing','past') or ((after_start is null)<>(after_id is null)) or (after_start is not null and not isfinite(after_start)) then
    raise exception using errcode='22023',message='Filtro/cursor inválido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select e.id,e.collective_id,e.name,e.kind,e.starts_at,e.ends_at,e.timezone,e.city,e.state_code,e.venue,e.is_free,e.ticket_url,e.cover_url,e.cover_path,e.rescheduled_at,e.style
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

create or replace function public.list_collective_events(target uuid, period text default 'future', after_start timestamptz default null, after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if period is null or period not in ('future','ongoing','past') or ((after_start is null)<>(after_id is null)) or (after_start is not null and not isfinite(after_start)) then
    raise exception using errcode='22023',message='Filtro/cursor inválido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select e.id,e.name,e.state,e.starts_at,e.ends_at,e.version,e.style from public.events e
    where e.collective_id=target and private.event_editor(e.id) and private.event_period(e.starts_at,e.ends_at,now())=period
      and (after_start is null or case when period='past' then (e.starts_at,e.id)<(after_start,after_id) else (e.starts_at,e.id)>(after_start,after_id) end)
    order by case when period='past' then e.starts_at end desc,case when period='past' then e.id end desc,
      case when period<>'past' then e.starts_at end,case when period<>'past' then e.id end limit 50
  ) page),'[]');
end $$;
