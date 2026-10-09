/** Chamada do navegador à API JSON do painel lateral do evento (`/api/eventos/:id`). Nunca navega e nunca lança. */
import type { EventPageData } from '../server/mappers/events'
import type { ApiResult } from './chat-client'

const GENERIC = 'Não foi possível carregar o evento agora.'
const TIMEOUT_MS = 20_000

export const eventPath = (id: string) => `/eventos/${id}`

export async function fetchEventSheet(id: string, signal?: AbortSignal): Promise<ApiResult<EventPageData>> {
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const response = await fetch(`/api${eventPath(encodeURIComponent(id))}`, {
      credentials: 'same-origin',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Resposta que não é JSON (por exemplo, uma página de erro do proxy): mensagem genérica abaixo.
    }
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    if (response.ok && typeof record.evento === 'object' && record.error === undefined) return { ok: true, data: body as EventPageData }
    return { ok: false, status: response.status, error: typeof record.error === 'string' ? record.error : GENERIC }
  } catch {
    return { ok: false, status: 0, error: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' }
  }
}
