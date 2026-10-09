-- Banco descartável: buckets, políticas de storage.objects e RPCs de arquivo (W11). A transação não deixa dados nem objetos.
-- Os objetos são inseridos direto em storage.objects (com o papel do usuário), como o Storage faz depois de aceitar o envio:
-- é assim que se exercitam as políticas sem subir o serviço de Storage.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.actor(n integer, mfa boolean default true) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a6000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'role','authenticated','aal',case when mfa then 'aal2' else 'aal1' end,
    'session_id','a8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true)::void
$$;
-- Executa o comando e exige o SQLSTATE esperado; mensagens 22023 não podem expor detalhes internos.
create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute stmt;
  exception when others then
    failed := true;
    if sqlstate <> expected then raise exception 'Esperado % mas veio % (%) em: %', expected, sqlstate, sqlerrm, stmt; end if;
    if expected = '22023' and sqlerrm ~* 'constraint|violates|profile_images|professional_details|storage' then raise exception 'Mensagem expôs detalhe interno: %', sqlerrm; end if;
  end;
  if not failed then raise exception 'Esperado erro % em: %', expected, stmt; end if;
end $$;
-- Objeto como o Storage o grava: dono = quem enviou, tamanho e tipo nos metadados.
create function pg_temp.put(bucket text, object_name text, size integer default 1000, mime text default null) returns void language plpgsql as $$
begin
  insert into storage.objects(bucket_id,name,owner_id,metadata) values(bucket,object_name,auth.uid()::text,
    jsonb_build_object('size',size,'mimetype',coalesce(mime,case when object_name ~ '\.png$' then 'image/png' when object_name ~ '\.pdf$' then 'application/pdf'
      when object_name ~ '\.webp$' then 'image/webp' else 'image/jpeg' end)));
end $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.actor(integer,boolean),pg_temp.expect_error(text,text),pg_temp.put(text,text,integer,text) to anon,authenticated;
-- Atualiza/remove objetos com as regras de RLS e devolve quantas linhas o papel atual conseguiu atingir (nome nulo = todos do bucket).
create function pg_temp.touch(bucket text, object_name text default null) returns integer language plpgsql as $$
declare n integer;
begin update storage.objects set metadata=metadata where bucket_id=bucket and (object_name is null or name=object_name); get diagnostics n=row_count; return n; end $$;
create function pg_temp.drop_object(bucket text, object_name text default null) returns integer language plpgsql as $$
declare n integer;
begin perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id=bucket and (object_name is null or name=object_name); get diagnostics n=row_count; return n; end $$;
grant execute on function pg_temp.touch(text,text),pg_temp.drop_object(text,text) to anon,authenticated;
-- O papel atual enxerga o objeto de public-images? (a leitura do bucket privado passa pela política de select)
create function pg_temp.sees(object_name text) returns boolean language sql as $$
  select exists(select from storage.objects where bucket_id='public-images' and name=object_name)
$$;
grant execute on function pg_temp.sees(text) to anon,authenticated;

-- Buckets: configuração esperada.
select pg_temp.assert_true((select not public and file_size_limit=5000000 and allowed_mime_types=array['image/jpeg','image/png','image/webp'] from storage.buckets where id='public-images'),'Bucket de imagens deve ser privado');
select pg_temp.assert_true((select not public and file_size_limit=10000000 and allowed_mime_types=array['application/pdf'] from storage.buckets where id='private-documents'),'Bucket privado incorreto');

insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('a6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'storage-'||n||'@example.invalid',now(),'558199740000'||n,now() from generate_series(1,6) n;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
select ('a7000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('a6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'totp','verified',now(),now() from generate_series(1,6) n;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select ('a8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('a6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('a7000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'aal2',now(),now() from generate_series(1,6) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..6 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Titular de arquivos '||n,'cpf',(array['52998224725','12345678909','11144477735','93541134780','86288366757','52513127765'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      jsonb_build_object('kind','artist','name','Artista de arquivos '||n,'styles','[{"style":"techno"}]'::jsonb),gen_random_uuid());
  end loop;
end $$;
select pg_temp.actor(1);
select set_config('test.services1',public.create_profile('{"kind":"services","name":"Serviços de arquivos"}')::text,true);
select set_config('test.av1',public.create_profile('{"kind":"audiovisual","name":"Audiovisual de arquivos"}')::text,true);
select set_config('test.member1',public.create_profile('{"kind":"member","name":"Integrante de arquivos"}')::text,true);
select set_config('test.artist1',(select id::text from public.list_my_profiles() where kind='artist'),true);
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Coletivo de arquivos","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
select set_config('test.pending',public.create_collective('{"kind":"collective","name":"Coletivo pendente de arquivos","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
select pg_temp.actor(2);
select set_config('test.artist2',(select id::text from public.list_my_profiles() where kind='artist'),true);
select pg_temp.actor(4);
select set_config('test.artist4',(select id::text from public.list_my_profiles() where kind='artist'),true);
select set_config('test.c4',public.create_collective('{"kind":"collective","name":"Coletivo leitor","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())::text,true);
select pg_temp.actor(5);
select set_config('test.artist5',(select id::text from public.list_my_profiles() where kind='artist'),true);
reset role;
update public.collectives set state='approved' where id in (current_setting('test.c')::uuid,current_setting('test.c4')::uuid);
insert into private.collective_roles(id,collective_id,name) values('a9000000-0000-4000-8000-000000000001',current_setting('test.c')::uuid,'Editores');
insert into private.collective_role_permissions(collective_id,role_id,permission) values(current_setting('test.c')::uuid,'a9000000-0000-4000-8000-000000000001','edit_events');
-- 2 edita eventos; 3 é só membro comum.
insert into private.collective_memberships(collective_id,user_id,role_id) values(current_setting('test.c')::uuid,'a6000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000001');
insert into private.collective_memberships(collective_id,user_id,role_id)
select id,'a6000000-0000-4000-8000-000000000003',member_role_id from public.collectives where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.event',public.create_event(current_setting('test.c')::uuid,
  '{"name":"Evento de arquivos","kind":"festa","style":"techno","starts_at":"2099-01-01T18:00:00-03:00","city":"Recife","state_code":"PE","venue":"Local","is_free":true}',gen_random_uuid())::text,true);
select set_config('test.event2',public.create_event(current_setting('test.c')::uuid,
  '{"name":"Outro evento de arquivos","kind":"festa","style":"techno","starts_at":"2099-02-01T18:00:00-03:00","city":"Recife","state_code":"PE","venue":"Local","is_free":true}',gen_random_uuid())::text,true);

-- ---- Políticas de public-images ----
-- Titular da atuação de artista envia sob o id da própria atuação; outras contas e atuações que não são de artista, não.
select pg_temp.actor(1);
select pg_temp.put('public-images',current_setting('test.artist1')||'/foto.png');
select pg_temp.put('public-images',current_setting('test.artist1')||'/outra.jpg');
select pg_temp.put('public-images',current_setting('test.artist1')||'/galeria_1-a.webp');
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.artist1')||'/invasor.png'),'42501');
select pg_temp.actor(1);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.services1')||'/servicos.png'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.member1')||'/integrante.png'),'42501');
-- Caminho forjado: formato fora do padrão das colunas nunca é aceito, nem para o próprio id.
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.artist1')||'/sub/pasta.png'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.artist1')||'/animada.gif'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.artist1')||'/documento.pdf'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,upper(current_setting('test.artist1'))||'/maiuscula.png'),'42501');
select pg_temp.expect_error($$select pg_temp.put('public-images','nao-e-uuid/foto.png')$$,'42501');
select pg_temp.expect_error($$select pg_temp.put('public-images','foto-solta.png')$$,'42501');
select pg_temp.expect_error($$select pg_temp.put('public-images','------------------------------------/foto.png')$$,'42501');
select pg_temp.expect_error($$select pg_temp.put('public-images',gen_random_uuid()::text||'/inexistente.png')$$,'42501');
-- Coletivo: só o proprietário (também com pedido pendente); membro com perfil de eventos e membro comum, não.
select pg_temp.put('public-images',current_setting('test.c')||'/capa.png');
select pg_temp.put('public-images',current_setting('test.pending')||'/capa.png');
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.c')||'/membro.png'),'42501');
select pg_temp.actor(3);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.c')||'/membro.png'),'42501');
-- Evento: quem edita eventos do coletivo aprovado; membro comum e estranho, não.
select pg_temp.actor(2);
select pg_temp.put('public-images',current_setting('test.event')||'/capa.png');
select pg_temp.actor(3);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.event')||'/membro.png'),'42501');
select pg_temp.actor(5);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.event')||'/estranho.png'),'42501');
-- Dono listando: vê o que pode escrever; estranho só vê o que é público (aqui, a capa do coletivo aprovado) e nada de rascunho.
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='public-images' and name like current_setting('test.artist1')||'/%')=3,'Titular não lista as próprias imagens');
select pg_temp.actor(5);
select pg_temp.assert_true((select array_agg(name) from storage.objects where bucket_id='public-images')=array[current_setting('test.c')||'/capa.png'],'Estranho lista imagens alheias além das visíveis');
-- Anônimo só lê o que é visível a qualquer um e não escreve.
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true((select array_agg(name) from storage.objects)=array[current_setting('test.c')||'/capa.png'],'Anônimo lista objetos além dos visíveis');
select pg_temp.expect_error($$select pg_temp.put('public-images',gen_random_uuid()::text||'/anonimo.png')$$,'42501');
reset role;
set local role authenticated;
-- Atualizar (upsert) e remover: só quem pode escrever.
select pg_temp.actor(2);
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.artist1')||'/foto.png')=0,'Estranho atualizou imagem alheia');
select pg_temp.assert_true(pg_temp.drop_object('public-images',current_setting('test.artist1')||'/foto.png')=0,'Estranho removeu imagem alheia');
select pg_temp.actor(1);
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.artist1')||'/foto.png')=1,'Titular não atualiza a própria imagem');
select pg_temp.put('public-images',current_setting('test.artist1')||'/descartavel.png');
select pg_temp.assert_true(pg_temp.drop_object('public-images',current_setting('test.artist1')||'/descartavel.png')=1,'Titular não remove a própria imagem');

-- ---- Políticas de private-documents ----
select pg_temp.actor(1);
select pg_temp.put('private-documents',current_setting('test.artist1')||'/presskit.pdf');
select pg_temp.put('private-documents',current_setting('test.services1')||'/lista.pdf');
-- Audiovisual e integrante não têm documento (RN-35), outra conta não escreve na atuação alheia, e só PDF.
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.av1')||'/portfolio.pdf'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.member1')||'/doc.pdf'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.artist1')||'/imagem.png'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.artist1')||'/sub/doc.pdf'),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.c')||'/coletivo.pdf'),'42501');
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.artist1')||'/invasor.pdf'),'42501');
-- Leitura: o titular; o leitor profissional (proprietário de coletivo aprovado com MFA) e mais ninguém.
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='private-documents')=2,'Titular não lê os próprios documentos');
select pg_temp.actor(4);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='private-documents')=2,'Leitor profissional não lê documentos');
select pg_temp.actor(4,false);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='private-documents')=0,'Leitor sem MFA leu documentos');
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='private-documents')=0,'Conta comum leu documentos');
select pg_temp.actor(3);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='private-documents')=0,'Membro comum leu documentos');
-- Leitor não escreve, não atualiza e não remove.
select pg_temp.actor(4);
select pg_temp.expect_error(format($$select pg_temp.put('private-documents',%L)$$,current_setting('test.artist1')||'/leitor.pdf'),'42501');
select pg_temp.assert_true(pg_temp.touch('private-documents')=0,'Leitor atualizou documento');
select pg_temp.assert_true(pg_temp.drop_object('private-documents')=0,'Leitor removeu documento');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='private-documents')=0,'Anônimo leu documentos');
reset role;
set local role authenticated;

