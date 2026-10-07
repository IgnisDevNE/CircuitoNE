import type { ChatConversa, ChatOpen, ChatThread } from '../lib/chat'
import { CHAT_API } from '../lib/chat'
import { MESSAGE_FORM_BYTES, MESSAGE_SENT } from '../lib/messages'
import { readAccountSession, routePath } from './auth.server'
import { mapMessages, type Lado } from './mappers/messages'
import { listConversations, loadDetails, loadNewMessage, PAGE, sendFrom } from './messages.server'
import { callRpc, formId, runMutation } from './mutation.server'
import { createSupabaseServerClient, HttpError, privateHeaders, unwrap, unavailable, type SupabaseServerClient } from './supabase.server'

/**
 * Chat flutuante: rotas de recurso JSON (`/api/chat/*`, sem tela) que reaproveitam as funções de mensagens da W10.
 * Nenhuma delas redireciona: quem chama é uma janela sobre a página atual, que nunca pode navegar.
 */

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new HttpError(404, 'Conversa não encontrada.')
const side = (lado: Lado) => (lado.id ? `${lado.kind}:${lado.id}` : '')

/**
 * Dados para abrir a janela de um interlocutor (`profile:<id>` ou `collective:<id>`): quem pode enviar, as conversas que
 * já existem entre uma das minhas pontas e ele (a mais recente primeiro) e o histórico da mais recente. O interlocutor que
 * o titular não enxerga responde 404.
 */
export async function loadChatOpen(client: SupabaseServerClient, para: string | null): Promise<ChatOpen> {
  const { destinatario, remetentes } = await loadNewMessage(client, para)
  const senders = new Set(remetentes.map(side))
  const target = side(destinatario)
  const conversas: ChatConversa[] = []
  // `list_conversations` já vem da mais recente para a mais antiga e só traz o que o titular pode ler.
  for (const conversa of await listConversations(client)) {
    const [a, b] = conversa.lados
    for (const [mine, other] of [[a, b], [b, a]] as const) {
      if (side(other) !== target || !senders.has(side(mine))) continue
      conversas.push({ id: conversa.id, de: mine, naoLidas: conversa.naoLidas, bloqueada: conversa.bloqueada, arquivada: conversa.arquivada })
      break
    }
  }
  const first = conversas[0]
  const inicial = first ? { conversationId: first.id, ...(await loadChatThread(client, first.id)) } : null
  return { destinatario, remetentes, conversas, inicial }
}

/** Cursor de "carregar anteriores": o texto original do banco (com microssegundos) e o id da mensagem mais antiga carregada. */
export type ThreadCursor = { time: string; id: string }

/**
 * Mensagens mais recentes de uma conversa (ou as 50 anteriores ao cursor) e se ela está bloqueada. A conversa que o titular
 * não pode ler responde 404, igual a uma que não existe: `get_conversation_details` só devolve linhas legíveis.
 */
export async function loadChatThread(client: SupabaseServerClient, id: string, before?: ThreadCursor): Promise<ChatThread> {
  if (!uuid.test(id)) throw notFound()
  const [details, rows] = await Promise.all([
    loadDetails(client, [id]),
    client.rpc('get_recent_messages', { target: id, ...(before ? { before_time: before.time, before_id: before.id } : {}) }),
  ])
  const detail = details.get(id)
  if (!detail) throw notFound()
  const mensagens = mapMessages(unwrap(rows))
  return { mensagens, maisAnteriores: mensagens.length === PAGE, bloqueada: detail.bloqueadaPor.length > 0 }
}

const cursorOf = (params: URLSearchParams): ThreadCursor | undefined => {
  const time = params.get('antes_t')
  const id = params.get('antes_id')
  if (time === null && id === null) return undefined
  // O banco recusa cursor inválido (22023), mas o formato é conferido aqui antes de qualquer consulta.
  if (!time || !id || time.length > 40 || !uuid.test(id) || Number.isNaN(Date.parse(time))) throw new HttpError(404, 'Conversa não encontrada.')
  return { time, id }
}

