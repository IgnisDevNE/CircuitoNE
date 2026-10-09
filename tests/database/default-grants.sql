-- Também usado em homologação: cria e remove objetos de ensaio na mesma instrução
-- atômica. Qualquer falha reverte a instrução inteira.
do $test$
declare
  api_role text;
begin
  create table public.phase0_default_table_probe (id integer);
  create sequence public.phase0_default_sequence_probe;
  create function public.phase0_default_function_probe() returns integer
    language sql as $function$ select 1 $function$;

  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(api_role, 'public.phase0_default_table_probe', 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Nova tabela pública recebeu acesso automático: %', api_role;
    end if;
    if has_table_privilege(api_role, 'public.phase0_default_table_probe', 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
      raise exception 'Nova tabela pública recebeu TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN: %', api_role;
    end if;
    if has_sequence_privilege(api_role, 'public.phase0_default_sequence_probe', 'USAGE,SELECT,UPDATE') then
      raise exception 'Nova sequência pública recebeu acesso automático: %', api_role;
    end if;
    if has_function_privilege(api_role, 'public.phase0_default_function_probe()', 'EXECUTE') then
      raise exception 'Nova função pública recebeu acesso automático: %', api_role;
    end if;
  end loop;
  -- Sobras em tabelas já existentes (também vale para as criadas por migrações anteriores à revogação dos defaults).
  if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('anon'),('authenticated'),('service_role')) roles(name)
    where n.nspname='public' and c.relkind in ('r','p')
      and not exists(select from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
      and has_table_privilege(roles.name,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) then
    raise exception 'Tabela pública com TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN para papel da API';
  end if;
  if exists(select from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
    join pg_roles creator on creator.oid=d.defaclrole
    cross join lateral aclexplode(d.defaclacl) a join pg_roles r on r.oid=a.grantee
    where n.nspname='public' and creator.rolname='postgres' and d.defaclobjtype='r' and r.rolname in ('anon','authenticated','service_role')
      and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')) then
    raise exception 'Privilégio padrão de tabela restante em public';
  end if;
  -- Dados profissionais não têm leitura anônima (a RLS já devolvia 0 linhas).
  if has_any_column_privilege('anon', 'public.professional_details', 'SELECT') then
    raise exception 'Anônimo com SELECT em professional_details';
  end if;
  drop function public.phase0_default_function_probe();
  drop sequence public.phase0_default_sequence_probe;
  drop table public.phase0_default_table_probe;
end $test$;
