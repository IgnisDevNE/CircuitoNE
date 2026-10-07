-- Banco descartável: edição da própria conta e das próprias atuações (W6).
-- Somente o titular de conta ativa; CPF/nascimento imutáveis; constraints respeitadas; estilos substituídos atomicamente.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a2000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
-- Executa o comando e exige que falhe com o SQLSTATE esperado (a mensagem da função não pode vazar constraint).
create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute stmt;
  exception when others then
    failed := true;
    if sqlstate <> expected then raise exception 'Esperado % mas veio % (%) em: %', expected, sqlstate, sqlerrm, stmt; end if;
    if expected = '22023' and sqlerrm ~* 'constraint|violates|account_details|profiles_|professional_details' then raise exception 'Mensagem expôs detalhe interno: %', sqlerrm; end if;
  end;
  if not failed then raise exception 'Esperado erro % em: %', expected, stmt; end if;
end $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.actor(integer),pg_temp.expect_error(text,text) to anon,authenticated;

insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'edit-'||n||'@example.invalid',now(),'558199720000'||n,now() from generate_series(1,4) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..4 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Titular sintético '||n,'cpf',(array['52998224725','12345678909','11144477735','93541134780'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      jsonb_build_object('kind','artist','name','Artista '||n,'styles','[{"style":"techno"}]'::jsonb),gen_random_uuid());
  end loop;
end $$;
select pg_temp.actor(1);
select set_config('test.services1',public.create_profile('{"kind":"services","name":"Serviços 1"}')::text,true);
select set_config('test.av1',public.create_profile('{"kind":"audiovisual","name":"Audiovisual 1"}')::text,true);
select set_config('test.member1',public.create_profile('{"kind":"member","name":"Integrante 1"}')::text,true);
select set_config('test.artist1',(select id::text from public.list_my_profiles() where kind='artist'),true);
select pg_temp.actor(2);
select set_config('test.artist2',(select id::text from public.list_my_profiles() where kind='artist'),true);

-- Conta: projeção com CPF mascarado, e-mail e celular vindos do Auth.
select pg_temp.actor(1);
select pg_temp.assert_true((select d->>'name'='Titular sintético 1' and d->>'cpf_masked'='***.982.247-**' and d->>'birth_date'='1990-01-01'
  and d->>'city'='Recife' and d->>'state_code'='PE' and d->>'email'='edit-1@example.invalid' and d->>'phone'='+5581997200001'
  and (d->>'phone_is_whatsapp')::boolean and d->'whatsapp_number'='null'::jsonb and d->'gender'='null'::jsonb
  from (select public.get_my_account_details() d) x),'Projeção da própria conta incorreta');
select pg_temp.assert_true(not (public.get_my_account_details())::text like '%52998224725%','CPF completo saiu do banco');

-- Edição válida: nome, gênero, cidade/UF e WhatsApp diferente do celular.
select public.update_my_account_details('{"name":"  Nome editado  ","gender":"Pessoa não binária","city":"Olinda","state_code":"PE","phone_is_whatsapp":false,"whatsapp_number":"+5581988887777"}');
select pg_temp.assert_true((select d->>'name'='Nome editado' and d->>'gender'='Pessoa não binária' and d->>'city'='Olinda'
  and not (d->>'phone_is_whatsapp')::boolean and d->>'whatsapp_number'='+5581988887777' and d->>'cpf_masked'='***.982.247-**' and d->>'birth_date'='1990-01-01'
  from (select public.get_my_account_details() d) x),'Edição da conta não persistiu ou alterou campo imutável');
-- Nome só: não mexe no resto (inclui WhatsApp). Gênero vazio volta a "não informar". "Não tenho WhatsApp" = false + nulo.
select public.update_my_account_details('{"name":"Outro nome","gender":""}');
select pg_temp.assert_true((select d->>'name'='Outro nome' and d->'gender'='null'::jsonb and d->>'whatsapp_number'='+5581988887777' from (select public.get_my_account_details() d) x),'Edição parcial alterou outros campos');
select public.update_my_account_details('{"phone_is_whatsapp":false,"whatsapp_number":null}');
select pg_temp.assert_true((select d->'whatsapp_number'='null'::jsonb and not (d->>'phone_is_whatsapp')::boolean from (select public.get_my_account_details() d) x),'Sem WhatsApp deve zerar o número');
select public.update_my_account_details('{"phone_is_whatsapp":true,"whatsapp_number":""}');
select pg_temp.assert_true((select (d->>'phone_is_whatsapp')::boolean and d->'whatsapp_number'='null'::jsonb from (select public.get_my_account_details() d) x),'Celular como WhatsApp deve zerar o número');

