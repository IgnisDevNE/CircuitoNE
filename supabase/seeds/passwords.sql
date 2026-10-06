-- Senha das contas sintéticas (@example.invalid), para login nos ambientes de homologação e testes. Rodar por último,
-- após identity, collectives, events, messages e demo. A senha vem de uma variável do psql, nunca do repositório:
--   psql -v fixture_password="$FIXTURE_PASSWORD" ... -f supabase/seeds/passwords.sql
-- Só instruções SQL simples podem usar variáveis do psql (não valem dentro de blocos `do $$`).
-- Reexecutável: só regrava o hash quando a senha mudou (rotação do segredo); cria a identidade `email` do Auth
-- que o GoTrue exige para login por e-mail e senha em usuários inseridos direto no banco.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
end $$;

create or replace function pg_temp.require(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
select pg_temp.require(length(:'fixture_password') >= 12, 'Senha das fixtures exige ao menos 12 caracteres');

-- Marca o provedor como e-mail, como o próprio Auth faz ao cadastrar um usuário.
update auth.users
  set raw_app_meta_data=raw_app_meta_data||jsonb_build_object('provider','email','providers',jsonb_build_array('email')),updated_at=now()
  where email like '%@example.invalid' and not raw_app_meta_data ? 'provider';

update auth.users
  set encrypted_password=extensions.crypt(:'fixture_password',extensions.gen_salt('bf',10)),updated_at=now()
  where email like '%@example.invalid' and case
    when coalesce(encrypted_password,'') !~ '^\$2[abxy]\$[0-9]{2}\$' then true
    else encrypted_password<>extensions.crypt(:'fixture_password',encrypted_password) end;

insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
select gen_random_uuid(),u.id::text,u.id,
  jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',u.email_confirmed_at is not null,'phone_verified',false),
  'email',now(),now()
  from auth.users u
  where u.email like '%@example.invalid'
    and not exists(select from auth.identities i where i.user_id=u.id and i.provider='email')
on conflict do nothing;
commit;
