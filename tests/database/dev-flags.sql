-- Banco descartável; a transação não deixa contas, flags nem coletivos.
-- Flags de ambiente do dev: desligadas, nada muda; ligadas (como o seed `dev-flags` faz), MFA vira opcional e coletivos nascem aprovados.
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
-- Sessões aal1, sem fator MFA algum.
create function pg_temp.actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','76000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'role','authenticated','aal','aal1','session_id','77000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true)::void
$$;
-- private.current_mfa() não é executável pelos papéis da API; o ensaio a consulta com a identidade da sessão simulada.
create function pg_temp.mfa() returns boolean language sql security definer as $$ select private.current_mfa() $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer),pg_temp.mfa() to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('76000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'flags-'||n||'@example.invalid',now(),'558199800000'||n,now() from generate_series(1,3) n;
-- A conta 4 não confirmou o telefone: nunca é verificada.
insert into auth.users(id,email,email_confirmed_at,phone) values('76000000-0000-4000-8000-000000000004','flags-4@example.invalid',now(),'5581998000004');
insert into auth.sessions(id,user_id,aal,created_at,updated_at)
select ('77000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('76000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'aal1',now(),now() from generate_series(1,4) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..3 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Pessoa de flags '||n,'cpf',(array['52998224725','12345678909','11144477735'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      '{"kind":"artist","name":"Atuação de flags","styles":[{"style":"techno"}]}',gen_random_uuid());
  end loop;
end $$;
reset role;

-- Flags desligadas: comportamento de produção.
select pg_temp.assert_true((select count(*) from private.environment_flags)=0,'Flags não nascem vazias');
select pg_temp.assert_true(not private.env_flag('mfa_optional') and not private.env_flag('auto_approve_collectives'),'Flag ativa sem linha');
set local role anon;
select pg_temp.assert_true(public.get_environment_flags()='{}'::text[],'Visitante vê flags com a tabela vazia');
select pg_temp.reject($q$select * from private.environment_flags$q$,'42501');
select pg_temp.reject($q$select private.env_flag('mfa_optional')$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.reject($q$insert into private.environment_flags values('mfa_optional')$q$,'42501');
select pg_temp.actor(1);
select pg_temp.assert_true(public.get_environment_flags()='{}'::text[],'Flags não vazias para a conta autenticada');
select pg_temp.assert_true(not pg_temp.mfa(),'Sessão aal1 ganhou MFA sem a flag');
select set_config('test.off',public.create_collective('{"kind":"collective","name":"Sem flag","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
reset role;
select pg_temp.assert_true((select state from public.collectives where id=current_setting('test.off')::uuid)='pending','Coletivo não nasceu pendente');
select pg_temp.assert_true(not exists(select from private.collective_audit where collective_id=current_setting('test.off')::uuid and action='auto_approved'),'Aprovação automática sem flag');
update public.collectives set state='approved' where id=current_setting('test.off')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(not private.professional_reader(),'Sessão aal1 virou leitor profissional sem a flag');
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Diretório liberado sem MFA e sem flag');
reset role;
-- Sem flag, a transferência continua exigindo MFA do proprietário.
insert into private.collective_memberships(collective_id,user_id,role_id)
  select id,'76000000-0000-4000-8000-000000000002',member_role_id from public.collectives where id=current_setting('test.off')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.transfer_collective_ownership(current_setting('test.off')::uuid,'76000000-0000-4000-8000-000000000002')$q$,'42501');
reset role;

-- Flags ligadas.
insert into private.environment_flags(name) values('mfa_optional'),('auto_approve_collectives');
select pg_temp.reject($q$insert into private.environment_flags values('qualquer')$q$,'23514');
set local role anon;
select pg_temp.assert_true(public.get_environment_flags()=array['auto_approve_collectives','mfa_optional'],'Visitante não lê as flags ativas');
reset role;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(private.professional_reader(),'Proprietário verificado aal1 não lê profissional com mfa_optional');
select pg_temp.assert_true((select count(*) from public.professional_details)=3,'Proprietário de coletivo aprovado não lê dados profissionais');
-- Conta sem coletivo aprovado continua sem diretório; conta não verificada continua sem MFA.
select pg_temp.actor(3);
select pg_temp.assert_true(pg_temp.mfa(),'Conta verificada não ganhou MFA com a flag');
select pg_temp.assert_true(not private.professional_reader(),'Conta sem coletivo virou leitor profissional');
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Conta sem coletivo leu diretório');
select pg_temp.actor(4);
select pg_temp.assert_true(not pg_temp.mfa(),'Conta não verificada ganhou MFA com a flag');
select pg_temp.actor(1);
select set_config('test.on',public.create_collective('{"kind":"collective","name":"Com flag","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
reset role;
select pg_temp.assert_true((select state from public.collectives where id=current_setting('test.on')::uuid)='approved','Coletivo não nasceu aprovado com a flag');
select pg_temp.assert_true((select count(*) from private.collective_audit where collective_id=current_setting('test.on')::uuid and action in ('created','auto_approved'))=2,'Trilha de aprovação automática ausente');
set local role anon;
select pg_temp.assert_true((select count(*) from public.collectives where id=current_setting('test.on')::uuid)=1,'Coletivo aprovado não aparece no catálogo');
reset role;
-- Transferência sem fator verificado do sucessor (a conta 2 não tem nenhum); sucessor não verificado continua recusado.
select pg_temp.assert_true(not exists(select from auth.mfa_factors where user_id='76000000-0000-4000-8000-000000000002'),'Sucessor com fator no teste');
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.transfer_collective_ownership(current_setting('test.off')::uuid,'76000000-0000-4000-8000-000000000004')$q$,'42501');
select public.transfer_collective_ownership(current_setting('test.off')::uuid,'76000000-0000-4000-8000-000000000002');
reset role;
select pg_temp.assert_true((select owner_user_id from public.collectives where id=current_setting('test.off')::uuid)='76000000-0000-4000-8000-000000000002','Transferência não aconteceu');
-- Reexecutar o seed não duplica, e apagar as linhas restaura a regra original.
insert into private.environment_flags(name) values('mfa_optional') on conflict do nothing;
delete from private.environment_flags;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(not pg_temp.mfa(),'MFA continuou opcional após apagar a flag');
select pg_temp.assert_true(public.get_environment_flags()='{}'::text[],'Flags continuaram após apagar');
reset role;
set constraints all immediate;
rollback;
