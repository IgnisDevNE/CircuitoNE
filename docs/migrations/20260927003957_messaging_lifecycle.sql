-- #119. Representações pertencem a uma atuação ou coletivo, nunca a metadados do JWT.
create table private.message_identities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('profile','collective')),
  profile_id uuid unique references public.profiles(id) on delete set null,
  owner_user_id uuid references private.account_details(user_id) on delete set null,
  collective_id uuid unique references public.collectives(id) on delete set null,
  check ((kind='profile' and collective_id is null) or (kind='collective' and profile_id is null and owner_user_id is null))
);
create index message_identity_owner on private.message_identities(owner_user_id) where owner_user_id is not null;
create table private.conversations (
  id uuid primary key default gen_random_uuid(),
  side_a uuid not null references private.message_identities(id),
  side_b uuid not null references private.message_identities(id),
  created_by uuid references private.account_details(user_id) on delete set null,
  initiated_as uuid references private.message_identities(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check(side_a<side_b), unique(side_a,side_b)
);
create index conversations_side_b on private.conversations(side_b,updated_at,id);
create index conversations_author_time on private.conversations(created_by,created_at);
create index conversations_identity_time on private.conversations(initiated_as,created_at);
create table private.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.conversations(id),
  sender_identity_id uuid not null references private.message_identities(id),
  author_user_id uuid references private.account_details(user_id) on delete set null,
  body text not null check(length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,id)
);
create index messages_cursor on private.messages(conversation_id,created_at,id);
create index messages_author_time on private.messages(author_user_id,created_at);
create index messages_identity_time on private.messages(sender_identity_id,created_at);
create table private.message_requests (
  user_id uuid not null references private.account_details(user_id) on delete cascade,
  request_id uuid not null,
  fingerprint text not null,
  message_id uuid not null references private.messages(id),
  primary key(user_id,request_id)
);
create table private.conversation_reads (
  user_id uuid not null references private.account_details(user_id) on delete cascade,
  conversation_id uuid not null references private.conversations(id),
  message_id uuid not null,
  primary key(user_id,conversation_id),
  foreign key(conversation_id,message_id) references private.messages(conversation_id,id)
);
create index conversation_reads_message on private.conversation_reads(conversation_id,message_id);
create table private.conversation_blocks (
  conversation_id uuid not null references private.conversations(id),
  identity_id uuid not null references private.message_identities(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key(conversation_id,identity_id)
);

create function private.message_identity(kind text,target uuid) returns uuid
language plpgsql set search_path='' as $$
declare result uuid;
begin
  if kind='profile' then
    insert into private.message_identities(kind,profile_id,owner_user_id)
      select 'profile',id,owner_id from public.profiles where id=target and private.active_account(owner_id)
      on conflict(profile_id) do nothing;
    select id into result from private.message_identities where profile_id=target;
  elsif kind='collective' then
    insert into private.message_identities(kind,collective_id)
      select 'collective',id from public.collectives where id=target and state='approved' on conflict(collective_id) do nothing;
    select id into result from private.message_identities where collective_id=target;
  else raise exception using errcode='22023',message='Representação inválida'; end if;
  if result is null then raise exception using errcode='42501',message='Interlocutor indisponível'; end if;
  return result;
end $$;
create function private.message_endpoint_active(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from private.message_identities i where i.id=target and (
    (i.kind='profile' and i.profile_id is not null and private.active_account(i.owner_user_id)) or
    (i.kind='collective' and exists(select from public.collectives c where c.id=i.collective_id and c.state='approved'))))
$$;
create function private.message_identity_can(target uuid,operation text) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_account(auth.uid()) and exists(select from private.message_identities i where i.id=target and (
    (i.kind='profile' and i.owner_user_id=auth.uid() and (operation='read' or i.profile_id is not null)) or
    (i.kind='collective' and case operation when 'read' then private.collective_can(i.collective_id,'read_messages',true)
      when 'send' then private.collective_can(i.collective_id,'send_messages')
      when 'block' then private.collective_can(i.collective_id,'read_messages') or private.collective_can(i.collective_id,'send_messages') else false end)))
$$;
create function private.conversation_read(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from private.conversations c where c.id=target and (private.message_identity_can(c.side_a,'read') or private.message_identity_can(c.side_b,'read')))
$$;
create function private.message_identity_label(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('kind',i.kind,'id',case when i.kind='profile' then p.id else c.id end,'name',
    case when i.kind='profile' then coalesce(p.name,case when a.state='deletion_pending' then 'Conta indisponível' when i.owner_user_id is null then 'Conta excluída' else 'Atuação excluída' end)
      else coalesce(c.name,'Coletivo excluído') end)
  from private.message_identities i left join private.account_details a on a.user_id=i.owner_user_id
    left join public.profiles p on p.id=i.profile_id and a.state<>'deletion_pending'
    left join public.collectives c on c.id=i.collective_id where i.id=target
$$;
create function private.lock_message_context(sender_kind text,sender uuid,recipient_kind text,recipient uuid) returns void
language plpgsql set search_path='' as $$
begin
  -- NO KEY UPDATE serializa quotas/estado, sem conflitar com KEY SHARE das FKs de auditoria.
  perform 1 from private.account_details a where a.user_id=auth.uid() or a.user_id in (
    select owner_id from public.profiles where (sender_kind='profile' and id=sender) or (recipient_kind='profile' and id=recipient))
    order by a.user_id for no key update;
  perform 1 from public.profiles where (sender_kind='profile' and id=sender) or (recipient_kind='profile' and id=recipient)
    order by id for share;
  perform 1 from public.collectives where (sender_kind='collective' and id=sender) or (recipient_kind='collective' and id=recipient)
    order by id for update;
  if not private.verified_account(auth.uid()) then raise exception using errcode='42501',message='Conta confirmada necessária'; end if;
end $$;

create function public.send_message(sender_kind text,sender uuid,recipient_kind text,recipient uuid,body text,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare from_id uuid; to_id uuid; convo uuid; message uuid; fingerprint text; prior private.message_requests; instant timestamptz; day_start timestamptz;
begin
  if request_id is null or body is null or length(btrim(body)) not between 1 and 2000 then raise exception using errcode='22023',message='Mensagem inválida'; end if;
  perform private.lock_message_context(sender_kind,sender,recipient_kind,recipient);
  from_id:=private.message_identity(sender_kind,sender); to_id:=private.message_identity(recipient_kind,recipient);
  if from_id=to_id then raise exception using errcode='22023',message='Escolha outro interlocutor'; end if;
  if not private.message_identity_can(from_id,'send') or not private.message_endpoint_active(from_id) or not private.message_endpoint_active(to_id) then
    raise exception using errcode='42501',message='Envio não autorizado'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(sender_kind,sender,recipient_kind,recipient,body)::text,'UTF8')),'hex');
  select * into prior from private.message_requests r where r.user_id=auth.uid() and r.request_id=send_message.request_id;
  if found then
    if prior.fingerprint<>fingerprint then raise exception using errcode='22023',message='Solicitação reutilizada com outros dados'; end if;
    select conversation_id into convo from private.messages where id=prior.message_id;
    return jsonb_build_object('conversation_id',convo,'message_id',prior.message_id);
  end if;
  instant:=clock_timestamp(); day_start:=date_trunc('day',instant at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
  if (select count(*) from private.messages where author_user_id=auth.uid() and created_at>instant-interval '1 minute')>=10
    or (sender_kind='collective' and (select count(*) from private.messages where sender_identity_id=from_id and created_at>instant-interval '1 minute')>=10) then
    raise exception using errcode='54000',message='Limite de mensagens por minuto'; end if;
  select id into convo from private.conversations where side_a=least(from_id,to_id) and side_b=greatest(from_id,to_id) for update;
  if not found then
    if (select count(*) from private.conversations where created_by=auth.uid() and created_at>=day_start)>=20
      or (sender_kind='collective' and (select count(*) from private.conversations where initiated_as=from_id and created_at>=day_start)>=20) then
      raise exception using errcode='54000',message='Limite de conversas por dia'; end if;
    insert into private.conversations(side_a,side_b,created_by,initiated_as) values(least(from_id,to_id),greatest(from_id,to_id),auth.uid(),from_id) returning id into convo;
  end if;
  if exists(select from private.conversation_blocks where conversation_id=convo) then raise exception using errcode='42501',message='Conversa bloqueada'; end if;
  insert into private.messages(conversation_id,sender_identity_id,author_user_id,body) values(convo,from_id,auth.uid(),body) returning id into message;
  insert into private.message_requests values(auth.uid(),request_id,fingerprint,message);
  update private.conversations set updated_at=clock_timestamp() where id=convo;
  return jsonb_build_object('conversation_id',convo,'message_id',message);
end $$;
create function public.get_messages(target uuid,after_time timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if ((after_time is null)<>(after_id is null)) or (after_time is not null and not isfinite(after_time)) then raise exception using errcode='22023',message='Cursor inválido'; end if;
  if not private.conversation_read(target) then return '[]'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select m.id,m.body,m.created_at,l.label->>'kind' sender_kind,l.label->>'id' sender_id,l.label->>'name' sender_name
    from private.messages m cross join lateral (select private.message_identity_label(m.sender_identity_id) label) l
    where m.conversation_id=target and (after_time is null or (m.created_at,m.id)>(after_time,after_id)) order by m.created_at,m.id limit 50
  ) page),'[]');
