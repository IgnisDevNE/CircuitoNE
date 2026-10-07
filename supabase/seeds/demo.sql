-- Demonstração fictícia para o ambiente de desenvolvimento. Após identity, collectives, events e messages.
-- Dados exclusivamente sintéticos: nomes, documentos, e-mails (@example.invalid) e links são inventados.
-- Não cria senha, sessão ou chave MFA. Reexecutável: tudo é "inserir se ausente", exceto as datas dos eventos
-- ainda publicados, que são reancoradas em circuitone.seed_time para a agenda não envelhecer entre cargas.
-- UUIDs: d001 contas, d002 atuações, d003 cadastro, d004 estilos, d005 coletivos, d006 cargos, d008 pedido de
-- coletivo, d009 solicitações, d00a eventos, d00b pedido de evento, d00c participações.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
  if nullif(current_setting('circuitone.seed_time',true),'') is null or not isfinite(current_setting('circuitone.seed_time')::timestamptz) then
    raise exception 'Seed exige referência temporal explícita e finita'; end if;
end $$;

create or replace function pg_temp.demo_id(prefix text, n integer) returns uuid language sql immutable strict as $$
  select (prefix || '-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- ---------------------------------------------------------------------------
-- Contas (10). CPFs com dígitos verificadores válidos, todos fictícios.
-- ---------------------------------------------------------------------------
create temp table demo_users(n integer primary key, name text, slug text, cpf text, birth date, city text, uf text, ddd text, whatsapp boolean) on commit drop;
insert into demo_users values
 (1,'Marina Albuquerque Costa','marina','29372594644','1992-03-14','Recife','PE','81',true),
 (2,'Rafael Pinheiro Lima','rafael','57614108000','1989-07-02','Fortaleza','CE','85',true),
 (3,'Helena Cavalcante Dantas','helena','81142024911','1994-11-23','Natal','RN','84',false),
 (4,'Tiago Nascimento Reis','tiago','25292368954','1991-05-09','Salvador','BA','71',true),
 (5,'Joana Barros Aragão','joana','49056199714','1996-01-30','Caruaru','PE','81',false),
 (6,'Davi Ferreira Mendes','davi','85062355370','1990-09-17','São Luís','MA','98',true),
 (7,'Luana Siqueira Prado','luana','83294104200','1997-04-05','Aracaju','SE','79',true),
 (8,'Caio Tavares Rocha','caio','87848775020','1993-12-12','Maceió','AL','82',false),
 (9,'Beatriz Nogueira Sá','beatriz','33682120955','1995-08-21','Teresina','PI','86',true),
 (10,'Otávio Medeiros Ramos','otavio','64223387839','1988-02-27','João Pessoa','PB','83',true);

insert into auth.users(instance_id,aud,role,confirmation_token,recovery_token,email_change_token_current,email_change_token_new,email_change,phone_change_token,phone_change,reauthentication_token,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,id,email,email_confirmed_at,phone,phone_confirmed_at)
select '00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
  '','','','','','','','',now(),now(),'{}'::jsonb,'{}'::jsonb,
  pg_temp.demo_id('d0010000',u.n),'demo-'||u.slug||'@example.invalid',now(),'55'||u.ddd||'98200'||lpad(u.n::text,4,'0'),now()
from demo_users u
on conflict do nothing;

insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,whatsapp_number,registration_request_id,registration_hash)
select pg_temp.demo_id('d0010000',u.n),u.name,u.cpf,u.birth,u.city,u.uf,u.whatsapp,
  case when not u.whatsapp then '+55'||u.ddd||'97700'||lpad(u.n::text,4,'0') end,
  pg_temp.demo_id('d0030000',u.n),'seed-demo-v1'
from demo_users u
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Atuações: 12 artistas (publicados), 3 serviços e 2 audiovisual (nunca públicos).
-- ---------------------------------------------------------------------------
create temp table demo_profiles(n integer primary key, owner_n integer, kind text, name text, slug text, bio text, color text,
  ig text, sc text, bc text, yt text, web text, fee integer, ptype text) on commit drop;
