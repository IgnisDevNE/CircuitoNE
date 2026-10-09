-- Somente no projeto dev (PoC): MFA opcional e coletivos nascem aprovados. Produção e CI não carregam este seed.
-- Para desligar uma flag, apague a linha: delete from private.environment_flags where name = 'mfa_optional';
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is distinct from 'odphoxozclrshqjgwbqk' then
    raise exception 'Seed exige destino sintético declarado pelo executor (somente o projeto dev)'; end if;
end $$;
insert into private.environment_flags(name) values ('mfa_optional'),('auto_approve_collectives') on conflict do nothing;
commit;
