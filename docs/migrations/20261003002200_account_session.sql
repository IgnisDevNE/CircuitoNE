-- Minimal own-account projection for server-validated Auth sessions.
create function public.get_account_session() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',u.id,
    'name',a.name,
    'state',case
      when a.state in ('suspended','deletion_pending') then a.state
      when a.user_id is null or u.email_confirmed_at is null or u.phone_confirmed_at is null then 'incomplete'
      else a.state end,
    'reason',case when a.state in ('suspended','deletion_pending') then a.state_reason else null end)
  from auth.users u left join private.account_details a on a.user_id=u.id
  where u.id=auth.uid() and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now())
$$;
revoke all on function public.get_account_session() from public,anon,service_role;
grant execute on function public.get_account_session() to authenticated;