end $$;
create function public.list_conversations(after_time timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if ((after_time is null)<>(after_id is null)) or (after_time is not null and not isfinite(after_time)) then raise exception using errcode='22023',message='Cursor inválido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page)) from (
    select c.id,c.updated_at,private.message_identity_label(c.side_a) side_a,private.message_identity_label(c.side_b) side_b,
      exists(select from private.conversation_blocks b where b.conversation_id=c.id) blocked,
      not (private.message_endpoint_active(c.side_a) and private.message_endpoint_active(c.side_b)) archived,
      (select count(*) from private.messages m left join private.conversation_reads r on r.user_id=auth.uid() and r.conversation_id=c.id
        left join private.messages last_read on last_read.id=r.message_id
        where m.conversation_id=c.id and m.author_user_id is distinct from auth.uid() and (last_read.id is null or (m.created_at,m.id)>(last_read.created_at,last_read.id))) unread_count
    from private.conversations c where private.conversation_read(c.id) and (after_time is null or (c.updated_at,c.id)<(after_time,after_id))
    order by c.updated_at desc,c.id desc limit 50
  ) page),'[]');
end $$;
create function public.mark_conversation_read(target uuid,last_message uuid) returns void
language plpgsql security definer set search_path='' as $$
declare incoming private.messages;
begin
  if not private.conversation_read(target) then raise exception using errcode='42501',message='Leitura não autorizada'; end if;
  select * into incoming from private.messages where id=last_message and conversation_id=target;
  if not found then raise exception using errcode='22023',message='Mensagem indisponível'; end if;
  insert into private.conversation_reads values(auth.uid(),target,last_message)
    on conflict(user_id,conversation_id) do update set message_id=excluded.message_id
    where exists(select from private.messages previous where previous.id=conversation_reads.message_id and (previous.created_at,previous.id)<(incoming.created_at,incoming.id));