-- ---- Foto principal e galeria (attach/detach/move_profile_image) ----
select pg_temp.actor(1);
select pg_temp.assert_true((public.attach_profile_image(current_setting('test.artist1')::uuid,'main',current_setting('test.artist1')||'/foto.png')->>'replaced_path') is null,'Primeira foto principal não deveria substituir nada');
select pg_temp.assert_true((select count(*)=1 and min(position)=0 and bool_and(mime_type='image/png' and size_bytes=1000) from public.profile_images where profile_id=current_setting('test.artist1')::uuid),'Foto principal não gravou posição/tipo/tamanho do Storage');
-- Substituir: a nova referência vale e o caminho antigo volta para quem chama apagar.
select set_config('test.replaced',public.attach_profile_image(current_setting('test.artist1')::uuid,'main',current_setting('test.artist1')||'/outra.jpg')->>'replaced_path',true);
select pg_temp.assert_true(current_setting('test.replaced')=current_setting('test.artist1')||'/foto.png','Substituição não devolveu o caminho antigo');
select pg_temp.assert_true((select count(*)=1 and min(object_path)=current_setting('test.artist1')||'/outra.jpg' and min(mime_type)='image/jpeg' from public.profile_images where profile_id=current_setting('test.artist1')::uuid),'Foto principal não foi substituída');
-- Recusas: outra conta, atuação que não é de artista, id inexistente.
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/galeria_1-a.webp'),'42501');
select pg_temp.actor(1);
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.services1'),current_setting('test.services1')||'/servicos.png'),'42501');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.member1'),current_setting('test.member1')||'/x.png'),'42501');
select pg_temp.expect_error($$select public.attach_profile_image(gen_random_uuid(),'main','a/b.png')$$,'42501');
-- Caminho/objeto inválidos: de outra atuação, inexistente, sem o formato, sem a posição certa, alt grande demais, objeto de outro dono.
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist2')||'/x.png'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/inexistente.png'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/sub/x.png'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'capa',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/galeria_1-a.webp'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,null,%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/galeria_1-a.webp'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L,repeat('a',501))$$,current_setting('test.artist1'),current_setting('test.artist1')||'/galeria_1-a.webp'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',null)$$,current_setting('test.artist1')),'22023');
-- Objeto no limite de 5.000.000 bytes vale; um byte a mais, tipo fora da lista e extensão que não bate com o tipo, não.
select pg_temp.put('public-images',current_setting('test.artist1')||'/limite.png',5000000);
select pg_temp.put('public-images',current_setting('test.artist1')||'/grande.png',5000001);
select pg_temp.put('public-images',current_setting('test.artist1')||'/zero.png',0);
select pg_temp.put('public-images',current_setting('test.artist1')||'/tipo.png',1000,'image/gif');
select pg_temp.put('public-images',current_setting('test.artist1')||'/disfarce.png',1000,'image/jpeg');
select pg_temp.put('public-images',current_setting('test.artist1')||'/sem-meta.png');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/grande.png'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/zero.png'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/tipo.png'),'22023');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/disfarce.png'),'22023');
reset role;
update storage.objects set metadata='{}' where name=current_setting('test.artist1')||'/sem-meta.png';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/sem-meta.png'),'22023');
select pg_temp.assert_true(public.attach_profile_image(current_setting('test.artist1')::uuid,'gallery',current_setting('test.artist1')||'/limite.png') is not null,'Imagem de 5.000.000 bytes deveria valer');
-- Um objeto enviado por outra conta (dono diferente) não vale, mesmo no caminho certo da atuação.
reset role;
insert into storage.objects(bucket_id,name,owner_id,metadata) values('public-images',current_setting('test.artist1')||'/alheio.png','a6000000-0000-4000-8000-000000000002','{"size":1000,"mimetype":"image/png"}');
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/alheio.png'),'22023');
-- A mesma imagem não entra duas vezes.
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/limite.png'),'22023');

