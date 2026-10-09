-- Banco descartável: endurecimento do banco (CNPJ válido, trilha do coletivo com alvo, recadastro na janela da exclusão,
-- lista de conversas filtrada pelas identidades de quem chama e privilégios padrão); a transação não deixa dados.
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
-- Mensagem do erro levantado pelo comando (nula se não houve erro).
create function pg_temp.error_message(statement text) returns text language plpgsql as $$
begin execute statement; return null; exception when others then return sqlerrm; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a9000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
-- `private.collective_audit` não tem grant: o ensaio lê a trilha com os direitos de quem o criou.
create function pg_temp.audit_count(target uuid, audit_action text, expected jsonb default null, exact boolean default false) returns integer
language sql security definer as $$
  select count(*)::integer from private.collective_audit a where a.collective_id=target and a.action=audit_action
    and (expected is null or case when exact then a.details=expected else a.details@>expected end)
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.error_message(text),pg_temp.actor(integer),
  pg_temp.audit_count(uuid,text,jsonb,boolean) to anon,authenticated;

-- ---- B6: dígitos verificadores do CNPJ (numérico e alfanumérico) ----
select pg_temp.assert_true(private.valid_cnpj('11222333000181'),'CNPJ numérico válido recusado');
select pg_temp.assert_true(private.valid_cnpj('11.444.777/0001-61'),'CNPJ com pontuação recusado');
select pg_temp.assert_true(private.valid_cnpj('00.000.000/0001-91'),'CNPJ com zeros à esquerda recusado');
select pg_temp.assert_true(private.valid_cnpj('12345678000195'),'CNPJ numérico válido recusado');
select pg_temp.assert_true(private.valid_cnpj('12ABC34501DE35'),'CNPJ alfanumérico válido recusado');
select pg_temp.assert_true(private.valid_cnpj('12.abc.345/01de-35'),'CNPJ alfanumérico em minúsculas e com pontuação recusado');
select pg_temp.assert_true(not private.valid_cnpj(null),'CNPJ nulo aceito');
select pg_temp.assert_true(not private.valid_cnpj(''),'CNPJ vazio aceito');
select pg_temp.assert_true(not private.valid_cnpj('123'),'CNPJ curto aceito');
select pg_temp.assert_true(not private.valid_cnpj('112223330001810'),'CNPJ longo aceito');
select pg_temp.assert_true(not private.valid_cnpj('11222333000182'),'Dígito verificador errado aceito');
select pg_temp.assert_true(not private.valid_cnpj('11222333000191'),'Primeiro dígito verificador errado aceito');
select pg_temp.assert_true(not private.valid_cnpj('12ABC34501DE36'),'Dígito alfanumérico errado aceito');
select pg_temp.assert_true(not private.valid_cnpj('12ABC34501DEAB'),'Dígitos verificadores não numéricos aceitos');
select pg_temp.assert_true(not private.valid_cnpj('00000000000000'),'CNPJ de zeros aceito');
select pg_temp.assert_true(not private.valid_cnpj('11111111111111'),'CNPJ de dígitos iguais aceito');
select pg_temp.assert_true(not private.valid_cnpj('1122233300018!'),'Caractere inválido aceito');
select pg_temp.assert_true(not has_function_privilege('anon','private.valid_cnpj(text)','EXECUTE')
  and not has_function_privilege('authenticated','private.valid_cnpj(text)','EXECUTE'),'valid_cnpj exposta');

