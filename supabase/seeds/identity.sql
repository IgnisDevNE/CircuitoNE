-- Dados exclusivamente sintéticos. O executor protegido também confere o destino real.
-- Sem senha: estes registros não criam um login nominal utilizável.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or
    current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor';
  end if;
end $$;

insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
values
 ('01000000-0000-4000-8000-000000000001','fixture-active@example.invalid',now(),'5581999000001',now()),
 ('01000000-0000-4000-8000-000000000002','fixture-suspended@example.invalid',now(),'5581999000002',now()),
 ('01000000-0000-4000-8000-000000000003','fixture-deletion@example.invalid',now(),'5581999000003',now()),
 ('01000000-0000-4000-8000-000000000004','fixture-unconfirmed@example.invalid',null,'5581999000004',null)
on conflict(id) do nothing;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,whatsapp_number,state,registration_request_id,registration_hash)
values
 ('01000000-0000-4000-8000-000000000001','Pessoa sintética ativa','52998224725','1990-01-01','Recife','PE',true,null,'active','03000000-0000-4000-8000-000000000001','seed-identity-v1'),
 ('01000000-0000-4000-8000-000000000002','Pessoa sintética suspensa','12345678909','1990-01-01','São Paulo','SP',false,'+5511999000002','suspended','03000000-0000-4000-8000-000000000002','seed-identity-v1'),
 ('01000000-0000-4000-8000-000000000003','Pessoa sintética em exclusão','11144477735','1990-01-01','Brasília','DF',false,null,'deletion_pending','03000000-0000-4000-8000-000000000003','seed-identity-v1')
on conflict(user_id) do nothing;
insert into public.profiles(id,owner_id,kind,name,description,city,state_code,published)
values
 ('02000000-0000-4000-8000-000000000001','01000000-0000-4000-8000-000000000001','artist','Artista sintético público','Fixture, sem dados reais','Recife','PE',true),
 ('02000000-0000-4000-8000-000000000002','01000000-0000-4000-8000-000000000001','artist','Projeto sintético interno','Fixture, sem dados reais','Recife','PE',false),
 ('02000000-0000-4000-8000-000000000003','01000000-0000-4000-8000-000000000001','services','Serviços sintéticos','Fixture, sem dados reais','Recife','PE',false),
 ('02000000-0000-4000-8000-000000000004','01000000-0000-4000-8000-000000000001','audiovisual','Estúdio sintético','Fixture, sem dados reais','Recife','PE',false),
 ('02000000-0000-4000-8000-000000000005','01000000-0000-4000-8000-000000000002','artist','Artista sintético suspenso','Fixture, sem dados reais','São Paulo','SP',true),
 ('02000000-0000-4000-8000-000000000006','01000000-0000-4000-8000-000000000003','member','Integrante sintético em exclusão','Fixture, sem dados reais','Brasília','DF',false)
on conflict(id) do nothing;
insert into public.artist_profiles(profile_id)
  select id from public.profiles where
    (id in ('02000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000002') and owner_id='01000000-0000-4000-8000-000000000001')
    or (id='02000000-0000-4000-8000-000000000005' and owner_id='01000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.artist_styles(id,profile_id,style)
  select ('04000000' || substr(id::text,9))::uuid,id,'techno' from public.profiles where
    (id in ('02000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000002') and owner_id='01000000-0000-4000-8000-000000000001')
    or (id='02000000-0000-4000-8000-000000000005' and owner_id='01000000-0000-4000-8000-000000000002') on conflict(profile_id,style,substyle) do nothing;
insert into public.professional_details(profile_id,kind)
  select id,kind from public.profiles where
    (id in ('02000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000002','02000000-0000-4000-8000-000000000003','02000000-0000-4000-8000-000000000004') and owner_id='01000000-0000-4000-8000-000000000001')
    or (id='02000000-0000-4000-8000-000000000005' and owner_id='01000000-0000-4000-8000-000000000002') on conflict do nothing;
commit;