insert into demo_profiles values
 (1,1,'artist','ANERIE','anerie','Produtora e DJ recifense navegando entre o techno hipnótico e as batidas do maracatu eletrônico. Residente do coletivo Litoral Sul.','#8b5cf6','anerie.dj','anerie','anerie',null,'https://anerie.example.invalid',300000,null),
 (2,2,'artist','BOITATÁ SYSTEM','boitata-system','Sound system cearense de dub e bass music. Grave denso, cultura de rua e um sistema de som construído artesanalmente em Fortaleza.','#22d3ee','boitatasystem','boitata',null,'boitatasystem',null,450000,null),
 (3,3,'artist','JURENÊ','jurene','Live set modular potiguar. Sintetizadores analógicos, texturas do sertão e experimentação sonora vinda de Natal.','#f59e0b','jurene.live',null,'jurene',null,'https://jurene.example.invalid',250000,null),
 (4,4,'artist','MARIMBA DIGITAL','marimba-digital','Dupla baiana de house afro e batidas percussivas. Da diáspora ao clube, um som que celebra o corpo e o terreiro.','#ff2040','marimbadigital','marimbadigital',null,'marimbadigital',null,550000,null),
 (5,5,'artist','SERTÃO ACID','sertao-acid','Selecionador caruaruense de acid techno e acid house. Linhas de 303 ao pôr do sol do agreste e pistas que não deixam ninguém parado.','#84cc16','sertaoacid','sertaoacid',null,null,null,200000,null),
 (6,6,'artist','NÊGA FUTURA','nega-futura','DJ e produtora ludovicense. O reggae de roda encontra o tecnobrega e o bass pesado numa pista que mistura a ilha inteira.','#ec4899','negafutura','negafutura',null,null,null,280000,null),
 (7,7,'artist','PRISMA 4','prisma-4','Trio aracajuano de future bass e glitch. Melodias em camadas, cortes de vocal e visuais sincronizados ao vivo.','#06b6d4','prisma4',null,'prisma4',null,'https://prisma4.example.invalid',220000,null),
 (8,8,'artist','TERRAL','terral','Selecionador maceioense de organic house e balearic para o fim de tarde. Percussão, violão processado e o mar de fundo.','#f97316','terral.set','terral',null,null,null,240000,null),
 (9,9,'artist','CAATINGA ROOT','caatinga-root','Selector teresinense de jungle e breaks. Amen break, baixo de sertão e MC ao vivo para pistas de calor e suor.','#a3e635','caatingaroot','caatingaroot',null,null,null,260000,null),
 (10,10,'artist','VELA ASTRAL','vela-astral','Psytrance paraibano com raiz nordestina. Sets de goa e full on para pistas ao ar livre, do pôr do sol ao amanhecer.','#a855f7','velaastral','velaastral',null,null,null,300000,null),
 (11,1,'artist','MANGUE QUENTE','mangue-quente','Projeto paralelo de brega funk e jersey club direto de Recife. Batida rápida, refrão na boca do povo e pista cheia.','#facc15','manguequente','manguequente',null,null,null,180000,null),
 (12,10,'artist','LUA DE FERRO','lua-de-ferro','Dark e industrial paraibano: EBM, coldwave e muito sintetizador para a pista escura. Residente de noites alternativas em João Pessoa.','#64748b','luadeferro',null,'luadeferro',null,null,210000,null),
 (13,5,'services','Nordeste Estruturas','nordeste-estruturas','Palcos, tendas, grades e energia para eventos de música eletrônica no agreste e no litoral.','#0ea5e9','nordesteestruturas',null,null,null,'https://nordesteestruturas.example.invalid',null,'structure'),
 (14,2,'services','Graves do Sertão Som','graves-do-sertao','Sistemas de som line array e subgraves para festas e festivais. Operação técnica incluída.','#14b8a6','gravesdosertao',null,null,null,null,null,'sound'),
 (15,3,'services','Fulgor Iluminação','fulgor-iluminacao','Desenho de luz, lasers e operação para pistas e palcos. Equipe própria em Natal e região.','#eab308','fulgor.lux',null,null,null,null,null,'lighting'),
 (16,1,'audiovisual','Noturna Filmes','noturna-filmes','Cobertura em vídeo de festas e festivais, aftermovies e clipes. Foco em luz baixa e pista cheia.','#6366f1','noturnafilmes',null,null,'noturnafilmes','https://noturnafilmes.example.invalid/reel',null,'full'),
 (17,2,'audiovisual','Flash Litoral','flash-litoral','Fotografia de eventos, retratos de artistas e coberturas para coletivos e produtoras do litoral.','#f43f5e','flashlitoral',null,null,null,'https://flashlitoral.example.invalid',null,'photo');

