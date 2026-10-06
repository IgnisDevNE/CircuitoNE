-- W4: listas do titular para o painel. Somente a própria conta ativa; nunca dados de terceiros.
-- `published` e o estado do coletivo não são legíveis pela Data API (grants por coluna); estas funções os expõem ao dono.
create function public.list_my_profiles()
returns table(id uuid, kind text, name text, city text, state_code text, published boolean, is_default boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,p.kind,p.name,p.city,p.state_code,p.published,p.id is not distinct from a.default_artist_profile_id
    from public.profiles p join private.account_details a on a.user_id=p.owner_id
    where p.owner_id=auth.uid() and private.active_account(auth.uid())
    order by p.created_at,p.id limit 100
$$;

-- Coletivos em que o titular é membro (qualquer estado exceto encerrado), com o cargo dele.
create function public.list_my_collectives()
returns table(id uuid, kind text, name text, city text, state_code text, state text, role_name text, is_owner boolean)
language sql stable security definer set search_path = '' as $$
  select c.id,c.kind,c.name,c.city,c.state_code,c.state,r.name,c.owner_user_id=m.user_id
    from private.collective_memberships m
      join public.collectives c on c.id=m.collective_id
      join private.collective_roles r on r.collective_id=m.collective_id and r.id=m.role_id
    where m.user_id=auth.uid() and private.active_account(auth.uid()) and c.state<>'closed'
    order by c.name,c.id limit 100
$$;

revoke all on function public.list_my_profiles(),public.list_my_collectives() from public,anon,authenticated,service_role;
grant execute on function public.list_my_profiles(),public.list_my_collectives() to authenticated;