-- Galeria: até 10, em ordem; a principal não conta.
do $$ declare n integer; begin
  for n in 2..10 loop
    perform pg_temp.put('public-images',current_setting('test.artist1')||'/g'||n||'.png');
    perform public.attach_profile_image(current_setting('test.artist1')::uuid,'gallery',current_setting('test.artist1')||'/g'||n||'.png');
  end loop;
end $$;
select pg_temp.assert_true((select count(*) from public.profile_images where profile_id=current_setting('test.artist1')::uuid)=11,'Principal + 10 da galeria');
select pg_temp.assert_true((select array_agg(position order by position) from public.profile_images where profile_id=current_setting('test.artist1')::uuid)=array[0,1,2,3,4,5,6,7,8,9,10]::smallint[],'Posições devem ser 0..10');
select pg_temp.put('public-images',current_setting('test.artist1')||'/g11.png');
select pg_temp.expect_error(format($$select public.attach_profile_image(%L,'gallery',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/g11.png'),'22023');
-- Mover: troca com a vizinha; nas pontas e para a principal não muda nada.
select set_config('test.g2',(select id::text from public.profile_images where profile_id=current_setting('test.artist1')::uuid and position=2),true);
select set_config('test.g3',(select id::text from public.profile_images where profile_id=current_setting('test.artist1')::uuid and position=3),true);
select set_config('test.main',(select id::text from public.profile_images where profile_id=current_setting('test.artist1')::uuid and position=0),true);
select public.move_profile_image(current_setting('test.artist1')::uuid,current_setting('test.g3')::uuid,'earlier');
select pg_temp.assert_true((select position from public.profile_images where id=current_setting('test.g3')::uuid)=2 and (select position from public.profile_images where id=current_setting('test.g2')::uuid)=3,'Mover para antes não trocou as posições');
select public.move_profile_image(current_setting('test.artist1')::uuid,current_setting('test.g3')::uuid,'later');
select pg_temp.assert_true((select position from public.profile_images where id=current_setting('test.g3')::uuid)=3,'Mover para depois não voltou');
select set_config('test.first',(select id::text from public.profile_images where profile_id=current_setting('test.artist1')::uuid and position=1),true);
select public.move_profile_image(current_setting('test.artist1')::uuid,current_setting('test.first')::uuid,'earlier');
select pg_temp.assert_true((select position from public.profile_images where id=current_setting('test.first')::uuid)=1,'A primeira da galeria não passa para a posição da principal');
select pg_temp.assert_true((select position from public.profile_images where id=current_setting('test.main')::uuid)=0,'A principal não se move');
select pg_temp.expect_error(format($$select public.move_profile_image(%L,%L,'earlier')$$,current_setting('test.artist1'),current_setting('test.main')),'22023');
select pg_temp.expect_error(format($$select public.move_profile_image(%L,%L,'cima')$$,current_setting('test.artist1'),current_setting('test.g2')),'22023');
select pg_temp.expect_error(format($$select public.move_profile_image(%L,gen_random_uuid(),'later')$$,current_setting('test.artist1')),'22023');
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select public.move_profile_image(%L,%L,'later')$$,current_setting('test.artist1'),current_setting('test.g2')),'42501');
select pg_temp.expect_error(format($$select public.detach_profile_image(%L,%L)$$,current_setting('test.artist1'),current_setting('test.g2')),'42501');
select pg_temp.actor(1);
-- Remover: devolve o caminho e a galeria fecha o espaço (1..9); abre uma vaga para uma nova.
select pg_temp.assert_true(public.detach_profile_image(current_setting('test.artist1')::uuid,current_setting('test.g2')::uuid) like current_setting('test.artist1')||'/%','Remoção não devolveu o caminho');
select pg_temp.assert_true((select array_agg(position order by position) from public.profile_images where profile_id=current_setting('test.artist1')::uuid)=array[0,1,2,3,4,5,6,7,8,9]::smallint[],'Galeria não fechou o espaço');
select pg_temp.expect_error(format($$select public.detach_profile_image(%L,%L)$$,current_setting('test.artist1'),current_setting('test.g2')),'22023');
select public.attach_profile_image(current_setting('test.artist1')::uuid,'gallery',current_setting('test.artist1')||'/g11.png');
select pg_temp.assert_true((select max(position) from public.profile_images where profile_id=current_setting('test.artist1')::uuid)=10,'A nova imagem vai para o fim da galeria');
-- Remover a principal não mexe na galeria.
select pg_temp.assert_true(public.detach_profile_image(current_setting('test.artist1')::uuid,current_setting('test.main')::uuid) is not null,'Remoção da principal');
select pg_temp.assert_true((select count(*)=10 and min(position)=1 from public.profile_images where profile_id=current_setting('test.artist1')::uuid),'Remover a principal alterou a galeria');
-- get_my_profile: imagens em ordem para a tela de edição; terceiros não leem.
select pg_temp.assert_true((select jsonb_array_length(public.get_my_profile(current_setting('test.artist1')::uuid)->'images'))=10,'Edição não lista as imagens');
select pg_temp.assert_true((select (public.get_my_profile(current_setting('test.artist1')::uuid)->'images'->0->>'position')::int)=1,'Imagens fora de ordem');

-- Leitura pública das linhas: perfil publicado aparece ao anônimo; não publicado, não.
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true((select count(*) from public.profile_images)=0,'Imagem de perfil não publicado vazou');
reset role;
update public.profiles set published=true where id=current_setting('test.artist1')::uuid;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true((select count(*) from public.profile_images where profile_id=current_setting('test.artist1')::uuid)=10,'Imagens do perfil publicado não aparecem');
reset role;
set local role authenticated;

-- ---- Leitura de public-images (bucket privado; select por visibilidade da entidade) ----
select pg_temp.actor(2);
select pg_temp.put('public-images',current_setting('test.artist2')||'/rascunho.png');
select pg_temp.actor(1);
-- Estado: artista 1 publicado; artista 2 não publicado; coletivo c aprovado; coletivo pendente; capa do evento em rascunho.
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true(pg_temp.sees(current_setting('test.artist1')||'/outra.jpg'),'Anônimo não lê imagem de artista publicado');
select pg_temp.assert_true(pg_temp.sees(current_setting('test.c')||'/capa.png'),'Anônimo não lê imagem de coletivo aprovado');
select pg_temp.assert_true(not pg_temp.sees(current_setting('test.artist2')||'/rascunho.png'),'Anônimo leu imagem de artista não publicado');
select pg_temp.assert_true(not pg_temp.sees(current_setting('test.pending')||'/capa.png'),'Anônimo leu imagem de coletivo pendente');
select pg_temp.assert_true(not pg_temp.sees(current_setting('test.event')||'/capa.png'),'Anônimo leu capa de evento em rascunho');
select pg_temp.assert_true(not pg_temp.sees(gen_random_uuid()::text||'/inexistente.png') and not pg_temp.sees('foto-solta.png'),'Caminho fora do padrão visível');
reset role;
set local role authenticated;
-- Conta comum (sem relação com as entidades): a mesma visão do anônimo.
select pg_temp.actor(5);
select pg_temp.assert_true(pg_temp.sees(current_setting('test.artist1')||'/outra.jpg') and pg_temp.sees(current_setting('test.c')||'/capa.png'),'Conta comum não lê imagens públicas');
select pg_temp.assert_true(not pg_temp.sees(current_setting('test.artist2')||'/rascunho.png') and not pg_temp.sees(current_setting('test.pending')||'/capa.png')
  and not pg_temp.sees(current_setting('test.event')||'/capa.png'),'Conta comum leu imagem não pública');
-- Titulares e editores leem os próprios rascunhos; membro comum não lê a capa do rascunho.
select pg_temp.actor(2);
select pg_temp.assert_true(pg_temp.sees(current_setting('test.artist2')||'/rascunho.png'),'Titular não lê a própria imagem não publicada');
select pg_temp.assert_true(pg_temp.sees(current_setting('test.event')||'/capa.png'),'Editor não lê capa do evento em rascunho');
select pg_temp.assert_true(not pg_temp.sees(current_setting('test.pending')||'/capa.png'),'Editor leu imagem de coletivo pendente alheio');
select pg_temp.actor(3);
select pg_temp.assert_true(not pg_temp.sees(current_setting('test.event')||'/capa.png'),'Membro comum leu capa de evento em rascunho');
select pg_temp.actor(1);
select pg_temp.assert_true(pg_temp.sees(current_setting('test.pending')||'/capa.png'),'Proprietário não lê imagem do coletivo pendente');
select pg_temp.assert_true(pg_temp.sees(current_setting('test.event')||'/capa.png'),'Proprietário não lê capa do evento em rascunho');

-- ---- Documentos (set_professional_document) ----
select pg_temp.actor(1);
select pg_temp.assert_true(public.set_professional_document(current_setting('test.artist1')::uuid,'presskit',current_setting('test.artist1')||'/presskit.pdf') is null,'Primeiro presskit não deveria substituir nada');
select pg_temp.assert_true((select presskit_path=current_setting('test.artist1')||'/presskit.pdf' and presskit_bytes=1000 and presskit_url is null
  from public.professional_details where profile_id=current_setting('test.artist1')::uuid),'Presskit não gravou caminho/tamanho');
-- Enviar o PDF limpa o link; e o link não coexiste com o PDF.
select public.update_my_professional_details(current_setting('test.artist1')::uuid,'{"presskit_url":null}');
reset role;
update public.professional_details set presskit_path=null,presskit_bytes=null where profile_id=current_setting('test.artist1')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select public.update_my_professional_details(current_setting('test.artist1')::uuid,'{"presskit_url":"https://example.invalid/presskit"}');
select pg_temp.assert_true(public.set_professional_document(current_setting('test.artist1')::uuid,'presskit',current_setting('test.artist1')||'/presskit.pdf') is null,'Presskit após o link');
select pg_temp.assert_true((select presskit_url is null and presskit_path is not null from public.professional_details where profile_id=current_setting('test.artist1')::uuid),'Enviar o PDF deveria limpar o link do presskit');
select pg_temp.expect_error(format($$select public.update_my_professional_details(%L,'{"presskit_url":"https://example.invalid/presskit"}')$$,current_setting('test.artist1')),'22023');
-- Troca devolve o caminho antigo; remover (nulo) limpa e devolve o caminho; get_my_profile mostra o tamanho do documento.
select pg_temp.put('private-documents',current_setting('test.artist1')||'/presskit-2.pdf',2500);
select pg_temp.assert_true(public.set_professional_document(current_setting('test.artist1')::uuid,'presskit',current_setting('test.artist1')||'/presskit-2.pdf')=current_setting('test.artist1')||'/presskit.pdf','Troca do presskit não devolveu o anterior');
select pg_temp.assert_true((public.get_my_profile(current_setting('test.artist1')::uuid)->'professional'->>'presskit_bytes')::int=2500,'Edição não mostra o tamanho do presskit');
select pg_temp.assert_true(public.set_professional_document(current_setting('test.artist1')::uuid,'presskit',null)=current_setting('test.artist1')||'/presskit-2.pdf','Remoção do presskit');
select pg_temp.assert_true((select presskit_path is null and presskit_bytes is null from public.professional_details where profile_id=current_setting('test.artist1')::uuid),'Remoção não limpou o presskit');
-- Tipo errado, atuação alheia, caminho forjado, tamanho e tipo do objeto.
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'services',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/presskit.pdf'),'42501');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.services1'),current_setting('test.services1')||'/lista.pdf'),'42501');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.av1'),current_setting('test.av1')||'/portfolio.pdf'),'42501');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'services',%L)$$,current_setting('test.av1'),current_setting('test.av1')||'/portfolio.pdf'),'42501');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.member1'),current_setting('test.member1')||'/doc.pdf'),'42501');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'portfolio',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/presskit.pdf'),'22023');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.artist1'),current_setting('test.services1')||'/lista.pdf'),'22023');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/inexistente.pdf'),'22023');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/foto.png'),'22023');
select pg_temp.put('private-documents',current_setting('test.artist1')||'/grande.pdf',10000001);
select pg_temp.put('private-documents',current_setting('test.artist1')||'/limite.pdf',10000000);
select pg_temp.put('private-documents',current_setting('test.artist1')||'/falso.pdf',1000,'image/png');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/grande.pdf'),'22023');
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',%L)$$,current_setting('test.artist1'),current_setting('test.artist1')||'/falso.pdf'),'22023');
select pg_temp.assert_true(public.set_professional_document(current_setting('test.artist1')::uuid,'presskit',current_setting('test.artist1')||'/limite.pdf') is null,'PDF de 10.000.000 bytes deveria valer');
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select public.set_professional_document(%L,'presskit',null)$$,current_setting('test.artist1')),'42501');
-- Serviços: lista em PDF; o outro tipo de documento não vale.
select pg_temp.actor(1);
select pg_temp.assert_true(public.set_professional_document(current_setting('test.services1')::uuid,'services',current_setting('test.services1')||'/lista.pdf') is null,'Lista de serviços');
select pg_temp.assert_true((select services_pdf_path=current_setting('test.services1')||'/lista.pdf' and services_pdf_bytes=1000 from public.professional_details where profile_id=current_setting('test.services1')::uuid),'Lista de serviços não gravou caminho/tamanho');
select pg_temp.assert_true(public.set_professional_document(current_setting('test.services1')::uuid,'services',null)=current_setting('test.services1')||'/lista.pdf','Remoção da lista de serviços');
-- Documentos nunca aparecem em respostas públicas: anônimo não lê professional_details.
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect_error('select count(*) from public.professional_details','42501');
reset role;
set local role authenticated;