end $$;
create function public.set_conversation_block(target uuid,as_kind text,as_id uuid,blocked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare identity uuid; c private.conversations;
begin
  if blocked is null then raise exception using errcode='22023',message='Estado necessário'; end if;
  perform private.lock_message_context(as_kind,as_id,null,null);
  identity:=private.message_identity(as_kind,as_id);
  select * into c from private.conversations where id=target for update;
  if not found or identity not in(c.side_a,c.side_b) or not private.message_identity_can(identity,'block') then
    raise exception using errcode='42501',message='Bloqueio não autorizado'; end if;
  if blocked then insert into private.conversation_blocks values(target,identity,clock_timestamp()) on conflict do nothing;
  else delete from private.conversation_blocks where conversation_id=target and identity_id=identity; end if;
end $$;

alter table private.message_identities enable row level security;
alter table private.conversations enable row level security;
alter table private.messages enable row level security;
alter table private.message_requests enable row level security;
alter table private.conversation_reads enable row level security;
alter table private.conversation_blocks enable row level security;
revoke all on private.message_identities,private.conversations,private.messages,private.message_requests,private.conversation_reads,private.conversation_blocks from public,anon,authenticated,service_role;
revoke all on function private.message_identity(text,uuid),private.message_endpoint_active(uuid),private.message_identity_can(uuid,text),private.conversation_read(uuid),
  private.message_identity_label(uuid),private.lock_message_context(text,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_message(text,uuid,text,uuid,text,uuid),public.get_messages(uuid,timestamptz,uuid),public.list_conversations(timestamptz,uuid),
  public.mark_conversation_read(uuid,uuid),public.set_conversation_block(uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.send_message(text,uuid,text,uuid,text,uuid),public.get_messages(uuid,timestamptz,uuid),public.list_conversations(timestamptz,uuid),
  public.mark_conversation_read(uuid,uuid),public.set_conversation_block(uuid,text,uuid,boolean) to authenticated;

-- Denúncias têm cópia mínima e responsável designado, sem conceder acesso à conversa.
create table private.message_reports (
  id uuid primary key default gen_random_uuid(),
  source_message_id uuid references private.messages(id) on delete set null,
  reporter_user_id uuid references private.account_details(user_id) on delete set null,
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  assigned_to uuid references private.account_details(user_id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz check(closed_at is null or isfinite(closed_at)),
  resolution text check(length(btrim(resolution)) between 1 and 2000),
  check((closed_at is null)=(resolution is null)),
  unique(reporter_user_id,source_message_id)
);
create index reports_queue on private.message_reports(created_at,id) where closed_at is null;
create index reports_assignee on private.message_reports(assigned_to) where assigned_to is not null;
create index reports_source on private.message_reports(source_message_id);
create index reports_expiry on private.message_reports(closed_at) where closed_at is not null;
create table private.report_context (
  report_id uuid not null references private.message_reports(id) on delete cascade,
  ordinal smallint not null check(ordinal between 1 and 5),
  selected boolean not null,
  body text not null check(length(body) between 1 and 2000),
  sent_at timestamptz not null,
  author_user_id uuid references private.account_details(user_id) on delete set null,
  primary key(report_id,ordinal)
);
create index report_context_author on private.report_context(author_user_id) where author_user_id is not null;
create unique index report_selected on private.report_context(report_id) where selected;
-- Fila de exclusão não é concedida à Data API. O executor usa Storage API + Auth Admin.
-- A tarefa contém apenas identificadores necessários ao retry e desaparece ao concluir.
create table private.storage_cleanup (
  profile_id uuid primary key,
  owner_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index storage_cleanup_owner on private.storage_cleanup(owner_user_id);
create function private.queue_profile_cleanup() returns trigger language plpgsql set search_path='' as $$
begin
  insert into private.storage_cleanup(profile_id,owner_user_id) values(old.id,old.owner_id) on conflict do nothing;
  return old;
end $$;
create trigger profile_cleanup before delete on public.profiles for each row execute function private.queue_profile_cleanup();
create function public.delete_profile(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.account_details where user_id=auth.uid() for no key update;
  if not private.active_account(auth.uid()) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  delete from public.profiles where id=target and owner_id=auth.uid();
  if not found then raise exception using errcode='42501',message='Atuação indisponível'; end if;
end $$;
create table private.account_deletions (
  user_id uuid primary key,
  requested_at timestamptz not null default clock_timestamp(),
  identity_due_at timestamptz not null,
  prepared_at timestamptz,
  profile_ids uuid[] not null default '{}',
  storage_done boolean not null default false,
  check(isfinite(identity_due_at) and identity_due_at>=requested_at and identity_due_at<=requested_at+interval '30 days')
);
create index account_deletions_due on private.account_deletions(identity_due_at) where prepared_at is null;
create table private.moderation_audit (
  id bigint generated always as identity primary key,
  report_id uuid not null references private.message_reports(id) on delete cascade,
  actor_id uuid references private.account_details(user_id) on delete set null,
  action text not null check(action in ('reported','claimed','closed')),
  created_at timestamptz not null default clock_timestamp()
);
create index moderation_audit_report on private.moderation_audit(report_id,id);
create index moderation_audit_actor on private.moderation_audit(actor_id) where actor_id is not null;

create function private.lock_lifecycle() returns void language sql set search_path='' as $$
  -- ponytail: serializa somente denúncia/expurgo, operações raras; particionar por caso se houver contenção medida.
  select pg_advisory_xact_lock(119,1)
$$;
create function public.report_message(target uuid,reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare m private.messages; result uuid;
begin
  perform private.lock_lifecycle();
  if reason is null or length(btrim(reason)) not between 1 and 2000 then raise exception using errcode='22023',message='Motivo necessário'; end if;
  select * into m from private.messages where id=target;
  if not found or not private.conversation_read(m.conversation_id) then raise exception using errcode='42501',message='Denúncia não autorizada'; end if;
  select id into result from private.message_reports r where r.source_message_id=target and r.reporter_user_id=auth.uid();
  if found then return result; end if;
  insert into private.message_reports(source_message_id,reporter_user_id,reason) values(target,auth.uid(),reason) returning id into result;
  with context as (
    (select * from private.messages where conversation_id=m.conversation_id and (created_at,id)<(m.created_at,m.id) order by created_at desc,id desc limit 2)
    union all select m.*
    union all (select * from private.messages where conversation_id=m.conversation_id and (created_at,id)>(m.created_at,m.id) order by created_at,id limit 2)
  ) insert into private.report_context(report_id,ordinal,selected,body,sent_at,author_user_id)
    select result,row_number() over(order by created_at,id),id=target,body,created_at,author_user_id from context;
  insert into private.moderation_audit(report_id,actor_id,action) values(result,auth.uid(),'reported');
  return result;
end $$;
create function public.list_message_reports(after_time timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  if ((after_time is null)<>(after_id is null)) or (after_time is not null and not isfinite(after_time)) then raise exception using errcode='22023',message='Cursor inválido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q)) from (
    select id,created_at,assigned_to=auth.uid() assigned_to_me from private.message_reports where closed_at is null
      and (assigned_to is null or assigned_to=auth.uid()) and (after_time is null or (created_at,id)>(after_time,after_id)) order by created_at,id limit 50) q),'[]');
end $$;
create function public.claim_message_report(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_lifecycle();
  if not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  update private.message_reports set assigned_to=auth.uid() where id=target and closed_at is null and (assigned_to is null or assigned_to=auth.uid());
  if not found then raise exception using errcode='42501',message='Caso indisponível'; end if;
  insert into private.moderation_audit(report_id,actor_id,action) values(target,auth.uid(),'claimed');
end $$;
create function public.get_message_report(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.message_reports;
begin
  if not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  select * into r from private.message_reports where id=target and assigned_to=auth.uid() and (closed_at is null or closed_at>now()-interval '90 days');
  if not found then raise exception using errcode='42501',message='Caso indisponível'; end if;
  return jsonb_build_object('id',r.id,'reason',r.reason,'closed_at',r.closed_at,'resolution',r.resolution,'context',
    coalesce((select jsonb_agg(jsonb_build_object('selected',c.selected,'body',c.body,'sent_at',c.sent_at,'author_user_id',
      case when not exists(select from private.account_deletions d where d.user_id=c.author_user_id and (d.identity_due_at<=now() or r.closed_at is not null)) then c.author_user_id end) order by c.ordinal)
      from private.report_context c where report_id=r.id),'[]'));
end $$;
create function private.prepare_account_deletions(target uuid default null) returns void language plpgsql set search_path='' as $$
declare d private.account_deletions;
begin
  perform private.lock_lifecycle();
  for d in select * from private.account_deletions where prepared_at is null and (target is null or user_id=target) order by user_id for update loop
    if d.identity_due_at>clock_timestamp() and exists(select from private.message_reports r where r.closed_at is null and
      (r.reporter_user_id=d.user_id or exists(select from private.report_context c where c.report_id=r.id and c.author_user_id=d.user_id))) then continue; end if;
    perform 1 from private.account_details where user_id=d.user_id for no key update;
    if exists(select from public.collectives where owner_user_id=d.user_id and state<>'closed') then
      raise exception using errcode='55000',message='Proprietário requer transferência ou encerramento'; end if;
    update private.account_deletions set profile_ids=array(select id from public.profiles where owner_id=d.user_id order by id),prepared_at=clock_timestamp() where user_id=d.user_id;
    -- A fonte não é entregue à administração; elimina até esse vínculo interno quando o autor sai.
    update private.message_reports set source_message_id=null where source_message_id in(select id from private.messages where author_user_id=d.user_id);
    delete from auth.sessions where user_id=d.user_id;
    delete from private.account_details where user_id=d.user_id;
  end loop;
  delete from private.message_reports where closed_at<=clock_timestamp()-interval '90 days';
end $$;
create function public.close_message_report(target uuid,resolution text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_lifecycle();
  if not private.site_admin() then raise exception using errcode='42501',message='Administração com MFA necessária'; end if;
  if resolution is null or length(btrim(resolution)) not between 1 and 2000 then raise exception using errcode='22023',message='Conclusão necessária'; end if;
  update private.message_reports set closed_at=clock_timestamp(),resolution=close_message_report.resolution where id=target and assigned_to=auth.uid() and closed_at is null;
  if not found then raise exception using errcode='42501',message='Caso indisponível'; end if;
  update private.report_context set author_user_id=null where report_id=target;
  update private.message_reports set source_message_id=null,reporter_user_id=null where id=target;
  insert into private.moderation_audit(report_id,actor_id,action) values(target,auth.uid(),'closed');
  perform private.prepare_account_deletions();
end $$;
create function public.request_account_deletion() returns void
language plpgsql security definer set search_path='' as $$
declare instant timestamptz:=clock_timestamp();
begin
  perform private.lock_lifecycle();
  perform 1 from private.account_details where user_id=auth.uid() for no key update;
  if not found then
    if exists(select from private.account_deletions where user_id=auth.uid()) then return; end if;
    raise exception using errcode='42501',message='Conta indisponível';
  end if;
  if exists(select from public.collectives where owner_user_id=auth.uid() and state<>'closed') then
    raise exception using errcode='55000',message='Transfira a propriedade ou solicite encerramento ao suporte'; end if;
  insert into private.account_deletions(user_id,requested_at,identity_due_at)
    values(auth.uid(),instant,instant+case when exists(select from private.message_reports r where r.closed_at is null and
      (r.reporter_user_id=auth.uid() or exists(select from private.report_context c where c.report_id=r.id and c.author_user_id=auth.uid()))) then interval '30 days' else interval '0' end)
    on conflict(user_id) do nothing;
  update private.account_details set state='deletion_pending',state_reason='Exclusão solicitada',updated_at=instant where user_id=auth.uid();
  perform private.prepare_account_deletions(auth.uid());
end $$;
create function public.get_account_deletion_status() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('state',case when prepared_at is null then 'waiting_review' else 'external_cleanup' end,'requested_at',requested_at,'identity_due_at',identity_due_at)
    from private.account_deletions where user_id=auth.uid()
$$;
create function private.finish_account_deletion(target uuid) returns void language plpgsql set search_path='' as $$
begin
  perform private.lock_lifecycle();
  if not exists(select from private.account_deletions where user_id=target and prepared_at is not null and storage_done)
    or exists(select from private.storage_cleanup where owner_user_id=target) or exists(select from auth.users where id=target) then raise exception using errcode='55000',message='Limpeza externa não confirmada'; end if;
  delete from private.account_deletions where user_id=target;
end $$;

create or replace function public.create_profile(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.account_details where user_id=auth.uid() for share;
  if not private.active_account(auth.uid()) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  return private.insert_profile(auth.uid(),payload);
end $$;
create or replace function public.transfer_collective_ownership(target uuid,successor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.collectives;
begin
  perform 1 from private.account_details where user_id in(auth.uid(),successor) order by user_id for share;
  c:=private.lock_collective(target);
  if successor is null or successor=c.owner_user_id or not private.current_mfa() or not private.verified_account(successor)
    or not exists(select from auth.mfa_factors where user_id=successor and status='verified')
    or not exists(select from private.collective_memberships where collective_id=target and user_id=successor) then
    raise exception using errcode='42501',message='Transferência exige proprietário com MFA e sucessor elegível'; end if;
  update private.collective_memberships set role_id=c.member_role_id where collective_id=target and user_id=c.owner_user_id;
  update public.collectives set owner_user_id=successor,version=version+1,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,auth.uid(),'ownership_transferred');
end $$;
alter table private.message_reports enable row level security;
alter table private.report_context enable row level security;
alter table private.account_deletions enable row level security;
alter table private.moderation_audit enable row level security;
revoke all on private.message_reports,private.report_context,private.account_deletions,private.moderation_audit from public,anon,authenticated,service_role;
revoke all on sequence private.moderation_audit_id_seq from public,anon,authenticated,service_role;
revoke all on function private.lock_lifecycle(),private.prepare_account_deletions(uuid),private.finish_account_deletion(uuid),public.report_message(uuid,text),
  public.list_message_reports(timestamptz,uuid),public.claim_message_report(uuid),public.get_message_report(uuid),public.close_message_report(uuid,text),
  public.request_account_deletion(),public.get_account_deletion_status() from public,anon,authenticated,service_role;
grant execute on function public.report_message(uuid,text),public.list_message_reports(timestamptz,uuid),public.claim_message_report(uuid),public.get_message_report(uuid),
  public.close_message_report(uuid,text),public.request_account_deletion(),public.get_account_deletion_status() to authenticated;

alter table private.storage_cleanup enable row level security;
revoke all on private.storage_cleanup from public,anon,authenticated,service_role;
revoke all on function private.queue_profile_cleanup(),public.delete_profile(uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_profile(uuid) to authenticated;