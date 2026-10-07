import { mapEventList } from './mappers/events'
import {
  mapArtistProfile,
  mapArtistSummaries,
  type ArtistListData,
  type ArtistPageData,
} from './mappers/artists'
import { HttpError, unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new HttpError(404, 'Artista não encontrado.')

/** Colunas de `profiles` liberadas ao visitante. */
export const ARTIST_COLUMNS = 'id,name,description,city,state_code'

/**
 * Hub público: artistas publicados (o RLS do visitante anônimo já limita a eles) em ordem alfabética.
 * Duas consultas para a lista inteira, sem N+1: cor e redes sociais só existem em `get_profile`
 * e ficam para a página do artista.
 */
export async function loadArtistList(client: SupabaseServerClient): Promise<ArtistListData> {
  const [profiles, styles, photos] = await Promise.all([
    client.from('profiles').select(ARTIST_COLUMNS).eq('kind', 'artist').order('name').order('id'),
    client.from('artist_styles').select('profile_id,style,substyle').order('style').order('substyle'),
    client.from('profile_images').select('profile_id,position,object_path').eq('position', 0),
  ])
  return { artistas: mapArtistSummaries(unwrap(profiles), unwrap(styles), unwrap(photos)) }
}

/**
 * Perfil público: `get_profile` (projeção pública completa) + estilos + eventos do artista.
 * UUID inválido, perfil inexistente, não publicado ou de outro tipo => 404. Não consulta
 * `professional_details`: contato de booking, cachê e presskit não são públicos. Fotos vêm de `profile_images`
 * (a RLS só as mostra para perfis visíveis) e viram URLs públicas do bucket `public-images`.
 */
export async function loadArtistPage(client: SupabaseServerClient, id: string): Promise<ArtistPageData> {
  if (!uuid.test(id)) throw notFound()
  const [profile, styles, images, ongoing, future, past] = await Promise.all([
    client.rpc('get_profile', { target: id }),
    client.from('artist_styles').select('style,substyle').eq('profile_id', id).order('style').order('substyle'),
    client.from('profile_images').select('profile_id,position,object_path').eq('profile_id', id).order('position'),
    client.rpc('list_events', { period: 'ongoing', artist: id }),
    client.rpc('list_events', { period: 'future', artist: id }),
    client.rpc('list_events', { period: 'past', artist: id }),
  ])
  const row = unwrap(profile)
  if (row === null) throw notFound()
  const artista = mapArtistProfile(row, unwrap(styles), unwrap(images))
  if (!artista) throw notFound()
  return {
    artista,
    proximos: [...mapEventList(unwrap(ongoing)), ...mapEventList(unwrap(future))],
    anteriores: mapEventList(unwrap(past)),
  }
}
