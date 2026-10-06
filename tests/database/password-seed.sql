-- Após aplicar supabase/seeds/passwords.sql (variável fixture_password do psql). Só contas sintéticas ganham login.
select count(*) as synthetic_accounts from auth.users where email like '%@example.invalid' \gset
select count(*) as accounts_with_password from auth.users
  where email like '%@example.invalid' and encrypted_password ~ '^\$2[abxy]\$10\$' and encrypted_password=extensions.crypt(:'fixture_password',encrypted_password) \gset
select count(*) as email_identities from auth.identities i join auth.users u on u.id=i.user_id
  where u.email like '%@example.invalid' and i.provider='email' and i.provider_id=u.id::text and i.identity_data->>'sub'=u.id::text
    and i.identity_data->>'email'=u.email and (i.identity_data->>'email_verified')::boolean=(u.email_confirmed_at is not null) \gset
select count(*) as other_identities from auth.identities i join auth.users u on u.id=i.user_id where u.email like '%@example.invalid' \gset
select count(*) as foreign_passwords from auth.users where email not like '%@example.invalid' and coalesce(encrypted_password,'')<>'' \gset
create function pg_temp.require(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
select pg_temp.require(:synthetic_accounts >= 15, 'Seeds sintéticos ausentes');
select pg_temp.require(:accounts_with_password = :synthetic_accounts, 'Nem toda conta sintética recebeu a senha');
select pg_temp.require(:email_identities = :synthetic_accounts and :other_identities = :synthetic_accounts, 'Identidade email ausente ou duplicada');
select pg_temp.require(:foreign_passwords = 0, 'Seed de senhas alterou conta não sintética');
select pg_temp.require(exists(select from auth.users where email='fixture-active@example.invalid' and raw_app_meta_data->>'provider'='email'), 'Provedor email ausente nos metadados do Auth');
