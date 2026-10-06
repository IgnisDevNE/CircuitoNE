-- W7: fila de pedidos de entrada para quem gere pedidos, com o nome de quem pede.
-- `get_collective_requests` devolve só identificadores; nome da conta e da atuação escolhida ficam no schema privado.
-- Só pedidos pendentes de contas ativas, e só para o proprietário ou membro com `manage_requests` no coletivo aprovado.
create function public.list_collective_requests(target uuid)
returns table(id uuid, created_at timestamptz, message text, requester_name text, profile_id uuid, profile_name text, profile_kind text, profile_published boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.collective_can(target,'manage_requests') then raise exception using errcode='42501',message='Operação não autorizada'; end if;
  return query select r.id,r.created_at,r.message,a.name,p.id,p.name,p.kind,p.published
    from private.membership_requests r
      join private.account_details a on a.user_id=r.user_id
      left join public.profiles p on p.id=r.profile_id and p.owner_id=r.user_id
    where r.collective_id=target and r.state='pending' and private.active_account(r.user_id)
    order by r.created_at,r.id limit 100;
end $$;

revoke all on function public.list_collective_requests(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_collective_requests(uuid) to authenticated;
