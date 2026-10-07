import { eventoNaoEncerrado } from '../lib/utils'
import {
  mapCollectiveList,
  mapCollectiveMembers,
  mapCollectiveRow,
  type CollectiveListData,
  type CollectivePageData,
} from './mappers/collectives'
import { mapEventList } from './mappers/events'
import { HttpError, unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new HttpError(404, 'Coletivo não encontrado.')

/** Colunas de `public.collectives` liberadas ao anon (as demais, como `state`, não são legíveis). */
export const COLLECTIVE_COLUMNS ='id,kind,name,description,activity,city,state_code,social_links,color,image_path'
export const EVENT_COLUMNS =
  'id,collective_id,name,kind,other_kind,starts_at,ends_at,state_code,city,venue,is_free,ticket_url,cover_url,cover_path,style'

/** Quantos eventos do coletivo a página considera, dos mais recentes para trás, e quantos encerrados mostra. */
const EVENT_WINDOW = 100
const PAST_SHOWN = 10

/** Catálogo público: o RLS já devolve somente coletivos e produtoras aprovados. */
export async function loadCollectiveList(client: SupabaseServerClient): Promise<CollectiveListData> {
  const rows = unwrap(await client.from('collectives').select(COLLECTIVE_COLUMNS).order('name').order('id'))
  return { coletivos: mapCollectiveList(rows) }
}

/**
 * Perfil público: coletivo + membros (`get_collective_members`) + eventos publicados dele.
 * UUID inválido ou coletivo invisível (pendente, suspenso, inexistente) => 404.
 */
export async function loadCollectivePage(
  client: SupabaseServerClient,
  id: string,
  now = Date.now(),
): Promise<CollectivePageData> {
  if (!uuid.test(id)) throw notFound()
  const row = unwrap(await client.from('collectives').select(COLLECTIVE_COLUMNS).eq('id', id).maybeSingle())
  if (row === null) throw notFound()
  const [members, events] = await Promise.all([
    client.rpc('get_collective_members', { target: id }),
    client
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('collective_id', id)
      .eq('state', 'published')
      .order('starts_at', { ascending: false })
      .limit(EVENT_WINDOW),
  ])
  const todos = mapEventList(unwrap(events))
  return {
    coletivo: mapCollectiveRow(row),
    membros: mapCollectiveMembers(unwrap(members)),
    // Mesma regra do banco para "encerrado" (`private.event_period`), aplicada ao relógio do servidor.
    proximos: todos.filter((e) => eventoNaoEncerrado(e, now)).reverse(),
    anteriores: todos.filter((e) => !eventoNaoEncerrado(e, now)).slice(0, PAST_SHOWN),
  }
}
