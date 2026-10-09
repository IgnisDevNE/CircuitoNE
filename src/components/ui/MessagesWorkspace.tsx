import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useRevalidator } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { REFRESH_INTERVAL_MS, partyKey } from '../../lib/messages'
import { cx } from '../../lib/utils'
import type { Lado, MessagesPageData } from '../../server/mappers/messages'
import { useOutgoing } from '../chat/useOutgoing'
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
  /** A central da conta mistura atuações e coletivos: cada conversa diz "como …" e a lista ganha o filtro por identidade. */
  identidade?: boolean
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

const ALL = ''
const kindLabel = (lado: Lado) => (lado.kind === 'collective' ? 'coletivo' : 'atuação')

/** Atuações e coletivos que aparecem nas conversas, sem repetir, na ordem em que surgem. */
function identitiesOf(conversas: MessagesPageData['conversas']): Lado[] {
  const seen = new Map<string, Lado>()
  for (const conversa of conversas)
    for (const lado of conversa.meus) if (lado.id !== null && !seen.has(partyKey({ kind: lado.kind, id: lado.id }))) seen.set(partyKey({ kind: lado.kind, id: lado.id }), lado)
  return [...seen.values()]
}

/** Duas colunas (conversas e histórico); no celular mostra a lista ou a conversa aberta. */
export function MessagesWorkspace({ basePath, conversas, limitada, podeEnviar, aberta, feedback, busy = false, novaHref, identidade = false }: MessagesWorkspaceProps) {
  const revalidator = useAutoRefresh()
  const { revalidate } = revalidator
  const latest = useRef(revalidate)
  latest.current = revalidate
  // Envio otimista: a mensagem entra na conversa na hora; depois do envio (ou de uma recusa que muda o estado) a tela é relida.
  const outgoing = useOutgoing({
    onSent: () => void latest.current(),
    onFailed: (_item, status) => {
      if (status === 401 || status === 403 || status === 409) void latest.current()
    },
  })

  const filterId = useId()
  const [chosen, setChosen] = useState(ALL)
  const identities = useMemo(() => identitiesOf(conversas), [conversas])
  // Se a identidade escolhida sumiu das conversas (por exemplo, o acesso ao coletivo acabou), volta a mostrar todas.
  const filter = identities.some((lado) => partyKey({ kind: lado.kind, id: lado.id ?? '' }) === chosen) ? chosen : ALL
  const shown = filter === ALL ? conversas : conversas.filter((conversa) => conversa.meus.some((lado) => lado.id !== null && partyKey({ kind: lado.kind, id: lado.id }) === filter))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title="conversas" className={cx('lg:h-[70vh]', aberta && 'hidden lg:block')} bodyClassName="max-h-[70vh] overflow-y-auto">
        {novaHref && (
          <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">
            Para começar uma conversa, use "Enviar mensagem" no perfil de um artista ou coletivo.
          </p>
        )}
        {identidade && identities.length > 1 && (
          <div className="mb-3">
            <label htmlFor={filterId} className="mb-1 block font-mono text-xs text-[var(--color-muted)]">Mostrar conversas de</label>
            <select
              id={filterId}
              value={filter}
              onChange={(event) => setChosen(event.target.value)}
              className="w-full bg-[var(--color-bg-elev)] border border-[var(--color-control)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value={ALL}>todas</option>
              {identities.map((lado) => {
                const key = partyKey({ kind: lado.kind, id: lado.id ?? '' })
                return <option key={key} value={key}>{`${lado.nome} (${kindLabel(lado)})`}</option>
              })}
            </select>
          </div>
        )}
        <ConversationList
          basePath={basePath}
          conversas={shown}
          abertaId={aberta?.conversa.id}
          limitada={limitada}
          identidade={identidade}
          vazio={filter === ALL ? undefined : 'Nenhuma conversa com esta atuação ou coletivo.'}
        />
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
            <Chat basePath={basePath} aberta={aberta} podeEnviar={podeEnviar} feedback={feedback} busy={busy} outgoing={outgoing} identidade={identidade} />
          </>
        ) : (
          <Empty>Selecione uma conversa.</Empty>
        )}
      </Panel>
    </div>
  )
}