insert into public.profiles(id,owner_id,kind,name,description,city,state_code,social_links,color,published)
select pg_temp.demo_id('d0020000',p.n),pg_temp.demo_id('d0010000',p.owner_n),p.kind,p.name,p.bio,u.city,u.uf,
  jsonb_strip_nulls(jsonb_build_object(
    'instagram',case when p.ig is not null then 'https://instagram.example.invalid/'||p.ig end,
    'soundcloud',case when p.sc is not null then 'https://soundcloud.example.invalid/'||p.sc end,
    'bandcamp',case when p.bc is not null then 'https://'||p.bc||'.bandcamp.example.invalid' end,
    'youtube',case when p.yt is not null then 'https://youtube.example.invalid/@'||p.yt end,
    'website',p.web)),
  p.color,p.kind='artist'
from demo_profiles p join demo_users u on u.n=p.owner_n
on conflict do nothing;

insert into public.artist_profiles(profile_id)
select pg_temp.demo_id('d0020000',p.n) from demo_profiles p
where p.kind='artist' and exists(select from public.profiles x where x.id=pg_temp.demo_id('d0020000',p.n) and x.kind='artist')
on conflict do nothing;

create temp table demo_styles(artist_n integer, style text, substyle text) on commit drop;
insert into demo_styles values
 (1,'techno','hypnotic techno'),(1,'techno','melodic techno'),(1,'música brasileira','maracatu'),(1,'ambient',null),
 (2,'reggae','dub'),(2,'reggae','dancehall'),(2,'bass music',null),
 (3,'electronica','experimental electronic'),(3,'electronica','idm'),(3,'ambient','drone ambient'),
 (4,'house','afro house'),(4,'eletrônica africana','kuduro'),(4,'música brasileira',null),
 (5,'techno','acid techno'),(5,'house','acid house'),
 (6,'eletrônica latina','tecnobrega'),(6,'reggae','dub'),(6,'bass music','uk bass'),
 (7,'bass music','future bass'),(7,'electronica','glitch'),
 (8,'house','organic house'),(8,'house','deep house'),(8,'downtempo','balearic'),
 (9,'drum and bass','jungle'),(9,'drum and bass','liquid drum and bass'),(9,'breakbeat','breaks'),
 (10,'trance','psytrance'),(10,'trance','goa trance'),
 (11,'funk carioca','brega funk'),(11,'club','jersey club'),
 (12,'industrial','ebm'),(12,'darkwave','coldwave'),(12,'techno','industrial techno');
insert into public.artist_styles(id,profile_id,style,substyle)
select overlay(md5('demo-style-'||s.artist_n||'-'||s.style||'-'||coalesce(s.substyle,''))::text placing 'd0040000' from 1 for 8)::uuid,
  pg_temp.demo_id('d0020000',s.artist_n),s.style,s.substyle
from demo_styles s
where exists(select from public.artist_profiles a where a.profile_id=pg_temp.demo_id('d0020000',s.artist_n))
on conflict do nothing;