-- CPF, nascimento, e-mail e telefone confirmados são imutáveis; chaves desconhecidas e formatos inválidos são recusados.
select pg_temp.expect_error($$select public.update_my_account_details('{"cpf":"12345678909"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"birth_date":"1980-01-01"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"email":"outro@example.invalid"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"state":"suspended"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('[]')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"name":""}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"name":"   "}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details(jsonb_build_object('name',repeat('x',201)))$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"name":null}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"city":""}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"state_code":"XX"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details(jsonb_build_object('gender',repeat('x',101)))$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"phone_is_whatsapp":true}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"whatsapp_number":"+5581988887777"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"phone_is_whatsapp":true,"whatsapp_number":"+5581988887777"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"phone_is_whatsapp":false,"whatsapp_number":"81988887777"}')$$,'22023');
select pg_temp.expect_error($$select public.update_my_account_details('{"phone_is_whatsapp":"talvez","whatsapp_number":null}')$$,'22023');
-- Nada acima alterou a conta; também não há caminho direto às tabelas privadas.
select pg_temp.assert_true((select d->>'name'='Outro nome' and d->>'cpf_masked'='***.982.247-**' and d->>'birth_date'='1990-01-01' from (select public.get_my_account_details() d) x),'Tentativa recusada alterou a conta');
select pg_temp.expect_error($$update private.account_details set cpf='12345678909'$$,'42501');
select pg_temp.expect_error($$select cpf from private.account_details$$,'42501');

-- Titulares não cruzam: o 2 edita só a própria conta e vê só a própria projeção.
select pg_temp.actor(2);
select public.update_my_account_details('{"name":"Nome do titular 2"}');
select pg_temp.assert_true((select d->>'name'='Nome do titular 2' and d->>'email'='edit-2@example.invalid' from (select public.get_my_account_details() d) x),'Titular 2 viu/alterou a conta errada');
select pg_temp.actor(1);
select pg_temp.assert_true((select d->>'name'='Outro nome' from (select public.get_my_account_details() d) x),'Edição do titular 2 atingiu o titular 1');

