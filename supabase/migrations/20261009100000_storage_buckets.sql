-- W11: uploads. Dois buckets do Storage com políticas que seguem as regras de propriedade do banco, e RPCs para ligar
-- (ou desligar) cada arquivo à sua linha. Os caminhos seguem as constraints já existentes: `<id da entidade>/<nome>.<ext>`,
-- onde a entidade é a atuação (fotos e documentos), o coletivo (imagem) ou o evento (capa).
--   public-images      público para leitura; JPG/PNG/WebP; até 5.000.000 bytes (RN-09).
--   private-documents  privado; somente PDF; até 10.000.000 bytes (RN-35). Leitura: titular ou leitor profissional (RN-07).
-- O Storage valida tamanho e tipo declarado do bucket; as funções abaixo conferem de novo, a partir dos metadados que o
-- próprio Storage gravou em `storage.objects`, nunca de valores enviados pelo cliente.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('public-images','public-images',true,5000000,array['image/jpeg','image/png','image/webp']),
  ('private-documents','private-documents',false,10000000,array['application/pdf'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Trocar a posição de duas imagens, ou deslocar a galeria depois de uma remoção, é um único UPDATE: a unicidade só pode
-- ser conferida no fim do comando.
alter table public.profile_images drop constraint profile_images_profile_id_position_key;
alter table public.profile_images add constraint profile_images_profile_id_position_key unique (profile_id,position) deferrable initially immediate;

-- ---- Políticas de `storage.objects` ----
-- Cada função confere o formato do caminho (id em minúsculas, nome simples e extensão do bucket) antes de qualquer consulta,
-- para que um caminho forjado nunca vire um id válido nem faça a conversão para uuid falhar.
create function private.image_object_entity(object_name text) returns uuid
language sql immutable parallel safe set search_path='' as $$
  select case when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$'
    then split_part(object_name,'/',1)::uuid end
$$;
create function private.document_object_entity(object_name text) returns uuid
language sql immutable parallel safe set search_path='' as $$
  select case when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_-]{1,100}\.pdf$'
    then split_part(object_name,'/',1)::uuid end
$$;

-- Imagens: o titular da atuação de artista, o proprietário do coletivo (pedido pendente, recusado ou aprovado, como em
-- `edit_collective`) e quem pode editar eventos do coletivo aprovado (como em `update_event`).
create function private.can_write_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.active_account(auth.uid()) and (
    exists(select from public.profiles p join public.artist_profiles a on a.profile_id=p.id
      where p.id=private.image_object_entity(object_name) and p.owner_id=auth.uid())
    or exists(select from public.collectives c where c.id=private.image_object_entity(object_name)
      and c.owner_user_id=auth.uid() and c.state in ('pending','rejected','approved'))
    or exists(select from public.events e where e.id=private.image_object_entity(object_name)
      and private.collective_can(e.collective_id,'edit_events'))),false)
$$;
-- Documentos: presskit é de artista e a lista de serviços/equipamentos é de serviços; audiovisual, integrante, coletivo e
-- produtora não têm arquivo (RN-35), mesmo com o caminho forjado.
create function private.can_write_document(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.active_account(auth.uid()) and exists(select from public.profiles p
    where p.id=private.document_object_entity(object_name) and p.owner_id=auth.uid() and p.kind in ('artist','services')),false)
$$;
-- Leitura: o titular, ou o leitor profissional (MFA + proprietário de coletivo aprovado) de uma atuação visível, como em
-- `professional_read` de `professional_details`.
create function private.can_read_document(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.active_account(auth.uid()) and (
    private.owns_profile(private.document_object_entity(object_name))
    or (private.professional_reader() and private.profile_visible(private.document_object_entity(object_name)))),false)
$$;
revoke all on function private.image_object_entity(text),private.document_object_entity(text),private.can_write_image(text),
  private.can_write_document(text),private.can_read_document(text) from public,anon,authenticated,service_role;
