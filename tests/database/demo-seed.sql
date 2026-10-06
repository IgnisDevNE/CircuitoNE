-- Após cada aplicação de supabase/seeds/demo.sql. Exige circuitone.seed_time igual ao da última carga.
begin;
do $$ declare t timestamptz:=current_setting('circuitone.seed_time')::timestamptz; begin
  -- Sem duplicidade: contagens exatas após uma ou mais cargas.
  if (select count(*) from auth.users where id::text like 'd0010000-%')<>10
    or (select count(*) from private.account_details where user_id::text like 'd0010000-%')<>10 then
    raise exception 'Contas demo incompletas/duplicadas'; end if;
  if exists(select from auth.users where id::text like 'd0010000-%' and (email not like '%@example.invalid' or encrypted_password is not null
      or email_confirmed_at is null or phone_confirmed_at is null)) then
    raise exception 'Conta demo não sintética, com senha ou sem confirmação'; end if;
  if (select count(*) from public.profiles where id::text like 'd0020000-%')<>17
    or (select count(*) from public.profiles where id::text like 'd0020000-%' and kind='artist' and published)<>12
    or (select count(*) from public.profiles where id::text like 'd0020000-%' and kind='services')<>3
    or (select count(*) from public.profiles where id::text like 'd0020000-%' and kind='audiovisual')<>2
    or (select count(*) from public.artist_profiles where profile_id::text like 'd0020000-%')<>12
    or (select count(*) from public.artist_styles where profile_id::text like 'd0020000-%')<>33
    or (select count(*) from public.professional_details where profile_id::text like 'd0020000-%')<>17 then
    raise exception 'Atuações demo incompletas/duplicadas'; end if;
  if (select count(distinct state_code) from public.profiles where id::text like 'd0020000-%' and kind='artist')<9 then
    raise exception 'Artistas demo não cobrem os 9 estados'; end if;
  if (select count(*) from public.collectives where id::text like 'd0050000-%' and state='approved')<>5
    or (select count(*) from private.collective_details where collective_id::text like 'd0050000-%')<>5
    or (select count(*) from private.collective_roles where collective_id::text like 'd0050000-%')<>12
    or (select count(*) from private.collective_role_permissions where collective_id::text like 'd0050000-%')<>37
    or (select count(*) from private.collective_memberships where collective_id::text like 'd0050000-%')<>17
    or (select count(*) from private.membership_requests where collective_id::text like 'd0050000-%' and state='pending')<>3 then
    raise exception 'Coletivos demo incompletos/duplicados'; end if;
  if (select count(*) from public.events where id::text like 'd00a0000-%' and state='published')<>16
    or (select count(*) from private.event_details where event_id::text like 'd00a0000-%')<>16
    or (select count(*) from private.event_lineup where event_id::text like 'd00a0000-%')<>43
    or (select count(*) from private.event_lineup where event_id::text like 'd00a0000-%' and artist_id is null)<>8 then
    raise exception 'Eventos demo incompletos/duplicados'; end if;
  -- Datas ancoradas na referência desta carga (quatro passados, dois em andamento, dez futuros).
  if (select count(*) from public.events where id::text like 'd00a0000-%' and private.event_period(starts_at,ends_at,t)='past')<>4
    or (select count(*) from public.events where id::text like 'd00a0000-%' and private.event_period(starts_at,ends_at,t)='ongoing')<>2
    or (select count(*) from public.events where id::text like 'd00a0000-%' and private.event_period(starts_at,ends_at,t)='future')<>10 then
    raise exception 'Datas de eventos demo não acompanham a referência do seed'; end if;
  if (select starts_at from public.events where id='d00a0000-0000-4000-8000-000000000007')
    is distinct from ((date_trunc('day',t at time zone 'America/Fortaleza')+interval '3 days 22 hours') at time zone 'America/Fortaleza') then
    raise exception 'Evento demo não foi reancorado na nova referência'; end if;
  if (select starts_at from public.events where id='d00a0000-0000-4000-8000-000000000005') is distinct from t-interval '2 hours' then
    raise exception 'Evento demo em andamento não foi reancorado'; end if;
  if exists(select from public.events where id::text like 'd00a0000-%' and (is_free=(ticket_url is not null) or cover_url is null)) then
    raise exception 'Ingresso/capa demo inconsistentes'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare t timestamptz:=current_setting('circuitone.seed_time')::timestamptz; future jsonb:=public.list_events('future'); begin
  if (select count(*) from jsonb_array_elements(future) x where x->>'id' like 'd00a0000-%')<8 then
    raise exception 'Agenda pública exibe menos de 8 eventos demo futuros'; end if;
  if not exists(select from jsonb_array_elements(future) x where x->>'id'='d00a0000-0000-4000-8000-000000000007'
      and (x->>'starts_at')::timestamptz=((date_trunc('day',t at time zone 'America/Fortaleza')+interval '3 days 22 hours') at time zone 'America/Fortaleza')) then
    raise exception 'Agenda pública não reflete a data reancorada'; end if;
  if (select count(*) from public.profiles where id::text like 'd0020000-%' and kind='artist')<>12
    or exists(select from public.profiles where id::text like 'd0020000-%' and kind<>'artist') then
    raise exception 'Público deve ver exatamente os 12 artistas demo publicados'; end if;
  if (select count(*) from public.collectives where id::text like 'd0050000-%')<>5 then
    raise exception 'Público deve ver os 5 coletivos demo aprovados'; end if;
  if (select count(*) from public.get_collective_members('d0050000-0000-4000-8000-000000000001'))<>4
    or (select count(artist_profile_id) from public.get_collective_members('d0050000-0000-4000-8000-000000000001'))<>4 then
    raise exception 'Integrantes demo sem artista vinculado'; end if;
end $$;
rollback;
