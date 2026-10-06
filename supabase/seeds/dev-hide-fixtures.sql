-- Somente no dev: oculta as fixtures de teste (prefixos 02/05/0a) das páginas públicas, sem apagar nada.
-- Os testes de CI continuam usando as fixtures visíveis; a demonstração (demo.sql) não é afetada.
begin;
do $$ begin
  if current_setting('circuitone.seed_target',true) is null or current_setting('circuitone.seed_target',true) not in ('disposable','odphoxozclrshqjgwbqk') then
    raise exception 'Seed exige destino sintético declarado pelo executor'; end if;
end $$;
update public.profiles set published=false,updated_at=now()
  where id::text like '02000000-0000-4000-8000-%' and published;
update public.collectives set state='suspended',updated_at=now()
  where id::text like '05000000-0000-4000-8000-%' and state='approved';
update public.events set state='cancelled',cancelled_at=now(),updated_at=now()
  where id::text like '0a000000-0000-4000-8000-%' and state='published';
commit;