-- ---- B8: privilégios padrão e leitura anônima de professional_details ----
-- Só os padrões do papel que roda as migrações (postgres): são os que valem para as tabelas criadas por elas.
select pg_temp.assert_true(not exists(select from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
  join pg_roles creator on creator.oid=d.defaclrole
  cross join lateral aclexplode(d.defaclacl) a join pg_roles r on r.oid=a.grantee
  where n.nspname='public' and creator.rolname='postgres' and d.defaclobjtype='r' and r.rolname in ('anon','authenticated','service_role')
    and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')),'Privilégio padrão de tabela restante em public');
select pg_temp.assert_true(not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join (values('anon'),('authenticated'),('service_role')) roles(name)
  where n.nspname='public' and c.relkind in ('r','p')
    and not exists(select from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
    and has_table_privilege(roles.name,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')),
  'Tabela pública com TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN para papel da API');
select pg_temp.assert_true(not has_table_privilege('anon','public.professional_details','SELECT')
  and not has_any_column_privilege('anon','public.professional_details','SELECT'),'Anônimo ainda lê professional_details');
select pg_temp.assert_true(has_table_privilege('authenticated','public.professional_details','SELECT'),'Autenticado perdeu a leitura da própria atuação');

-- ---- Contas ----
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a9000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'hardening-'||n||'@example.invalid',now(),'558199760000'||n,now() from generate_series(1,5) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..4 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Titular de endurecimento '||n,'cpf',(array['52998224725','12345678909','11144477735','93541134780'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      jsonb_build_object('kind','artist','name','Artista de endurecimento '||n,'styles','[{"style":"techno"}]'::jsonb),gen_random_uuid());
  end loop;
end $$;

-- ---- B6: criação de coletivo e produtora com CNPJ ----
select pg_temp.actor(1);
select pg_temp.reject($q$select public.create_collective('{"kind":"producer","name":"Produtora inválida","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"11222333000182"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_collective('{"kind":"producer","name":"Produtora zerada","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"00000000000000"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_collective('{"kind":"producer","name":"Produtora curta","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"123"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_collective('{"kind":"collective","name":"Coletivo com CNPJ inválido","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"11.222.333/0001-82"}',gen_random_uuid())$q$,'22023');
select pg_temp.assert_true(pg_temp.error_message($q$select public.create_collective('{"kind":"producer","name":"Produtora inválida","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"11222333000182"}',gen_random_uuid())$q$)='CNPJ inválido','Mensagem do CNPJ inválido');
select pg_temp.assert_true((select count(*) from public.collectives where owner_user_id='a9000000-0000-4000-8000-000000000001')=0,'Coletivo criado com CNPJ inválido');
select set_config('test.producer',public.create_collective('{"kind":"producer","name":"Produtora válida","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"11.222.333/0001-81"}',gen_random_uuid())::text,true);
select set_config('test.alpha',public.create_collective('{"kind":"producer","name":"Produtora alfanumérica","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"12abc34501de35"}',gen_random_uuid())::text,true);
select set_config('test.a',public.create_collective('{"kind":"collective","name":"Coletivo A","city":"Recife","state_code":"PE","description":"S","activity":"Música"}',gen_random_uuid())::text,true);
select pg_temp.assert_true(public.get_collective_status(current_setting('test.producer')::uuid)->>'cnpj'='11222333000181','CNPJ da produtora não normalizado');
select pg_temp.assert_true(public.get_collective_status(current_setting('test.alpha')::uuid)->>'cnpj'='12ABC34501DE35','CNPJ alfanumérico não normalizado');
-- Coletivo pendente: trocar o nome não entra na trilha de identidade (ainda será analisado).
select public.edit_collective(current_setting('test.producer')::uuid,1,'{"name":"Produtora renomeada"}',false);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.producer')::uuid,'edited')=1
  and pg_temp.audit_count(current_setting('test.producer')::uuid,'identity_changed')=0,'Edição de coletivo pendente registrou mudança de identidade');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.producer')::uuid,2,'{"cnpj":"11222333000182"}',false)$q$,'22023');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.producer')::uuid,2,'{"cnpj":""}',false)$q$,'22023');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.producer')::uuid,2,'{"cnpj":"11111111111111"}',false)$q$,'22023');
select pg_temp.assert_true(public.get_collective_status(current_setting('test.producer')::uuid)->>'cnpj'='11222333000181','CNPJ inválido alterou o cadastro');

-- ---- B6 + B14: coletivo aprovado muda nome e CNPJ sem nova análise; a trilha guarda o antes e o depois ----
reset role;
update public.collectives set state='approved' where id in (current_setting('test.a')::uuid,current_setting('test.producer')::uuid);
set local role authenticated;
select pg_temp.actor(1);
select public.edit_collective(current_setting('test.a')::uuid,1,'{"name":"Coletivo A2","cnpj":"11.222.333/0001-81"}',false);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'identity_changed',
  '{"name":{"from":"Coletivo A","to":"Coletivo A2"},"cnpj":{"from":null,"to":"11222333000181"}}',true)=1,'Nome e CNPJ alterados não ficaram na trilha');
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'edited')=1,'Edição comum deixou de ser registrada');
-- Mudar só a descrição, ou repetir os mesmos valores, não registra mudança de identidade.
select public.edit_collective(current_setting('test.a')::uuid,2,'{"description":"Outra descrição"}',false);
select public.edit_collective(current_setting('test.a')::uuid,3,'{"name":"Coletivo A2","cnpj":"11222333000181"}',false);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'identity_changed')=1,'Edição sem mudança de identidade entrou na trilha');
select public.edit_collective(current_setting('test.a')::uuid,4,'{"name":"Coletivo A3"}',false);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'identity_changed',
  '{"name":{"from":"Coletivo A2","to":"Coletivo A3"}}',true)=1,'Só o nome mudou, e a trilha deve trazer só o nome');