insert into public.professional_details(profile_id,kind,booking_email,contact_email,contact_phone,fee_cents,presskit_url,service_type,audiovisual_type,portfolio_url)
select pg_temp.demo_id('d0020000',p.n),p.kind,
  case when p.kind='artist' then 'booking@'||p.slug||'.example.invalid' end,
  'contato@'||p.slug||'.example.invalid',
  '+55'||u.ddd||'97700'||lpad((p.n+10)::text,4,'0'),
  p.fee,
  case when p.kind='artist' then 'https://presskit.example.invalid/'||p.slug end,
  case when p.kind='services' then p.ptype end,
  case when p.kind='audiovisual' then p.ptype end,
  case when p.kind='audiovisual' then p.web end
from demo_profiles p join demo_users u on u.n=p.owner_n
where exists(select from public.profiles x where x.id=pg_temp.demo_id('d0020000',p.n) and x.kind=p.kind)
on conflict do nothing;

-- Primeira atuação e artista padrão, apenas na primeira carga de cada conta demo (vínculo usado por get_collective_members).
update private.account_details a set default_artist_profile_id=f.id,first_profile_id=f.id
from (select distinct on (p.owner_id) p.owner_id,p.id from public.profiles p
        where p.kind='artist' and p.id::text like 'd0020000-%' order by p.owner_id,p.created_at,p.id) f
where a.user_id=f.owner_id and a.registration_hash='seed-demo-v1' and a.first_profile_id is null and a.default_artist_profile_id is null;

-- ---------------------------------------------------------------------------
-- Coletivos e produtoras aprovados (5), cargos, membros e solicitações.
-- ---------------------------------------------------------------------------
create temp table demo_collectives(n integer primary key, owner_n integer, kind text, name text, bio text, activity text, city text, uf text,
  color text, ig text, sc text, web text, cnpj text) on commit drop;
insert into demo_collectives values
 (1,1,'collective','LITORAL SUL','Coletivo de Recife dedicado à cena techno independente do litoral pernambucano. Festas na praia, ocupação de espaços e formação de novos artistas.','Eventos Musicais, Artistas','Recife','PE','#8b5cf6','litoralsul.rec','litoralsul',null,null),
 (2,2,'producer','USINA PRODUÇÕES','Produtora cearense de festivais e eventos culturais de grande porte. Estrutura completa, curadoria e logística para a cena eletrônica do Nordeste.','Eventos Musicais, Eventos Culturais, Serviços','Fortaleza','CE','#22d3ee','usinaproducoes',null,'https://usina.example.invalid','DEMO0000000100'),
 (3,4,'collective','TERREIRO ELETRÔNICO','Coletivo soteropolitano que une tambor, house e música africana contemporânea. Rodas abertas, festas de rua e oficinas de produção de batidas.','Eventos Musicais, Formação','Salvador','BA','#ff2040','terreiroeletronico','terreiroeletronico',null,null),
 (4,6,'collective','ILHA BASS','Coletivo ludovicense de reggae, dub e bass music. Cultura de sound system, festas no quintal e encontros com a cena jamaicana da ilha.','Eventos Musicais, Sound System','São Luís','MA','#10b981','ilhabass',null,null,null),
 (5,3,'producer','NATAL ANALÓGICA','Produtora potiguar de lives modulares, festas e oficinas de música eletrônica. Curadoria autoral e equipamento próprio de sintetizadores.','Eventos Musicais, Capacitação','Natal','RN','#f59e0b','natalanalogica',null,'https://natalanalogica.example.invalid','DEMO0000000200');

insert into public.collectives(id,owner_user_id,member_role_id,kind,name,description,activity,city,state_code,social_links,color,state,created_at,updated_at)
select pg_temp.demo_id('d0050000',c.n),pg_temp.demo_id('d0010000',c.owner_n),pg_temp.demo_id('d0060000',c.n),c.kind,c.name,c.bio,c.activity,c.city,c.uf,
  jsonb_strip_nulls(jsonb_build_object(
    'instagram',case when c.ig is not null then 'https://instagram.example.invalid/'||c.ig end,
    'soundcloud',case when c.sc is not null then 'https://soundcloud.example.invalid/'||c.sc end,
    'website',c.web)),
  c.color,'approved',anchor.t-interval '90 days',anchor.t-interval '90 days'