-- Atuação: leitura só do dono, com estilos e dados profissionais.
select pg_temp.assert_true((select p->>'kind'='artist' and p->>'name'='Artista 1' and p->>'published'='false' and p->'color'='null'::jsonb
  and p->'styles'='[{"style":"techno","substyle":null}]'::jsonb and p->'professional'->>'booking_email' is null and p->'social_links'='{}'::jsonb
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Projeção da própria atuação incorreta');
select pg_temp.assert_true(public.get_my_profile(current_setting('test.artist2')::uuid) is null,'Titular 1 leu a atuação do titular 2');
select pg_temp.assert_true(public.get_my_profile(gen_random_uuid()) is null,'Atuação inexistente deve ser nula');
select pg_temp.assert_true((select p->'professional'='null'::jsonb from (select public.get_my_profile(current_setting('test.member1')::uuid) p) x),'Integrante não tem dados profissionais');

-- Edição de atuação: dados públicos, redes, cor e publicação.
select public.update_my_profile(current_setting('test.artist1')::uuid,
  '{"name":"  Artista renomeado ","description":"**Bio** em _markdown_","city":"Olinda","state_code":"PE","color":"#00ff88",
    "social_links":{"instagram":"https://instagram.com/sintetico","website":"https://example.invalid"},"published":true}');
select pg_temp.assert_true((select p->>'name'='Artista renomeado' and p->>'description'='**Bio** em _markdown_' and p->>'city'='Olinda' and p->>'color'='#00ff88'
  and p->>'published'='true' and p->'social_links'->>'instagram'='https://instagram.com/sintetico' and p->'styles'='[{"style":"techno","substyle":null}]'::jsonb
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Edição da atuação não persistiu');
-- O perfil público (visitante, sem identidade) passa a refletir; despublicar some do público e limpa a cor.
select set_config('request.jwt.claims','{}',true);
reset role; set local role anon;
select pg_temp.assert_true((select public.get_profile(current_setting('test.artist1')::uuid)->>'name')='Artista renomeado','Perfil público não refletiu a edição');
reset role; set local role authenticated;
select pg_temp.actor(1);
select public.update_my_profile(current_setting('test.artist1')::uuid,'{"published":false,"color":null,"social_links":{}}');
select set_config('request.jwt.claims','{}',true);
reset role; set local role anon;
select pg_temp.assert_true(public.get_profile(current_setting('test.artist1')::uuid) is null,'Perfil despublicado continua público');
reset role; set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true((select p->>'published'='false' and p->'color'='null'::jsonb and p->'social_links'='{}'::jsonb from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Despublicar/limpar não persistiu');

-- Outro titular não edita a atuação alheia (nada muda), nem professional_details dela.
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Invadida"}')$$,current_setting('test.artist1')),'42501');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"booking_email":"x@example.invalid"}')$$,current_setting('test.artist1')),'42501');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"styles":[{"style":"house"}]}')$$,current_setting('test.artist1')),'42501');
select pg_temp.expect_error($$select public.update_my_profile(gen_random_uuid(),'{"name":"Nada"}')$$,'42501');
select pg_temp.actor(1);
select pg_temp.assert_true((select p->>'name'='Artista renomeado' and p->'styles'='[{"style":"techno","substyle":null}]'::jsonb from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Titular 2 alterou a atuação do titular 1');

-- Constraints existentes são respeitadas, com erro 22023 e mensagem própria.
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":""}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,jsonb_build_object('name',repeat('x',201)))$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,jsonb_build_object('description',repeat('x',10001)))$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"description":null}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"city":"  "}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"state_code":"ZZ"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"color":"verde"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"color":"#12345"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"social_links":{"instagram":"@sintetico"}}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"social_links":{"tiktok":"https://example.invalid"}}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"social_links":{"website":"javascript:alert(1)"}}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"social_links":[]}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"owner_id":"a2000000-0000-4000-8000-000000000002"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"kind":"services"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"published":"sim"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'[]')$$,current_setting('test.artist1')),'22023');
-- Somente artista publica e tem estilos.
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"published":true}')$$,current_setting('test.services1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"styles":[{"style":"techno"}]}')$$,current_setting('test.services1')),'22023');
select public.update_my_profile(current_setting('test.services1')::uuid,'{"name":"Serviços renomeado","description":"","published":false}');
select pg_temp.assert_true((select p->>'name'='Serviços renomeado' and p->>'published'='false' from (select public.get_my_profile(current_setting('test.services1')::uuid) p) x),'Edição de atuação de serviços não persistiu');

-- Estilos: substituição completa e atômica.
select public.update_my_profile(current_setting('test.artist1')::uuid,
  '{"styles":[{"style":"house","substyle":"acid house"},{"style":"house"},{"style":"trance","substyle":"psytrance"}]}');
select pg_temp.assert_true((select p->'styles'='[{"style":"house","substyle":null},{"style":"house","substyle":"acid house"},{"style":"trance","substyle":"psytrance"}]'::jsonb
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Estilos não foram substituídos por completo');
select pg_temp.assert_true((select count(*)=3 from public.artist_styles where profile_id=current_setting('test.artist1')::uuid),'Estilos antigos sobraram');
-- Falha no meio (segundo item inválido): nada muda, nem o nome enviado junto.
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Nome que não vale","styles":[{"style":"techno"},{"style":"inexistente"}]}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Nome que não vale","styles":[{"style":"techno","substyle":"psytrance"}]}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Nome que não vale","styles":[{"style":"techno"},{"style":"techno"}]}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Nome que não vale","styles":[{"style":"techno","extra":1}]}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Nome que não vale","styles":[]}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Nome que não vale","styles":"techno"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,jsonb_build_object('name','Nome que não vale','styles',(select jsonb_agg(jsonb_build_object('style','techno')) from generate_series(1,51))))$$,current_setting('test.artist1')),'22023');
select pg_temp.assert_true((select p->>'name'='Artista renomeado' and p->'styles'='[{"style":"house","substyle":null},{"style":"house","substyle":"acid house"},{"style":"trance","substyle":"psytrance"}]'::jsonb
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Falha parcial deixou estilos ou nome alterados');

-- Dados profissionais por tipo.
select public.update_my_professional_details(current_setting('test.artist1')::uuid,
  '{"booking_email":"booking@example.invalid","contact_email":"contato@example.invalid","contact_phone":"+5581977776666","fee_cents":150000,"cnpj":"12abc34501de35","presskit_url":"https://example.invalid/presskit"}');
select pg_temp.assert_true((select p->'professional' @> '{"booking_email":"booking@example.invalid","contact_email":"contato@example.invalid","contact_phone":"+5581977776666","fee_cents":150000,
  "cnpj":"12ABC34501DE35","service_type":null,"service_other":null,"audiovisual_type":null,"presskit_url":"https://example.invalid/presskit","portfolio_url":null}'::jsonb
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Dados profissionais do artista não persistiram');
-- W11: a projeção também traz o estado dos documentos privados e as imagens (vazios aqui).
select pg_temp.assert_true((select p->'professional'->'presskit_path'='null'::jsonb and p->'professional'->'presskit_bytes'='null'::jsonb and p->'professional'->'services_pdf_path'='null'::jsonb
  and p->'images'='[]'::jsonb from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Projeção sem os campos de arquivo');
-- Só as chaves enviadas mudam; vazio vira nulo; cachê pode ser zerado.
select public.update_my_professional_details(current_setting('test.artist1')::uuid,'{"booking_email":"","fee_cents":null}');
select pg_temp.assert_true((select p->'professional'->'booking_email'='null'::jsonb and p->'professional'->'fee_cents'='null'::jsonb and p->'professional'->>'contact_email'='contato@example.invalid'
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Atualização parcial dos dados profissionais incorreta');
select public.update_my_professional_details(current_setting('test.services1')::uuid,'{"service_type":"other","service_other":"Cenografia","contact_email":"servicos@example.invalid"}');
select pg_temp.assert_true((select p->'professional'->>'service_type'='other' and p->'professional'->>'service_other'='Cenografia' from (select public.get_my_profile(current_setting('test.services1')::uuid) p) x),'Serviço não persistiu');
select public.update_my_professional_details(current_setting('test.av1')::uuid,'{"audiovisual_type":"video","portfolio_url":"https://example.invalid/portfolio"}');
select pg_temp.assert_true((select p->'professional'->>'audiovisual_type'='video' and p->'professional'->>'portfolio_url'='https://example.invalid/portfolio' from (select public.get_my_profile(current_setting('test.av1')::uuid) p) x),'Audiovisual não persistiu');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"booking_email":"sem-arroba"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"contact_email":"a b@example.invalid"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"contact_phone":"81977776666"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"fee_cents":-1}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"fee_cents":1.5}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"fee_cents":"caro"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"cnpj":"123"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"presskit_url":"ftp://example.invalid/x"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"presskit_path":"x/y.pdf"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"kind":"services"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"portfolio_url":"https://example.invalid/portfolio"}')$$,current_setting('test.artist1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"booking_email":"booking@example.invalid"}')$$,current_setting('test.services1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"fee_cents":100}')$$,current_setting('test.av1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"service_type":"other","service_other":null}')$$,current_setting('test.services1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"service_type":"structure","service_other":"Cenografia"}')$$,current_setting('test.services1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"service_type":"cenografia"}')$$,current_setting('test.services1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"audiovisual_type":"drone"}')$$,current_setting('test.av1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"contact_email":"x@example.invalid"}')$$,current_setting('test.member1')),'22023');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'[]')$$,current_setting('test.artist1')),'22023');
select pg_temp.assert_true((select p->'professional'->>'contact_email'='contato@example.invalid' and p->'professional'->>'contact_phone'='+5581977776666'
  from (select public.get_my_profile(current_setting('test.artist1')::uuid) p) x),'Tentativa recusada alterou dados profissionais');

