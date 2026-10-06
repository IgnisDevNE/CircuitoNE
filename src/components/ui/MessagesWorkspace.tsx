import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'
import { Link } from '../../router'
import type { ActionResult } from '../../lib/action-result'
import { REFRESH_INTERVAL_MS } from '../../lib/messages'
import { cx } from '../../lib/utils'
import type { MessagesPageData } from '../../server/mappers/messages'
import { Chat } from './Chat'
import { ConversationList } from './ConversationList'
import { Button, Empty, Panel } from './primitives'

export interface MessagesWorkspaceProps extends MessagesPageData {
  /** `/painel/mensagens` ou `/coletivo/:id/mensagens`. */
  basePath: string
  feedback?: ActionResult | null
  busy?: boolean
  /** Atalho para começar uma conversa (só na conta). */
  novaHref?: string
}

/** Recarrega os dados a cada ~15 s com a aba visível: não há Realtime (as tabelas de mensagens são privadas). */
function useAutoRefresh() {
  const revalidator = useRevalidator()
  const ref = useRef(revalidator)
  ref.current = revalidator
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && ref.current.state === 'idle') void ref.current.revalidate()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
  return revalidator
}

/** Duas colunas (conversas e histórico); no celular mostra a lista ou a conversa aberta. */
export function MessagesWorkspace({ basePath, conversas, limitada, podeEnviar, aberta, feedback, busy = false, novaHref }: MessagesWorkspaceProps) {
  const revalidator = useAutoRefresh()
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Panel title="conversas" className={cx('lg:h-[70vh]', aberta && 'hidden lg:block')} bodyClassName="max-h-[70vh] overflow-y-auto">
        {novaHref && (
          <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">
            Para começar uma conversa, use "Enviar mensagem" no perfil de um artista ou coletivo.
          </p>
        )}
        <ConversationList basePath={basePath} conversas={conversas} abertaId={aberta?.conversa.id} limitada={limitada} />
      </Panel>

      <Panel
        title={aberta ? aberta.conversa.titulo : 'conversa'}
        className={cx('flex h-[70vh] flex-col', !aberta && 'hidden lg:flex')}
        bodyClassName="flex min-h-0 flex-1 flex-col"
        actions={
          <span className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={revalidator.state !== 'idle'} onClick={() => void revalidator.revalidate()}>
              atualizar
            </Button>
          </span>
        }
      >
        {aberta ? (
          <>
            <Link to={basePath} className="mb-2 font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)] lg:hidden">← conversas</Link>
            <Chat basePath={basePath} aberta={aberta} podeEnviar={podeEnviar} feedback={feedback} busy={busy} />
          </>
        ) : (
          <Empty>Selecione uma conversa.</Empty>
        )}
      </Panel>
    </div>
  )
}
