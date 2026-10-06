-- Após fixtures, demo e dev-hide-fixtures: visitante não vê nenhuma fixture; a demo continua visível.
do $$ begin
  if exists(select from public.profiles where id::text like '02000000-%' and published) then
    raise exception 'Fixture de perfil continua publicada'; end if;
  if exists(select from public.collectives where id::text like '05000000-%' and state='approved') then
    raise exception 'Fixture de coletivo continua aprovada'; end if;
  if exists(select from public.events where id::text like '0a000000-%' and state='published') then
    raise exception 'Fixture de evento continua publicada'; end if;
end $$;
begin;
set local role anon;
do $$ begin
  if exists(select from jsonb_array_elements(public.list_events('future')||public.list_events('ongoing')||public.list_events('past')) e
    where e->>'id' like '0a000000-%') then raise exception 'Agenda pública mostra fixture'; end if;
  if exists(select from public.collectives where id::text like '05000000-%') then raise exception 'Catálogo mostra coletivo fixture'; end if;
  if exists(select from public.profiles where id::text like '02000000-%') then raise exception 'Catálogo mostra perfil fixture'; end if;
  if (select count(*) from jsonb_array_elements(public.list_events('future')) e where e->>'id' like 'd00a0000-%')<8 then
    raise exception 'Demo deixou de aparecer na agenda'; end if;
  if (select count(*) from public.collectives where id::text like 'd0050000-%')<>5 then raise exception 'Demo perdeu coletivos'; end if;
end $$;
rollback;
