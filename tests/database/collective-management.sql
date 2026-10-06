-- Banco descartável: lista de membros (get_collective_member_roster) e proteção do proprietário nas atribuições; a transação não deixa dados.
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
  select set_config('request.jwt.claims',jsonb_build_object('sub','a4000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'roster-'||n||'@example.invalid',now(),'558199730000'||n,now() from generate_series(1,5) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..5 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Titular do elenco '||n,'cpf',(array['52998224725','12345678909','11144477735','93541134780','86288366757'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      jsonb_build_object('kind','artist','name','Artista do elenco '||n,'styles','[{"style":"techno"}]'::jsonb),gen_random_uuid());
  end loop;
end $$;
select pg_temp.actor(1);
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Coletivo do elenco","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
select set_config('test.pending',public.create_collective('{"kind":"collective","name":"Coletivo pendente do elenco","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
-- Membro 2 pode remover membros; membro 3 tem só o perfil Membro; 4 e 5 não pertencem ao coletivo.
insert into private.collective_roles(id,collective_id,name) values('a5000000-0000-4000-8000-000000000001',current_setting('test.c')::uuid,'Moderação');
insert into private.collective_role_permissions(collective_id,role_id,permission) values(current_setting('test.c')::uuid,'a5000000-0000-4000-8000-000000000001','remove_members');
insert into private.collective_memberships(collective_id,user_id,role_id) values(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001');
insert into private.collective_memberships(collective_id,user_id,role_id)
select id,'a4000000-0000-4000-8000-000000000003',member_role_id from public.collectives where id=current_setting('test.c')::uuid;
-- Atuação padrão: a do membro 3 é pública (aparece); a do membro 2 não (nunca vaza o id ou o nome).
update public.profiles set published=true where owner_id='a4000000-0000-4000-8000-000000000003' and kind='artist';
update private.account_details a set default_artist_profile_id=p.id from public.profiles p
  where p.owner_id=a.user_id and p.kind='artist' and a.user_id in ('a4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000003');
update private.collective_memberships set last_activity_at='2026-10-01 12:00:00+00' where collective_id=current_setting('test.c')::uuid and user_id='a4000000-0000-4000-8000-000000000003';
set local role authenticated;

-- O proprietário vê todos os membros: ele primeiro, depois por nome, com perfil de acesso, atividade e atuação pública.
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from public.get_collective_member_roster(current_setting('test.c')::uuid))=3,'Elenco deve ter 3 membros');
select pg_temp.assert_true((select array_agg(member_name) from public.get_collective_member_roster(current_setting('test.c')::uuid))=
  array['Titular do elenco 1','Titular do elenco 2','Titular do elenco 3'],'Ordem: proprietário primeiro, depois por nome');
select pg_temp.assert_true((select is_owner and role_name='Membro' and artist_profile_id is null and last_activity_at is null
  from public.get_collective_member_roster(current_setting('test.c')::uuid) where user_id='a4000000-0000-4000-8000-000000000001'),'Linha do proprietário incorreta');
select pg_temp.assert_true((select not is_owner and role_name='Moderação' and role_id='a5000000-0000-4000-8000-000000000001' and artist_profile_id is null and artist_name is null
  from public.get_collective_member_roster(current_setting('test.c')::uuid) where user_id='a4000000-0000-4000-8000-000000000002'),'Atuação não pública vazou ou perfil incorreto');
select pg_temp.assert_true((select not is_owner and role_name='Membro' and artist_name='Artista do elenco 3' and artist_profile_id is not null and last_activity_at='2026-10-01 12:00:00+00'
  from public.get_collective_member_roster(current_setting('test.c')::uuid) where user_id='a4000000-0000-4000-8000-000000000003'),'Linha do membro comum incorreta');
select pg_temp.assert_true((select count(*) from public.get_collective_member_roster(current_setting('test.c')::uuid) where is_owner)=1,'Deve haver exatamente um proprietário');

-- Perfil com remover membros também vê; Membro comum, não membro e coletivo sem aprovação, não.
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from public.get_collective_member_roster(current_setting('test.c')::uuid))=3,'Perfil com remove_members deve ver o elenco');
select pg_temp.actor(3);
select pg_temp.reject($q$select * from public.get_collective_member_roster(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.actor(4);
select pg_temp.reject($q$select * from public.get_collective_member_roster(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.actor(1);
select pg_temp.reject($q$select * from public.get_collective_member_roster(current_setting('test.pending')::uuid)$q$,'42501');
select pg_temp.reject($q$select * from public.get_collective_member_roster('a5000000-0000-4000-8000-0000000000ff')$q$,'42501');

-- O proprietário não recebe outro perfil; um membro recebe e a lista reflete na hora; quem remove membros remove um comum, nunca o dono.
select pg_temp.reject($q$select public.assign_collective_role(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.assert_true((select role_name from public.get_collective_member_roster(current_setting('test.c')::uuid) where is_owner)='Membro','Proprietário foi rebaixado ou alterado');
select public.assign_collective_role(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select role_name from public.get_collective_member_roster(current_setting('test.c')::uuid) where user_id='a4000000-0000-4000-8000-000000000003')='Moderação','Atribuição não apareceu');
select pg_temp.reject($q$select public.assign_collective_role(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-000000000001')$q$,'22023');
select pg_temp.actor(2);
select pg_temp.reject($q$select public.assign_collective_role(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.reject($q$select public.remove_collective_member(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000001')$q$,'42501');
select public.remove_collective_member(current_setting('test.c')::uuid,'a4000000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select count(*) from public.get_collective_member_roster(current_setting('test.c')::uuid))=2,'Membro removido ainda aparece');
select pg_temp.assert_true((select count(*) from public.get_collective_member_roster(current_setting('test.c')::uuid) where user_id='a4000000-0000-4000-8000-000000000003')=0,'Membro removido ainda aparece');

-- Edição com o payload completo da tela (inclui `cnpj`, nulo num coletivo) e CNPJ de produtora normalizado.
select pg_temp.actor(1);
select public.edit_collective(current_setting('test.c')::uuid,1,'{"name":"Coletivo editado","description":"Texto","activity":"Música","city":"Olinda","state_code":"PE","cnpj":null}',false);
select pg_temp.assert_true(public.get_collective_status(current_setting('test.c')::uuid)->'profile'->>'name'='Coletivo editado'
  and public.get_collective_status(current_setting('test.c')::uuid)->'profile'->>'city'='Olinda'
  and (public.get_collective_status(current_setting('test.c')::uuid)->>'version')::integer=2
  and public.get_collective_status(current_setting('test.c')::uuid)->>'cnpj' is null,'Edição com cnpj nulo não aplicada');
select set_config('test.producer',public.create_collective('{"kind":"producer","name":"Produtora","city":"Recife","state_code":"PE","description":"S","activity":"Música","cnpj":"12ABC34501DE35"}',gen_random_uuid())::text,true);
select public.edit_collective(current_setting('test.producer')::uuid,1,'{"name":"Produtora editada","cnpj":"12.abc.345/01de-35"}',false);
select pg_temp.assert_true(public.get_collective_status(current_setting('test.producer')::uuid)->>'cnpj'='12ABC34501DE35','CNPJ não normalizado');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.producer')::uuid,2,'{"cnpj":null}',false)$q$,'22023');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.producer')::uuid,1,'{"name":"Versão velha"}',false)$q$,'40001');
select pg_temp.reject($q$select public.edit_collective(current_setting('test.c')::uuid,2,'{"kind":"producer"}',false)$q$,'22023');

-- Coletivo suspenso e conta suspensa do proprietário não leem a lista.
reset role;
update public.collectives set state='suspended' where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select * from public.get_collective_member_roster(current_setting('test.c')::uuid)$q$,'42501');
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
update private.account_details set state='suspended',state_reason='Revisão sintética' where user_id='a4000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select * from public.get_collective_member_roster(current_setting('test.c')::uuid)$q$,'42501');

-- Anônimo e service_role não executam; apenas autenticados.
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_collective_member_roster(uuid)','EXECUTE'),'Anônimo executa a lista de membros');
select pg_temp.assert_true(not has_function_privilege('service_role','public.get_collective_member_roster(uuid)','EXECUTE'),'service_role executa a lista de membros');
select pg_temp.assert_true(has_function_privilege('authenticated','public.get_collective_member_roster(uuid)','EXECUTE'),'Autenticado deve executar a lista de membros');
do $$ begin
  set local role anon;
  begin perform public.get_collective_member_roster(current_setting('test.c')::uuid); raise exception 'Anônimo listou membros';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
rollback;