const json = (body: unknown, status: number, headers: Headers) => Response.json(body, { status, headers })

/** `data()` de `runMutation` (resultado + status + cabeçalhos privados) como uma resposta JSON de verdade. */
const asResponse = (result: unknown): Response => {
  if (result instanceof Response) return result
  const { data, init } = result as { data: unknown; init?: { status?: number; headers?: HeadersInit } }
  return Response.json(data, { status: init?.status ?? 200, headers: init?.headers })
}

/**
 * GET `/api/chat/abrir?para=` e `/api/chat/conversa?id=[&antes_t=&antes_id=]`. A sessão é validada no servidor
 * (getUser + conta ativa) antes de qualquer leitura; respostas privadas, sem cache, com os cookies de Auth renovados.
 */
export async function chatLoader(request: Request, route: string | undefined): Promise<Response> {
  const headers = privateHeaders()
  if (request.method !== 'GET') return json({ error: 'Operação indisponível.' }, 405, headers)
  // Os cookies de sessão são SameSite=Lax; a checagem é a segunda barreira contra leitura a partir de outro site.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Origem recusada.' }, 403, headers)
  if (route !== 'abrir' && route !== 'conversa') return json({ error: 'Operação indisponível.' }, 404, headers)
  try {
    const client = createSupabaseServerClient(request, headers)
    const session = await readAccountSession(client, request, headers)
    if (session.kind === 'error') return json({ error: session.message }, 503, headers)
    if (session.kind === 'anonymous') return json({ error: 'Sua sessão expirou. Entre novamente para continuar.' }, 401, headers)
    if (session.account.state !== 'active') return json({ error: 'Esta conta não pode enviar nem ler mensagens.' }, 403, headers)
    const params = new URL(request.url).searchParams
    const body =
      route === 'abrir'
        ? await loadChatOpen(client, params.get('para'))
        : await loadChatThread(client, params.get('id') ?? '', cursorOf(params))
    return json(body, 200, headers)
  } catch (error) {
    // Nunca 502/504 nem texto do banco: falhas viram 4xx/503 com mensagem própria.
    const failure = error instanceof HttpError ? error : unavailable()
    return json({ error: failure.message }, failure.status, headers)
  }
}

/**
 * POST `/api/chat/enviar` (`via`, `body`, `request_id`) e `/api/chat/lida` (`conversation`, `last`). Mesma casca das demais
 * escritas (`runMutation`): só POST no caminho esperado, `APP_ORIGIN`, corpo limitado e cookies do titular; o sucesso só
 * existe depois do RPC, e as permissões (inclusive as do coletivo) e o bloqueio são decididos pelo banco.
 */
export async function chatAction(request: Request, route: string | undefined): Promise<Response> {
  if (route !== 'enviar' && route !== 'lida') return json({ ok: false, error: 'Operação indisponível.' }, 404, privateHeaders())
  const path = `${CHAT_API}/${route}`
  if (routePath(request) !== path) return json({ ok: false, error: 'Operação indisponível.' }, 405, privateHeaders())
  return asResponse(
    await runMutation(
      request,
      path,
      async (client, form) => {
        if (route === 'enviar') {
          // Só aceita o par "de quem envia > interlocutor" que o formulário traz; o RPC confere cada ponta.
          const { conversation } = await sendFrom(client, form)
          return { message: MESSAGE_SENT, extra: { conversation_id: conversation } }
        }
        const target = formId(form, 'conversation', 'Conversa inválida.')
        await callRpc(client.rpc('mark_conversation_read', { target, last_message: formId(form, 'last', 'Mensagem inválida.') }))
        return 'Conversa marcada como lida.'
      },
      { maxBytes: MESSAGE_FORM_BYTES },
    ),
  )
}

