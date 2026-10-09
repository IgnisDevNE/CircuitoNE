-- Endurecimento do banco (revisão OWASP Top 10, achados B6, B8, B13, B14).
-- Cada função redefinida parte da sua definição mais recente; o comportamento, os grants e os ramos das flags de dev ficam como estavam.

-- ---- B8: sobras de privilégios padrão e leitura anônima de professional_details ----
-- `20260923160806_restrict_public_defaults.sql` revogou só SELECT/INSERT/UPDATE/DELETE dos defaults de tabela: TRUNCATE,
-- REFERENCES, TRIGGER (e MAINTAIN, do Postgres 17) continuaram concedidos a toda tabela futura de `public`.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated, service_role;
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated, service_role;
-- A política `professional_read` é só para `authenticated` (a RLS já devolvia 0 linhas ao anônimo); o grant era resto.
revoke all on public.professional_details from anon;

-- ---- B6: CNPJ com dígitos verificadores ----
-- Aceita o CNPJ numérico e o alfanumérico (12 caracteres + 2 dígitos verificadores): cada caractere vale o seu código ASCII
-- menos 48 (`0`-`9` valem 0-9, `A`-`Z` valem 17-42), pesos 5,4,3,2,9,8,7,6,5,4,3,2 e 6,5,4,3,2,9,8,7,6,5,4,3,2, módulo 11.
create function private.valid_cnpj(value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  digits text:=upper(regexp_replace(coalesce(value,''),'[./[:space:]-]','','g'));
  first_weights integer[]:=array[5,4,3,2,9,8,7,6,5,4,3,2];
  second_weights integer[]:=array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  total integer:=0; remainder integer; first_digit integer; second_digit integer; i integer;
begin
  if digits !~ '^[A-Z0-9]{12}[0-9]{2}$' or digits ~ '^(.)\1{13}$' then return false; end if;
  for i in 1..12 loop total:=total+(ascii(substr(digits,i,1))-48)*first_weights[i]; end loop;
  remainder:=total%11;
  first_digit:=case when remainder<2 then 0 else 11-remainder end;
  total:=0;
  for i in 1..12 loop total:=total+(ascii(substr(digits,i,1))-48)*second_weights[i]; end loop;
  total:=total+first_digit*second_weights[13];
  remainder:=total%11;
  second_digit:=case when remainder<2 then 0 else 11-remainder end;
  return substr(digits,13,2)=first_digit::text||second_digit::text;
end $$;
revoke all on function private.valid_cnpj(text) from public,anon,authenticated,service_role;

-- ---- B14: a trilha do coletivo registra o alvo (ids, nunca nomes nem CPF) ----
alter table private.collective_audit add column details jsonb not null default '{}';

-- Definição anterior: 20260926232806_collective_authorization.sql.
create or replace function public.save_collective_role(target uuid, target_role uuid, role_name text, permissions text[]) returns uuid
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
  insert into private.collective_audit(collective_id,actor_id,action,details)
    values(target,auth.uid(),'role_saved',jsonb_build_object('role_id',result,'created',target_role is null,'permissions',to_jsonb(permissions)));
  return result;
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Perfil/permissões inválidos';
end $$;

create or replace function public.delete_collective_role(target uuid, target_role uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_collective(target);
  delete from private.collective_roles where collective_id=target and id=target_role and not builtin;
  if not found then raise exception using errcode='22023',message='Perfil indisponível'; end if;
  insert into private.collective_audit(collective_id,actor_id,action,details)
    values(target,auth.uid(),'role_deleted',jsonb_build_object('role_id',target_role));
exception when foreign_key_violation then raise exception using errcode='22023',message='Reatribua os membros antes de excluir o perfil';
end $$;

-- Definição anterior: 20261008100000_collective_management.sql.
create or replace function public.assign_collective_role(target uuid, member uuid, target_role uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  c:=private.lock_collective(target);
  if not exists(select from private.collective_roles where collective_id=target and id=target_role) then raise exception using errcode='22023',message='Perfil indisponível'; end if;
  if member is not distinct from c.owner_user_id then raise exception using errcode='42501',message='Proprietário não recebe outro perfil'; end if;
  update private.collective_memberships set role_id=target_role where collective_id=target and user_id=member;
  if not found then raise exception using errcode='22023',message='Membro indisponível'; end if;
  insert into private.collective_audit(collective_id,actor_id,action,details)
    values(target,auth.uid(),'role_assigned',jsonb_build_object('member_id',member,'role_id',target_role));
end $$;

-- Definição anterior: 20260926232806_collective_authorization.sql.
create or replace function public.decide_collective_request(target_request uuid, approve boolean) returns void
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
  insert into private.collective_audit(collective_id,actor_id,action,details)
    values(target,auth.uid(),'membership_decided',jsonb_build_object('request_id',target_request,'user_id',r.user_id,'approved',approve));
end $$;

create or replace function public.remove_collective_member(target uuid, member uuid) returns void
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
  insert into private.collective_audit(collective_id,actor_id,action,details)
    values(target,auth.uid(),'member_removed',jsonb_build_object('member_id',member,'self',member=auth.uid()));
end $$;

-- ---- B6 + B14: CNPJ válido; a imagem do coletivo só entra por `set_collective_image`; nome e CNPJ alterados num coletivo aprovado ficam na trilha ----
-- Definição anterior: 20261012100000_dev_flags.sql (flag `auto_approve_collectives` preservada).
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
  if cnpj is not null and not private.valid_cnpj(cnpj) then raise exception using errcode='22023',message='CNPJ inválido'; end if;
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

-- Definição anterior: 20261008100000_collective_management.sql. `image_path` deixa de ser aceito: o app só troca a imagem por
-- `set_collective_image`, que confere o objeto no Storage (`private.verified_upload`).
create or replace function public.edit_collective(target uuid, expected_version integer, payload jsonb, resubmit boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives; new_cnpj text; old_cnpj text; changes jsonb:='{}'; renamed boolean; recnpj boolean:=false;
begin
  select * into c from public.collectives where id=target for update;
  if not found or not private.active_account(auth.uid()) or c.owner_user_id is distinct from auth.uid() or c.state not in ('pending','rejected','approved') then
    raise exception using errcode='42501',message='Operação não autorizada'; end if;
  if c.version is distinct from expected_version then raise exception using errcode='40001',message='Coletivo alterado; recarregue'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k where k not in ('name','description','activity','city','state_code','social_links','color','cnpj'))
    or resubmit is null or (resubmit and c.state not in ('pending','rejected')) then raise exception using errcode='22023',message='Edição inválida'; end if;
  if payload?'cnpj' then
    new_cnpj:=upper(regexp_replace(payload->>'cnpj','[./[:space:]-]','','g'));
    if c.kind='producer' and new_cnpj is null then raise exception using errcode='22023',message='Produtora exige CNPJ'; end if;
    if new_cnpj is not null and not private.valid_cnpj(new_cnpj) then raise exception using errcode='22023',message='CNPJ inválido'; end if;
    select d.cnpj into old_cnpj from private.collective_details d where d.collective_id=target;
    recnpj:=old_cnpj is distinct from new_cnpj;
    update private.collective_details set cnpj=new_cnpj where collective_id=target;
  end if;
  renamed:=payload->>'name' is not null and payload->>'name' is distinct from c.name;
  update public.collectives set name=coalesce(payload->>'name',name),description=coalesce(payload->>'description',description),
    activity=coalesce(payload->>'activity',activity),city=coalesce(payload->>'city',city),state_code=coalesce(payload->>'state_code',state_code),
    social_links=coalesce(payload->'social_links',social_links),color=case when payload?'color' then payload->>'color' else color end,
    state=case when resubmit then 'pending' else state end,version=version+1,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),case when resubmit then 'resubmitted' else 'edited' end);
  -- Um coletivo aprovado muda de nome ou CNPJ sem nova análise: a trilha guarda o antes e o depois.
  if c.state='approved' and (renamed or recnpj) then
    if renamed then changes:=changes||jsonb_build_object('name',jsonb_build_object('from',c.name,'to',payload->>'name')); end if;
    if recnpj then changes:=changes||jsonb_build_object('cnpj',jsonb_build_object('from',old_cnpj,'to',new_cnpj)); end if;
    insert into private.collective_audit(collective_id,actor_id,action,details) values(target,auth.uid(),'identity_changed',changes);
  end if;
exception when integrity_constraint_violation then raise exception using errcode='22023',message='Dados de coletivo inválidos';
end $$;

-- CNPJ do perfil profissional. Definição anterior: 20261007100000_account_editing.sql.
create or replace function public.update_my_professional_details(target uuid, payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owned_kind text;
  new_cnpj text;
begin
  perform 1 from private.account_details where user_id=actor for no key update;
  if not private.active_account(actor) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  select kind into owned_kind from public.profiles where id=target and owner_id=actor for update;
  if not found then raise exception using errcode='42501',message='Atuação indisponível'; end if;
  if owned_kind='member' then raise exception using errcode='22023',message='Esta atuação não tem dados profissionais'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k
    where k not in ('booking_email','contact_email','contact_phone','fee_cents','cnpj','service_type','service_other',
      'audiovisual_type','presskit_url','portfolio_url'))
    or ((payload->'fee_cents') is not null and jsonb_typeof(payload->'fee_cents') not in ('number','null')) then
    raise exception using errcode='22023',message='Dados profissionais inválidos';
  end if;
  if (payload->'cnpj') is not null then
    new_cnpj:=nullif(upper(btrim(payload->>'cnpj')),'');
    if new_cnpj is not null and not private.valid_cnpj(new_cnpj) then raise exception using errcode='22023',message='Dados profissionais inválidos'; end if;
  end if;
  update public.professional_details set
    booking_email=case when (payload->'booking_email') is not null then nullif(btrim(payload->>'booking_email'),'') else booking_email end,
    contact_email=case when (payload->'contact_email') is not null then nullif(btrim(payload->>'contact_email'),'') else contact_email end,
    contact_phone=case when (payload->'contact_phone') is not null then nullif(btrim(payload->>'contact_phone'),'') else contact_phone end,
    fee_cents=case when (payload->'fee_cents') is not null then (payload->>'fee_cents')::bigint else fee_cents end,
    cnpj=case when (payload->'cnpj') is not null then new_cnpj else cnpj end,
    service_type=case when (payload->'service_type') is not null then nullif(btrim(payload->>'service_type'),'') else service_type end,
    service_other=case when (payload->'service_other') is not null then nullif(btrim(payload->>'service_other'),'') else service_other end,
    audiovisual_type=case when (payload->'audiovisual_type') is not null then nullif(btrim(payload->>'audiovisual_type'),'') else audiovisual_type end,
    presskit_url=case when (payload->'presskit_url') is not null then nullif(btrim(payload->>'presskit_url'),'') else presskit_url end,
    portfolio_url=case when (payload->'portfolio_url') is not null then nullif(btrim(payload->>'portfolio_url'),'') else portfolio_url end,
    updated_at=now()
  where profile_id=target;
  if not found then raise exception using errcode='22023',message='Dados profissionais ausentes'; end if;
exception when integrity_constraint_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='Dados profissionais inválidos';
end $$;

-- ---- B6: a capa do evento é conferida no Storage (como `attach_profile_image`) ----
-- Definição anterior: 20261010100000_event_style.sql. Uma capa nova só vale se o objeto existe em `public-images`, foi enviado por
-- quem edita e tem tipo e tamanho aceitos; `cover_bytes` vem do objeto, não do payload.
create or replace function public.update_event(target uuid, expected_version integer, payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare original public.events; incoming public.events; rescheduled boolean; upload record;
begin
  original:=private.lock_event(target,'edit_events');
  if original.state='published' and not private.collective_can(original.collective_id,'publish_events') then raise exception using errcode='42501',message='Edição pública exige publicar'; end if;
  if original.version is distinct from expected_version then raise exception using errcode='40001',message='Evento alterado; recarregue'; end if;
  if original.state='cancelled' then raise exception using errcode='22023',message='Evento cancelado não aceita edição'; end if;
  incoming:=private.event_payload(original,payload);
  if incoming.cover_path is not null and incoming.cover_path is distinct from original.cover_path then
    select * into upload from private.verified_upload('public-images',incoming.cover_path,auth.uid(),5000000,array['image/jpeg','image/png','image/webp']);
    incoming.cover_bytes:=upload.size_bytes;
  end if;
  rescheduled:=original.state='published' and (original.starts_at is distinct from incoming.starts_at or original.ends_at is distinct from incoming.ends_at);
  update public.events set name=incoming.name,kind=incoming.kind,other_kind=incoming.other_kind,description=incoming.description,
    starts_at=incoming.starts_at,ends_at=incoming.ends_at,city=incoming.city,state_code=incoming.state_code,venue=incoming.venue,
    is_free=incoming.is_free,ticket_url=incoming.ticket_url,cover_url=incoming.cover_url,cover_path=incoming.cover_path,cover_bytes=incoming.cover_bytes,
    style=incoming.style,
    rescheduled_at=case when rescheduled then now() else rescheduled_at end,previous_starts_at=case when rescheduled then original.starts_at else previous_starts_at end,
    version=version+1,updated_at=now() where id=target;
  if payload?'lineup' then perform private.replace_event_lineup(target,payload->'lineup'); end if;
  insert into private.event_audit(event_id,actor_id,action,version) values(target,auth.uid(),case when rescheduled then 'rescheduled' else 'edited' end,original.version+1);
exception when integrity_constraint_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='Dados de evento/lineup inválidos';
end $$;

-- ---- B13: recadastro na janela da exclusão e leitura das conversas ----
-- Definição anterior: 20260926213828_identity_profiles.sql. Entre o pedido de exclusão (que apaga `account_details`) e a
-- remoção da conta no Auth, a identidade ainda existe: sem este bloqueio ela poderia se cadastrar de novo.
create or replace function public.complete_registration(account jsonb, profile jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); identity auth.users; existing private.account_details; result uuid; normalized_cpf text; fingerprint text;
begin
  -- Trava a identidade gerenciada por Auth antes de verificar idempotência/CPF.
  select * into identity from auth.users where id=actor for update;
  if not found or identity.email_confirmed_at is null or identity.phone_confirmed_at is null
    or identity.email is null or identity.phone is null or identity.phone !~ '^[1-9][0-9]{7,14}$'
    or identity.deleted_at is not null or coalesce(identity.banned_until > now(),false) then
    raise exception using errcode='42501', message='Identidade confirmada necessária';
  end if;
  if exists(select from private.account_deletions where user_id=actor) then
    raise exception using errcode='42501', message='Conta indisponível';
  end if;
  if request_id is null or jsonb_typeof(account) is distinct from 'object' or jsonb_typeof(profile) is distinct from 'object'
    or exists(select from jsonb_object_keys(account) key where key not in ('name','cpf','birth_date','gender','city','state_code','phone_is_whatsapp','whatsapp_number'))
    or coalesce(account->>'cpf','') !~ '^[0-9.[:space:]-]+$' then
    raise exception using errcode='22023', message='Dados de cadastro inválidos';
  end if;
  normalized_cpf := regexp_replace(account->>'cpf','[^0-9]','','g');
  fingerprint := encode(sha256(convert_to(jsonb_build_array(account,profile)::text,'UTF8')),'hex');
  select * into existing from private.account_details where user_id=actor;
  if found then
    if existing.state <> 'active' then raise exception using errcode='42501', message='Conta indisponível'; end if;
    if existing.registration_request_id=request_id and existing.registration_hash=fingerprint and existing.first_profile_id is not null then
      return existing.first_profile_id;
    end if;
    raise exception using errcode='22023', message='Cadastro já concluído com outra solicitação';
  end if;
  insert into private.account_details(user_id,name,cpf,birth_date,gender,city,state_code,phone_is_whatsapp,whatsapp_number,registration_request_id,registration_hash)
    values(actor,account->>'name',normalized_cpf,(account->>'birth_date')::date,account->>'gender',account->>'city',account->>'state_code',
      (account->>'phone_is_whatsapp')::boolean,account->>'whatsapp_number',request_id,fingerprint);
  result := private.insert_profile(actor,profile);
  update private.account_details set first_profile_id=result where user_id=actor;
  return result;
exception when integrity_constraint_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  -- Não expõe constraint, CPF, telefone nem titular de outra conta.
  raise exception using errcode='22023', message='Não foi possível concluir o cadastro com estes dados';
end $$;

-- Definição anterior: 20260927003957_messaging_lifecycle.sql. Mesmo resultado, ordem e cursor; em vez de avaliar
-- `conversation_read` em todas as conversas do sistema, parte das identidades de quem chama (atuações próprias e coletivos
-- em que a conta é membro, os únicos que `message_identity_can(...,'read')` pode aceitar) e só então aplica a regra exata.
create or replace function public.list_conversations(after_time timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare mine uuid[];
begin
  if ((after_time is null)<>(after_id is null)) or (after_time is not null and not isfinite(after_time)) then raise exception using errcode='22023',message='Cursor inválido'; end if;
  select coalesce(array_agg(i.id),'{}') into mine from private.message_identities i
    where (i.kind='profile' and i.owner_user_id=auth.uid())
      or (i.kind='collective' and exists(select from private.collective_memberships m where m.collective_id=i.collective_id and m.user_id=auth.uid()));
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select c.id,c.updated_at,private.message_identity_label(c.side_a) side_a,private.message_identity_label(c.side_b) side_b,
      exists(select from private.conversation_blocks b where b.conversation_id=c.id) blocked,
      not (private.message_endpoint_active(c.side_a) and private.message_endpoint_active(c.side_b)) archived,
      (select count(*) from private.messages m left join private.conversation_reads r on r.user_id=auth.uid() and r.conversation_id=c.id
        left join private.messages last_read on last_read.id=r.message_id
        where m.conversation_id=c.id and m.author_user_id is distinct from auth.uid() and (last_read.id is null or (m.created_at,m.id)>(last_read.created_at,last_read.id))) unread_count
    from private.conversations c where (c.side_a=any(mine) or c.side_b=any(mine)) and private.conversation_read(c.id)
      and (after_time is null or (c.updated_at,c.id)<(after_time,after_id))
    order by c.updated_at desc,c.id desc limit 50
  ) page),'[]');
end $$;