grant execute on function private.image_object_entity(text),private.document_object_entity(text),private.can_write_image(text),
  private.can_write_document(text),private.can_read_document(text) to authenticated;

-- Leitura de `public-images` não passa por RLS (bucket público); as políticas de select existem para o titular listar,
-- substituir (upsert) e remover os próprios arquivos.
create policy public_images_select on storage.objects for select to authenticated
  using (bucket_id='public-images' and private.can_write_image(name));
create policy public_images_insert on storage.objects for insert to authenticated
  with check (bucket_id='public-images' and private.can_write_image(name));
create policy public_images_update on storage.objects for update to authenticated
  using (bucket_id='public-images' and private.can_write_image(name))
  with check (bucket_id='public-images' and private.can_write_image(name));
create policy public_images_delete on storage.objects for delete to authenticated
  using (bucket_id='public-images' and private.can_write_image(name));
create policy private_documents_select on storage.objects for select to authenticated
  using (bucket_id='private-documents' and private.can_read_document(name));
create policy private_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id='private-documents' and private.can_write_document(name));
create policy private_documents_update on storage.objects for update to authenticated
  using (bucket_id='private-documents' and private.can_write_document(name))
  with check (bucket_id='private-documents' and private.can_write_document(name));
create policy private_documents_delete on storage.objects for delete to authenticated
  using (bucket_id='private-documents' and private.can_write_document(name));

-- ---- RPCs ----
-- Confere o objeto no Storage: existe no bucket, foi enviado por quem pede, tem tamanho e tipo aceitos e a extensão é do tipo.
create function private.verified_upload(bucket text, object_path text, actor uuid, max_bytes integer, mimes text[])
returns table(size_bytes integer, mime_type text)
language plpgsql stable security definer set search_path='' as $$
declare found_size integer; found_mime text;
begin
  select (o.metadata->>'size')::integer,o.metadata->>'mimetype' into found_size,found_mime
    from storage.objects o where o.bucket_id=bucket and o.name=object_path and o.owner_id=actor::text;
  if not found or found_size is null or found_size not between 1 and max_bytes or found_mime is null or not (found_mime=any(mimes))
    or not (case when object_path ~ '\.(jpg|jpeg)$' then found_mime='image/jpeg'
      when object_path ~ '\.png$' then found_mime='image/png'
      when object_path ~ '\.webp$' then found_mime='image/webp'
      when object_path ~ '\.pdf$' then found_mime='application/pdf' else false end) then
    raise exception using errcode='22023',message='Arquivo não encontrado ou inválido';
  end if;
  return query select found_size,found_mime;
end $$;

-- Trava a conta e a atuação do titular (do tipo pedido) na mesma ordem das demais escritas do perfil.
create function private.lock_owned_profile(target uuid, kinds text[]) returns void
language plpgsql set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  perform 1 from private.account_details where user_id=actor for no key update;
  if not private.active_account(actor) then raise exception using errcode='42501',message='Conta indisponível'; end if;
  perform 1 from public.profiles where id=target and owner_id=actor and kind=any(kinds) for update;
  if not found then raise exception using errcode='42501',message='Atuação indisponível'; end if;
end $$;

-- Foto principal (posição 0, substitui a anterior) ou imagem da galeria (até 10, no fim). A foto principal não consome
-- uma das 10 posições da galeria (RN-09). Devolve o caminho substituído, que quem chama remove do Storage depois de
-- concluída a troca.
create function public.attach_profile_image(target uuid, slot text, object_path text, alt text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); upload record; old_path text; pos smallint; image_id uuid;
begin
  perform private.lock_owned_profile(target,array['artist']);
  if slot is null or slot not in ('main','gallery') or alt is null or length(alt)>500 or object_path is null
    or object_path !~ ('^'||target::text||'/[a-zA-Z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$') then
    raise exception using errcode='22023',message='Imagem inválida';
  end if;
  select * into upload from private.verified_upload('public-images',object_path,actor,5000000,array['image/jpeg','image/png','image/webp']);
  if slot='main' then
    delete from public.profile_images where profile_id=target and position=0 returning public.profile_images.object_path into old_path;
    pos:=0;
  else
    select count(*)+1 into pos from public.profile_images where profile_id=target and position>=1;
    if pos>10 then raise exception using errcode='22023',message='A galeria aceita até 10 imagens'; end if;
  end if;
  insert into public.profile_images(profile_id,position,object_path,mime_type,size_bytes,alt_text)
    values(target,pos,object_path,upload.mime_type,upload.size_bytes,alt) returning id into image_id;
  return jsonb_build_object('id',image_id,'position',pos,'replaced_path',old_path);
