-- Banco descartável: fila de pedidos de entrada (list_collective_requests) só para quem gere pedidos; a transação não deixa dados.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.reject(statement text, expected_state text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlstate=expected_state then return; end if;
    raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
  end;
  raise exception 'Operation unexpectedly succeeded: %',statement;
end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a2000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'area-'||n||'@example.invalid',now(),'558199720000'||n,now() from generate_series(1,6) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..6 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Titular da área '||n,'cpf',(array['52998224725','12345678909','11144477735','93541134780','86288366757','45317828791'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      jsonb_build_object('kind','artist','name','Artista da área '||n,'styles','[{"style":"techno"}]'::jsonb),gen_random_uuid());
  end loop;
end $$;
select pg_temp.actor(1);
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Coletivo da área","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
select pg_temp.actor(2);
select set_config('test.pending',public.create_collective('{"kind":"collective","name":"Coletivo pendente da área","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
-- Membro 6 com perfil que gere pedidos; membro 5 com o perfil Membro, sem permissões.
insert into private.collective_roles(id,collective_id,name) values('a3000000-0000-4000-8000-000000000001',current_setting('test.c')::uuid,'Recepção');
insert into private.collective_role_permissions(collective_id,role_id,permission) values(current_setting('test.c')::uuid,'a3000000-0000-4000-8000-000000000001','manage_requests');
insert into private.collective_memberships(collective_id,user_id,role_id)
select id,'a2000000-0000-4000-8000-000000000005',member_role_id from public.collectives where id=current_setting('test.c')::uuid;
insert into private.collective_memberships(collective_id,user_id,role_id)
values(current_setting('test.c')::uuid,'a2000000-0000-4000-8000-000000000006','a3000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.actor(2);
select set_config('test.r2',public.request_collective_membership(current_setting('test.c')::uuid,
  (select id from public.profiles where owner_id='a2000000-0000-4000-8000-000000000002' and kind='artist'),'Quero tocar com vocês')::text,true);
select pg_temp.actor(3);
select set_config('test.r3',public.request_collective_membership(current_setting('test.c')::uuid,null,'')::text,true);
select pg_temp.actor(4);
select set_config('test.r4',public.request_collective_membership(current_setting('test.c')::uuid,null,'Vou desistir')::text,true);
select public.cancel_collective_request(current_setting('test.r4')::uuid);

-- O proprietário vê só os pedidos pendentes, com nome da conta, atuação escolhida e mensagem.
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from public.list_collective_requests(current_setting('test.c')::uuid))=2,'Fila deve ter só os 2 pedidos pendentes');
select pg_temp.assert_true((select array_agg(id order by created_at,id) from public.list_collective_requests(current_setting('test.c')::uuid))=
  (select array_agg(id order by created_at,id) from public.get_collective_requests(current_setting('test.c')::uuid) where state='pending'),'Ordem/conteúdo divergem de get_collective_requests');
select pg_temp.assert_true((select requester_name='Titular da área 2' and message='Quero tocar com vocês' and profile_name='Artista da área 2' and profile_kind='artist' and not profile_published
  from public.list_collective_requests(current_setting('test.c')::uuid) where id=current_setting('test.r2')::uuid),'Projeção do pedido com atuação incorreta');
select pg_temp.assert_true((select requester_name='Titular da área 3' and message='' and profile_id is null and profile_name is null and profile_kind is null and profile_published is null
  from public.list_collective_requests(current_setting('test.c')::uuid) where id=current_setting('test.r3')::uuid),'Pedido sem atuação deve vir só com o nome da conta');
select pg_temp.assert_true((select count(*) from public.list_collective_requests(current_setting('test.c')::uuid) where id=current_setting('test.r4')::uuid)=0,'Pedido cancelado não pode aparecer');

-- Membro com a permissão de gerir pedidos também vê; Membro comum, solicitante, estranho e anônimo não.
select pg_temp.actor(6);
select pg_temp.assert_true((select count(*) from public.list_collective_requests(current_setting('test.c')::uuid))=2,'Perfil com manage_requests deve ver a fila');
select pg_temp.actor(5);
select pg_temp.reject($q$select * from public.list_collective_requests(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.actor(2);
select pg_temp.reject($q$select * from public.list_collective_requests(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.actor(4);
select pg_temp.reject($q$select * from public.list_collective_requests(current_setting('test.c')::uuid)$q$,'42501');
-- Coletivo pendente (mesmo do próprio dono) e inexistente não têm fila.
select pg_temp.actor(2);
select pg_temp.reject($q$select * from public.list_collective_requests(current_setting('test.pending')::uuid)$q$,'42501');
select pg_temp.reject($q$select * from public.list_collective_requests('a3000000-0000-4000-8000-0000000000ff')$q$,'42501');

-- Publicar a atuação muda só o indicador; conta suspensa do solicitante some da fila; decidir tira o pedido da fila.
reset role;
update public.profiles set published=true where owner_id='a2000000-0000-4000-8000-000000000002' and kind='artist';
update private.account_details set state='suspended',state_reason='Revisão sintética' where user_id='a2000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true((select profile_published from public.list_collective_requests(current_setting('test.c')::uuid) where id=current_setting('test.r2')::uuid),'Indicador de publicação desatualizado');
select pg_temp.assert_true((select count(*) from public.list_collective_requests(current_setting('test.c')::uuid))=1,'Solicitante suspenso deve sair da fila');
select public.decide_collective_request(current_setting('test.r2')::uuid,true);
select pg_temp.assert_true((select count(*) from public.list_collective_requests(current_setting('test.c')::uuid))=0,'Pedido decidido deve sair da fila');

-- Coletivo suspenso: ninguém, nem o dono, lê a fila.
reset role;
update public.collectives set state='suspended' where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select * from public.list_collective_requests(current_setting('test.c')::uuid)$q$,'42501');

-- Anônimo e service_role não executam; apenas autenticados.
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.list_collective_requests(uuid)','EXECUTE'),'Anônimo executa a fila de pedidos');
select pg_temp.assert_true(not has_function_privilege('service_role','public.list_collective_requests(uuid)','EXECUTE'),'service_role executa a fila de pedidos');
select pg_temp.assert_true(has_function_privilege('authenticated','public.list_collective_requests(uuid)','EXECUTE'),'Autenticado deve executar a fila de pedidos');
rollback;
