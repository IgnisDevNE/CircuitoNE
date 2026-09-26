-- #117: operações serializadas pela linha do coletivo; sem escrita direta pela Data API.
create table public.collectives (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references private.account_details(user_id) on delete set null,
  member_role_id uuid not null,
  member_role_builtin boolean not null default true check (member_role_builtin),
  kind text not null check (kind in ('collective','producer')),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null check (length(btrim(description)) between 1 and 10000),
  activity text not null check (length(btrim(activity)) between 1 and 200),
  city text not null check (length(btrim(city)) between 1 and 150),
  state_code text not null check (state_code=any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  social_links jsonb not null default '{}' check (private.valid_social_links(social_links)),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  image_path text check (image_path ~ ('^'||id::text||'/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$')),
  state text not null default 'pending' check (state in ('pending','rejected','approved','suspended','closed')),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,kind),
  check ((state='closed')=(owner_user_id is null))
);
create index collectives_owner on public.collectives(owner_user_id) where owner_user_id is not null;
create index collectives_catalog on public.collectives(name,id) where state='approved';
create index collectives_review_queue on public.collectives(state,id);
alter table public.collectives enable row level security;

create table private.collective_details (
  collective_id uuid primary key,
  kind text not null,
  cnpj text check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  decision_reason text,
  creator_user_id uuid references private.account_details(user_id) on delete set null,
  request_id uuid not null,
  request_hash text not null,
  unique (creator_user_id,request_id),
  foreign key(collective_id,kind) references public.collectives(id,kind) on delete cascade,
  check (kind<>'producer' or cnpj is not null)
);
alter table public.collectives add foreign key(id) references private.collective_details(collective_id) deferrable initially deferred;
create table private.collective_roles (
  id uuid primary key default gen_random_uuid(),
  collective_id uuid not null references public.collectives(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  builtin boolean not null default false,
  check (not builtin or name='Membro'),
  unique (collective_id,name), unique (collective_id,id), unique (collective_id,id,builtin)
);
create unique index collective_one_member_role on private.collective_roles(collective_id) where builtin;
create table private.collective_role_permissions (
  collective_id uuid not null,
  role_id uuid not null,
  builtin boolean not null default false check (not builtin),
  permission text not null check (permission in ('manage_requests','remove_members','create_events','edit_events','publish_events','cancel_events','read_messages','send_messages')),
  primary key (collective_id,role_id,permission),
  foreign key (collective_id,role_id,builtin) references private.collective_roles(collective_id,id,builtin) on delete cascade
);
create table private.collective_memberships (
  collective_id uuid not null references public.collectives(id) on delete cascade,
  user_id uuid not null references private.account_details(user_id) on delete cascade,
  role_id uuid not null,
  joined_at timestamptz not null default now(),
  last_activity_at timestamptz,
  primary key (collective_id,user_id),
  foreign key (collective_id,role_id) references private.collective_roles(collective_id,id)
);
create index memberships_user on private.collective_memberships(user_id,collective_id);
create index memberships_role on private.collective_memberships(collective_id,role_id);
alter table public.collectives add foreign key (id,owner_user_id) references private.collective_memberships(collective_id,user_id) deferrable initially deferred;
alter table public.collectives add foreign key (id,member_role_id,member_role_builtin) references private.collective_roles(collective_id,id,builtin) deferrable initially deferred;
create table private.membership_requests (
  id uuid primary key default gen_random_uuid(),
  collective_id uuid not null references public.collectives(id) on delete cascade,
  user_id uuid not null references private.account_details(user_id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  message text not null default '' check (length(message)<=2000),
  state text not null default 'pending' check (state in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references private.account_details(user_id) on delete set null,
  check ((state='pending')=(decided_at is null))
);
create unique index membership_one_pending on private.membership_requests(collective_id,user_id) where state='pending';
create index membership_requests_user on private.membership_requests(user_id,id);
create index membership_requests_profile on private.membership_requests(profile_id) where profile_id is not null;
create index membership_requests_collective on private.membership_requests(collective_id,created_at,id);
create index membership_requests_decider on private.membership_requests(decided_by) where decided_by is not null;
create table private.site_admins (
  user_id uuid primary key references private.account_details(user_id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references private.account_details(user_id) on delete set null
);
create index site_admins_granter on private.site_admins(granted_by) where granted_by is not null;
create table private.collective_audit (
  id uuid primary key default gen_random_uuid(),
  collective_id uuid not null references public.collectives(id) on delete cascade,
  actor_id uuid references private.account_details(user_id) on delete set null,
  action text not null,
  reason text check (length(reason)<=2000),
  created_at timestamptz not null default now()
);
create index collective_audit_timeline on private.collective_audit(collective_id,created_at,id);
create index collective_audit_actor on private.collective_audit(actor_id) where actor_id is not null;
alter table private.collective_details enable row level security;
alter table private.collective_roles enable row level security;
alter table private.collective_role_permissions enable row level security;
alter table private.collective_memberships enable row level security;
alter table private.membership_requests enable row level security;
alter table private.site_admins enable row level security;
alter table private.collective_audit enable row level security;

-- A identidade, confirmação e fator vêm de tabelas mantidas pelo Auth, nunca de user_metadata.
create function private.verified_account(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_account(actor) and exists(select from auth.users where id=actor and email is not null and phone is not null and email_confirmed_at is not null and phone_confirmed_at is not null)
$$;
create function private.current_mfa() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(auth.jwt()->>'aal'='aal2',false) and private.verified_account(auth.uid()) and exists(
    select from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and s.aal='aal2' and f.status='verified'
      and (s.not_after is null or s.not_after>now()))
$$;
create function private.site_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select private.current_mfa() and exists(select from private.site_admins where user_id=auth.uid())
$$;
create function private.collective_can(target uuid, permission text, history boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_account(auth.uid()) and exists(
    select from public.collectives c join private.collective_memberships m on m.collective_id=c.id and m.user_id=auth.uid()
    where c.id=target and (c.state='approved' or (history and permission='read_messages' and c.state='suspended'))
      and permission=any(array['manage_requests','remove_members','create_events','edit_events','publish_events','cancel_events','read_messages','send_messages'])
      and (c.owner_user_id=auth.uid() or exists(select from private.collective_role_permissions p
        where p.collective_id=c.id and p.role_id=m.role_id and p.permission=collective_can.permission)))
$$;
create function private.professional_reader() returns boolean
language sql stable security definer set search_path='' as $$
  select private.current_mfa() and exists(select from public.collectives c join private.collective_memberships m on m.collective_id=c.id and m.user_id=c.owner_user_id
    where c.owner_user_id=auth.uid() and c.state='approved')
$$;
create function private.collective_visible(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (auth.uid() is null or private.active_account(auth.uid())) and exists(select from public.collectives where id=target and state='approved')
$$;
create policy collectives_read on public.collectives for select to anon,authenticated using (private.collective_visible(id));
drop policy professional_read on public.professional_details;
create policy professional_read on public.professional_details for select to authenticated
  using (private.owns_profile(profile_id) or (private.professional_reader() and private.profile_visible(profile_id)));

-- Todas as mutações do agregado tomam esta mesma trava antes de ler poderes/estado.
create function private.lock_collective(target uuid, permission text default null) returns public.collectives
language plpgsql set search_path='' as $$
declare c public.collectives;
begin
  select * into c from public.collectives where id=target for update;
  if not found or not private.active_account(auth.uid()) or c.state<>'approved'
    or (permission is null and c.owner_user_id is distinct from auth.uid())
    or (permission is not null and not private.collective_can(target,permission)) then
    raise exception using errcode='42501',message='Operação não autorizada';
  end if;
  return c;
end $$;

create function public.create_collective(payload jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result uuid; role_id uuid:=gen_random_uuid(); fingerprint text; existing private.collective_details; cnpj text;
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
  insert into public.collectives(owner_user_id,member_role_id,kind,name,description,activity,city,state_code,social_links,color)
    values(actor,role_id,payload->>'kind',payload->>'name',payload->>'description',payload->>'activity',payload->>'city',payload->>'state_code',coalesce(payload->'social_links','{}'),payload->>'color') returning id into result;
  insert into private.collective_details(collective_id,kind,cnpj,creator_user_id,request_id,request_hash) values(result,payload->>'kind',cnpj,actor,request_id,fingerprint);
  insert into private.collective_roles(id,collective_id,name,builtin) values(role_id,result,'Membro',true);
  insert into private.collective_memberships(collective_id,user_id,role_id) values(result,actor,role_id);
  insert into private.collective_audit(collective_id,actor_id,action) values(result,actor,'created');
  return result;
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Dados de coletivo inválidos';
end $$;

create function public.edit_collective(target uuid, expected_version integer, payload jsonb, resubmit boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives; cnpj text;
begin
  select * into c from public.collectives where id=target for update;
  if not found or not private.active_account(auth.uid()) or c.owner_user_id is distinct from auth.uid() or c.state not in ('pending','rejected','approved') then
    raise exception using errcode='42501',message='Operação não autorizada'; end if;
  if c.version is distinct from expected_version then raise exception using errcode='40001',message='Coletivo alterado; recarregue'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k where k not in ('name','description','activity','city','state_code','social_links','color','image_path','cnpj'))
    or resubmit is null or (resubmit and c.state not in ('pending','rejected')) then raise exception using errcode='22023',message='Edição inválida'; end if;
  if payload?'cnpj' then
    cnpj:=upper(regexp_replace(payload->>'cnpj','[./[:space:]-]','','g'));
    if c.kind='producer' and cnpj is null then raise exception using errcode='22023',message='Produtora exige CNPJ'; end if;
    update private.collective_details set cnpj=edit_collective.cnpj where collective_id=target;
  end if;
  update public.collectives set name=coalesce(payload->>'name',name),description=coalesce(payload->>'description',description),
    activity=coalesce(payload->>'activity',activity),city=coalesce(payload->>'city',city),state_code=coalesce(payload->>'state_code',state_code),
    social_links=coalesce(payload->'social_links',social_links),color=case when payload?'color' then payload->>'color' else color end,
    image_path=case when payload?'image_path' then payload->>'image_path' else image_path end,
    state=case when resubmit then 'pending' else state end,version=version+1,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),case when resubmit then 'resubmitted' else 'edited' end);
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Dados de coletivo inválidos';
end $$;

create function public.review_collective(target uuid, expected_version integer, decision text, reason text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  select * into c from public.collectives where id=target for update;
  if not found or not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  if c.version is distinct from expected_version then raise exception using errcode='40001',message='Coletivo alterado; recarregue'; end if;
  if reason is null or length(btrim(reason)) not between 1 and 2000 or decision is null or not (
    (c.state='pending' and decision in ('approved','rejected')) or (c.state='approved' and decision='suspended') or (c.state='suspended' and decision='approved')) then
    raise exception using errcode='22023',message='Decisão inválida'; end if;
  update public.collectives set state=decision,version=version+1,updated_at=now() where id=target;
  update private.collective_details set decision_reason=reason where collective_id=target;
  insert into private.collective_audit(collective_id,actor_id,action,reason) values(target,auth.uid(),decision,reason);
end $$;

create function public.save_collective_role(target uuid, target_role uuid, role_name text, permissions text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid:=coalesce(target_role,gen_random_uuid());
begin
  perform private.lock_collective(target);
  if permissions is null or array_position(permissions,null) is not null then raise exception using errcode='22023',message='Permissões inválidas'; end if;
  if target_role is null then insert into private.collective_roles(id,collective_id,name) values(result,target,role_name);
  else
    update private.collective_roles set name=role_name where id=target_role and collective_id=target and not builtin;
    if not found then raise exception using errcode='22023',message='Perfil indisponível'; end if;
    delete from private.collective_role_permissions where collective_id=target and role_id=target_role;
  end if;
  insert into private.collective_role_permissions(collective_id,role_id,permission) select target,result,p from (select distinct unnest(permissions) p) valueset;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'role_saved');
  return result;
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Perfil/permissões inválidos';
end $$;
create function public.delete_collective_role(target uuid, target_role uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_collective(target);
  delete from private.collective_roles where collective_id=target and id=target_role and not builtin;
  if not found then raise exception using errcode='22023',message='Perfil indisponível'; end if;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'role_deleted');
exception when foreign_key_violation then raise exception using errcode='22023',message='Reatribua os membros antes de excluir o perfil';
end $$;
create function public.assign_collective_role(target uuid, member uuid, target_role uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_collective(target);
  if not exists(select from private.collective_roles where collective_id=target and id=target_role) then raise exception using errcode='22023',message='Perfil indisponível'; end if;
  update private.collective_memberships set role_id=target_role where collective_id=target and user_id=member;
  if not found then raise exception using errcode='22023',message='Membro indisponível'; end if;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'role_assigned');
end $$;

create function public.request_collective_membership(target uuid, profile uuid default null, message text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.collectives; result uuid;
begin
  select * into c from public.collectives where id=target for update;
  if not found or c.state<>'approved' or not private.active_account(auth.uid()) then raise exception using errcode='42501',message='Coletivo indisponível'; end if;
  if message is null or length(message)>2000 or (profile is not null and not exists(select from public.profiles where id=profile and owner_id=auth.uid())) then
    raise exception using errcode='22023',message='Apresentação inválida'; end if;
  if exists(select from private.collective_memberships where collective_id=target and user_id=auth.uid()) then raise exception using errcode='22023',message='Conta já vinculada'; end if;
  select id into result from private.membership_requests where collective_id=target and user_id=auth.uid() and state='pending';
  if result is null then insert into private.membership_requests(collective_id,user_id,profile_id,message) values(target,auth.uid(),profile,message) returning id into result;
  elsif exists(select from private.membership_requests r where r.id=result and (r.profile_id is distinct from profile or r.message is distinct from request_collective_membership.message)) then
    raise exception using errcode='22023',message='Já existe pedido com outra apresentação'; end if;
  return result;
end $$;
create function public.cancel_collective_request(target_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  select collective_id into target from private.membership_requests where id=target_request;
  perform 1 from public.collectives where id=target and state='approved' for update;
  if not found or not private.active_account(auth.uid()) then raise exception using errcode='42501',message='Conta/coletivo indisponível'; end if;
  update private.membership_requests set state='cancelled',decided_at=now(),decided_by=auth.uid()
    where id=target_request and user_id=auth.uid() and state='pending';
  if not found then raise exception using errcode='42501',message='Pedido indisponível'; end if;
end $$;
create function public.decide_collective_request(target_request uuid, approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid; c public.collectives; r private.membership_requests;
begin
  select collective_id into target from private.membership_requests where id=target_request;
  c:=private.lock_collective(target,'manage_requests');
  select * into r from private.membership_requests where id=target_request for update;
  if r.state<>'pending' or approve is null then raise exception using errcode='22023',message='Pedido já decidido ou decisão inválida'; end if;
  if approve then
    if not private.active_account(r.user_id) then raise exception using errcode='42501',message='Solicitante indisponível'; end if;
    insert into private.collective_memberships(collective_id,user_id,role_id) values(target,r.user_id,c.member_role_id);
  end if;
  update private.membership_requests set state=case when approve then 'approved' else 'rejected' end,decided_at=now(),decided_by=auth.uid() where id=target_request;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'membership_decided');
end $$;
create function public.remove_collective_member(target uuid, member uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  -- Saída voluntária usa o mesmo bloqueio; suspensão não concede gestão.
  if member=auth.uid() then
    select * into c from public.collectives where id=target for update;
    if not found or c.state<>'approved' or not private.active_account(auth.uid()) then raise exception using errcode='42501',message='Operação não autorizada'; end if;
  else c:=private.lock_collective(target,'remove_members'); end if;
  if c.owner_user_id=member then raise exception using errcode='42501',message='Transfira a propriedade antes de sair'; end if;
  delete from private.collective_memberships where collective_id=target and user_id=member;
  if not found then raise exception using errcode='22023',message='Membro indisponível'; end if;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'member_removed');
end $$;
create function public.transfer_collective_ownership(target uuid, successor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  c:=private.lock_collective(target);
  if successor is null or successor=c.owner_user_id or not private.current_mfa() or not private.verified_account(successor)
    or not exists(select from auth.mfa_factors where user_id=successor and status='verified')
    or not exists(select from private.collective_memberships where collective_id=target and user_id=successor) then
    raise exception using errcode='42501',message='Transferência exige proprietário com MFA e sucessor elegível'; end if;
  update private.collective_memberships set role_id=c.member_role_id where collective_id=target and user_id=c.owner_user_id;
  update public.collectives set owner_user_id=successor,version=version+1,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'ownership_transferred');
end $$;

create function private.close_collective(target uuid, reason text) returns void language plpgsql set search_path='' as $$
begin
  if reason is null or length(btrim(reason)) not between 1 and 2000 then raise exception using errcode='22023',message='Motivo necessário'; end if;
  update public.collectives set state='closed',owner_user_id=null,version=version+1,updated_at=now() where id=target;
  update private.collective_details set decision_reason=reason where collective_id=target;
  insert into private.collective_audit(collective_id,actor_id,action,reason) values(target,auth.uid(),'closed',reason);
end $$;
create function public.close_collective(target uuid, reason text) returns void
language plpgsql security definer set search_path='' as $$
begin perform private.lock_collective(target); perform private.close_collective(target,reason); end $$;
create function public.support_close_collective(target uuid, reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.collectives where id=target and state<>'closed' for update;
  if not found or not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  perform private.close_collective(target,reason);
end $$;

create function public.get_collective_status(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.collectives;
begin
  select * into c from public.collectives where id=target;
  if not found or not (private.site_admin() or (private.active_account(auth.uid()) and c.owner_user_id is not distinct from auth.uid())) then
    raise exception using errcode='42501',message='Acompanhamento indisponível'; end if;
  return (select jsonb_build_object('id',c.id,'state',c.state,'version',c.version,'reason',d.decision_reason,'cnpj',d.cnpj,
    'profile',to_jsonb(c)-array['owner_user_id','member_role_id','member_role_builtin'])
    from private.collective_details d where d.collective_id=target);
end $$;
create function public.get_collective_review_contact(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  return (select jsonb_build_object('name',a.name,'phone','+'||u.phone,
    'whatsapp',case when a.phone_is_whatsapp then '+'||u.phone else a.whatsapp_number end)
    from public.collectives c join private.account_details a on a.user_id=c.owner_user_id join auth.users u on u.id=a.user_id where c.id=target);
end $$;
create function public.get_collective_access(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('owner',c.owner_user_id=auth.uid(),'role_id',m.role_id,'permissions',
    case when c.owner_user_id=auth.uid() then '["manage_requests","remove_members","create_events","edit_events","publish_events","cancel_events","read_messages","send_messages"]'::jsonb
      else coalesce((select jsonb_agg(p.permission order by p.permission) from private.collective_role_permissions p where p.collective_id=c.id and p.role_id=m.role_id),'[]') end)
    from public.collectives c join private.collective_memberships m on m.collective_id=c.id and m.user_id=auth.uid()
    where c.id=target and c.state='approved' and private.active_account(auth.uid())
$$;
create function public.get_collective_members(target uuid) returns table(name text, artist_profile_id uuid)
language sql stable security definer set search_path='' as $$
  select a.name,case when p.published then p.id end from public.collectives c
    join private.collective_memberships m on m.collective_id=c.id join private.account_details a on a.user_id=m.user_id
    left join public.profiles p on p.id=a.default_artist_profile_id and p.owner_id=a.user_id and p.kind='artist'
    where c.id=target and c.state='approved' and private.active_account(a.user_id)
      and (auth.uid() is null or private.active_account(auth.uid())) order by a.name,m.user_id
$$;
create function public.get_collective_member_activity(target uuid) returns table(user_id uuid, last_activity_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.active_account(auth.uid()) or not exists(select from public.collectives where id=target and owner_user_id=auth.uid() and state='approved') then
    raise exception using errcode='42501',message='Operação não autorizada'; end if;
  return query select m.user_id,m.last_activity_at from private.collective_memberships m where m.collective_id=target order by m.user_id;
end $$;
create function public.get_collective_requests(target uuid) returns table(id uuid,user_id uuid,state text,created_at timestamptz,profile_id uuid,message text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.collective_can(target,'manage_requests') then raise exception using errcode='42501',message='Operação não autorizada'; end if;
  return query select r.id,r.user_id,r.state,r.created_at,r.profile_id,r.message from private.membership_requests r where r.collective_id=target order by r.created_at,r.id;
end $$;
create function public.get_collective_roles(target uuid) returns table(id uuid,name text,permissions text[])
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.active_account(auth.uid()) or not exists(select from public.collectives where public.collectives.id=target and owner_user_id=auth.uid() and state='approved') then
    raise exception using errcode='42501',message='Operação não autorizada'; end if;
  return query select r.id,r.name,coalesce(array_agg(p.permission order by p.permission) filter(where p.permission is not null),'{}'::text[])
    from private.collective_roles r left join private.collective_role_permissions p on p.collective_id=r.collective_id and p.role_id=r.id
    where r.collective_id=target group by r.id,r.name order by r.name,r.id;
end $$;
create function public.get_my_collective_requests(after_id uuid default null)
returns table(id uuid,collective_id uuid,state text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select r.id,r.collective_id,r.state,r.created_at from private.membership_requests r join public.collectives c on c.id=r.collective_id
    where r.user_id=auth.uid() and private.active_account(auth.uid()) and c.state='approved' and (after_id is null or r.id>after_id)
    order by r.id limit 50
$$;
create function public.get_collective_review_queue(target_state text default 'pending', after_id uuid default null)
returns table(id uuid,kind text,name text,city text,state_code text,state text,version integer,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  if target_state is null or target_state not in ('pending','rejected','approved','suspended','closed') then
    raise exception using errcode='22023',message='Estado inválido'; end if;
  return query select c.id,c.kind,c.name,c.city,c.state_code,c.state,c.version,c.created_at from public.collectives c
    where c.state=target_state and (after_id is null or c.id>after_id) order by c.id limit 50;
end $$;

revoke all on public.collectives from public,anon,authenticated,service_role;
revoke all on private.collective_details,private.collective_roles,private.collective_role_permissions,private.collective_memberships,
  private.membership_requests,private.site_admins,private.collective_audit from public,anon,authenticated,service_role;
revoke all on function private.verified_account(uuid),private.current_mfa(),private.site_admin(),private.collective_can(uuid,text,boolean),private.professional_reader(),
  private.lock_collective(uuid,text),private.close_collective(uuid,text),private.collective_visible(uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_collective(jsonb,uuid),public.edit_collective(uuid,integer,jsonb,boolean),public.review_collective(uuid,integer,text,text),
  public.save_collective_role(uuid,uuid,text,text[]),public.delete_collective_role(uuid,uuid),public.assign_collective_role(uuid,uuid,uuid),
  public.request_collective_membership(uuid,uuid,text),public.cancel_collective_request(uuid),public.decide_collective_request(uuid,boolean),public.remove_collective_member(uuid,uuid),
  public.transfer_collective_ownership(uuid,uuid),public.close_collective(uuid,text),public.support_close_collective(uuid,text),public.get_collective_status(uuid),
  public.get_collective_access(uuid),public.get_collective_members(uuid),public.get_collective_member_activity(uuid),public.get_collective_requests(uuid),public.get_collective_roles(uuid),public.get_collective_review_contact(uuid),public.get_my_collective_requests(uuid),public.get_collective_review_queue(text,uuid)
  from public,anon,authenticated,service_role;
grant select(id,kind,name,description,activity,city,state_code,social_links,color,image_path) on public.collectives to anon,authenticated;
grant execute on function private.collective_visible(uuid) to anon,authenticated;
grant execute on function private.professional_reader(),private.collective_can(uuid,text,boolean) to authenticated;
grant execute on function public.get_collective_members(uuid) to anon,authenticated;
grant execute on function public.create_collective(jsonb,uuid),public.edit_collective(uuid,integer,jsonb,boolean),public.review_collective(uuid,integer,text,text),
  public.save_collective_role(uuid,uuid,text,text[]),public.delete_collective_role(uuid,uuid),public.assign_collective_role(uuid,uuid,uuid),
  public.request_collective_membership(uuid,uuid,text),public.cancel_collective_request(uuid),public.decide_collective_request(uuid,boolean),public.remove_collective_member(uuid,uuid),
  public.transfer_collective_ownership(uuid,uuid),public.close_collective(uuid,text),public.support_close_collective(uuid,text),public.get_collective_status(uuid),
  public.get_collective_access(uuid),public.get_collective_member_activity(uuid),public.get_collective_requests(uuid),public.get_collective_roles(uuid),public.get_collective_review_contact(uuid),public.get_my_collective_requests(uuid),public.get_collective_review_queue(text,uuid) to authenticated;
