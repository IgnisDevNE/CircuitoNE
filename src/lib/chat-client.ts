/** Chamadas do navegador à API JSON do chat flutuante (`/api/chat/*`). Nunca navegam e nunca lançam: devolvem `{ ok, ... }`. */
import { CHAT_API, type ChatOpen, type ChatSent, type ChatThread } from './chat'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

const GENERIC = 'Não foi possível concluir a operação. Tente novamente.'
const TIMEOUT_MS = 20_000

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${CHAT_API}/${path}`, {
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Resposta que não é JSON (por exemplo, uma página de erro do proxy): mensagem genérica abaixo.
    }
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    if (response.ok && record.error === undefined) return { ok: true, data: body as T }
    return { ok: false, status: response.status, error: typeof record.error === 'string' ? record.error : GENERIC }
  } catch {
    return { ok: false, status: 0, error: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' }
  }
}

const post = (path: string, fields: Record<string, string>) =>
  call<ChatSent>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })

export const fetchChatOpen = (para: string) => call<ChatOpen>(`abrir?para=${encodeURIComponent(para)}`)

export const fetchChatThread = (id: string, before?: { time: string; id: string }) =>
  call<ChatThread>(
    `conversa?id=${encodeURIComponent(id)}${before ? `&antes_t=${encodeURIComponent(before.time)}&antes_id=${encodeURIComponent(before.id)}` : ''}`,
  )

export const sendChatMessage = (fields: { via: string; body: string; requestId: string }) =>
  post('enviar', { via: fields.via, body: fields.body, request_id: fields.requestId })

export const markChatRead = (conversation: string, last: string) => post('lida', { conversation, last })