from demo_collectives c cross join (select current_setting('circuitone.seed_time')::timestamptz t) anchor
on conflict do nothing;

insert into private.collective_details(collective_id,kind,cnpj,creator_user_id,request_id,request_hash)
select pg_temp.demo_id('d0050000',c.n),c.kind,c.cnpj,pg_temp.demo_id('d0010000',c.owner_n),pg_temp.demo_id('d0080000',c.n),'seed-demo-v1'
from demo_collectives c
where exists(select from public.collectives x where x.id=pg_temp.demo_id('d0050000',c.n) and x.kind=c.kind)
on conflict do nothing;

insert into private.collective_roles(id,collective_id,name,builtin)
select pg_temp.demo_id('d0060000',c.n),pg_temp.demo_id('d0050000',c.n),'Membro',true from demo_collectives c
where exists(select from public.collectives x where x.id=pg_temp.demo_id('d0050000',c.n))
on conflict do nothing;

create temp table demo_roles(c integer, k integer, name text, perms text[]) on commit drop;
insert into demo_roles values
 (1,1,'Comunicação',array['read_messages','send_messages','create_events','edit_events']),
 (1,2,'Produção',array['create_events','edit_events','publish_events','cancel_events','read_messages','send_messages']),
 (2,1,'Produção',array['create_events','edit_events','publish_events','cancel_events','read_messages','send_messages']),
 (2,2,'Diretoria',array['manage_requests','remove_members','create_events','edit_events','publish_events','cancel_events','read_messages','send_messages']),
 (3,1,'Curadoria',array['create_events','edit_events','publish_events']),
 (4,1,'Moderação',array['manage_requests','remove_members','read_messages','send_messages']),
 (5,1,'Produção',array['create_events','edit_events','publish_events','cancel_events','read_messages','send_messages']);
insert into private.collective_roles(id,collective_id,name)
select pg_temp.demo_id('d0060000',100+r.c*10+r.k),pg_temp.demo_id('d0050000',r.c),r.name from demo_roles r
where exists(select from public.collectives x where x.id=pg_temp.demo_id('d0050000',r.c))
on conflict do nothing;
insert into private.collective_role_permissions(collective_id,role_id,permission)
select ro.collective_id,ro.id,p from demo_roles r
  join private.collective_roles ro on ro.id=pg_temp.demo_id('d0060000',100+r.c*10+r.k) and ro.collective_id=pg_temp.demo_id('d0050000',r.c) and not ro.builtin
  cross join unnest(r.perms) p
on conflict do nothing;

-- k=0: cargo Membro (inclui o proprietário, que sempre é membro do próprio coletivo).
create temp table demo_members(c integer, u integer, k integer) on commit drop;
insert into demo_members values
 (1,1,0),(1,5,2),(1,7,1),(1,8,0),
 (2,2,0),(2,9,1),(2,6,2),(2,3,0),
 (3,4,0),(3,8,1),(3,10,0),
 (4,6,0),(4,2,1),(4,9,0),
 (5,3,0),(5,1,1),(5,5,0);
insert into private.collective_memberships(collective_id,user_id,role_id,joined_at,last_activity_at)
select pg_temp.demo_id('d0050000',m.c),pg_temp.demo_id('d0010000',m.u),
  pg_temp.demo_id('d0060000',case when m.k=0 then m.c else 100+m.c*10+m.k end),
  anchor.t-interval '60 days',anchor.t-make_interval(hours=>m.u*7)
from demo_members m cross join (select current_setting('circuitone.seed_time')::timestamptz t) anchor
where exists(select from private.collective_roles r where r.collective_id=pg_temp.demo_id('d0050000',m.c)
    and r.id=pg_temp.demo_id('d0060000',case when m.k=0 then m.c else 100+m.c*10+m.k end))
  and exists(select from private.account_details a where a.user_id=pg_temp.demo_id('d0010000',m.u))
