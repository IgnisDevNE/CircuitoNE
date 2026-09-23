-- Simula o default legado do Supabase antes da migração canônica.
alter default privileges for role postgres in schema public
  grant update on sequences to anon, authenticated, service_role;
