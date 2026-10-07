-- W14: gênero com valores canônicos (continua opcional, RN-04) e estilos musicais consistentes.

-- Gênero: valores fixos. Textos livres já gravados são levados ao valor canônico equivalente; o que não tem equivalente
-- vira "não informado" (o campo é opcional).
update private.account_details set gender = case
    when lower(btrim(gender)) in ('masculino', 'homem', 'homem cis', 'homem trans') then 'Masculino'
    when lower(btrim(gender)) in ('feminino', 'mulher', 'mulher cis', 'mulher trans') then 'Feminino'
    when lower(btrim(gender)) in ('não binário', 'nao binario', 'não-binário', 'pessoa não binária', 'não binária', 'nao binaria') then 'Não binário'
    else null end
  where gender is not null and gender not in ('Masculino', 'Feminino', 'Não binário');
alter table private.account_details add constraint account_details_gender_allowed
  check (gender is null or gender in ('Masculino', 'Feminino', 'Não binário'));

-- Estilos: um subestilo escolhido implica o estilo principal; remover o principal remove os subestilos dele.
-- Os dois lados valem para qualquer caminho de escrita (RPCs, seeds), então ficam em gatilhos.
insert into public.artist_styles(profile_id, style, substyle)
  select distinct profile_id, style, null from public.artist_styles where substyle is not null
  on conflict (profile_id, style, substyle) do nothing;

-- O principal entra no fim da transação (gatilho adiado): as RPCs que gravam estilos podem enviar o principal e o
-- subestilo na ordem que quiserem, sem conflito, e o que sobra sem principal é completado.
create function private.artist_style_add_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.artist_styles(profile_id, style, substyle)
    select new.profile_id, new.style, null
    where exists (select from public.artist_profiles where profile_id = new.profile_id)
    on conflict (profile_id, style, substyle) do nothing;
  return null;
end $$;

create function private.artist_style_drop_children() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.artist_styles where profile_id = old.profile_id and style = old.style and substyle is not null;
  return null;
end $$;

create constraint trigger artist_styles_add_parent after insert on public.artist_styles
  deferrable initially deferred
  for each row when (new.substyle is not null) execute function private.artist_style_add_parent();
create trigger artist_styles_drop_children after delete on public.artist_styles
  for each row when (old.substyle is null) execute function private.artist_style_drop_children();

revoke all on function private.artist_style_add_parent(), private.artist_style_drop_children()
  from public, anon, authenticated, service_role;

-- Nova atuação: cidade e UF próprias (as duas ou nenhuma); sem elas valem as da conta, como antes.
-- A cidade precisa existir na UF (chave estrangeira para public.municipalities).
create or replace function private.insert_profile(actor uuid, payload jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare result uuid; classification jsonb; account private.account_details; place_city text; place_state text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) key
    where key not in ('kind','name','description','social_links','color','styles','city','state_code')) then
    raise exception using errcode='22023', message='Dados de atuação inválidos';
  end if;
  if ((payload->'city') is not null) is distinct from ((payload->'state_code') is not null) then
    raise exception using errcode='22023', message='Informe a cidade e o estado da atuação';
  end if;
  select * into strict account from private.account_details where user_id=actor;
  place_city := coalesce(btrim(payload->>'city'), account.city);
  place_state := coalesce(payload->>'state_code', account.state_code);
  if payload->>'kind'='artist' then
    if jsonb_typeof(payload->'styles') is distinct from 'array' or jsonb_array_length(payload->'styles')=0 then
      raise exception using errcode='22023', message='Artista exige ao menos um estilo';
    end if;
  elsif coalesce(payload->'styles','[]') <> '[]'::jsonb then
    raise exception using errcode='22023', message='Estilos são exclusivos de artistas';
  end if;
  insert into public.profiles(owner_id,kind,name,description,city,state_code,social_links,color)
    values(actor,payload->>'kind',payload->>'name',coalesce(payload->>'description',''),place_city,place_state,
      coalesce(payload->'social_links','{}'),payload->>'color') returning id into result;
  if payload->>'kind'='artist' then
    insert into public.artist_profiles(profile_id) values(result);
    for classification in select value from jsonb_array_elements(payload->'styles') loop
      if jsonb_typeof(classification) <> 'object' or exists(select from jsonb_object_keys(classification) key where key not in ('style','substyle')) then
        raise exception using errcode='22023', message='Classificação inválida';
      end if;
      insert into public.artist_styles(profile_id,style,substyle) values(result,classification->>'style',classification->>'substyle');
    end loop;
  end if;
  if payload->>'kind' <> 'member' then
    insert into public.professional_details(profile_id,kind) values(result,payload->>'kind');
  end if;
  return result;
exception when integrity_constraint_violation then
  raise exception using errcode='22023', message='Dados de atuação inválidos';
end $$;
