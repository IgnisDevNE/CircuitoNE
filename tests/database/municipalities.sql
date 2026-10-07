-- W14: municípios do IBGE como valores fixos, gênero canônico e estilos consistentes. Fixtures próprias e rollback integral.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlstate=expected_state then return; end if;
  raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
end; raise exception 'Operation unexpectedly succeeded: %',statement; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','8b000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer) to anon,authenticated;

-- Conjunto: 5.571 municípios (5.570 de antes de 2025 + Boa Esperança do Norte/MT), 27 UFs, nomes únicos por UF.
select pg_temp.assert_true((select count(*) from public.municipalities)=5571,'Municípios incompletos');
select pg_temp.assert_true((select count(distinct state_code) from public.municipalities)=27,'UFs incompletas');
select pg_temp.assert_true((select count(*) from public.municipalities where state_code='DF')=1,'DF deve ter só Brasília');
select pg_temp.assert_true(exists(select from public.municipalities where name='Juazeiro do Norte' and state_code='CE' and ibge_code=2307304),'Juazeiro do Norte/CE ausente');
select pg_temp.assert_true(exists(select from public.municipalities where name='Boa Esperança do Norte' and state_code='MT'),'Município novo ausente');
select pg_temp.assert_true(exists(select from public.municipalities where name='Alta Floresta D''Oeste' and state_code='RO'),'Apóstrofo não preservado');
select pg_temp.reject($q$insert into public.municipalities(ibge_code,name,state_code) values(2307305,'Juazeiro do Norte','CE')$q$,'23505');
select pg_temp.reject($q$insert into public.municipalities(ibge_code,name,state_code) values(9999999,'Fora da faixa','CE')$q$,'23514');
select pg_temp.reject($q$insert into public.municipalities(ibge_code,name,state_code) values(2300000,'Cidade de UF inválida','XX')$q$,'23514');

-- Dado público de referência: leitura para anon e authenticated, nenhuma escrita pela API.
set local role anon;
select pg_temp.assert_true((select count(*) from public.municipalities where state_code='CE')=184,'anon não lê os municípios');
select pg_temp.reject($q$insert into public.municipalities(ibge_code,name,state_code) values(2300001,'Nova','CE')$q$,'42501');
select pg_temp.reject($q$update public.municipalities set name='X' where ibge_code=2307304$q$,'42501');
select pg_temp.reject($q$delete from public.municipalities$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.municipalities where state_code='PE')=185,'authenticated não lê os municípios');
select pg_temp.reject($q$delete from public.municipalities where ibge_code=2307304$q$,'42501');
reset role;

-- Fixtures: uma conta com atuação artista e um coletivo com evento, todos com cidades reais.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
('8b000000-0000-4000-8000-000000000001','municipios@example.invalid',now(),'5581982000001',now());
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash) values
('8b000000-0000-4000-8000-000000000001','Pessoa sintética','52998224725','1990-01-01','Recife','PE',true,gen_random_uuid(),'municipios-test');
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.profile',public.create_profile('{"kind":"artist","name":"Artista municipal","styles":[{"style":"techno","substyle":null}]}')::text,true);
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Coletivo municipal","description":"Só fixture","activity":"Música","city":"Recife","state_code":"PE"}',gen_random_uuid())::text,true);
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.event',public.create_event(current_setting('test.c')::uuid,
  '{"name":"Evento municipal","kind":"festa","style":"techno","description":"","starts_at":"2099-01-01T18:00:00-03:00","ends_at":null,"city":"Juazeiro do Norte","state_code":"CE","venue":"Local sintético","is_free":true}',gen_random_uuid())::text,true);
reset role;