on conflict do nothing;

create temp table demo_requests(n integer primary key, c integer, u integer, profile_n integer, msg text) on commit drop;
insert into demo_requests values
 (1,1,10,10,'Sou DJ de psytrance em João Pessoa e quero somar nas festas do coletivo.'),
 (2,3,7,7,'Produzo future bass em Aracaju e gostaria de participar das rodas e oficinas.'),
 (3,2,10,12,'Toco EBM e coldwave e procuro uma produtora para circular pelo Ceará.');
insert into private.membership_requests(id,collective_id,user_id,profile_id,message,state,created_at)
select pg_temp.demo_id('d0090000',r.n),pg_temp.demo_id('d0050000',r.c),pg_temp.demo_id('d0010000',r.u),
  pg_temp.demo_id('d0020000',r.profile_n),r.msg,'pending',anchor.t-make_interval(days=>r.n)
from demo_requests r cross join (select current_setting('circuitone.seed_time')::timestamptz t) anchor
where exists(select from public.collectives x where x.id=pg_temp.demo_id('d0050000',r.c))
  and exists(select from public.profiles x where x.id=pg_temp.demo_id('d0020000',r.profile_n))
  and not exists(select from private.collective_memberships m where m.collective_id=pg_temp.demo_id('d0050000',r.c) and m.user_id=pg_temp.demo_id('d0010000',r.u))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Eventos publicados (16): 4 passados, 2 em andamento, 10 futuros.
-- d/h: dia relativo à referência e hora local (America/Fortaleza); rel: horas relativas à referência (em andamento);
-- dur: duração em horas. Marcador '#N' em lineup é a atuação artista N; qualquer outro texto é crédito sem vínculo.
-- ---------------------------------------------------------------------------
create temp table demo_events(n integer primary key, collective_n integer, name text, kind text, other_kind text, description text,
  d integer, h integer, rel integer, dur integer, city text, uf text, venue text, is_free boolean, cover text, lineup text[]) on commit drop;
