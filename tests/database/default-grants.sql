-- Executado somente no banco descartável após aplicar as migrações canônicas.
do $test$
begin
  create table public.phase0_default_table_probe (id integer);
  create sequence public.phase0_default_sequence_probe;
  create function public.phase0_default_function_probe() returns integer
    language sql as $function$ select 1 $function$;

  if has_table_privilege('anon', 'public.phase0_default_table_probe', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.phase0_default_table_probe', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Nova tabela pública recebeu acesso automático';
  end if;
  if has_sequence_privilege('anon', 'public.phase0_default_sequence_probe', 'USAGE,SELECT')
    or has_sequence_privilege('authenticated', 'public.phase0_default_sequence_probe', 'USAGE,SELECT') then
    raise exception 'Nova sequência pública recebeu acesso automático';
  end if;
  if has_function_privilege('anon', 'public.phase0_default_function_probe()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.phase0_default_function_probe()', 'EXECUTE') then
    raise exception 'Nova função pública recebeu acesso automático';
  end if;
  drop function public.phase0_default_function_probe();
  drop sequence public.phase0_default_sequence_probe;
  drop table public.phase0_default_table_probe;
end $test$;
