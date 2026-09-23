-- Projetos existentes concedem acesso automático a novos objetos em public.
-- Cada objeto de negócio deve receber GRANT explícito junto de suas políticas.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

-- O EXECUTE padrão de PUBLIC é global em PostgreSQL; uma revogação limitada
-- ao schema não o remove. Afeta somente funções futuras criadas por postgres.
alter default privileges for role postgres
  revoke execute on functions from public;
