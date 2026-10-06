-- W9: gestão de membros do coletivo.
-- `get_collective_members` é público e só traz o nome; `get_collective_member_activity` devolve identificadores.
-- Esta lista junta, para quem pode remover membros (o proprietário ou um perfil com `remove_members`), o nome da conta,
-- a atuação artística padrão publicada (RN-20), o perfil de acesso e a última atividade. Coletivo aprovado apenas.
create function public.get_collective_member_roster(target uuid)
returns table(user_id uuid, member_name text, artist_profile_id uuid, artist_name text, role_id uuid, role_name text, last_activity_at timestamptz, is_owner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.collective_can(target,'remove_members') then raise exception using errcode='42501',message='Operação não autorizada'; end if;
  return query select m.user_id,a.name,case when p.published then p.id end,case when p.published then p.name end,
      r.id,r.name,m.last_activity_at,c.owner_user_id is not distinct from m.user_id
    from public.collectives c
      join private.collective_memberships m on m.collective_id=c.id
      join private.account_details a on a.user_id=m.user_id
      join private.collective_roles r on r.collective_id=m.collective_id and r.id=m.role_id
      left join public.profiles p on p.id=a.default_artist_profile_id and p.owner_id=a.user_id and p.kind='artist'
    where c.id=target
    order by (c.owner_user_id is not distinct from m.user_id) desc,a.name,m.user_id
    limit 500;
end $$;

-- O proprietário nunca recebe outro perfil por atribuição: seus poderes vêm da propriedade (e a transferência o rebaixa a Membro).
create or replace function public.assign_collective_role(target uuid, member uuid, target_role uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  c:=private.lock_collective(target);
  if not exists(select from private.collective_roles where collective_id=target and id=target_role) then raise exception using errcode='22023',message='Perfil indisponível'; end if;
  if member is not distinct from c.owner_user_id then raise exception using errcode='42501',message='Proprietário não recebe outro perfil'; end if;
  update private.collective_memberships set role_id=target_role where collective_id=target and user_id=member;
  if not found then raise exception using errcode='22023',message='Membro indisponível'; end if;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'role_assigned');
end $$;

-- Corrige `edit_collective` quando o payload traz `cnpj`: a variável local era referenciada como `edit_collective.cnpj` dentro do UPDATE,
-- o que o PL/pgSQL recusa ("missing FROM-clause entry"), então nenhuma edição com CNPJ funcionava. O restante é idêntico.
create or replace function public.edit_collective(target uuid, expected_version integer, payload jsonb, resubmit boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives; new_cnpj text;
begin
  select * into c from public.collectives where id=target for update;
  if not found or not private.active_account(auth.uid()) or c.owner_user_id is distinct from auth.uid() or c.state not in ('pending','rejected','approved') then
    raise exception using errcode='42501',message='Operação não autorizada'; end if;
  if c.version is distinct from expected_version then raise exception using errcode='40001',message='Coletivo alterado; recarregue'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k where k not in ('name','description','activity','city','state_code','social_links','color','image_path','cnpj'))
    or resubmit is null or (resubmit and c.state not in ('pending','rejected')) then raise exception using errcode='22023',message='Edição inválida'; end if;
  if payload?'cnpj' then
    new_cnpj:=upper(regexp_replace(payload->>'cnpj','[./[:space:]-]','','g'));
    if c.kind='producer' and new_cnpj is null then raise exception using errcode='22023',message='Produtora exige CNPJ'; end if;
    update private.collective_details set cnpj=new_cnpj where collective_id=target;
  end if;
  update public.collectives set name=coalesce(payload->>'name',name),description=coalesce(payload->>'description',description),
    activity=coalesce(payload->>'activity',activity),city=coalesce(payload->>'city',city),state_code=coalesce(payload->>'state_code',state_code),
    social_links=coalesce(payload->'social_links',social_links),color=case when payload?'color' then payload->>'color' else color end,
    image_path=case when payload?'image_path' then payload->>'image_path' else image_path end,
    state=case when resubmit then 'pending' else state end,version=version+1,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),case when resubmit then 'resubmitted' else 'edited' end);
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Dados de coletivo inválidos';
end $$;

revoke all on function public.get_collective_member_roster(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_collective_member_roster(uuid) to authenticated;
