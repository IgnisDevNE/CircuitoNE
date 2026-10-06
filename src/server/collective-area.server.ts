import { EVENT_PERMISSIONS, can, type CollectiveAccess } from '../lib/collective-access'
import { eventoNaoEncerrado } from '../lib/utils'
import { mapMyCollectives, mapMyProfiles, type MeuColetivo } from './mappers/account'
import {
  mapCollectiveAccess,
  mapDecisionReason,
  mapManagedEvents,
  mapMyRequests,
  mapRequestQueue,
  summarizeCollectiveConversations,
  type CollectiveAreaData,
  type ColetivoArea,
  type MyCollectivesData,
  type EventoGestao,
  type MeuPedido,
  type PedidoEntrada,
  type ResumoMensagens,
  type SituacaoBloqueada,
} from './mappers/collective-area'
import { DEFAULT_ACCENT, mapCollectiveList } from './mappers/collectives'
import { mapEventList } from './mappers/events'
import { ActionFailure, callRpc, formId, runMutation } from './mutation.server'
import { COLLECTIVE_COLUMNS, EVENT_COLUMNS } from './collectives.server'
import { HttpError, unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Não revela se o coletivo existe: quem não é membro recebe o mesmo 404 de um id inexistente. */
const notFound = () => new HttpError(404, 'Coletivo não encontrado.')
const unavailableFunction = () =>
  new HttpError(403, 'As funções internas deste coletivo não estão disponíveis agora para a sua conta.')
const noPermission = (what: string) => new HttpError(403, `Você não tem permissão para ${what} neste coletivo.`)

/** Quantos eventos encerrados o dashboard mostra. */
export const PAST_EVENTS_SHOWN = 10
const PUBLIC_EVENT_WINDOW = 100
const REQUEST_PAGES = 4
const MAX_MESSAGE = 2000

/** Acesso atual do titular ao coletivo (`get_collective_access`): nulo se não é membro de um coletivo aprovado. */
async function currentAccess(client: SupabaseServerClient, id: string): Promise<CollectiveAccess | null> {
  return mapCollectiveAccess(unwrap(await client.rpc('get_collective_access', { target: id })))
}

async function requireAccess(client: SupabaseServerClient, id: string): Promise<CollectiveAccess> {
  if (!uuid.test(id)) throw notFound()
  const access = await currentAccess(client, id)
  if (!access) throw unavailableFunction()
  return access
}

const toArea = (mine: MeuColetivo, cor: string): ColetivoArea => ({
  id: mine.id,
  nome: mine.nome,
  tipo: mine.tipo,
  cidade: mine.cidade,
  estado: mine.estado,
  cargo: mine.cargo,
  dono: mine.dono,
  cor,
})

/**
 * Layout `/coletivo/:id`: quem não é membro (ou o coletivo está encerrado/inexistente) recebe 404. Membro de coletivo
 * ainda não aprovado (em análise, recusado, suspenso) vê o estado e nenhuma função interna (RN-30). Membro de
 * coletivo aprovado recebe as permissões efetivas e, se gere pedidos, quantos estão pendentes.
 */
export async function loadCollectiveArea(client: SupabaseServerClient, id: string): Promise<CollectiveAreaData> {
  if (!uuid.test(id)) throw notFound()
  const mine = mapMyCollectives(unwrap(await client.rpc('list_my_collectives'))).find((c) => c.id === id)
  if (!mine || mine.situacao === 'closed') throw notFound()
  if (mine.situacao !== 'approved') {
    // Só o proprietário acompanha o pedido e o motivo da decisão (RN-30).
    const motivo = mine.dono ? mapDecisionReason(unwrap(await client.rpc('get_collective_status', { target: id }))) : null
    return { status: 'unavailable', coletivo: toArea(mine, DEFAULT_ACCENT), situacao: mine.situacao as SituacaoBloqueada, motivo }
  }
  const [access, colors] = await Promise.all([
    currentAccess(client, id),
    client.from('collectives').select('id,color').eq('id', id).maybeSingle(),
  ])
  if (!access) throw notFound()
  const color = unwrap(colors)?.color
  const pendentes = can(access, 'manage_requests')
    ? mapRequestQueue(unwrap(await client.rpc('list_collective_requests', { target: id }))).length
    : null
  return {
    status: 'available',
    coletivo: toArea(mine, color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT),
    permissoes: access.permissoes,
    pendentes,
  }
}

export type CollectiveDashboardData = {
  eventos: EventoGestao[]
  /** Verdadeiro quando a lista vem da gestão (rascunhos e cancelados incluídos); falso: só eventos publicados. */
  gestao: boolean
  mensagens: ResumoMensagens | null
}

/** Futuros (em andamento primeiro) por proximidade e depois os encerrados, do mais recente ao mais antigo (RN-22). */
async function loadManagedEvents(client: SupabaseServerClient, id: string): Promise<EventoGestao[]> {
  const [ongoing, future, past] = await Promise.all(
    (['ongoing', 'future', 'past'] as const).map(async (period) =>
      mapManagedEvents(unwrap(await client.rpc('list_collective_events', { target: id, period })), period),
    ),
  )
  return [...ongoing, ...future, ...past.slice(0, PAST_EVENTS_SHOWN)]
}

/** Membro sem permissão de eventos vê só o que é público: os eventos publicados do coletivo. */
async function loadPublicEvents(client: SupabaseServerClient, id: string, now: number): Promise<EventoGestao[]> {
  const rows = unwrap(
    await client
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('collective_id', id)
      .eq('state', 'published')
      .order('starts_at', { ascending: false })
      .limit(PUBLIC_EVENT_WINDOW),
  )
  const all = mapEventList(rows).map((evento): EventoGestao => ({
    id: evento.id,
    nome: evento.nome,
    situacao: 'published',
    periodo: !eventoNaoEncerrado(evento, now) ? 'past' : Date.parse(evento.inicio) <= now ? 'ongoing' : 'future',
    inicio: evento.inicio,
    fim: evento.fim,
  }))
  return [
    ...all.filter((evento) => evento.periodo !== 'past').reverse(),
    ...all.filter((evento) => evento.periodo === 'past').slice(0, PAST_EVENTS_SHOWN),
  ]
}

/** Dashboard do coletivo: eventos conforme as permissões e as conversas do coletivo quando "ler mensagens" vale. */
export async function loadCollectiveDashboard(
  client: SupabaseServerClient,
  id: string,
  now = Date.now(),
): Promise<CollectiveDashboardData> {
  const access = await requireAccess(client, id)
  const gestao = EVENT_PERMISSIONS.some((permission) => can(access, permission))
  const [eventos, mensagens] = await Promise.all([
    gestao ? loadManagedEvents(client, id) : loadPublicEvents(client, id, now),
    can(access, 'read_messages')
      ? client.rpc('list_conversations').then((result) => summarizeCollectiveConversations(unwrap(result), id))
      : Promise.resolve(null),
  ])
  return { eventos, gestao, mensagens }
}

export type CollectiveRequestsData = { pedidos: PedidoEntrada[] }

/** Fila de pedidos pendentes; sem "gerir pedidos de entrada" o banco recusa e a rota responde 403. */
export async function loadCollectiveRequests(client: SupabaseServerClient, id: string): Promise<CollectiveRequestsData> {
  const access = await requireAccess(client, id)
  if (!can(access, 'manage_requests')) throw noPermission('gerir pedidos de entrada')
  return { pedidos: mapRequestQueue(unwrap(await client.rpc('list_collective_requests', { target: id }))) }
}

export const collectiveRequestsPath = (id: string) => `/coletivo/${id}/solicitacoes`

/** Aprovar ou recusar um pedido (`decide_collective_request`); quem aprova sempre atribui o perfil Membro (RN-19). */
export function collectiveRequestsAction(request: Request, id: string) {
  if (!uuid.test(id)) throw new Response('Coletivo não encontrado', { status: 404 })
  return runMutation(request, collectiveRequestsPath(id), async (client, form) => {
    const intent = form.get('intent')
    if (intent !== 'approve' && intent !== 'decline') throw new ActionFailure(400, 'Decisão inválida.')
    const target = formId(form, 'request', 'Pedido inválido.')
    await callRpc(client.rpc('decide_collective_request', { target_request: target, approve: intent === 'approve' }))
    return intent === 'approve'
      ? 'Pedido aprovado. A pessoa agora faz parte do coletivo com o perfil Membro.'
      : 'Pedido recusado.'
  })
}

/** Todos os pedidos do titular (a RPC pagina por id; poucas páginas bastam para o PoC). */
async function loadMyRequests(client: SupabaseServerClient): Promise<MeuPedido[]> {
  const all: MeuPedido[] = []
  let after: string | undefined
  for (let page = 0; page < REQUEST_PAGES; page++) {
    const rows = mapMyRequests(unwrap(await client.rpc('get_my_collective_requests', after ? { after_id: after } : {})))
    all.push(...rows)
    if (rows.length < 50) break
    after = rows[rows.length - 1].id
  }
  return all
}

/**
 * `/painel/coletivos`: meus coletivos, meus pedidos de entrada (pendentes primeiro) e os coletivos aprovados
 * em que ainda posso pedir entrada (nem membro, nem com pedido pendente).
 */
export async function loadMyCollectivesPage(client: SupabaseServerClient): Promise<MyCollectivesData> {
  const [mine, profiles, catalog, requests] = await Promise.all([
    client.rpc('list_my_collectives'),
    client.rpc('list_my_profiles'),
    client.from('collectives').select(COLLECTIVE_COLUMNS).order('name').order('id'),
    loadMyRequests(client),
  ])
  const coletivos = mapMyCollectives(unwrap(mine))
  const approved = mapCollectiveList(unwrap(catalog))
  const names = new Map(approved.map((c) => [c.id, c.nome]))
  const memberOf = new Set(coletivos.map((c) => c.id))
  const pending = new Set(requests.filter((p) => p.situacao === 'pending').map((p) => p.coletivoId))
  return {
    coletivos,
    perfis: mapMyProfiles(unwrap(profiles)),
    pedidos: requests
      .map((p) => ({ ...p, coletivoNome: names.get(p.coletivoId) ?? null }))
      .sort((a, b) => Number(b.situacao === 'pending') - Number(a.situacao === 'pending') || b.criadoEm.localeCompare(a.criadoEm) || a.id.localeCompare(b.id)),
    disponiveis: approved
      .filter((c) => !memberOf.has(c.id))
      .map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, cidade: c.cidade, estado: c.estado, pendente: pending.has(c.id) })),
  }
}

