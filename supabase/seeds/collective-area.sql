-- Após identity.sql e collectives.sql. Somente fixtures; nunca concede senha, sessão ou chave MFA.
-- Conta sintética que ainda não pertence a nenhum coletivo: os testes e2e da área do coletivo (W7) a usam para pedir entrada,
-- cancelar, ser aprovada ou recusada sem tocar nas contas e nos coletivos que as demais suítes afirmam.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
end $$;
insert into auth.users(instance_id,aud,role,confirmation_token,recovery_token,email_change_token_current,email_change_token_new,email_change,phone_change_token,phone_change,reauthentication_token,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,id,email,email_confirmed_at,phone,phone_confirmed_at) values
('00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 '','','','','','','','',now(),now(),'{}'::jsonb,'{}'::jsonb,
 '01000000-0000-4000-8000-000000000006','fixture-applicant@example.invalid',now(),'5581999000006',now()) on conflict(id) do nothing;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash) values
('01000000-0000-4000-8000-000000000006','Candidato sintético ativo','39053344705','1990-01-01','Recife','PE',true,'03000000-0000-4000-8000-000000000006','seed-collective-area-v1') on conflict(user_id) do nothing;
insert into public.profiles(id,owner_id,kind,name,city,state_code) values
('02000000-0000-4000-8000-000000000009','01000000-0000-4000-8000-000000000006','artist','Artista sintético do candidato','Recife','PE') on conflict(id) do nothing;
insert into public.artist_profiles(profile_id) select id from public.profiles where
  id='02000000-0000-4000-8000-000000000009' and owner_id='01000000-0000-4000-8000-000000000006' and kind='artist' on conflict do nothing;
insert into public.professional_details(profile_id,kind) select id,kind from public.profiles where
  id='02000000-0000-4000-8000-000000000009' and owner_id='01000000-0000-4000-8000-000000000006' and kind='artist' on conflict do nothing;
commit;
