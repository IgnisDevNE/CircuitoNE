-- W6: edição da própria conta e das próprias atuações. Somente o titular de conta ativa; nunca dados de terceiros.
-- CPF, nascimento, e-mail e confirmações de contato não são editáveis por estas funções (RN-33): chaves desconhecidas
-- no payload são recusadas, e toda violação de constraint vira um erro 22023 com mensagem própria (sem expor constraint).

-- Projeção da conta do titular. O CPF sai mascarado: o número completo nunca deixa o banco.
create function public.get_my_account_details() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name',a.name,
    'cpf_masked','***.'||substr(a.cpf,4,3)||'.'||substr(a.cpf,7,3)||'-**',
    'birth_date',a.birth_date,
    'gender',a.gender,
    'city',a.city,
    'state_code',a.state_code,
    'email',u.email,
    'phone','+'||u.phone,
    'phone_is_whatsapp',a.phone_is_whatsapp,
    'whatsapp_number',a.whatsapp_number)
  from private.account_details a join auth.users u on u.id=a.user_id
  where a.user_id=auth.uid() and private.active_account(auth.uid())
$$;

-- Dados editáveis da conta: nome, gênero (opcional), cidade/UF e a escolha de WhatsApp (RN-36).
-- `phone_is_whatsapp` e `whatsapp_number` sempre juntos; com `phone_is_whatsapp` verdadeiro o número é nulo.
create function public.update_my_account_details(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  old_row private.account_details;
  next_flag boolean;
  next_number text;
begin
  perform 1 from private.account_details where user_id=actor for no key update;
  if not private.active_account(actor) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k
    where k not in ('name','gender','city','state_code','phone_is_whatsapp','whatsapp_number')) then
    raise exception using errcode='22023',message='Dados da conta inválidos';
  end if;
  if ((payload->'phone_is_whatsapp') is not null) is distinct from ((payload->'whatsapp_number') is not null)
    or ((payload->'phone_is_whatsapp') is not null and jsonb_typeof(payload->'phone_is_whatsapp') is distinct from 'boolean') then
    raise exception using errcode='22023',message='Informe se o celular é WhatsApp e o outro número, se houver';
  end if;
  select * into strict old_row from private.account_details where user_id=actor;
  next_flag := case when (payload->'phone_is_whatsapp') is not null then (payload->>'phone_is_whatsapp')::boolean else old_row.phone_is_whatsapp end;
  next_number := case when (payload->'whatsapp_number') is not null then nullif(btrim(payload->>'whatsapp_number'),'') else old_row.whatsapp_number end;
  update private.account_details set
    name=case when (payload->'name') is not null then btrim(payload->>'name') else name end,
    gender=case when (payload->'gender') is not null then nullif(btrim(payload->>'gender'),'') else gender end,
    city=case when (payload->'city') is not null then btrim(payload->>'city') else city end,
    state_code=case when (payload->'state_code') is not null then payload->>'state_code' else state_code end,
    phone_is_whatsapp=next_flag,
    whatsapp_number=next_number,
    updated_at=now()
  where user_id=actor;
exception when integrity_constraint_violation or invalid_text_representation then
  raise exception using errcode='22023',message='Dados da conta inválidos';
end $$;

-- Atuação do titular com estilos e dados profissionais, para a tela de edição. Nulo se não for dele.
create function public.get_my_profile(target uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',p.id,'kind',p.kind,'name',p.name,'description',p.description,'city',p.city,'state_code',p.state_code,
    'social_links',p.social_links,'color',p.color,'published',p.published,
    'is_default',p.id is not distinct from a.default_artist_profile_id,
    'styles',coalesce((select jsonb_agg(jsonb_build_object('style',s.style,'substyle',s.substyle) order by s.style,s.substyle nulls first)
      from public.artist_styles s where s.profile_id=p.id),'[]'::jsonb),
    'professional',(select jsonb_build_object(
        'booking_email',d.booking_email,'contact_email',d.contact_email,'contact_phone',d.contact_phone,'fee_cents',d.fee_cents,
        'cnpj',d.cnpj,'service_type',d.service_type,'service_other',d.service_other,'audiovisual_type',d.audiovisual_type,
        'presskit_url',d.presskit_url,'portfolio_url',d.portfolio_url)
      from public.professional_details d where d.profile_id=p.id))
  from public.profiles p join private.account_details a on a.user_id=p.owner_id
  where p.id=target and p.owner_id=auth.uid() and private.active_account(auth.uid())
$$;