select public.edit_collective(current_setting('test.a')::uuid,5,'{"cnpj":"12ABC34501DE35"}',false);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'identity_changed',
  '{"cnpj":{"from":"11222333000181","to":"12ABC34501DE35"}}',true)=1,'Só o CNPJ mudou, e a trilha deve trazer só o CNPJ');
-- CNPJ inválido e imagem pelo RPC de edição são recusados sem alterar nada.
select pg_temp.reject($q$select public.edit_collective(current_setting('test.a')::uuid,6,'{"cnpj":"12ABC34501DE36"}',false)$q$,'22023');
select pg_temp.assert_true(pg_temp.error_message($q$select public.edit_collective(current_setting('test.a')::uuid,6,'{"cnpj":"12ABC34501DE36"}',false)$q$)='CNPJ inválido','Mensagem do CNPJ inválido na edição');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.a')::uuid,6,'{"image_path":"x/y.png"}',false)$q$,'22023');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.a')::uuid,6,jsonb_build_object('image_path',current_setting('test.a')||'/capa.png'),false)$q$,'22023');
select pg_temp.assert_true(public.get_collective_status(current_setting('test.a')::uuid)->>'cnpj'='12ABC34501DE35'
  and (public.get_collective_status(current_setting('test.a')::uuid)->>'version')::integer=6
  and public.get_collective_status(current_setting('test.a')::uuid)->'profile'->>'image_path' is null,'Edição recusada alterou o coletivo');
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'identity_changed')=3,'Total de mudanças de identidade');

-- ---- B14: a trilha do coletivo registra o alvo (ids, sem dados pessoais) ----
select pg_temp.actor(2);
select set_config('test.request1',public.request_collective_membership(current_setting('test.a')::uuid)::text,true);
select pg_temp.actor(1);
select public.decide_collective_request(current_setting('test.request1')::uuid,true);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'membership_decided',
  jsonb_build_object('request_id',current_setting('test.request1'),'user_id','a9000000-0000-4000-8000-000000000002','approved',true),true)=1,'Decisão do pedido sem alvo na trilha');
select set_config('test.role',public.save_collective_role(current_setting('test.a')::uuid,null,'Moderação',array['remove_members'])::text,true);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'role_saved',
  jsonb_build_object('role_id',current_setting('test.role'),'created',true,'permissions',jsonb_build_array('remove_members')),true)=1,'Perfil criado sem alvo na trilha');
select public.save_collective_role(current_setting('test.a')::uuid,current_setting('test.role')::uuid,'Moderação 2',array['remove_members','manage_requests']);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'role_saved',
  jsonb_build_object('role_id',current_setting('test.role'),'created',false,'permissions',jsonb_build_array('remove_members','manage_requests')),true)=1,'Perfil editado sem alvo na trilha');