exception when integrity_constraint_violation then
  raise exception using errcode='22023',message='Imagem inválida';
end $$;

-- Remove a foto principal ou uma imagem da galeria (a galeria fecha o espaço) e devolve o caminho a apagar do Storage.
create function public.detach_profile_image(target uuid, image uuid) returns text
language plpgsql security definer set search_path='' as $$
declare old_path text; pos smallint;
begin
  perform private.lock_owned_profile(target,array['artist']);
  delete from public.profile_images where id=image and profile_id=target
    returning public.profile_images.object_path,position into old_path,pos;
  if not found then raise exception using errcode='22023',message='Imagem indisponível'; end if;
  if pos>=1 then update public.profile_images set position=position-1 where profile_id=target and position>pos; end if;
  return old_path;
end $$;

-- Troca uma imagem da galeria com a vizinha anterior ou seguinte; nas pontas não faz nada. A foto principal não se move.
create function public.move_profile_image(target uuid, image uuid, direction text) returns void
language plpgsql security definer set search_path='' as $$
declare pos smallint; neighbor smallint;
begin
  perform private.lock_owned_profile(target,array['artist']);
  if direction is null or direction not in ('earlier','later') then raise exception using errcode='22023',message='Direção inválida'; end if;
  select position into pos from public.profile_images where id=image and profile_id=target and position>=1;
  if not found then raise exception using errcode='22023',message='Imagem indisponível'; end if;
  neighbor:=case when direction='earlier' then pos-1 else pos+1 end;
  if neighbor<1 or not exists(select from public.profile_images where profile_id=target and position=neighbor) then return; end if;
  update public.profile_images set position=case when position=pos then neighbor else pos end
    where profile_id=target and position in (pos,neighbor);
end $$;

-- Presskit em PDF (artista) ou lista de serviços/equipamentos em PDF (serviços); caminho nulo remove. O PDF do presskit
-- e o link são excludentes: enviar o PDF limpa o link (RN-35). Devolve o caminho anterior para o Storage.
create function public.set_professional_document(target uuid, kind text, object_path text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); upload_bytes integer; old_path text;
begin
  if kind is null or kind not in ('presskit','services') then raise exception using errcode='22023',message='Documento inválido'; end if;
  perform private.lock_owned_profile(target,array[case when kind='presskit' then 'artist' else 'services' end]);
  if object_path is not null then
    if object_path !~ ('^'||target::text||'/[a-zA-Z0-9_-]{1,100}\.pdf$') then
      raise exception using errcode='22023',message='Documento inválido'; end if;
    select v.size_bytes into upload_bytes from private.verified_upload('private-documents',object_path,actor,10000000,array['application/pdf']) v;
  end if;
  if kind='presskit' then
    select presskit_path into old_path from public.professional_details where profile_id=target for update;
    if not found then raise exception using errcode='22023',message='Dados profissionais ausentes'; end if;
    update public.professional_details set presskit_path=object_path,presskit_bytes=upload_bytes,
      presskit_url=case when object_path is not null then null else presskit_url end,updated_at=now() where profile_id=target;
  else
    select services_pdf_path into old_path from public.professional_details where profile_id=target for update;
    if not found then raise exception using errcode='22023',message='Dados profissionais ausentes'; end if;
    update public.professional_details set services_pdf_path=object_path,services_pdf_bytes=upload_bytes,updated_at=now()
      where profile_id=target;
  end if;
  return old_path;