insert into demo_events values
 (1,1,'MARÉ BAIXA — EDIÇÃO INVERNO','festa',null,'# Maré Baixa

Edição de inverno com **techno hipnótico** à beira do rio. Registro da noite no nosso SoundCloud.

- Abertura: 22h
- Pista coberta e área de descanso',-28,22,null,7,'Olinda','PE','Sítio das Palmeiras',false,'1493225457124-a3eb161ffa5f',array['#3','#1','DJ Convidado Surpresa']),
 (2,2,'BASS NA PRAÇA — SOUND SYSTEMS','encontro',null,'# Bass na Praça

Tarde **gratuita** de dub, bass e cultura de rua, com roda de conversa e som na praça.',-17,15,null,6,'Fortaleza','CE','Praça das Jangadas',true,'1533174072545-7a4b6ad7a6c3',array['#2','#9']),
 (3,3,'ROTA DO BATUQUE ELETRÔNICO','evento-cultural',null,'# Rota do Batuque Eletrônico

Percussão ao vivo encontra house afro e música eletrônica africana num casarão histórico.

- Roda de abertura às 18h
- Apresentação do grupo de percussão convidado',-9,18,null,5,'Salvador','BA','Casarão da Ladeira',false,'1470225620780-dba8ba36b745',array['#4','#6','Grupo de Percussão Ilê Novo']),
 (4,5,'OFICINA DE SÍNTESE MODULAR','capacitacao',null,'# Oficina de síntese modular

Introdução prática a sintetizadores modulares: patches básicos, sequenciamento e performance ao vivo. Vagas limitadas.',-3,14,null,4,'Natal','RN','Espaço Duna Lab',true,'1598488035139-bdbb2231ce04',array['#3']),
 (5,4,'RAIZ ELÉTRICA — NOITE DE REGGAE E BASS','festa',null,'# Raiz Elétrica

Reggae, dub e **bass music** no quintal, com sistema de som próprio. A noite começou e vai até a madrugada.',null,null,-2,8,'São Luís','MA','Quintal do Reggae',false,'1524368535928-5b5e00ddc76b',array['#6','#2','#11']),
 (6,1,'FEIRA DE DISCOS E SINTETIZADORES','feira',null,'# Feira de Discos e Sintetizadores

Troca, venda e bate-papo sobre **vinis, sintetizadores e equipamentos**, com discotecagem coletiva ao longo do dia. Entrada gratuita.',null,null,-3,9,'Recife','PE','Galpão Cais Velho',true,'1571019613454-1cb2f99b2d8b',array['Discotecagem coletiva']),
 (7,1,'PORTO NOTURNO — TECHNO NA ORLA','festa',null,'# Porto Noturno

Uma noite de **techno hipnótico** na orla de Recife. Line-up 100% nordestina, som em 360º e projeções ao vivo.

- Abertura: 22h
- Sunrise set incluso
- *Traga protetor auricular*',3,22,null,8,'Recife','PE','Armazém do Porto',false,'1516450360452-9312f5e86fc7',array['#1','#5','#3','Convidada Surpresa']),
 (8,2,'USINA FESTIVAL 2026','festival',null,'# Usina Festival

Três palcos, dois dias, uma celebração da **música eletrônica do Nordeste**. Arte, som e estrutura de nível internacional em Fortaleza.

- Palco principal, palco bass e palco sunrise
- Área de alimentação e feira de criadores',21,16,null,34,'Fortaleza','CE','Aterro da Orla',false,'1459749411175-04bf5292ceea',array['#2','#4','#1','#9','#10','Orquestra de Tambores do Cais']),
 (9,2,'ENCONTRO DE SOUND SYSTEMS','encontro',null,'# Encontro de Sound Systems

Tarde livre e **gratuita** de dub, bass e cultura de rua. Roda de conversa e som na praça.',12,15,null,6,'Fortaleza','CE','Praça Verde do Parque',true,'1533174072545-7a4b6ad7a6c3',array['#2','#9']),
 (10,3,'TERREIRO ELETRÔNICO #5','festa',null,'# Terreiro Eletrônico #5

A quinta edição do terreiro: **house afro**, percussão ao vivo e pista de rua.

- Abertura: 21h
- Roda aberta até meia-noite',6,21,null,8,'Salvador','BA','Largo do Tambor',false,'1549213783-8284d0336c4f',array['#4','#8','#6']),
 (11,4,'ILHA BASS FESTIVAL','festival',null,'# Ilha Bass Festival

Dois dias de **reggae, dub e bass music** na ilha, com sound systems de todo o Maranhão e convidados do Nordeste.',35,17,null,30,'São Luís','MA','Arena do Cais',false,'1470229722913-7c0e2dbbafd3',array['#6','#2','#7']),
 (12,5,'NOITE ANALÓGICA — LIVES MODULARES','festa',null,'# Noite Analógica

Seis horas de **lives modulares** e sets de sintetizador na capital potiguar.

- Palco imersivo com projeção
- Bar com bebidas locais',9,20,null,6,'Natal','RN','Teatro de Arena Dunas',false,'1506157786151-b8491531f063',array['#3','#7','Banda Residente Analógica']),
 (13,1,'SUNRISE NA PRAIA — PSY E TECHNO','outros','Sunrise session','# Sunrise na Praia

Sessão de **psytrance e techno** do amanhecer à manhã, com os pés na areia.

- Início às 4h
- Traga água e protetor solar',16,4,null,6,'João Pessoa','PB','Deque da Orla',false,'1519892300165-cb5542fb47c7',array['#10','#8','DJ Alvorada']),
 (14,3,'OFICINA: PRODUÇÃO DE BATIDAS AFRO','capacitacao',null,'# Oficina de produção de batidas afro

Aprenda a construir **grooves percussivos** em DAW, com amostras e instrumentos reais. Aberta a iniciantes.',27,14,null,5,'Salvador','BA','Casa de Cultura do Bairro',true,'1470225620780-dba8ba36b745',array['#4']),
 (15,2,'CEARÁ ELETRÔNICO — FEIRA DA CENA','feira',null,'# Ceará Eletrônico

Feira da cena: **discos, equipamentos, serviços e bate-papo** com artistas, coletivos e técnicos do Nordeste. Entrada gratuita.',44,10,null,10,'Fortaleza','CE','Centro de Convenções do Aterro',true,'1571266028243-e4733b0f0bb0',array['Mesa de debate: a cena do Nordeste','#11']),
 (16,5,'NATAL BASS E BREAKS','festa',null,'# Natal Bass e Breaks

Uma noite de **jungle, breaks e bass** na capital potiguar, com line-up de vários estados.',58,22,null,7,'Natal','RN','Galpão da Ribeira',false,'1571019613454-1cb2f99b2d8b',array['#9','#7','#5']);

with anchor as (select current_setting('circuitone.seed_time')::timestamptz t)
insert into public.events as ev(id,collective_id,name,kind,other_kind,description,starts_at,ends_at,city,state_code,venue,is_free,ticket_url,cover_url,
  state,first_published_at,version,created_at,updated_at,style)
select pg_temp.demo_id('d00a0000',e.n),pg_temp.demo_id('d0050000',e.collective_n),e.name,e.kind,e.other_kind,e.description,
  s.starts_at,case when e.dur is not null then s.starts_at+make_interval(hours=>e.dur) end,
  e.city,e.uf,e.venue,e.is_free,
  case when not e.is_free then 'https://ingressos.example.invalid/demo-evento-'||e.n end,
  'https://images.unsplash.com/photo-'||e.cover||'?w=1600&h=800&fit=crop&auto=format',
  'published',s.published_at,2,s.published_at,anchor.t,(array['techno','bass music','electronica','experimental e noise','reggae','electronica','techno','house','bass music','house','reggae','ambient','trance','eletrônica africana','electronica','breakbeat'])[e.n]
from demo_events e cross join anchor
cross join lateral (select x.starts_at,least(anchor.t,x.starts_at-interval '1 day')-interval '10 days' published_at
  from (select case when e.d is null then anchor.t+make_interval(hours=>e.rel)
      else (date_trunc('day',anchor.t at time zone 'America/Fortaleza')+make_interval(days=>e.d,hours=>e.h)) at time zone 'America/Fortaleza' end starts_at) x) s
where exists(select from public.collectives c where c.id=pg_temp.demo_id('d0050000',e.collective_n))
on conflict(id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=excluded.updated_at,style=excluded.style
  where ev.state='published';

-- Detalhes e line-up apenas dos eventos recém-criados: não reconstruir line-up removido por quem testa.
with new_details as (
  insert into private.event_details(event_id,creator_id,request_id,request_hash)
  select ev.id,pg_temp.demo_id('d0010000',c.owner_n),('d00b0000'||substr(ev.id::text,9))::uuid,'seed-demo-v1'
  from demo_events e join demo_collectives c on c.n=e.collective_n
    join public.events ev on ev.id=pg_temp.demo_id('d00a0000',e.n)
  on conflict do nothing returning event_id
)
insert into private.event_lineup(id,event_id,position,artist_id,credited_name)
select overlay(md5('demo-lineup-'||d.event_id::text||'-'||l.ord)::text placing 'd00c0000' from 1 for 8)::uuid,
  d.event_id,(l.ord-1)::integer,pg_temp.demo_id('d0020000',l.artist_n),coalesce(p.name,l.item)
from new_details d join demo_events e on pg_temp.demo_id('d00a0000',e.n)=d.event_id
  cross join lateral (select i.item,i.ord,case when i.item ~ '^#[0-9]+$' then substr(i.item,2)::integer end artist_n
    from unnest(e.lineup) with ordinality i(item,ord)) l
  left join demo_profiles p on p.n=l.artist_n and p.kind='artist';

commit;