-- ---- Imagem do coletivo (set_collective_image) ----
select pg_temp.actor(1);
select pg_temp.put('public-images',current_setting('test.c')||'/capa-2.jpg',3000);
select pg_temp.assert_true(public.set_collective_image(current_setting('test.c')::uuid,current_setting('test.c')||'/capa.png') is null,'Primeira imagem do coletivo');
select pg_temp.assert_true((public.get_collective_status(current_setting('test.c')::uuid)->'profile'->>'image_path')=current_setting('test.c')||'/capa.png','Imagem do coletivo não gravada');
select pg_temp.assert_true((public.get_collective_status(current_setting('test.c')::uuid)->>'version')::int=1,'Trocar a imagem não deve alterar a versão do cadastro');
select pg_temp.assert_true(public.set_collective_image(current_setting('test.c')::uuid,current_setting('test.c')||'/capa-2.jpg')=current_setting('test.c')||'/capa.png','Troca da imagem do coletivo não devolveu a anterior');
-- Imagem do coletivo aprovado é pública (a coluna já é liberada ao anônimo).
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true((select image_path from public.collectives where id=current_setting('test.c')::uuid)=current_setting('test.c')||'/capa-2.jpg','Imagem do coletivo não aparece na leitura pública');
reset role;
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select public.set_collective_image(%L,null)$$,current_setting('test.c')),'42501');
select pg_temp.actor(3);
select pg_temp.expect_error(format($$select public.set_collective_image(%L,null)$$,current_setting('test.c')),'42501');
select pg_temp.actor(5);
select pg_temp.expect_error(format($$select public.set_collective_image(%L,null)$$,current_setting('test.c')),'42501');
select pg_temp.actor(1);
select pg_temp.expect_error(format($$select public.set_collective_image(%L,%L)$$,current_setting('test.c'),current_setting('test.c4')||'/x.png'),'22023');
select pg_temp.expect_error(format($$select public.set_collective_image(%L,%L)$$,current_setting('test.c'),current_setting('test.c')||'/inexistente.png'),'22023');
select pg_temp.expect_error(format($$select public.set_collective_image(%L,%L)$$,current_setting('test.c'),current_setting('test.c')||'/doc.pdf'),'22023');
select pg_temp.expect_error($$select public.set_collective_image(gen_random_uuid(),null)$$,'42501');
-- Pedido pendente: o proprietário já pode enviar a imagem; remover (nulo) limpa.
select pg_temp.assert_true(public.set_collective_image(current_setting('test.pending')::uuid,current_setting('test.pending')||'/capa.png') is null,'Imagem do coletivo pendente');
select pg_temp.assert_true(public.set_collective_image(current_setting('test.pending')::uuid,null)=current_setting('test.pending')||'/capa.png','Remoção da imagem do coletivo');
select pg_temp.assert_true(public.set_collective_image(current_setting('test.c')::uuid,null)=current_setting('test.c')||'/capa-2.jpg','Remoção da imagem do coletivo aprovado');
-- Coletivo suspenso ou encerrado: nada de imagem.
reset role;
update public.collectives set state='suspended' where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.expect_error(format($$select public.set_collective_image(%L,null)$$,current_setting('test.c')),'42501');
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.c')||'/suspenso.png'),'42501');
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
set local role authenticated;