-- Chave composta (UF, cidade) em toda tabela que guarda o par: cidade de outra UF, inventada ou com grafia diferente é recusada.
select pg_temp.reject($q$update private.account_details set city='Fortaleza'$q$,'23503');
select pg_temp.reject($q$update private.account_details set city='recife'$q$,'23503');
select pg_temp.reject($q$update private.account_details set city='Cidade Inventada'$q$,'23503');
select pg_temp.reject($q$update private.account_details set state_code='CE'$q$,'23503');
select pg_temp.reject($q$update public.profiles set city='Fortaleza'$q$,'23503');
select pg_temp.reject($q$update public.profiles set city='Recife ',state_code='PE'$q$,'23503');
select pg_temp.reject($q$update public.collectives set city='Fortaleza'$q$,'23503');
select pg_temp.reject($q$update public.collectives set city='Cidade Inventada'$q$,'23503');
select pg_temp.reject($q$update public.events set state_code='PE'$q$,'23503');
select pg_temp.reject($q$update public.events set city='Cidade Inventada'$q$,'23503');
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
('8b000000-0000-4000-8000-000000000002','municipios-2@example.invalid',now(),'5581982000002',now());
select pg_temp.reject($q$insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
  values('8b000000-0000-4000-8000-000000000002','Outra pessoa','11144477735','1990-01-01','Fortaleza','PE',true,gen_random_uuid(),'x')$q$,'23503');
select pg_temp.reject($q$insert into public.profiles(owner_id,kind,name,city,state_code)
  values('8b000000-0000-4000-8000-000000000001','member','Perfil fora da UF','Fortaleza','PE')$q$,'23503');
-- Cidades reais da UF continuam aceitas.
update public.events set city='Fortaleza' where id=current_setting('test.event')::uuid;
update public.events set city='Juazeiro do Norte' where id=current_setting('test.event')::uuid;
update public.profiles set city='Olinda' where id=current_setting('test.profile')::uuid;

-- As RPCs recusam o par inválido com a mensagem genérica de dados inválidos, sem deixar alteração parcial.
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.update_my_account_details('{"city":"Fortaleza","state_code":"PE"}')$q$,'22023');
select public.update_my_account_details('{"city":"Fortaleza","state_code":"CE"}');
select pg_temp.assert_true((public.get_my_account_details()->>'city')='Fortaleza' and (public.get_my_account_details()->>'state_code')='CE','Conta não mudou de cidade');
select public.update_my_account_details('{"city":"Recife","state_code":"PE"}');
select pg_temp.reject(format($q$select public.update_my_profile(%L,'{"city":"Fortaleza","state_code":"PE"}')$q$,current_setting('test.profile')),'22023');
select public.update_my_profile(current_setting('test.profile')::uuid,'{"city":"Fortaleza","state_code":"CE"}');
select pg_temp.reject(format($q$select public.create_profile('{"kind":"services","name":"Fora da UF","city":"Fortaleza","state_code":"PE"}')$q$),'22023');
select pg_temp.reject($q$select public.create_profile('{"kind":"services","name":"So cidade","city":"Recife"}')$q$,'22023');
select pg_temp.assert_true((select city||'/'||state_code from public.profiles where name='Fora da UF') is null,'Atuação com par inválido foi criada');
select set_config('test.other',public.create_profile('{"kind":"services","name":"Atuação em Natal","city":"Natal","state_code":"RN"}')::text,true);
select set_config('test.inherit',public.create_profile('{"kind":"services","name":"Atuação herdada"}')::text,true);
select pg_temp.assert_true((select city||'/'||state_code from public.profiles where id=current_setting('test.other')::uuid)='Natal/RN','Atuação não ficou com a cidade própria');
select pg_temp.assert_true((select city||'/'||state_code from public.profiles where id=current_setting('test.inherit')::uuid)='Recife/PE','Atuação sem cidade deve herdar a da conta');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.c')::uuid,1,'{"city":"Fortaleza"}')$q$,'22023');
select pg_temp.reject(format($q$select public.update_event(%L,1,'{"state_code":"CE","city":"Recife"}')$q$,current_setting('test.event')),'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,
  '{"name":"Inválido","kind":"festa","style":"techno","description":"","starts_at":"2099-01-01T18:00:00-03:00","ends_at":null,"city":"Cidade Inventada","state_code":"PE","venue":"Local","is_free":true}',gen_random_uuid())$q$,'22023');
reset role;
select pg_temp.assert_true((select name from public.events where id=current_setting('test.event')::uuid)='Evento municipal','Edição recusada alterou o evento');