-- Sem identidade (anônimo autenticado sem sub), conta suspensa ou em exclusão: nada é lido nem escrito.
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true(public.get_my_account_details() is null and public.get_my_profile(current_setting('test.artist1')::uuid) is null,'Sem identidade não pode ler');
select pg_temp.expect_error($$select public.update_my_account_details('{"name":"Sem identidade"}')$$,'42501');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Sem identidade"}')$$,current_setting('test.artist1')),'42501');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"booking_email":"s@example.invalid"}')$$,current_setting('test.artist1')),'42501');
reset role;
update private.account_details set state='suspended',state_reason='Revisão sintética' where user_id='a2000000-0000-4000-8000-000000000001';
update private.account_details set state='deletion_pending' where user_id='a2000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(public.get_my_account_details() is null and public.get_my_profile(current_setting('test.artist1')::uuid) is null,'Conta suspensa leu dados');
select pg_temp.expect_error($$select public.update_my_account_details('{"name":"Suspensa"}')$$,'42501');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Suspensa"}')$$,current_setting('test.artist1')),'42501');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"booking_email":"s@example.invalid"}')$$,current_setting('test.artist1')),'42501');
select pg_temp.actor(2);
select pg_temp.assert_true(public.get_my_account_details() is null,'Conta em exclusão leu dados');
select pg_temp.expect_error($$select public.update_my_account_details('{"name":"Em exclusão"}')$$,'42501');
select pg_temp.expect_error(format($$select public.update_my_profile(%L,'{"name":"Em exclusão"}')$$,current_setting('test.artist2')),'42501');
reset role;
select pg_temp.assert_true((select name='Outro nome' from private.account_details where user_id='a2000000-0000-4000-8000-000000000001'),'Conta suspensa foi alterada');
select pg_temp.assert_true((select name='Nome do titular 2' from private.account_details where user_id='a2000000-0000-4000-8000-000000000002'),'Conta em exclusão foi alterada');