-- ---- Capa do evento: publicado exige publish_events; cancelado não aceita escrita (como update_event) ----
select pg_temp.actor(1);
select pg_temp.put('public-images',current_setting('test.event2')||'/capa.png');
select pg_temp.actor(2);
-- Rascunho: quem edita eventos escreve.
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.event2')||'/capa.png')=1,'Editor não atualiza capa de rascunho');
select pg_temp.actor(1);
select public.publish_event(current_setting('test.event2')::uuid,1);
select pg_temp.actor(2);
-- Publicado sem publish_events: o editor lê (evento público), mas não envia, não atualiza e não remove.
select pg_temp.assert_true(pg_temp.sees(current_setting('test.event2')||'/capa.png'),'Capa de evento publicado deveria ser legível');
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.event2')||'/nova.png'),'42501');
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.event2')||'/capa.png')=0,'Editor sem publicar atualizou capa de evento publicado');
select pg_temp.assert_true(pg_temp.drop_object('public-images',current_setting('test.event2')||'/capa.png')=0,'Editor sem publicar removeu capa de evento publicado');
select pg_temp.actor(3);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.event2')||'/membro.png'),'42501');
-- Com publish_events (o proprietário tem todos os poderes), continua valendo.
select pg_temp.actor(1);
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.event2')||'/capa.png')=1,'Proprietário não atualiza capa de evento publicado');
select pg_temp.put('public-images',current_setting('test.event2')||'/extra.png');
-- Concede publish_events ao perfil do editor: volta a escrever.
reset role;
insert into private.collective_role_permissions(collective_id,role_id,permission) values(current_setting('test.c')::uuid,'a9000000-0000-4000-8000-000000000001','publish_events');
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.event2')||'/capa.png')=1,'Editor com publish_events não atualiza capa de evento publicado');
reset role;
delete from private.collective_role_permissions where collective_id=current_setting('test.c')::uuid and role_id='a9000000-0000-4000-8000-000000000001' and permission='publish_events';
set local role authenticated;
-- Cancelado: ninguém escreve, nem o proprietário; a capa continua legível (evento cancelado já publicado tem detalhe público).
select pg_temp.actor(1);
select public.cancel_event(current_setting('test.event2')::uuid,2);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.event2')||'/depois.png'),'42501');
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.event2')||'/capa.png')=0,'Proprietário atualizou capa de evento cancelado');
select pg_temp.assert_true(pg_temp.drop_object('public-images',current_setting('test.event2')||'/extra.png')=0,'Proprietário removeu capa de evento cancelado');
select pg_temp.actor(2);
select pg_temp.expect_error(format($$select pg_temp.put('public-images',%L)$$,current_setting('test.event2')||'/depois.png'),'42501');
select pg_temp.assert_true(pg_temp.touch('public-images',current_setting('test.event2')||'/capa.png')=0,'Editor atualizou capa de evento cancelado');
select pg_temp.assert_true(pg_temp.sees(current_setting('test.event2')||'/capa.png'),'Capa de evento cancelado (já publicado) deveria ser legível');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true(pg_temp.sees(current_setting('test.event2')||'/capa.png'),'Anônimo não lê capa de evento publicado/cancelado');
reset role;
set local role authenticated;