-- Gênero: só os valores canônicos (ou nulo). Texto livre é recusado no banco e nas RPCs.
update private.account_details set gender='Masculino';
update private.account_details set gender='Feminino';
update private.account_details set gender='Não binário';
update private.account_details set gender=null;
select pg_temp.reject($q$update private.account_details set gender='Pessoa não binária'$q$,'23514');
select pg_temp.reject($q$update private.account_details set gender='feminino'$q$,'23514');
select pg_temp.reject($q$update private.account_details set gender=''$q$,'23514');
set local role authenticated;
select pg_temp.actor(1);
select public.update_my_account_details('{"gender":"Feminino"}');
select pg_temp.assert_true(public.get_my_account_details()->>'gender'='Feminino','Gênero não gravado');
select pg_temp.reject($q$select public.update_my_account_details('{"gender":"Outro"}')$q$,'22023');
select public.update_my_account_details('{"gender":""}');
select pg_temp.assert_true(public.get_my_account_details()->'gender'='null'::jsonb,'Gênero vazio deve voltar a não informado');
reset role;

-- Estilos: subestilo traz o principal, remover o principal remove os subestilos, e nada fica órfão.
select set_config('test.style',(select style from public.music_substyles order by style,name limit 1),true);
select set_config('test.sub',(select name from public.music_substyles where style=current_setting('test.style') order by name limit 1),true);
select set_config('test.sub2',(select name from public.music_substyles where style=current_setting('test.style') order by name offset 1 limit 1),true);
select pg_temp.assert_true(current_setting('test.sub2')<>'','Taxonomia sem dois subestilos no mesmo estilo');
set local role authenticated;
select pg_temp.actor(1);
-- Pela edição: só o subestilo é enviado, o estilo principal entra junto.
select public.update_my_profile(current_setting('test.profile')::uuid,
  jsonb_build_object('styles',jsonb_build_array(jsonb_build_object('style',current_setting('test.style'),'substyle',current_setting('test.sub')))));
-- O principal entra no fim da transação (gatilho adiado); aqui o fim é antecipado para conferir.
set constraints all immediate;
select pg_temp.assert_true((select count(*) from public.artist_styles where profile_id=current_setting('test.profile')::uuid)=2,'Estilo principal não acompanhou o subestilo');
select pg_temp.assert_true(exists(select from public.artist_styles where profile_id=current_setting('test.profile')::uuid and style=current_setting('test.style') and substyle is null),'Estilo principal ausente');
-- Pela criação.
select set_config('test.artist2',public.create_profile(jsonb_build_object('kind','artist','name','Só subestilo','styles',
  jsonb_build_array(jsonb_build_object('style',current_setting('test.style'),'substyle',current_setting('test.sub')))))::text,true);
select pg_temp.assert_true((select count(*) from public.artist_styles where profile_id=current_setting('test.artist2')::uuid and substyle is null)=1,'Criação sem o estilo principal');
reset role;
-- Escrita direta (seeds): o gatilho completa o principal e não duplica.
insert into public.artist_styles(profile_id,style,substyle) values(current_setting('test.profile')::uuid,current_setting('test.style'),current_setting('test.sub2'));
select pg_temp.assert_true((select count(*) from public.artist_styles where profile_id=current_setting('test.profile')::uuid)=3,'Segundo subestilo duplicou o principal');
-- Remover o principal remove os subestilos dele; os de outros estilos ficam.
delete from public.artist_styles where profile_id=current_setting('test.profile')::uuid and style=current_setting('test.style') and substyle is null;
select pg_temp.assert_true((select count(*) from public.artist_styles where profile_id=current_setting('test.profile')::uuid)=0,'Subestilos ficaram sem o principal');
-- Remover só um subestilo mantém o principal.
insert into public.artist_styles(profile_id,style,substyle) values(current_setting('test.profile')::uuid,current_setting('test.style'),current_setting('test.sub'));
delete from public.artist_styles where profile_id=current_setting('test.profile')::uuid and substyle=current_setting('test.sub');
select pg_temp.assert_true((select count(*) from public.artist_styles where profile_id=current_setting('test.profile')::uuid and substyle is null)=1,'Remover um subestilo apagou o principal');
rollback;
