-- #116: identidade e atuações. Auth é migrado pelo serviço oficial antes deste arquivo.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create function private.valid_cpf(value text) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare total integer; digit integer; i integer; pass integer;
begin
  if value !~ '^[0-9]{11}$' or value = repeat(substr(value, 1, 1), 11) then return false; end if;
  for pass in 10..11 loop
    total := 0;
    for i in 1..pass-1 loop total := total + substr(value, i, 1)::integer * (pass + 1 - i); end loop;
    digit := (total * 10) % 11;
    if digit = 10 then digit := 0; end if;
    if digit <> substr(value, pass, 1)::integer then return false; end if;
  end loop;
  return true;
end $$;

create function private.valid_web_url(value text) returns boolean
language sql immutable strict set search_path = '' as $$
  select length(value) <= 2048 and value ~ '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'
$$;

create function private.valid_social_links(value jsonb) returns boolean
language sql immutable strict set search_path = '' as $$
  select jsonb_typeof(value) = 'object' and not exists (
    select from jsonb_each(case when jsonb_typeof(value)='object' then value else '{}'::jsonb end) item
    where item.key not in ('instagram','bandcamp','soundcloud','facebook','website','youtube')
      or jsonb_typeof(item.value) <> 'string' or not private.valid_web_url(item.value #>> '{}'))
$$;

create table private.account_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  cpf text not null unique check (private.valid_cpf(cpf)),
  birth_date date not null check (isfinite(birth_date) and birth_date <= ((current_timestamp at time zone 'America/Fortaleza')::date - interval '18 years')::date),
  gender text check (length(gender) <= 100),
  city text not null check (length(btrim(city)) between 1 and 150),
  state_code text not null check (state_code = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  phone_is_whatsapp boolean not null,
  whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  state text not null default 'active' check (state in ('active','suspended','deletion_pending')),
  state_reason text,
  default_artist_profile_id uuid,
  default_artist_kind text not null default 'artist' check (default_artist_kind='artist'),
  registration_request_id uuid not null,
  registration_hash text not null,
  first_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not phone_is_whatsapp or whatsapp_number is null)
);
alter table private.account_details enable row level security;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references private.account_details(user_id) on delete cascade,
  kind text not null check (kind in ('artist','services','audiovisual','member')),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  city text not null check (length(btrim(city)) between 1 and 150),
  state_code text not null check (state_code = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  social_links jsonb not null default '{}' check (private.valid_social_links(social_links)),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  published boolean not null default false check (not published or kind='artist'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,kind), unique (owner_id,id,kind)
);
create index profiles_owner on public.profiles(owner_id);
create index profiles_catalog on public.profiles(kind,name,id);
alter table public.profiles enable row level security;
alter table private.account_details add foreign key (user_id,default_artist_profile_id,default_artist_kind)
  references public.profiles(owner_id,id,kind) on delete set null (default_artist_profile_id);
alter table private.account_details add foreign key (first_profile_id) references public.profiles(id) on delete set null;

create table public.artist_profiles (
  profile_id uuid primary key,
  kind text not null default 'artist' check (kind='artist'),
  foreign key (profile_id,kind) references public.profiles(id,kind) on delete cascade
);
alter table public.artist_profiles enable row level security;
create table public.music_styles (name text primary key);
create table public.music_substyles (
  style text not null references public.music_styles(name), name text not null, primary key(style,name)
);
alter table public.music_styles enable row level security;
alter table public.music_substyles enable row level security;
create table public.artist_styles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.artist_profiles(profile_id) on delete cascade,
  style text not null references public.music_styles(name),
  substyle text,
  foreign key (style,substyle) references public.music_substyles(style,name),
  unique nulls not distinct (profile_id,style,substyle)
);
create index artist_styles_filter on public.artist_styles(style,substyle,profile_id);
alter table public.artist_styles enable row level security;

