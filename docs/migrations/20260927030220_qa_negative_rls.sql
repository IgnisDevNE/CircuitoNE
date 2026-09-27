-- Disposable negative experiment: never merge or apply to hosted Supabase.
alter table public.events disable row level security;
grant select on public.events to anon;
