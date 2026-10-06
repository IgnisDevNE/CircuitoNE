import { can } from '../lib/collective-access'
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_FORM_BYTES,
  MESSAGE_SENT,
  normalizeText,
  parseParty,
  parseRoute,
  textLength,
} from '../lib/messages'
import { requireAccess } from './collective-area.server'
import { mapMyCollectives, mapMyProfiles } from './mappers/account'
import {
  identityOf,
  mapConversationDetails,
  mapConversations,
  mapMessages,
  toConversaItem,
  type Conversa,
  type DetalheConversa,
  type Identity,
  type Lado,
  type Mensagem,
  type MessagesPageData,
  type NewMessageData,
} from './mappers/messages'
import { ActionFailure, callRpc, formId, runMutation } from './mutation.server'
import { HttpError, unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 50
/** Páginas de `list_conversations` percorridas (200 conversas); a lista mostra as 50 mais recentes. */
const LIST_PAGES = 4
/** Páginas de histórico que uma conversa carrega de uma vez (500 mensagens). */
export const MAX_THREAD_PAGES = 10
const NEW_MESSAGE_PATH = '/painel/mensagens/nova'

const conversationNotFound = () => new HttpError(404, 'Conversa não encontrada.')

/** Onde as mensagens são lidas: a conta (como cada uma das suas atuações) ou um coletivo (como o próprio coletivo). */
export type MessageScope = { kind: 'account' } | { kind: 'collective'; id: string }

export const messagesBase = (scope: MessageScope) => (scope.kind === 'account' ? '/painel/mensagens' : `/coletivo/${scope.id}/mensagens`)
const threadPath = (scope: MessageScope, id: string) => `${messagesBase(scope)}/${id}`

type Context = { me: Identity; podeEnviar: boolean }

/**
 * Quem está lendo. Conta: conversas em que uma das suas atuações é uma ponta. Coletivo: exige "ler mensagens"
 * (o banco também recusa); "enviar mensagens" é outra permissão e só libera o campo de envio.
 */
async function resolveContext(client: SupabaseServerClient, scope: MessageScope): Promise<Context> {
  if (scope.kind === 'account') {
    const profiles = mapMyProfiles(unwrap(await client.rpc('list_my_profiles')))
    return { me: identityOf(profiles.map((profile) => ({ kind: 'profile' as const, id: profile.id }))), podeEnviar: profiles.length > 0 }
  }
  const access = await requireAccess(client, scope.id)
  if (!can(access, 'read_messages')) throw new HttpError(403, 'Você não tem permissão para ler as mensagens deste coletivo.')
  return { me: identityOf([{ kind: 'collective', id: scope.id }]), podeEnviar: can(access, 'send_messages') }
}

/** Todas as conversas legíveis pelo titular, da mais recente à mais antiga (a RPC pagina por cursor). */
async function listConversations(client: SupabaseServerClient): Promise<Conversa[]> {
  const all: Conversa[] = []
  let after: { time: string; id: string } | undefined
  for (let page = 0; page < LIST_PAGES; page++) {
    const rows = mapConversations(
      unwrap(await client.rpc('list_conversations', after ? { after_time: after.time, after_id: after.id } : {})),
    )
    all.push(...rows)
    if (rows.length < PAGE) break
    const last = rows[rows.length - 1]
    after = { time: last.cursor, id: last.id }
  }
  return all
}

async function loadDetails(client: SupabaseServerClient, ids: string[]): Promise<Map<string, DetalheConversa>> {
  if (ids.length === 0) return new Map()
  return mapConversationDetails(unwrap(await client.rpc('get_conversation_details', { targets: ids })))
}

/**
 * Histórico da conversa a partir da página mais recente; cada página extra volta mais 50 mensagens usando
 * como cursor a mais antiga já carregada (o cursor é o texto original do banco, com microssegundos).
 */
async function loadThread(client: SupabaseServerClient, id: string, pages: number) {
  const mensagens: Mensagem[] = []
  let before: { time: string; id: string } | undefined
  let more = false
  for (let page = 0; page < pages; page++) {
    const rows = mapMessages(
      unwrap(await client.rpc('get_recent_messages', { target: id, ...(before ? { before_time: before.time, before_id: before.id } : {}) })),
    )
    mensagens.unshift(...rows)
    more = rows.length === PAGE
    if (!more) break
    before = { time: rows[0].cursor, id: rows[0].id }
  }
  return { mensagens, maisAnteriores: more && pages < MAX_THREAD_PAGES }
}

/**
 * Conversas do titular (com a última mensagem e as não lidas) e, se `conversationId` vier, o histórico dela.
 * Conversa que o titular não pode ler responde 404, igual a uma que não existe.
 */
export async function loadMessages(
  client: SupabaseServerClient,
  scope: MessageScope,
  options: { conversationId?: string; pages?: number } = {},
): Promise<MessagesPageData> {
  const { conversationId } = options
  if (conversationId !== undefined && !uuid.test(conversationId)) throw conversationNotFound()
  const context = await resolveContext(client, scope)
  const mine = (await listConversations(client)).filter((conversa) => conversa.lados.some(context.me))
  const shown = mine.slice(0, PAGE)
  const open = conversationId ? mine.find((conversa) => conversa.id === conversationId) : undefined
  if (conversationId && !open) throw conversationNotFound()
  const pages = Math.min(Math.max(Math.trunc(options.pages ?? 1) || 1, 1), MAX_THREAD_PAGES)
  const needsOwnDetails = !!open && !shown.some((conversa) => conversa.id === open.id)
  const [details, openDetails, thread] = await Promise.all([
    loadDetails(client, shown.map((conversa) => conversa.id)),
    needsOwnDetails ? loadDetails(client, [open.id]) : Promise.resolve(new Map<string, DetalheConversa>()),
    open ? loadThread(client, open.id, pages) : Promise.resolve(null),
  ])
  const item = (conversa: Conversa) => toConversaItem(conversa, details.get(conversa.id) ?? openDetails.get(conversa.id), context.me)
  return {
    conversas: shown.map(item),
    limitada: mine.length > shown.length,
    podeEnviar: context.podeEnviar,
    aberta: open && thread ? { conversa: item(open), mensagens: thread.mensagens, maisAnteriores: thread.maisAnteriores, paginas: pages } : null,
  }
}

/** Número de páginas de histórico pedido na URL (`?paginas=2`); qualquer valor inválido vale 1. */
export const threadPages = (request: Request) => {
  const value = Number(new URL(request.url).searchParams.get('paginas'))
  return Number.isInteger(value) && value >= 1 ? Math.min(value, MAX_THREAD_PAGES) : 1
}

/** Texto digitado: CRLF do navegador normalizado, sem espaços nas pontas, entre 1 e 2.000 caracteres (não unidades UTF-16). */
function messageText(form: URLSearchParams, key: string, empty: string, tooLong: string) {
  const value = normalizeText(form.get(key) ?? '')
  if (!value) throw new ActionFailure(422, empty)
  if (textLength(value) > MAX_MESSAGE_LENGTH) throw new ActionFailure(422, tooLong)
  return value
}

/** A mesma chave de idempotência só vale para o mesmo envio; sem JavaScript o formulário não traz uma e o servidor gera. */
const requestId = (form: URLSearchParams) => {
  const value = form.get('request_id') ?? ''
  return uuid.test(value) ? value : crypto.randomUUID()
}

async function sendFrom(client: SupabaseServerClient, form: URLSearchParams) {
  const route = parseRoute(form.get('via'))
  if (!route) throw new ActionFailure(400, 'Escolha com qual atuação ou coletivo enviar.')
  const body = messageText(form, 'body', 'Escreva uma mensagem.', `A mensagem pode ter até ${MAX_MESSAGE_LENGTH.toLocaleString('pt-BR')} caracteres.`)
  const sent = await callRpc(
    client.rpc('send_message', {
      sender_kind: route.from.kind,
      sender: route.from.id,
      recipient_kind: route.to.kind,
      recipient: route.to.id,
      body,
      request_id: requestId(form),
    }),
  )
  const conversation = (sent as { conversation_id?: unknown } | null)?.conversation_id
  if (typeof conversation !== 'string' || !uuid.test(conversation)) throw new ActionFailure(503, 'Não foi possível confirmar o envio. Atualize a página.')
  return { route, conversation }
}

/**
 * Ações de uma conversa aberta: enviar, marcar como lida, bloquear/desbloquear e denunciar. O sucesso só existe depois
 * de o RPC responder; as permissões (inclusive as do coletivo) são decididas pelo banco.
 */
export function messagesAction(request: Request, scope: MessageScope, conversationId: string | undefined) {
  if (!conversationId || !uuid.test(conversationId) || (scope.kind === 'collective' && !uuid.test(scope.id)))
    throw new Response('Conversa não encontrada', { status: 404 })
  return runMutation(
    request,
    threadPath(scope, conversationId),
    async (client, form) => {
      const intent = form.get('intent')
      if (intent === 'send') {
        await sendFrom(client, form)
        return MESSAGE_SENT
      }
      if (intent === 'read') {
        await callRpc(client.rpc('mark_conversation_read', { target: conversationId, last_message: formId(form, 'last', 'Mensagem inválida.') }))
        return 'Conversa marcada como lida.'
      }
      if (intent === 'block' || intent === 'unblock') {
        const as = parseParty(form.get('as'))
        if (!as) throw new ActionFailure(400, 'Escolha com qual atuação ou coletivo bloquear.')
        const blocked = intent === 'block'
        await callRpc(client.rpc('set_conversation_block', { target: conversationId, as_kind: as.kind, as_id: as.id, blocked }))
        // Só quem criou o bloqueio o remove, e o banco ignora o pedido dos outros sem erro: confirmar antes de dizer que removeu.
        if (!blocked) {
          const stillBlocked = (await loadDetails(client, [conversationId])).get(conversationId)?.bloqueadaPor.some((lado) => lado.id === as.id && lado.kind === as.kind)
          if (stillBlocked) throw new ActionFailure(409, 'Não foi possível remover o bloqueio. Só quem bloqueou pode desbloquear.')
        }
        return blocked ? 'Conversa bloqueada. Nenhum dos lados envia mensagens até o desbloqueio.' : 'Bloqueio removido.'
      }
      if (intent === 'report') {
        const message = formId(form, 'message', 'Mensagem inválida.')
        const reason = messageText(form, 'reason', 'Explique o motivo da denúncia.', `O motivo pode ter até ${MAX_MESSAGE_LENGTH.toLocaleString('pt-BR')} caracteres.`)
        await callRpc(client.rpc('report_message', { target: message, reason }))
        return 'Denúncia enviada. A moderação vai analisar a mensagem.'
      }
      throw new ActionFailure(400, 'Operação inválida.')
    },
    { maxBytes: MESSAGE_FORM_BYTES },
  )
}

const notFoundRecipient = () => new HttpError(404, 'Interlocutor não encontrado.')

/**
 * Tela de nova conversa (`?para=profile:<id>` ou `collective:<id>`). O destinatário vem das mesmas consultas
 * públicas das páginas de artista e de coletivo; o que o titular não enxerga responde 404.
 */
export async function loadNewMessage(client: SupabaseServerClient, para: string | null): Promise<NewMessageData> {
  const target = parseParty(para)
  if (!target) throw notFoundRecipient()
  const [found, profiles, collectives] = await Promise.all([
    target.kind === 'profile'
      ? client.from('profiles').select('id,name').eq('id', target.id).maybeSingle()
      : client.from('collectives').select('id,name').eq('id', target.id).maybeSingle(),
    client.rpc('list_my_profiles'),
    client.rpc('list_my_collectives'),
  ])
  const row = unwrap(found)
  if (!row || typeof row.name !== 'string' || !row.name) throw notFoundRecipient()
  const destinatario: Lado = { kind: target.kind, id: target.id, nome: row.name }
  const mine: Lado[] = mapMyProfiles(unwrap(profiles)).map((profile) => ({ kind: 'profile', id: profile.id, nome: profile.nome }))
  const approved = mapMyCollectives(unwrap(collectives)).filter((collective) => collective.situacao === 'approved').slice(0, 10)
  const allowed = await Promise.all(
    approved.map(async (collective) => {
      const access = await requireAccess(client, collective.id).catch(() => null)
      return access && can(access, 'send_messages') && can(access, 'read_messages') ? ({ kind: 'collective', id: collective.id, nome: collective.nome } as Lado) : null
    }),
  )
  const remetentes = [...mine, ...allowed.filter((lado): lado is Lado => lado !== null)].filter((lado) => lado.id !== target.id || lado.kind !== target.kind)
  return { destinatario, remetentes }
}

/** Primeira mensagem (ou mais uma) para um interlocutor; depois do envio leva para a conversa, na área de quem enviou. */
export function newMessageAction(request: Request) {
  // runMutation só redireciona depois do RPC e leva os cookies renovados da sessão no redirecionamento.
  return runMutation(
    request,
    NEW_MESSAGE_PATH,
    async (client, form) => {
      const { route, conversation } = await sendFrom(client, form)
      return {
        redirectTo:
          route.from.kind === 'collective' ? `/coletivo/${route.from.id}/mensagens/${conversation}` : `/painel/mensagens/${conversation}`,
      }
    },
    { maxBytes: MESSAGE_FORM_BYTES },
  )
}
