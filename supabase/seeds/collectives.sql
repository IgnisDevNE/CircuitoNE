-- Após identity.sql. Somente fixtures; nunca concede senha, sessão ou chave MFA.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
('01000000-0000-4000-8000-000000000005','fixture-member@example.invalid',now(),'5581999000005',now()) on conflict(id) do nothing;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash) values
('01000000-0000-4000-8000-000000000005','Membro sintético ativo','93541134780','1990-01-01','Recife','PE',true,'03000000-0000-4000-8000-000000000005','seed-collectives-v1') on conflict(user_id) do nothing;
-- Titular diferente do proprietário: prova acesso profissional somente com MFA elegível.
insert into public.profiles(id,owner_id,kind,name,city,state_code) values
('02000000-0000-4000-8000-000000000008','01000000-0000-4000-8000-000000000005','artist','Artista sintético do membro','Recife','PE') on conflict(id) do nothing;
insert into public.artist_profiles(profile_id) select id from public.profiles where
  id='02000000-0000-4000-8000-000000000008' and owner_id='01000000-0000-4000-8000-000000000005' and kind='artist' on conflict do nothing;
insert into public.professional_details(profile_id,kind) select id,kind from public.profiles where
  id='02000000-0000-4000-8000-000000000008' and owner_id='01000000-0000-4000-8000-000000000005' and kind='artist' on conflict do nothing;
insert into public.collectives(id,owner_user_id,member_role_id,kind,name,description,activity,city,state_code,state)
select ('05000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=5 then null else '01000000-0000-4000-8000-000000000001'::uuid end,
  ('06000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=6 then 'producer' else 'collective' end,
  'Organização sintética '||n,'Fixture sem dados reais','Música','Recife','PE',(array['approved','pending','suspended','rejected','closed','approved'])[n]
  from generate_series(1,6) n on conflict(id) do nothing;
-- Não reconciliar nem sobrescrever dados que o usuário tenha alterado após a primeira carga.
insert into private.collective_details(collective_id,kind,cnpj,creator_user_id,request_id,request_hash)
select c.id,c.kind,case when c.kind='producer' then '12ABC34501DE35' end,'01000000-0000-4000-8000-000000000001',
  ('08000000'||substr(c.id::text,9))::uuid,'seed-collectives-v1'
  from public.collectives c where c.id in (select ('05000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n)
    and (c.owner_user_id='01000000-0000-4000-8000-000000000001' or (c.state='closed' and c.owner_user_id is null))
  on conflict(collective_id) do nothing;
insert into private.collective_roles(id,collective_id,name,builtin)
select c.member_role_id,c.id,'Membro',true from public.collectives c join private.collective_details d on d.collective_id=c.id
where d.request_hash='seed-collectives-v1' and c.id in (select ('05000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n)
on conflict(id) do nothing;
insert into private.collective_roles(id,collective_id,name)
select '06000000-0000-4000-8000-000000000100',c.id,'Operações sintéticas' from public.collectives c
where c.id='05000000-0000-4000-8000-000000000001' and c.owner_user_id='01000000-0000-4000-8000-000000000001' on conflict(id) do nothing;
insert into private.collective_role_permissions(collective_id,role_id,permission)
select r.collective_id,r.id,p from private.collective_roles r cross join unnest(array['manage_requests','remove_members','create_events','edit_events','publish_events','cancel_events','read_messages','send_messages']) p
where r.id='06000000-0000-4000-8000-000000000100' and r.collective_id='05000000-0000-4000-8000-000000000001' and not r.builtin on conflict do nothing;
insert into private.collective_memberships(collective_id,user_id,role_id)
select c.id,c.owner_user_id,c.member_role_id from public.collectives c join private.collective_details d on d.collective_id=c.id
where d.request_hash='seed-collectives-v1' and c.owner_user_id='01000000-0000-4000-8000-000000000001'
  and c.id in (select ('05000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n)
on conflict(collective_id,user_id) do nothing;
insert into private.collective_memberships(collective_id,user_id,role_id)
select r.collective_id,'01000000-0000-4000-8000-000000000005',r.id from private.collective_roles r
where r.id='06000000-0000-4000-8000-000000000100' and r.collective_id='05000000-0000-4000-8000-000000000001' on conflict(collective_id,user_id) do nothing;
insert into private.membership_requests(id,collective_id,user_id,state,decided_at,decided_by)
select ('09000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('05000000-0000-4000-8000-'||lpad((array[6,1,4,3])[n]::text,12,'0'))::uuid,'01000000-0000-4000-8000-000000000005',
  (array['pending','approved','rejected','cancelled'])[n],case when n>1 then '2026-01-01 00:00:00+00'::timestamptz end,
  case when n>1 then '01000000-0000-4000-8000-000000000001'::uuid end from generate_series(1,4) n
on conflict(id) do nothing;
commit;