select public.assign_collective_role(current_setting('test.a')::uuid,'a9000000-0000-4000-8000-000000000002',current_setting('test.role')::uuid);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'role_assigned',
  jsonb_build_object('member_id','a9000000-0000-4000-8000-000000000002','role_id',current_setting('test.role')),true)=1,'Atribuição de perfil sem alvo na trilha');
select public.remove_collective_member(current_setting('test.a')::uuid,'a9000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'member_removed',
  '{"member_id":"a9000000-0000-4000-8000-000000000002","self":false}',true)=1,'Remoção de membro sem alvo na trilha');
select public.delete_collective_role(current_setting('test.a')::uuid,current_setting('test.role')::uuid);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'role_deleted',
  jsonb_build_object('role_id',current_setting('test.role')),true)=1,'Perfil excluído sem alvo na trilha');
-- Pedido recusado e saída voluntária.
select pg_temp.actor(3);
select set_config('test.request2',public.request_collective_membership(current_setting('test.a')::uuid)::text,true);
select pg_temp.actor(1);
select public.decide_collective_request(current_setting('test.request2')::uuid,false);
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'membership_decided',
  jsonb_build_object('request_id',current_setting('test.request2'),'user_id','a9000000-0000-4000-8000-000000000003','approved',false),true)=1,'Pedido recusado sem alvo na trilha');
select pg_temp.actor(2);
select set_config('test.request3',public.request_collective_membership(current_setting('test.a')::uuid)::text,true);
select pg_temp.actor(1);
select public.decide_collective_request(current_setting('test.request3')::uuid,true);
select pg_temp.actor(2);
select public.remove_collective_member(current_setting('test.a')::uuid,'a9000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.audit_count(current_setting('test.a')::uuid,'member_removed',
  '{"member_id":"a9000000-0000-4000-8000-000000000002","self":true}',true)=1,'Saída voluntária sem alvo na trilha');
-- Só ids, perfis e decisões: nenhum nome, perfil de acesso ou CPF na coluna details das ações de membros e perfis.
reset role;
select pg_temp.assert_true(not exists(select from private.collective_audit where collective_id=current_setting('test.a')::uuid
  and action in ('role_saved','role_deleted','role_assigned','membership_decided','member_removed')
  and (details::text ~* 'Titular|Moderação|Artista|cpf|@' or jsonb_typeof(details)<>'object' or details='{}'::jsonb)),'Trilha com dado pessoal ou sem alvo');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.collective_audit','SELECT')
  and not has_any_column_privilege('authenticated','private.collective_audit','SELECT')
  and not has_any_column_privilege('anon','private.collective_audit','SELECT'),'Trilha do coletivo exposta');
set local role authenticated;

-- ---- B13: recadastro na janela entre o pedido de exclusão e a remoção da conta ----
select pg_temp.actor(4);
select public.request_account_deletion();
reset role;
select pg_temp.assert_true(exists(select from private.account_deletions where user_id='a9000000-0000-4000-8000-000000000004' and prepared_at is not null)
  and not exists(select from private.account_details where user_id='a9000000-0000-4000-8000-000000000004')
  and exists(select from auth.users where id='a9000000-0000-4000-8000-000000000004'),'Preparação da exclusão do ensaio');
set local role authenticated;
select pg_temp.actor(4);
select pg_temp.reject($q$select public.complete_registration('{"name":"Volta","cpf":"93541134780","birth_date":"1990-01-01","city":"Recife","state_code":"PE","phone_is_whatsapp":true}','{"kind":"member","name":"Atuação nova"}',gen_random_uuid())$q$,'42501');
select pg_temp.assert_true(pg_temp.error_message($q$select public.complete_registration('{"name":"Volta","cpf":"93541134780","birth_date":"1990-01-01","city":"Recife","state_code":"PE","phone_is_whatsapp":true}','{"kind":"member","name":"Atuação nova"}',gen_random_uuid())$q$)='Conta indisponível','Recusa do recadastro deve ser genérica');
reset role;
select pg_temp.assert_true(not exists(select from private.account_details where user_id='a9000000-0000-4000-8000-000000000004')
  and not exists(select from public.profiles where owner_id='a9000000-0000-4000-8000-000000000004'),'Recadastro recusado criou conta ou atuação');