-- ---- Capa do evento: sem RPC nova; update_event aceita cover_path sob o id do evento ----
select pg_temp.actor(1);
-- A capa só vale se o objeto existe em `public-images` (verified_upload); sem o objeto, o caminho forjado é recusado.
select pg_temp.expect_error(format($$select public.update_event(%L,1,jsonb_build_object('cover_path',%L,'cover_bytes',1000))$$,current_setting('test.event'),current_setting('test.event')||'/capa.png'),'22023');
select pg_temp.put('public-images',current_setting('test.event')||'/capa.png',1234);
-- `cover_bytes` vem do objeto, não do payload.
select public.update_event(current_setting('test.event')::uuid,1,jsonb_build_object('cover_path',current_setting('test.event')||'/capa.png','cover_bytes',1));
select pg_temp.assert_true((public.get_event(current_setting('test.event')::uuid)->>'cover_path')=current_setting('test.event')||'/capa.png','Capa do evento não gravada');
select pg_temp.assert_true((public.get_event(current_setting('test.event')::uuid)->>'cover_bytes')::integer=1234,'Tamanho da capa deve vir do objeto');
select pg_temp.expect_error(format($$select public.update_event(%L,2,jsonb_build_object('cover_path',%L,'cover_bytes',1000))$$,current_setting('test.event'),current_setting('test.event2')||'/capa.png'),'22023');
select pg_temp.expect_error(format($$select public.update_event(%L,2,jsonb_build_object('cover_url','https://example.invalid/capa.png'))$$,current_setting('test.event')),'22023');
select public.update_event(current_setting('test.event')::uuid,2,jsonb_build_object('cover_path',null,'cover_bytes',null,'cover_url','https://example.invalid/capa.png'));
select pg_temp.assert_true((public.get_event(current_setting('test.event')::uuid)->>'cover_path') is null and (public.get_event(current_setting('test.event')::uuid)->>'cover_url')='https://example.invalid/capa.png','Troca de capa por link');
reset role;
rollback;
