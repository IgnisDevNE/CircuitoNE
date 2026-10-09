-- W17: flags de ambiente só para o dev (PoC). A tabela nasce vazia; somente o seed `dev-flags` a preenche, e
-- apenas no projeto dev. Produção e CI nunca carregam o seed, então as regras de MFA e de aprovação continuam as mesmas.
create table private.environment_flags (
  name text primary key check (name in ('mfa_optional','auto_approve_collectives'))
);
alter table private.environment_flags enable row level security;
revoke all on private.environment_flags from public,anon,authenticated,service_role;

create function private.env_flag(flag text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from private.environment_flags where name=flag)
$$;
revoke all on function private.env_flag(text) from public,anon,authenticated,service_role;

-- Não é segredo: o app lê para avisar na interface que a regra será exigida em produção.
create function public.get_environment_flags() returns text[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(name order by name),'{}'::text[]) from private.environment_flags
$$;
revoke all on function public.get_environment_flags() from public,anon,authenticated,service_role;
grant execute on function public.get_environment_flags() to anon,authenticated;

-- Com `mfa_optional`, a conta verificada (e-mail e telefone confirmados) vale como MFA mesmo em sessão aal1.
create or replace function private.current_mfa() returns boolean
language sql stable security definer set search_path='' as $$
  select (private.env_flag('mfa_optional') and private.verified_account(auth.uid()))
    or (coalesce(auth.jwt()->>'aal'='aal2',false) and private.verified_account(auth.uid()) and exists(
      select from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
      where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and s.aal='aal2' and f.status='verified'
        and (s.not_after is null or s.not_after>now())))
$$;

-- Definição anterior: 20260927003957_messaging_lifecycle.sql. Com `mfa_optional`, o sucessor não precisa de fator verificado.
create or replace function public.transfer_collective_ownership(target uuid,successor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  perform 1 from private.account_details where user_id in(auth.uid(),successor) order by user_id for share;
  c:=private.lock_collective(target);
  if successor is null or successor=c.owner_user_id or not private.current_mfa() or not private.verified_account(successor)
    or not (private.env_flag('mfa_optional') or exists(select from auth.mfa_factors where user_id=successor and status='verified'))
    or not exists(select from private.collective_memberships where collective_id=target and user_id=successor) then
    raise exception using errcode='42501',message='Transferência exige proprietário com MFA e sucessor elegível'; end if;
  update private.collective_memberships set role_id=c.member_role_id where collective_id=target and user_id=c.owner_user_id;
  update public.collectives set owner_user_id=successor,version=version+1,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'ownership_transferred');
end $$;

-- Definição anterior: 20260926232806_collective_authorization.sql. Com `auto_approve_collectives`, o coletivo já nasce aprovado
-- (não há interface de administração no dev); a trilha registra a aprovação automática.
create or replace function public.create_collective(payload jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid; role_id uuid:=gen_random_uuid(); fingerprint text; existing private.collective_details; cnpj text;
  auto_approve boolean:=private.env_flag('auto_approve_collectives');
begin
  -- Serializa retries da mesma conta antes da inserção do agregado.
  perform 1 from private.account_details where user_id=actor for update;
  if not private.active_account(actor) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  if request_id is null or jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k
    where k not in ('kind','name','description','activity','city','state_code','social_links','color','cnpj')) then
    raise exception using errcode='22023',message='Dados de coletivo inválidos';
  end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  select * into existing from private.collective_details d where d.creator_user_id=actor and d.request_id=create_collective.request_id;
  if found then
    if existing.request_hash=fingerprint then return existing.collective_id; end if;
    raise exception using errcode='22023',message='Solicitação reutilizada com outros dados';
  end if;
  cnpj:=upper(regexp_replace(payload->>'cnpj','[./[:space:]-]','','g'));
  if payload->>'kind'='producer' and cnpj is null then raise exception using errcode='22023',message='Produtora exige CNPJ'; end if;
  insert into public.collectives(owner_user_id,member_role_id,kind,name,description,activity,city,state_code,social_links,color,state)
    values(actor,role_id,payload->>'kind',payload->>'name',payload->>'description',payload->>'activity',payload->>'city',payload->>'state_code',coalesce(payload->'social_links','{}'),payload->>'color',
      case when auto_approve then 'approved' else 'pending' end) returning id into result;
  insert into private.collective_details(collective_id,kind,cnpj,creator_user_id,request_id,request_hash) values(result,payload->>'kind',cnpj,actor,request_id,fingerprint);
  insert into private.collective_roles(id,collective_id,name,builtin) values(role_id,result,'Membro',true);
  insert into private.collective_memberships(collective_id,user_id,role_id) values(result,actor,role_id);
  insert into private.collective_audit(collective_id,actor_id,action) values(result,actor,'created');
  if auto_approve then
    insert into private.collective_audit(collective_id,actor_id,action,reason) values(result,actor,'auto_approved','Aprovação automática (flag de ambiente de desenvolvimento)');
  end if;
  return result;
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Dados de coletivo inválidos';
end $$;
