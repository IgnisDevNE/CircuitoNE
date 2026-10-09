import { useCallback, useEffect, useRef, useState } from 'react'
import { sendChatMessage } from '../../lib/chat-client'
import {
  dropOutgoing,
  isRetryable,
  markFailed,
  markRetry,
  markSent,
  newOutgoing,
  pruneDelivered,
  type ChatSent,
  type Outgoing,
} from '../../lib/chat'
import type { Mensagem } from '../../server/mappers/messages'

export type OutgoingDraft = Pick<Outgoing, 'via' | 'body' | 'conversationId'>

export interface OutgoingApi {
  items: Outgoing[]
  /** Mostra a mensagem na hora (`sending`) e a envia; cada mensagem tem a sua chave de idempotência. */
  send: (draft: OutgoingDraft) => void
  /** Reenvia uma mensagem que falhou, com a mesma chave, rota e texto (o banco devolve a mesma mensagem se ela já tinha passado). */
  retry: (requestId: string) => void
  discard: (requestId: string) => void
  /** Tira da lista as mensagens cuja versão real já está na conversa carregada. */
  prune: (loaded: Mensagem[]) => void
}

export interface OutgoingHandlers {
  /** O banco confirmou o envio (a tela relê a conversa e atualiza o menu). */
  onSent?: (item: Outgoing, sent: ChatSent) => void
  /** O envio falhou: `status` 0 é falha de rede; 401, 403 e 409 pedem uma releitura (sessão, permissão ou bloqueio mudaram). */
  onFailed?: (item: Outgoing, status: number, error: string) => void
}

/**
 * Envio otimista: a mensagem entra na conversa assim que o usuário envia e o campo fica livre para a próxima. Os envios saem
 * em fila (a ordem de escrita é a ordem no banco); uma falha não trava os seguintes. Nunca navega nem lança.
 */
export function useOutgoing(handlers: OutgoingHandlers = {}): OutgoingApi {
  const [items, setItems] = useState<Outgoing[]>([])
  // A fonte da verdade é o ref (leitura síncrona nas ações); o estado só dispara a renderização.
  const list = useRef<Outgoing[]>([])
  const queue = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  const update = useCallback((change: (current: Outgoing[]) => Outgoing[]) => {
    const next = change(list.current)
    if (next === list.current) return
    list.current = next
    setItems(next)
  }, [])

  const dispatch = useCallback(
    (item: Outgoing) => {
      queue.current = queue.current.then(async () => {
        // Descartada antes de a vez chegar (só falhas são descartáveis, então isto é só uma guarda).
        if (!list.current.some((entry) => entry.requestId === item.requestId)) return
        const result = await sendChatMessage({ via: item.via, body: item.body, requestId: item.requestId })
        if (result.ok) {
          update((current) => markSent(current, item.requestId, result.data.message_id ?? null))
          latest.current.onSent?.(item, result.data)
        } else {
          update((current) => markFailed(current, item.requestId, result.error, isRetryable(result.status)))
          latest.current.onFailed?.(item, result.status, result.error)
        }
      })
    },
    [update],
  )

  const send = useCallback(
    (draft: OutgoingDraft) => {
      const item = newOutgoing({ ...draft, requestId: crypto.randomUUID() })
      update((current) => [...current, item])
      dispatch(item)
    },
    [update, dispatch],
  )

  const retry = useCallback(
    (requestId: string) => {
      const item = list.current.find((entry) => entry.requestId === requestId)
      if (!item || item.status !== 'failed' || !item.retryable) return
      update((current) => markRetry(current, requestId))
      dispatch({ ...item, status: 'sending', error: null })
    },
    [update, dispatch],
  )

  const discard = useCallback((requestId: string) => update((current) => dropOutgoing(current, requestId)), [update])
  const prune = useCallback((loaded: Mensagem[]) => update((current) => pruneDelivered(current, loaded)), [update])

  return { items, send, retry, discard, prune }
}