export const MY_COLLECTIVES_PATH = '/painel/coletivos'

/** Pedir entrada em um coletivo aprovado ou cancelar um pedido pendente. Erros do banco chegam traduzidos. */
export function myCollectivesAction(request: Request) {
  return runMutation(request, MY_COLLECTIVES_PATH, async (client, form) => {
    const intent = form.get('intent')
    if (intent === 'cancel') {
      await callRpc(client.rpc('cancel_collective_request', { target_request: formId(form, 'request', 'Pedido inválido.') }))
      return 'Pedido cancelado.'
    }
    if (intent === 'request') {
      const target = formId(form, 'collective', 'Escolha um coletivo.')
      const profile = form.get('profile') ? formId(form, 'profile', 'Escolha uma das suas atuações.') : undefined
      // O navegador envia quebras de linha como CRLF; o banco conta caracteres.
      const message = (form.get('message') ?? '').replace(/\r\n/g, '\n').trim()
      if (message.length > MAX_MESSAGE) throw new ActionFailure(422, 'A apresentação pode ter até 2.000 caracteres.')
      await callRpc(client.rpc('request_collective_membership', { target, profile, message }))
      return 'Pedido enviado. A administração do coletivo vai analisá-lo.'
    }
    throw new ActionFailure(400, 'Operação inválida.')
  })
}