-- Conta nova com exclusão pendente (a linha existe antes de qualquer cadastro): recusada; sem a linha, o mesmo cadastro passa.
insert into private.account_deletions(user_id,requested_at,identity_due_at) values('a9000000-0000-4000-8000-000000000005',now(),now()+interval '1 day');
set local role authenticated;
select pg_temp.actor(5);
select pg_temp.reject($q$select public.complete_registration('{"name":"Pendente","cpf":"86288366757","birth_date":"1990-01-01","city":"Recife","state_code":"PE","phone_is_whatsapp":true}','{"kind":"member","name":"Atuação pendente"}',gen_random_uuid())$q$,'42501');
reset role;
delete from private.account_deletions where user_id='a9000000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.actor(5);
select public.complete_registration('{"name":"Sem pendência","cpf":"86288366757","birth_date":"1990-01-01","city":"Recife","state_code":"PE","phone_is_whatsapp":true}','{"kind":"member","name":"Atuação liberada"}',gen_random_uuid());
select pg_temp.assert_true((select count(*) from public.profiles where owner_id='a9000000-0000-4000-8000-000000000005')=1,'Cadastro sem exclusão pendente deve concluir');

-- ---- B13: list_conversations parte das identidades de quem chama ----
reset role;
select set_config('test.p1',(select id::text from public.profiles where owner_id='a9000000-0000-4000-8000-000000000001' and kind='artist'),true);
select set_config('test.p2',(select id::text from public.profiles where owner_id='a9000000-0000-4000-8000-000000000002' and kind='artist'),true);
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(public.list_conversations()='[]'::jsonb,'Lista de conversas deve começar vazia');
select public.send_message('profile',current_setting('test.p1')::uuid,'profile',current_setting('test.p2')::uuid,'Olá, endurecimento',gen_random_uuid());
select pg_temp.assert_true(jsonb_array_length(public.list_conversations())=1,'Remetente não vê a conversa');
select pg_temp.assert_true(public.list_conversations()->0->'side_a'->>'kind'='profile' and public.list_conversations()->0->>'blocked'='false','Linha da conversa incorreta');
select pg_temp.actor(2);
select pg_temp.assert_true(jsonb_array_length(public.list_conversations())=1 and (public.list_conversations()->0->>'unread_count')::integer=1,'Destinatário não vê a conversa');
select pg_temp.actor(3);
select pg_temp.assert_true(public.list_conversations()='[]'::jsonb,'Terceiro listou conversas');
-- Quem lê pelo coletivo vê as conversas do coletivo; quem não é membro não vê.
select pg_temp.actor(1);
select public.send_message('collective',current_setting('test.a')::uuid,'profile',current_setting('test.p2')::uuid,'Pelo coletivo',gen_random_uuid());
select pg_temp.assert_true(jsonb_array_length(public.list_conversations())=2,'Proprietário não vê a conversa do coletivo');
select pg_temp.actor(3);
select pg_temp.assert_true(public.list_conversations()='[]'::jsonb,'Não membro listou conversas do coletivo');
select pg_temp.actor(2);
select pg_temp.assert_true(jsonb_array_length(public.list_conversations())=2,'Destinatário não vê as duas conversas');
select pg_temp.reject($q$select public.list_conversations(now(),null)$q$,'22023');
select pg_temp.assert_true(jsonb_array_length(public.list_conversations(now()+interval '1 day',gen_random_uuid()))=2,'Cursor deve preservar a ordem');
select pg_temp.assert_true(jsonb_array_length(public.list_conversations(now()-interval '1 day',gen_random_uuid()))=0,'Cursor passado deve esgotar a lista');
reset role;
rollback;
