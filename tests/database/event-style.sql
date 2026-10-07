-- W13: vertente principal do evento. Fixtures próprias e rollback integral; nenhum projeto hospedado.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlstate=expected_state then return; end if;
  raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
end; raise exception 'Operation unexpectedly succeeded: %',statement; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','8a000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
create function pg_temp.payload() returns jsonb language sql as $$
 select '{"name":"Evento com vertente","kind":"festa","style":"techno","description":"","starts_at":"2099-01-01T18:00:00-03:00","ends_at":null,"city":"Recife","state_code":"PE","venue":"Local sintético","is_free":true}'::jsonb
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer),pg_temp.payload() to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
('8a000000-0000-4000-8000-000000000001','event-style@example.invalid',now(),'5581981000001',now());
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash) values
('8a000000-0000-4000-8000-000000000001','Pessoa sintética','52998224725','1990-01-01','Recife','PE',true,gen_random_uuid(),'event-style-test');
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Organizador de vertentes","description":"Só fixture","activity":"Música","city":"Recife","state_code":"PE"}',gen_random_uuid())::text,true);
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(1);

-- Obrigatória na criação: ausente, nula, vazia, de outro tipo ou fora da taxonomia são recusadas com mensagem própria.
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()-'style',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"style":null}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"style":""}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"style":5}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"style":"samba de gafieira"}',gen_random_uuid())$q$,'22023');
-- Subestilo não é vertente principal (a coluna referencia só public.music_styles).
select pg_temp.assert_true(exists(select from public.music_substyles s where s.name not in (select name from public.music_styles)),'Taxonomia sem subestilo exclusivo para o teste');
select pg_temp.reject(format($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||jsonb_build_object('style',%L),gen_random_uuid())$q$,
  (select s.name from public.music_substyles s where s.name not in (select name from public.music_styles) order by s.name limit 1)),'22023');
select pg_temp.assert_true((select count(*) from public.events)=0,'Criação recusada deixou evento');
do $$ begin
  begin perform public.create_event(current_setting('test.c')::uuid,pg_temp.payload()-'style',gen_random_uuid());
  exception when others then
    if sqlerrm<>'Vertente principal obrigatória' then raise exception 'Mensagem inesperada: %',sqlerrm; end if; return; end;
  raise exception 'Criou evento sem vertente';
end $$;

-- Criação válida grava e devolve a vertente em get_event, list_collective_events e list_events (depois de publicar).
select set_config('test.event',public.create_event(current_setting('test.c')::uuid,pg_temp.payload(),gen_random_uuid())::text,true);
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'style'='techno','get_event sem vertente');
select pg_temp.assert_true(public.list_collective_events(current_setting('test.c')::uuid)->0->>'style'='techno','list_collective_events sem vertente');

-- Editável depois; inválida recusada sem deixar edição parcial; omitir o campo mantém a vertente atual.
select public.update_event(current_setting('test.event')::uuid,1,'{"style":"house"}');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'style'='house','Vertente não foi editada');
select pg_temp.reject($q$select public.update_event(current_setting('test.event')::uuid,2,'{"name":"Parcial","style":"inexistente"}')$q$,'22023');
select pg_temp.reject($q$select public.update_event(current_setting('test.event')::uuid,2,'{"name":"Parcial","style":null}')$q$,'22023');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'name'='Evento com vertente','Edição recusada deixou alteração parcial');
select public.update_event(current_setting('test.event')::uuid,2,'{"name":"Renomeado"}');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'style'='house','Edição sem o campo apagou a vertente');
select public.publish_event(current_setting('test.event')::uuid,3);

-- Leitura pública (anon): RPCs e a tabela expõem a vertente do evento publicado.
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'style'='house','get_event público sem vertente');
select pg_temp.assert_true(public.list_events('future')->0->>'style'='house','list_events sem vertente');
select pg_temp.assert_true((select style from public.events where id=current_setting('test.event')::uuid)='house','Tabela pública sem a coluna de vertente');
reset role;

-- Evento anterior à coluna (style nulo) continua legível e editável; passa a ter vertente ao editar.
insert into public.events(id,collective_id,name,kind,starts_at,city,state_code,venue,is_free)
values('8b000000-0000-4000-8000-000000000001',current_setting('test.c')::uuid,'Evento antigo','festa','2099-03-01T21:00Z','Recife','PE','Local sintético',true);
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(public.get_event('8b000000-0000-4000-8000-000000000001')->'style'='null'::jsonb,'Evento antigo sem vertente deveria ser nulo');
select public.update_event('8b000000-0000-4000-8000-000000000001',1,'{"name":"Evento antigo editado"}');
select pg_temp.assert_true(public.get_event('8b000000-0000-4000-8000-000000000001')->'style'='null'::jsonb,'Editar outro campo inventou vertente');
select public.update_event('8b000000-0000-4000-8000-000000000001',2,'{"style":"techno"}');
select pg_temp.assert_true(public.get_event('8b000000-0000-4000-8000-000000000001')->>'style'='techno','Evento antigo não recebeu vertente');
reset role;
set constraints all immediate;
rollback;