-- Snapshot imutável da taxonomia normativa docs/specs/estilos-musicais.json.
insert into public.music_styles(name) values
('techno'),
('house'),
('trance'),
('drum and bass'),
('breakbeat'),
('uk garage'),
('dubstep'),
('bass music'),
('hardstyle'),
('hardcore eletrônico'),
('tekno'),
('electro'),
('disco'),
('dance'),
('electronica'),
('downtempo'),
('ambient'),
('industrial'),
('synthpop'),
('synthwave'),
('vaporwave'),
('darkwave'),
('club'),
('phonk'),
('funk carioca'),
('eletrônica latina'),
('eletrônica africana'),
('hip hop'),
('pop'),
('rock'),
('punk'),
('metal'),
('r&b'),
('soul'),
('funk'),
('jazz'),
('blues'),
('country'),
('folk'),
('reggae'),
('afrobeat e afropop'),
('música brasileira'),
('música latina e caribenha'),
('música clássica'),
('músicas tradicionais e regionais'),
('música religiosa'),
('música infantil'),
('trilhas sonoras e musicais'),
('new age e meditação'),
('experimental e noise'),
('áudio não musical');
insert into public.music_substyles(style,name) values
('techno','acid techno'),
('techno','ambient techno'),
('techno','deep techno'),
('techno','dub techno'),
('techno','experimental techno'),
('techno','hard techno'),
('techno','hypnotic techno'),
('techno','industrial techno'),
('techno','melodic techno'),
('techno','minimal techno'),
('techno','raw techno'),
('house','acid house'),
('house','afro house'),
('house','bass house'),
('house','deep house'),
('house','disco house'),
('house','electro house'),
('house','french house'),
('house','funky house'),
('house','future house'),
('house','garage house'),
('house','hard house'),
('house','hip house'),
('house','jackin'' house'),
('house','jazz house'),
('house','latin house'),
('house','lo-fi house'),
('house','microhouse'),
('house','organic house'),
('house','piano house'),
('house','progressive house'),
('house','slap house'),
('house','soulful house'),
('house','tech house'),
('house','tribal house'),
('house','tropical house'),
('trance','acid trance'),
('trance','balearic trance'),
('trance','goa trance'),
('trance','hard trance'),
('trance','progressive trance'),
('trance','psytrance'),
('trance','tech trance'),
('trance','uplifting trance'),
('trance','vocal trance'),
('drum and bass','dancefloor drum and bass'),
('drum and bass','darkstep'),
('drum and bass','drumfunk'),
('drum and bass','jungle'),
('drum and bass','liquid drum and bass'),
('drum and bass','neurofunk'),
('breakbeat','big beat'),
('breakbeat','breaks'),
('breakbeat','funky breaks'),
('breakbeat','hardcore breaks'),
('breakbeat','progressive breaks'),
('breakbeat','psybreaks'),
('uk garage','2-step'),
('uk garage','bassline'),
('uk garage','future garage'),
('uk garage','speed garage'),
('uk garage','uk funky'),
('dubstep','brostep'),
('dubstep','deep dubstep'),
('dubstep','deathstep'),
('dubstep','melodic dubstep'),
('dubstep','riddim dubstep'),
('bass music','electronic trap'),
('bass music','experimental bass'),
('bass music','future bass'),
('bass music','glitch hop'),
('bass music','miami bass'),
('bass music','psybass'),
('bass music','uk bass'),
('bass music','wave'),
('hardstyle','euphoric hardstyle'),
('hardstyle','jumpstyle'),
('hardcore eletrônico','breakcore'),
('hardcore eletrônico','digital hardcore'),
('hardcore eletrônico','frenchcore'),
('hardcore eletrônico','gabber'),
('hardcore eletrônico','happy hardcore'),
('hardcore eletrônico','industrial hardcore'),
('hardcore eletrônico','makina'),
('hardcore eletrônico','speedcore'),
('hardcore eletrônico','uptempo hardcore'),
('tekno','acidcore'),
('tekno','hardtekk'),
('tekno','raggatek'),
('electro','electroclash'),
('electro','electro funk'),
('disco','dark disco'),
('disco','hi-nrg'),
('disco','italo disco'),
('disco','nu disco'),
('disco','space disco'),
('dance','dance pop'),
('dance','eurodance'),
('dance','freestyle'),
('dance','hard bass'),
('dance','italo dance'),
('electronica','chiptune'),
('electronica','electro swing'),
('electronica','experimental electronic'),
('electronica','glitch'),
('electronica','idm'),
('electronica','indietronica'),
('downtempo','balearic'),
('downtempo','chillout'),
('downtempo','chillstep'),
('downtempo','lo-fi beats'),
('downtempo','lounge'),
('downtempo','psychill'),
('downtempo','trip hop'),
('ambient','dark ambient'),
('ambient','drone ambient'),
('ambient','space ambient'),
('industrial','dark electro'),
('industrial','ebm'),
('industrial','electro-industrial'),
('industrial','power electronics'),
('industrial','power noise'),
('synthpop','electropop'),
('synthpop','minimal synth'),
('synthwave','chillsynth'),
('synthwave','darksynth'),
('vaporwave','chillwave'),
('vaporwave','future funk'),
('darkwave','coldwave'),
('darkwave','ethereal wave'),
('darkwave','witch house'),
('club','deconstructed club'),
('club','footwork'),
('club','jersey club'),
('phonk','brazilian phonk'),
('phonk','drift phonk'),
('funk carioca','brega funk'),
('funk carioca','funk mandelao'),
('funk carioca','funk melody'),
('funk carioca','funk mtg'),
('eletrônica latina','dembow'),
('eletrônica latina','electro latino'),
('eletrônica latina','guaracha'),
('eletrônica latina','moombahton'),
('eletrônica latina','nu-cumbia'),
('eletrônica latina','reggaeton'),
('eletrônica latina','rkt'),
('eletrônica latina','tecnobrega'),
('eletrônica africana','amapiano'),
('eletrônica africana','gqom'),
('eletrônica africana','kuduro'),
('eletrônica africana','kwaito'),
('eletrônica africana','singeli'),
('hip hop','drill'),
('hip hop','grime'),
('hip hop','trap'),
('reggae','dancehall'),
('reggae','dub'),
('reggae','ska'),
('música brasileira','arrocha'),
('música brasileira','axé'),
('música brasileira','bossa nova'),
('música brasileira','brega'),
('música brasileira','carimbó'),
('música brasileira','choro'),
('música brasileira','forró'),
('música brasileira','frevo'),
('música brasileira','maracatu'),
('música brasileira','mpb'),
('música brasileira','pagode'),
('música brasileira','samba'),
('música brasileira','sertanejo'),
('música latina e caribenha','bachata'),
('música latina e caribenha','bolero'),
('música latina e caribenha','cumbia'),
('música latina e caribenha','merengue'),
('música latina e caribenha','salsa'),
('música latina e caribenha','tango'),
('música latina e caribenha','zouk');

