-- Banco descartável: leitura de mensagens para a interface (get_recent_messages, get_conversation_details).
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlstate=expected_state then return; end if;
  raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
end; raise exception 'Operation unexpectedly succeeded'; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','a3000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'messaging-ui-'||n||'@example.invalid',now(),'558193000000'||n,now() from generate_series(1,3) n;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
select ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Nome cadastral privado '||n,(array['52998224725','12345678909','11144477735'])[n],
  '1990-01-01','Recife','PE',true,gen_random_uuid(),'messaging-ui-test' from generate_series(1,3) n;
insert into public.profiles(id,owner_id,kind,name,city,state_code)
select ('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'member','Atuação de interface '||n,'Recife','PE' from generate_series(1,3) n;
set local role authenticated;

-- 60 mensagens de 1 para 2: o fim da conversa só aparece pela página mais recente. O limite de envios por minuto
-- vale para o RPC, então as 59 mais antigas entram direto na tabela, com horários anteriores à enviada pelo RPC.
select pg_temp.actor(1);
select set_config('test.first',public.send_message('profile','a4000000-0000-4000-8000-000000000001','profile','a4000000-0000-4000-8000-000000000002','Mensagem 60',gen_random_uuid())::text,true);
select set_config('test.conversation',current_setting('test.first')::jsonb->>'conversation_id',true);
reset role;
insert into private.messages(conversation_id,sender_identity_id,author_user_id,body,created_at)
select current_setting('test.conversation')::uuid,i.id,'a3000000-0000-4000-8000-000000000001','Mensagem '||n,now()-interval '2 hours'+n*interval '1 minute'
  from generate_series(1,59) n cross join private.message_identities i where i.profile_id='a4000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(jsonb_array_length(public.get_messages(current_setting('test.conversation')::uuid))=50,'get_messages deve manter as 50 mais antigas');

select pg_temp.actor(2);
select set_config('test.page1',public.get_recent_messages(current_setting('test.conversation')::uuid)::text,true);
select pg_temp.assert_true(jsonb_array_length(current_setting('test.page1')::jsonb)=50,'Página mais recente deve ter 50 mensagens');
select pg_temp.assert_true(current_setting('test.page1')::jsonb->49->>'body'='Mensagem 60','Última posição deve ser a mensagem mais recente');
select pg_temp.assert_true(current_setting('test.page1')::jsonb->0->>'body'='Mensagem 11','A página recente começa na 11ª mensagem');
select pg_temp.assert_true(current_setting('test.page1')::jsonb->0->>'sender_name'='Atuação de interface 1','Remetente deve ser a atuação, nunca o nome cadastral');
select pg_temp.assert_true((select bool_and((a->>'created_at')::timestamptz<=(b->>'created_at')::timestamptz)
  from jsonb_array_elements(current_setting('test.page1')::jsonb) with ordinality x(a,i) join jsonb_array_elements(current_setting('test.page1')::jsonb) with ordinality y(b,j) on y.j=x.i+1),
  'Mensagens devem vir em ordem cronológica');
-- Cursor: a página anterior termina logo antes da primeira mensagem já carregada, sem repetir nem pular.
select set_config('test.page2',public.get_recent_messages(current_setting('test.conversation')::uuid,
  (current_setting('test.page1')::jsonb->0->>'created_at')::timestamptz,(current_setting('test.page1')::jsonb->0->>'id')::uuid)::text,true);
select pg_temp.assert_true(jsonb_array_length(current_setting('test.page2')::jsonb)=10,'Página anterior deve ter as 10 mensagens restantes');
select pg_temp.assert_true(current_setting('test.page2')::jsonb->0->>'body'='Mensagem 1' and current_setting('test.page2')::jsonb->9->>'body'='Mensagem 10','Página anterior deve ir da 1 à 10');
select pg_temp.reject($q$select public.get_recent_messages(current_setting('test.conversation')::uuid,now(),null)$q$,'22023');
select pg_temp.reject($q$select public.get_recent_messages(current_setting('test.conversation')::uuid,null,gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.get_recent_messages(current_setting('test.conversation')::uuid,'infinity',gen_random_uuid())$q$,'22023');
-- Quem não participa não lê nada, nem sabe se a conversa existe.
select pg_temp.actor(3);
select pg_temp.assert_true(public.get_recent_messages(current_setting('test.conversation')::uuid)='[]'::jsonb,'Terceiro leu mensagens recentes');
select pg_temp.assert_true(public.get_conversation_details(array[current_setting('test.conversation')::uuid])='[]'::jsonb,'Terceiro leu os detalhes da conversa');

-- Detalhes: última mensagem e quem bloqueou.
select pg_temp.actor(1);
select pg_temp.assert_true(public.get_conversation_details('{}')='[]'::jsonb,'Lista vazia deve devolver lista vazia');
select pg_temp.assert_true(public.get_conversation_details(array[current_setting('test.conversation')::uuid,gen_random_uuid()])->0->'last_message'->>'body'='Mensagem 60','Última mensagem incorreta');
select pg_temp.assert_true(jsonb_array_length(public.get_conversation_details(array[current_setting('test.conversation')::uuid,gen_random_uuid()]))=1,'Conversa inexistente não pode aparecer');
select pg_temp.assert_true(public.get_conversation_details(array[current_setting('test.conversation')::uuid])->0->'last_message'->>'sender_name'='Atuação de interface 1','Autor da última mensagem incorreto');
select pg_temp.assert_true(public.get_conversation_details(array[current_setting('test.conversation')::uuid])->0->'blocked_by'='[]'::jsonb,'Conversa sem bloqueio não pode listar bloqueadores');
select pg_temp.actor(2);
select public.set_conversation_block(current_setting('test.conversation')::uuid,'profile','a4000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(public.get_conversation_details(array[current_setting('test.conversation')::uuid])->0->'blocked_by'->0->>'id'='a4000000-0000-4000-8000-000000000002'
  and public.get_conversation_details(array[current_setting('test.conversation')::uuid])->0->'blocked_by'->0->>'kind'='profile','O bloqueador deve ser a atuação de quem bloqueou');
select pg_temp.actor(1);
select pg_temp.assert_true(jsonb_array_length(public.get_conversation_details(array[current_setting('test.conversation')::uuid])->0->'blocked_by')=1,'O outro lado também deve ver quem bloqueou');
select pg_temp.reject($q$select public.get_conversation_details((select array_agg(gen_random_uuid()) from generate_series(1,51)))$q$,'22023');
select pg_temp.reject($q$select public.get_conversation_details(null)$q$,'22023');

-- Anônimo e service_role não executam; só usuários autenticados.
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_recent_messages(uuid,timestamptz,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.get_conversation_details(uuid[])','EXECUTE'),'Anônimo executa leitura de mensagens');
select pg_temp.assert_true(not has_function_privilege('service_role','public.get_recent_messages(uuid,timestamptz,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.get_conversation_details(uuid[])','EXECUTE'),'service_role executa leitura de mensagens');
select pg_temp.assert_true(has_function_privilege('authenticated','public.get_recent_messages(uuid,timestamptz,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.get_conversation_details(uuid[])','EXECUTE'),'Autenticado deve executar leitura de mensagens');
rollback;
