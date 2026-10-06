-- Banco descartável: listas do titular (list_my_profiles / list_my_collectives) nunca cruzam contas.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a1000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.actor(integer) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'lists-'||n||'@example.invalid',now(),'558199710000'||n,now() from generate_series(1,3) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..3 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Titular sintético '||n,'cpf',(array['52998224725','12345678909','11144477735'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      jsonb_build_object('kind','artist','name','Artista '||n,'styles','[{"style":"techno"}]'::jsonb),gen_random_uuid());
  end loop;
end $$;
select pg_temp.actor(1);
select public.create_profile('{"kind":"services","name":"Serviços 1"}');
select pg_temp.actor(2);
select set_config('test.c2',public.create_collective('{"kind":"collective","name":"Coletivo do titular 2","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
select pg_temp.actor(1);
select set_config('test.c1',public.create_collective('{"kind":"collective","name":"Coletivo do titular 1","city":"Olinda","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);

-- Perfis: cada titular vê só os seus; `published` é exposto ao dono mesmo sem leitura direta da coluna.
select pg_temp.assert_true((select count(*) from public.list_my_profiles())=2,'Titular 1 deve ver exatamente suas 2 atuações');
select pg_temp.assert_true((select array_agg(name order by name) from public.list_my_profiles())=array['Artista 1','Serviços 1'],'Titular 1 viu atuação alheia');
select pg_temp.assert_true((select not published from public.list_my_profiles() where kind='artist'),'Atuação nova deve estar não publicada');
select pg_temp.assert_true((select city='Recife' and state_code='PE' from public.list_my_profiles() where kind='services'),'Cidade/UF da atuação ausentes');
select pg_temp.assert_true((select count(*) from public.list_my_profiles() where is_default)=0,'Sem artista padrão, nenhuma atuação é padrão');
select pg_temp.actor(2);
select pg_temp.assert_true((select array_agg(name) from public.list_my_profiles())=array['Artista 2'],'Titular 2 viu atuação alheia');

-- Coletivos: o criador é dono; estado pendente aparece só para o membro.
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from public.list_my_collectives())=1,'Titular 1 deve ver só o próprio coletivo');
select pg_temp.assert_true((select name='Coletivo do titular 1' and state='pending' and is_owner and role_name='Membro' and kind='collective' and city='Olinda' and state_code='PE'
  from public.list_my_collectives()),'Projeção do coletivo próprio incorreta');
select pg_temp.actor(3);
select pg_temp.assert_true((select count(*) from public.list_my_collectives())=0,'Quem não é membro não pode ver coletivos');
select pg_temp.assert_true((select count(*) from public.list_my_profiles())=1,'Titular 3 viu atuação alheia');

reset role;
update public.profiles set published=true where owner_id='a1000000-0000-4000-8000-000000000001' and kind='artist';
update private.account_details set default_artist_profile_id=(select id from public.profiles where owner_id='a1000000-0000-4000-8000-000000000001' and kind='artist')
  where user_id='a1000000-0000-4000-8000-000000000001';
update public.collectives set state='approved' where id=current_setting('test.c1')::uuid;
-- Membro comum (não dono) de outro coletivo, com o cargo embutido.
insert into private.collective_memberships(collective_id,user_id,role_id)
  select id,'a1000000-0000-4000-8000-000000000003',member_role_id from public.collectives where id=current_setting('test.c1')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true((select published and is_default from public.list_my_profiles() where kind='artist'),'Publicação e padrão devem refletir o estado atual');
select pg_temp.assert_true((select state='approved' from public.list_my_collectives()),'Estado do coletivo deve refletir o atual');
select pg_temp.actor(3);
select pg_temp.assert_true((select count(*)=1 and bool_and(not is_owner) and bool_and(role_name='Membro') from public.list_my_collectives()),'Membro comum deve ver o coletivo sem ser dono');
select pg_temp.actor(2);
select pg_temp.assert_true((select array_agg(name) from public.list_my_collectives())=array['Coletivo do titular 2'],'Titular 2 viu coletivo alheio');

-- Sem identidade, conta suspensa ou em exclusão: nada é devolvido.
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*) from public.list_my_profiles())=0 and (select count(*) from public.list_my_collectives())=0,'Sem identidade não pode listar');
reset role;
update private.account_details set state='suspended',state_reason='Revisão sintética' where user_id='a1000000-0000-4000-8000-000000000001';
update private.account_details set state='deletion_pending' where user_id='a1000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from public.list_my_profiles())=0 and (select count(*) from public.list_my_collectives())=0,'Conta suspensa não pode listar');
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from public.list_my_profiles())=0 and (select count(*) from public.list_my_collectives())=0,'Conta em exclusão não pode listar');
reset role;

-- Anônimo e service_role não executam; apenas usuários autenticados.
select pg_temp.assert_true(not has_function_privilege('anon','public.list_my_profiles()','EXECUTE') and not has_function_privilege('anon','public.list_my_collectives()','EXECUTE'),'Anônimo executa listas do titular');
select pg_temp.assert_true(not has_function_privilege('service_role','public.list_my_profiles()','EXECUTE') and not has_function_privilege('service_role','public.list_my_collectives()','EXECUTE'),'service_role executa listas do titular');
select pg_temp.assert_true(has_function_privilege('authenticated','public.list_my_profiles()','EXECUTE') and has_function_privilege('authenticated','public.list_my_collectives()','EXECUTE'),'Autenticado deve executar listas do titular');
do $$ begin
  set local role anon;
  begin perform public.list_my_profiles(); raise exception 'Anônimo listou atuações';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
rollback;
