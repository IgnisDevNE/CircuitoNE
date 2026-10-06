do $$ begin
  if (select count(*) from auth.users where email='fixture-applicant@example.invalid')<>1
    or (select count(*) from private.account_details where user_id='01000000-0000-4000-8000-000000000006' and state='active')<>1 then
    raise exception 'Conta candidata sintética ausente/duplicada'; end if;
  if (select count(*) from public.profiles where owner_id='01000000-0000-4000-8000-000000000006' and kind='artist' and not published)<>1 then
    raise exception 'Atuação sintética da candidata ausente/duplicada ou publicada'; end if;
  if exists(select from private.collective_memberships where user_id='01000000-0000-4000-8000-000000000006')
    or exists(select from private.membership_requests where user_id='01000000-0000-4000-8000-000000000006') then
    raise exception 'A candidata deve começar sem coletivos nem pedidos'; end if;
  if exists(select from auth.users where id='01000000-0000-4000-8000-000000000006' and coalesce(encrypted_password,'')<>'') then
    raise exception 'Seed criou login utilizável'; end if;
end $$;