exception when integrity_constraint_violation then
  raise exception using errcode='22023',message='Documento inválido';
end $$;

-- Imagem do coletivo: só o proprietário (como em `edit_collective`); caminho nulo remove. Não altera a versão do cadastro:
-- é independente dos campos de texto e não deve invalidar uma edição em andamento. Devolve o caminho anterior.
create function public.set_collective_image(target uuid, object_path text) returns text
language plpgsql security definer set search_path='' as $$
declare c public.collectives; actor uuid:=auth.uid(); old_path text;
begin
  select * into c from public.collectives where id=target for update;
  if not found or not private.active_account(actor) or c.owner_user_id is distinct from actor or c.state not in ('pending','rejected','approved') then
    raise exception using errcode='42501',message='Operação não autorizada'; end if;
  if object_path is not null then
    if object_path !~ ('^'||target::text||'/[a-zA-Z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$') then
      raise exception using errcode='22023',message='Imagem inválida'; end if;
    perform private.verified_upload('public-images',object_path,actor,5000000,array['image/jpeg','image/png','image/webp']);
  end if;
  old_path:=c.image_path;
  update public.collectives set image_path=object_path,updated_at=now() where id=target;
  insert into private.collective_audit(collective_id,actor_id,action) values(target,actor,'image_changed');
  return old_path;
exception when integrity_constraint_violation then
  raise exception using errcode='22023',message='Imagem inválida';
end $$;

-- A tela de edição passa a ver as imagens da atuação (em ordem) e o tamanho dos documentos enviados.
create or replace function public.get_my_profile(target uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',p.id,'kind',p.kind,'name',p.name,'description',p.description,'city',p.city,'state_code',p.state_code,
    'social_links',p.social_links,'color',p.color,'published',p.published,
    'is_default',p.id is not distinct from a.default_artist_profile_id,
    'styles',coalesce((select jsonb_agg(jsonb_build_object('style',s.style,'substyle',s.substyle) order by s.style,s.substyle nulls first)
      from public.artist_styles s where s.profile_id=p.id),'[]'::jsonb),
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'object_path',i.object_path,'size_bytes',i.size_bytes,'alt_text',i.alt_text)
      order by i.position) from public.profile_images i where i.profile_id=p.id),'[]'::jsonb),
    'professional',(select jsonb_build_object(
        'booking_email',d.booking_email,'contact_email',d.contact_email,'contact_phone',d.contact_phone,'fee_cents',d.fee_cents,
        'cnpj',d.cnpj,'service_type',d.service_type,'service_other',d.service_other,'audiovisual_type',d.audiovisual_type,
        'presskit_url',d.presskit_url,'portfolio_url',d.portfolio_url,
        'presskit_path',d.presskit_path,'presskit_bytes',d.presskit_bytes,
        'services_pdf_path',d.services_pdf_path,'services_pdf_bytes',d.services_pdf_bytes)
      from public.professional_details d where d.profile_id=p.id))
  from public.profiles p join private.account_details a on a.user_id=p.owner_id
  where p.id=target and p.owner_id=auth.uid() and private.active_account(auth.uid())
$$;

revoke all on function private.verified_upload(text,text,uuid,integer,text[]),private.lock_owned_profile(uuid,text[]),
  public.attach_profile_image(uuid,text,text,text),public.detach_profile_image(uuid,uuid),public.move_profile_image(uuid,uuid,text),
  public.set_professional_document(uuid,text,text),public.set_collective_image(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.attach_profile_image(uuid,text,text,text),public.detach_profile_image(uuid,uuid),
  public.move_profile_image(uuid,uuid,text),public.set_professional_document(uuid,text,text),public.set_collective_image(uuid,text) to authenticated;