-- Excluir a própria atuação (delete_profile) remove também estilos e dados profissionais; a de outro titular continua intacta.
update private.account_details set state='active',state_reason=null where user_id in ('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select public.delete_profile(%L)$$,current_setting('test.artist1')),'42501');
select pg_temp.actor(1);
select public.delete_profile(current_setting('test.services1')::uuid);
select pg_temp.assert_true(public.get_my_profile(current_setting('test.services1')::uuid) is null,'Atuação excluída ainda é legível');
select pg_temp.assert_true((select count(*)=3 from public.list_my_profiles()),'A exclusão deve afetar somente a atuação alvo');
reset role;
select pg_temp.assert_true(not exists(select from public.professional_details where profile_id=current_setting('test.services1')::uuid),'Dados profissionais sobraram após exclusão');

-- Grants: somente usuários autenticados executam; anônimo e service_role não.
select pg_temp.assert_true(not has_function_privilege('anon','public.get_my_account_details()','EXECUTE') and not has_function_privilege('anon','public.update_my_account_details(jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.get_my_profile(uuid)','EXECUTE') and not has_function_privilege('anon','public.update_my_profile(uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.update_my_professional_details(uuid,jsonb)','EXECUTE'),'Anônimo executa edição da conta');
select pg_temp.assert_true(not has_function_privilege('service_role','public.get_my_account_details()','EXECUTE') and not has_function_privilege('service_role','public.update_my_account_details(jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.get_my_profile(uuid)','EXECUTE') and not has_function_privilege('service_role','public.update_my_profile(uuid,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.update_my_professional_details(uuid,jsonb)','EXECUTE'),'service_role executa edição da conta');
select pg_temp.assert_true(has_function_privilege('authenticated','public.get_my_account_details()','EXECUTE') and has_function_privilege('authenticated','public.update_my_account_details(jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.get_my_profile(uuid)','EXECUTE') and has_function_privilege('authenticated','public.update_my_profile(uuid,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','public.update_my_professional_details(uuid,jsonb)','EXECUTE'),'Autenticado deve executar edição da conta');
do $$ begin
  set local role anon;
  begin perform public.get_my_account_details(); raise exception 'Anônimo leu a conta';
  exception when insufficient_privilege then null; end;
  begin perform public.update_my_account_details('{"name":"Anônimo"}'); raise exception 'Anônimo editou a conta';
  exception when insufficient_privilege then null; end;
  begin perform public.update_my_profile(gen_random_uuid(),'{"name":"Anônimo"}'); raise exception 'Anônimo editou atuação';
  exception when insufficient_privilege then null; end;
  begin perform public.update_my_professional_details(gen_random_uuid(),'{}'); raise exception 'Anônimo editou dados profissionais';
  exception when insufficient_privilege then null; end;
  begin perform public.get_my_profile(gen_random_uuid()); raise exception 'Anônimo leu atuação';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
rollback;
