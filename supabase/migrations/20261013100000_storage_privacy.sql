-- Privacidade das imagens e dos membros (revisão OWASP: M4, M5, M6).
--
-- M6: o bucket `public-images` deixa de ser público. A leitura passa pelo Storage com RLS: a política de select libera o
--   objeto só quando a entidade dona dele (atuação de artista, coletivo ou evento) é visível a quem pede, ou quando quem pede
--   pode escrevê-lo (titular e editores veem os próprios rascunhos no painel). Despublicar, recusar, suspender ou cancelar
--   passa a esconder a imagem sem apagar o objeto. O nome do bucket e os objetos existentes continuam iguais.
-- M5: `can_write_image` espelha `update_event` para capas: evento publicado exige `publish_events` e evento cancelado não
--   aceita escrita.
-- M4: `get_collective_members` (executável por anônimo) deixa de devolver o nome civil do cadastro.

update storage.buckets set public=false where id='public-images';

-- ---- M5 ----
create or replace function private.can_write_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.active_account(auth.uid()) and (
    exists(select from public.profiles p join public.artist_profiles a on a.profile_id=p.id
      where p.id=private.image_object_entity(object_name) and p.owner_id=auth.uid())
    or exists(select from public.collectives c where c.id=private.image_object_entity(object_name)
      and c.owner_user_id=auth.uid() and c.state in ('pending','rejected','approved'))
    or exists(select from public.events e where e.id=private.image_object_entity(object_name)
      and e.state<>'cancelled'
      and private.collective_can(e.collective_id,'edit_events')
      and (e.state<>'published' or private.collective_can(e.collective_id,'publish_events')))),false)
$$;

-- ---- M6 ----
-- Leitura de uma imagem: a atuação de artista que o chamador enxerga por inteiro (anônimo só vê artista publicado), o
-- coletivo aprovado, o evento visível com detalhe (publicado, ou cancelado depois de publicado), ou quem pode escrever o
-- objeto. Caminho fora do formato nunca vira id, então nada é liberado.
create function private.can_read_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.full_profile_visible(private.image_object_entity(object_name))
    or private.collective_visible(private.image_object_entity(object_name))
    or private.event_visible(private.image_object_entity(object_name),true)
    or private.can_write_image(object_name),false)
$$;
revoke all on function private.can_read_image(text) from public,anon,authenticated,service_role;
grant execute on function private.can_read_image(text) to anon,authenticated;

drop policy public_images_select on storage.objects;
create policy public_images_select on storage.objects for select to anon, authenticated
  using (bucket_id='public-images' and private.can_read_image(name));

-- ---- M4 ----
-- O nome exibido é o do perfil de artista padrão quando ele está publicado; sem perfil publicado, só o primeiro nome do
-- cadastro. O nome completo (civil) não sai mais por aqui. A lista passa a ter limite.
create or replace function public.get_collective_members(target uuid) returns table(name text, artist_profile_id uuid)
language sql stable security definer set search_path='' as $$
  select coalesce(case when p.published then p.name end,split_part(btrim(a.name),' ',1)),case when p.published then p.id end
    from public.collectives c
    join private.collective_memberships m on m.collective_id=c.id join private.account_details a on a.user_id=m.user_id
    left join public.profiles p on p.id=a.default_artist_profile_id and p.owner_id=a.user_id and p.kind='artist'
    where c.id=target and c.state='approved' and private.active_account(a.user_id)
      and (auth.uid() is null or private.active_account(auth.uid()))
    order by 1,m.user_id limit 200
$$;
