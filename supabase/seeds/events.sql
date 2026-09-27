-- Após identity.sql e collectives.sql. Referência temporal explícita; sem dados reais.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
  if nullif(current_setting('circuitone.seed_time',true),'') is null or not isfinite(current_setting('circuitone.seed_time')::timestamptz) then
    raise exception 'Seed exige referência temporal explícita e finita'; end if;
  if not exists(select from public.artist_profiles where profile_id='02000000-0000-4000-8000-000000000001')
    or (select count(*) from public.collectives where id in ('05000000-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000003'))<>2 then
    raise exception 'Seed exige identidade e coletivos sintéticos'; end if;
end $$;
with inserted as (
insert into public.events(id,collective_id,name,kind,other_kind,description,starts_at,ends_at,city,state_code,venue,is_free,ticket_url,
  state,first_published_at,cancelled_at,rescheduled_at,previous_starts_at,version,created_at,updated_at)
select ('0a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=7 then '05000000-0000-4000-8000-000000000003'::uuid else '05000000-0000-4000-8000-000000000001'::uuid end,
  'Evento sintético '||n,case when n=8 then 'outros' else 'festa' end,case when n=8 then 'Ensaio de agenda' end,
  '**Fixture**, sem dados reais',anchor+(array[interval '1 day',interval '-1 hour',interval '-7 days',interval '1 day',interval '2 days',interval '3 days',interval '4 days',interval '-1 hour'])[n],
  case when n=2 then anchor+interval '1 hour' when n=6 then anchor+interval '4 days' end,
  'Recife','PE','Local sintético',n<>6,case when n=6 then 'https://tickets.example.invalid/fixture' end,
  case when n=4 then 'cancelled' when n=5 then 'draft' else 'published' end,
  case when n<>5 then anchor-interval '10 days' end,case when n=4 then anchor end,
  case when n=6 then anchor end,case when n=6 then anchor+interval '2 days' end,
  case when n in (4,6) then 3 when n=5 then 1 else 2 end,anchor-interval '10 days',anchor
from generate_series(1,8) n cross join (select current_setting('circuitone.seed_time')::timestamptz anchor) reference
on conflict(id) do nothing returning id
), details as (
insert into private.event_details(event_id,creator_id,request_id,request_hash)
select id,'01000000-0000-4000-8000-000000000001',('0b000000'||substr(id::text,9))::uuid,'seed-events-v1'
from inserted returning event_id
)
-- Filhos somente dos eventos recém-criados: não reconstruir lineup removido pelo testador.
insert into private.event_lineup(id,event_id,position,artist_id,credited_name)
select ('0c000000'||substr(e.id::text,9))::uuid,e.id,0,
  case when e.id<>'0a000000-0000-4000-8000-000000000003' then '02000000-0000-4000-8000-000000000001'::uuid end,
  case when e.id='0a000000-0000-4000-8000-000000000003' then 'Crédito sintético sem vínculo' else 'Artista sintético público' end
from inserted e join details d on d.event_id=e.id;
commit;