create table public.professional_details (
  profile_id uuid primary key,
  kind text not null check (kind in ('artist','services','audiovisual')),
  booking_email text check (length(booking_email) <= 254 and booking_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  contact_email text check (length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  fee_cents bigint check (fee_cents >= 0),
  cnpj text check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  service_type text check (service_type in ('structure','sound','lighting','performance','other')),
  service_other text check (length(btrim(service_other)) between 1 and 200),
  audiovisual_type text check (audiovisual_type in ('photo','video','full','sound')),
  presskit_url text check (private.valid_web_url(presskit_url)),
  presskit_path text,
  presskit_bytes integer,
  portfolio_url text check (private.valid_web_url(portfolio_url)),
  services_pdf_path text,
  services_pdf_bytes integer,
  updated_at timestamptz not null default now(),
  foreign key (profile_id,kind) references public.profiles(id,kind) on delete cascade,
  check (kind='artist' or (booking_email is null and fee_cents is null and presskit_url is null and presskit_path is null)),
  check (kind='audiovisual' or (portfolio_url is null and audiovisual_type is null)),
  check (kind='services' or (service_type is null and service_other is null and services_pdf_path is null)),
  check ((service_type is not distinct from 'other' and service_other is not null) or (service_type is distinct from 'other' and service_other is null)),
  check (presskit_url is null or presskit_path is null),
  check ((presskit_path is null and presskit_bytes is null) or (presskit_path is not null and presskit_bytes is not null and presskit_bytes between 1 and 10000000)),
  check ((services_pdf_path is null and services_pdf_bytes is null) or (services_pdf_path is not null and services_pdf_bytes is not null and services_pdf_bytes between 1 and 10000000)),
  check (presskit_path is null or presskit_path ~ ('^' || profile_id::text || '/[a-zA-Z0-9_-]+\.pdf$')),
  check (services_pdf_path is null or services_pdf_path ~ ('^' || profile_id::text || '/[a-zA-Z0-9_-]+\.pdf$'))
);
alter table public.professional_details enable row level security;

create table public.profile_images (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.artist_profiles(profile_id) on delete cascade,
  position smallint not null check (position between 0 and 10),
  object_path text not null unique check (object_path ~ ('^' || profile_id::text || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5000000),
  alt_text text not null default '' check (length(alt_text) <= 500),
  unique (profile_id,position)
);
alter table public.profile_images enable row level security;

-- Autorização consulta estado atual; nenhum papel vem de user_metadata.
create function private.active_account(actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from private.account_details a join auth.users u on u.id=a.user_id
    where a.user_id=actor and a.state='active' and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now()))
$$;
create function private.profile_visible(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select from public.profiles p where p.id=target and private.active_account(p.owner_id)
    and case when auth.uid() is null then p.kind='artist' and p.published
      else private.active_account(auth.uid()) end)
$$;
create function private.owns_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.active_account(auth.uid()) and exists(select from public.profiles where id=target and owner_id=auth.uid())
$$;
create function private.full_profile_visible(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.profile_visible(target) and exists(select from public.profiles
    where id=target and (owner_id=auth.uid() or (kind='artist' and published)))
$$;
create policy profiles_read on public.profiles for select to anon,authenticated using (private.profile_visible(id));
create policy artists_read on public.artist_profiles for select to anon,authenticated using (private.full_profile_visible(profile_id));
create policy artist_styles_read on public.artist_styles for select to anon,authenticated using (private.full_profile_visible(profile_id));
create policy images_read on public.profile_images for select to anon,authenticated using (private.full_profile_visible(profile_id));
create policy music_styles_read on public.music_styles for select to anon,authenticated using (true);
create policy music_substyles_read on public.music_substyles for select to anon,authenticated using (true);
-- #117 amplia somente para proprietário elegível; até lá nega terceiros.
create policy professional_read on public.professional_details for select to authenticated using (private.owns_profile(profile_id));

create function private.insert_profile(actor uuid, payload jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare result uuid; classification jsonb; account private.account_details;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select from jsonb_object_keys(payload) key
    where key not in ('kind','name','description','social_links','color','styles')) then
    raise exception using errcode='22023', message='Dados de atuação inválidos';
  end if;
  select * into strict account from private.account_details where user_id=actor;
  if payload->>'kind'='artist' then
    if jsonb_typeof(payload->'styles') is distinct from 'array' or jsonb_array_length(payload->'styles')=0 then
      raise exception using errcode='22023', message='Artista exige ao menos um estilo';
    end if;
  elsif coalesce(payload->'styles','[]') <> '[]'::jsonb then
    raise exception using errcode='22023', message='Estilos são exclusivos de artistas';
  end if;
  insert into public.profiles(owner_id,kind,name,description,city,state_code,social_links,color)
    values(actor,payload->>'kind',payload->>'name',coalesce(payload->>'description',''),account.city,account.state_code,
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

create function public.complete_registration(account jsonb, profile jsonb, request_id uuid) returns uuid
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

create function public.create_profile(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not private.active_account(auth.uid()) then raise exception using errcode='42501', message='Conta indisponível'; end if;
  return private.insert_profile(auth.uid(),payload);
end $$;
create function public.set_default_artist(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.active_account(auth.uid()) or (target is not null and not exists (
    select from public.profiles where id=target and owner_id=auth.uid() and kind='artist')) then
    raise exception using errcode='42501', message='Atuação indisponível';
  end if;
  update private.account_details set default_artist_profile_id=target,updated_at=now() where user_id=auth.uid();
end $$;
create function public.get_profile(target uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(p) - 'owner_id' from public.profiles p
    where id=target and private.full_profile_visible(target)
$$;

-- Grants fechados primeiro, incluindo possíveis defaults anteriores do criador.
revoke all on all tables in schema private from public,anon,authenticated,service_role;
revoke all on function private.valid_cpf(text), private.valid_web_url(text), private.valid_social_links(jsonb),
  private.active_account(uuid), private.profile_visible(uuid), private.owns_profile(uuid), private.full_profile_visible(uuid), private.insert_profile(uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on public.profiles,public.artist_profiles,public.artist_styles,public.music_styles,public.music_substyles,
  public.professional_details,public.profile_images from public,anon,authenticated,service_role;
revoke all on function public.complete_registration(jsonb,jsonb,uuid),public.create_profile(jsonb),public.set_default_artist(uuid),public.get_profile(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.profile_visible(uuid),private.full_profile_visible(uuid),private.owns_profile(uuid),public.get_profile(uuid) to anon,authenticated;
grant select(id,kind,name,description,city,state_code) on public.profiles to anon,authenticated;
grant select on public.artist_profiles,public.artist_styles,public.music_styles,public.music_substyles,public.profile_images,public.professional_details to anon,authenticated;
grant execute on function public.complete_registration(jsonb,jsonb,uuid),public.create_profile(jsonb),public.set_default_artist(uuid) to authenticated;