-- Dados públicos da atuação. Os estilos de artista são substituídos atomicamente (tudo ou nada).
create function public.update_my_profile(target uuid, payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  old_row public.profiles;
  elem jsonb;
begin
  perform 1 from private.account_details where user_id=actor for no key update;
  if not private.active_account(actor) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  select * into old_row from public.profiles where id=target and owner_id=actor for update;
  if not found then raise exception using errcode='42501',message='Atuação indisponível'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) k
    where k not in ('name','description','city','state_code','social_links','color','published','styles')) then
    raise exception using errcode='22023',message='Dados da atuação inválidos';
  end if;
  if (payload->'published') is not null and (jsonb_typeof(payload->'published') is distinct from 'boolean'
    or ((payload->>'published')::boolean and old_row.kind<>'artist')) then
    raise exception using errcode='22023',message='Somente atuações de artista podem ser publicadas';
  end if;
  if (payload->'styles') is not null then
    if old_row.kind<>'artist' then raise exception using errcode='22023',message='Estilos são exclusivos de artistas'; end if;
    -- Sem CASE dentro do IF: o plpgsql corta a condição no primeiro THEN, inclusive o do CASE.
    if jsonb_typeof(payload->'styles') is distinct from 'array' then
      raise exception using errcode='22023',message='Informe de 1 a 50 estilos';
    end if;
    if jsonb_array_length(payload->'styles') not between 1 and 50 then
      raise exception using errcode='22023',message='Informe de 1 a 50 estilos';
    end if;
  end if;
  update public.profiles set
    name=case when (payload->'name') is not null then btrim(payload->>'name') else name end,
    description=case when (payload->'description') is not null then payload->>'description' else description end,
    city=case when (payload->'city') is not null then btrim(payload->>'city') else city end,
    state_code=case when (payload->'state_code') is not null then payload->>'state_code' else state_code end,
    social_links=case when (payload->'social_links') is not null then payload->'social_links' else social_links end,
    color=case when (payload->'color') is not null then payload->>'color' else color end,
    published=case when (payload->'published') is not null then (payload->>'published')::boolean else published end,
    updated_at=now()
  where id=target;
  if (payload->'styles') is not null then
    delete from public.artist_styles where profile_id=target;
    for elem in select value from jsonb_array_elements(payload->'styles') loop
      if jsonb_typeof(elem) is distinct from 'object' or exists(select from jsonb_object_keys(elem) k where k not in ('style','substyle')) then
        raise exception using errcode='22023',message='Classificação inválida';
      end if;
      if not exists(select from public.music_styles where name=elem->>'style') then
        raise exception using errcode='22023',message='Estilo musical inválido';
      end if;
      if elem->>'substyle' is not null and not exists(select from public.music_substyles where style=elem->>'style' and name=elem->>'substyle') then
        raise exception using errcode='22023',message='Subestilo musical inválido';
      end if;
      insert into public.artist_styles(profile_id,style,substyle) values(target,elem->>'style',elem->>'substyle');
    end loop;
  end if;
exception when integrity_constraint_violation or invalid_text_representation then
  raise exception using errcode='22023',message='Dados da atuação inválidos';
end $$;

-- Dados profissionais (restritos, RN-07) do próprio titular. Só as chaves enviadas mudam; as constraints por tipo
-- (booking/cachê/presskit só de artista, portfólio só de audiovisual, serviço só de serviços) valem como sempre.
create function public.update_my_professional_details(target uuid, payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owned_kind text;
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
  update public.professional_details set
    booking_email=case when (payload->'booking_email') is not null then nullif(btrim(payload->>'booking_email'),'') else booking_email end,
    contact_email=case when (payload->'contact_email') is not null then nullif(btrim(payload->>'contact_email'),'') else contact_email end,
    contact_phone=case when (payload->'contact_phone') is not null then nullif(btrim(payload->>'contact_phone'),'') else contact_phone end,
    fee_cents=case when (payload->'fee_cents') is not null then (payload->>'fee_cents')::bigint else fee_cents end,
    cnpj=case when (payload->'cnpj') is not null then nullif(upper(btrim(payload->>'cnpj')),'') else cnpj end,
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

revoke all on function public.get_my_account_details(),public.update_my_account_details(jsonb),public.get_my_profile(uuid),
  public.update_my_profile(uuid,jsonb),public.update_my_professional_details(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_my_account_details(),public.update_my_account_details(jsonb),public.get_my_profile(uuid),
  public.update_my_profile(uuid,jsonb),public.update_my_professional_details(uuid,jsonb) to authenticated;
