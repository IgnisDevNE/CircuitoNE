import { ARTIST_COLUMNS } from './artists.server'
import { mapArtistSummaries } from './mappers/artists'
import { mapEventList } from './mappers/events'
import { mapCollectiveHighlights, type HomeData } from './mappers/home'
import { unavailable, unwrap, type SupabaseServerClient } from './supabase.server'

export const HOME_EVENTS = 3
export const HOME_ARTISTS = 8
export const HOME_COLLECTIVES = 4

const total = (result: { count: number | null; error: unknown }) => {
  if (result.error || typeof result.count !== 'number') throw unavailable()
  return result.count
}

/**
 * Destaques da home: próximos eventos (em andamento primeiro), primeiros artistas publicados e
 * coletivos aprovados, mais os totais exibidos no painel de boot. O RLS do visitante anônimo
 * garante que só aparecem artistas publicados e coletivos aprovados.
 */
export async function loadHome(client: SupabaseServerClient): Promise<HomeData> {
  const [ongoing, future, artists, artistCount, collectives, collectiveCount] = await Promise.all([
    client.rpc('list_events', { period: 'ongoing' }),
    client.rpc('list_events', { period: 'future' }),
    client.from('profiles').select(ARTIST_COLUMNS).eq('kind', 'artist').order('name').order('id').limit(HOME_ARTISTS),
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('kind', 'artist'),
    client.from('collectives').select('id,name,kind,city,state_code').order('name').order('id').limit(HOME_COLLECTIVES),
    client.from('collectives').select('id', { count: 'exact', head: true }),
  ])
  const artistRows = unwrap(artists)
  if (!artistRows) throw unavailable()
  const styles = artistRows.length
    ? unwrap(
        await client
          .from('artist_styles')
          .select('profile_id,style,substyle')
          .in('profile_id', artistRows.map((row) => row.id))
          .order('style')
          .order('substyle'),
      )
    : []
  const agenda = [...mapEventList(unwrap(ongoing)), ...mapEventList(unwrap(future))]
  return {
    proximos: agenda.slice(0, HOME_EVENTS),
    artistas: mapArtistSummaries(artistRows, styles),
    coletivos: mapCollectiveHighlights(unwrap(collectives)),
    // Cada RPC devolve no máximo 50 eventos por período.
    totais: { artistas: total(artistCount), coletivos: total(collectiveCount), eventos: agenda.length },
  }
}
