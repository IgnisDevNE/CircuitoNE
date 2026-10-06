-- W10: leitura de mensagens para a interface.
-- `get_messages` só pagina para frente (as 50 mais antigas): uma conversa longa nunca mostraria o fim.
-- `get_recent_messages` devolve a página mais recente (ou a anterior a um cursor), em ordem cronológica.
-- `get_conversation_details` completa as linhas de `list_conversations` com a última mensagem e quem bloqueou:
-- só o lado que criou um bloqueio o remove, então a tela precisa saber quem foi.
-- Mesmas regras de leitura de `get_messages`: só conversas que o titular pode ler (`private.conversation_read`).
create function public.get_recent_messages(target uuid,before_time timestamptz default null,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if ((before_time is null)<>(before_id is null)) or (before_time is not null and not isfinite(before_time)) then raise exception using errcode='22023',message='Cursor inválido'; end if;
  if not private.conversation_read(target) then return '[]'; end if;
  return coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at,page.id) from (
    select m.id,m.body,m.created_at,l.label->>'kind' sender_kind,l.label->>'id' sender_id,l.label->>'name' sender_name
    from private.messages m cross join lateral (select private.message_identity_label(m.sender_identity_id) label) l
    where m.conversation_id=target and (before_time is null or (m.created_at,m.id)<(before_time,before_id)) order by m.created_at desc,m.id desc limit 50
  ) page),'[]');
end $$;
create function public.get_conversation_details(targets uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if targets is null or cardinality(targets)>50 then raise exception using errcode='22023',message='Conversas inválidas'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'conversation_id',c.id,
      'last_message',(select jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at,
          'sender_kind',l.label->>'kind','sender_id',l.label->>'id','sender_name',l.label->>'name')
        from private.messages m cross join lateral (select private.message_identity_label(m.sender_identity_id) label) l
        where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1),
      'blocked_by',coalesce((select jsonb_agg(private.message_identity_label(b.identity_id) order by b.created_at,b.identity_id)
        from private.conversation_blocks b where b.conversation_id=c.id),'[]'::jsonb)
    ) order by c.updated_at desc,c.id desc)
    from private.conversations c where c.id=any(targets) and private.conversation_read(c.id)),'[]');
end $$;

revoke all on function public.get_recent_messages(uuid,timestamptz,uuid),public.get_conversation_details(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_recent_messages(uuid,timestamptz,uuid),public.get_conversation_details(uuid[]) to authenticated;
