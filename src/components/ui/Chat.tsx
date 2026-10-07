import { useEffect, useRef, useState } from 'react'
import { Form, Link, useFetcher } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { MAX_MESSAGE_LENGTH, MESSAGE_SENT, partyKey, routeKey } from '../../lib/messages'
import { cx, fmtDataHora } from '../../lib/utils'
import type { ConversaAberta, Lado, Mensagem } from '../../server/mappers/messages'
import { Badge, Button } from './primitives'

export interface ChatProps {
  /** Caminho da lista de conversas (`/painel/mensagens`): o histórico mais antigo é pedido por `?paginas=`. */
  basePath: string
  aberta: ConversaAberta
  /** Falso quando o titular só pode ler (coletivo sem "enviar mensagens"). */
  podeEnviar: boolean
  /** Resultado da última operação; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

const party = (lado: Lado) => ({ kind: lado.kind, id: lado.id ?? '' })

const fieldClass =
  'w-full bg-[var(--color-bg-elev)] border border-[var(--color-line)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]'

function Bubble({ mensagem, minha, autor }: { mensagem: Mensagem; minha: boolean; autor: boolean }) {
  return (
    <li className={cx('flex flex-col', minha ? 'items-end' : 'items-start')}>
      <div className={cx('max-w-[85%] border px-3 py-2', minha ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[var(--color-line)] bg-[var(--color-bg-elev)]')}>
        {autor && <p className="mb-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-[var(--accent-text)]">{mensagem.autor.nome}</p>}
        {/* Texto livre de outra pessoa: sempre texto puro (nunca HTML ou markdown), preservando as quebras de linha. */}
        <p className="whitespace-pre-wrap break-words text-sm">{mensagem.texto}</p>
      </div>
      <span className="mt-0.5 font-mono text-[0.6rem] text-[var(--color-muted)]">{fmtDataHora(mensagem.criadaEm)}</span>
      {!minha && (
        <details className="mt-0.5 w-full max-w-[85%] font-mono text-[0.65rem] text-[var(--color-muted)]">
          <summary className="cursor-pointer select-none hover:text-[var(--accent-text)]">denunciar</summary>
          <Form method="post" className="mt-1 space-y-1" preventScrollReset>
            <input type="hidden" name="intent" value="report" />
            <input type="hidden" name="message" value={mensagem.id} />
            <label htmlFor={`motivo-${mensagem.id}`} className="block">Motivo da denúncia</label>
            <textarea id={`motivo-${mensagem.id}`} name="reason" required maxLength={MAX_MESSAGE_LENGTH} rows={2} className={fieldClass} />
            <Button type="submit" size="sm" variant="danger" aria-label={`Enviar denúncia da mensagem de ${mensagem.autor.nome}`}>enviar denúncia</Button>
          </Form>
        </details>
      )}
    </li>
  )
}

/** Marca a conversa como lida quando há mensagens novas à vista; falhas são silenciosas e não se repetem para a mesma mensagem. */
function useMarkRead(aberta: ConversaAberta) {
  const fetcher = useFetcher()
  const { conversa, mensagens } = aberta
  const last = mensagens[mensagens.length - 1]?.id
  const marked = useRef<string | null>(null)
  const { submit } = fetcher
  useEffect(() => {
    if (conversa.naoLidas === 0 || !last || marked.current === last) return
    marked.current = last
    void submit({ intent: 'read', last }, { method: 'post' })
  }, [conversa.id, conversa.naoLidas, last, submit])
}

function Composer({ aberta, feedback, busy }: Pick<ChatProps, 'aberta' | 'feedback' | 'busy'>) {
  const { conversa } = aberta
  const [texto, setTexto] = useState('')
  // A chave de idempotência nasce no navegador (nunca no HTML do servidor) e muda a cada envio concluído.
  const [requestId, setRequestId] = useState('')
  useEffect(() => setRequestId(crypto.randomUUID()), [])
  useEffect(() => {
    if (feedback?.ok && feedback.message === MESSAGE_SENT) {
      setTexto('')
      setRequestId(crypto.randomUUID())
    }
  }, [feedback])
  const via = conversa.remetentes.map((r) => ({ key: routeKey(party(r.de), party(r.para)), de: r.de }))
  const textId = `mensagem-${conversa.id}`
  return (
    <Form method="post" preventScrollReset className="mt-3 shrink-0 space-y-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] pt-3">
      <input type="hidden" name="intent" value="send" />
      <input type="hidden" name="request_id" value={requestId} />
      {via.length > 1 ? (
        <div>
          <label htmlFor={`via-${conversa.id}`} className="mb-1 block font-mono text-xs text-[var(--color-muted)]">Enviar como</label>
          <select id={`via-${conversa.id}`} name="via" className={fieldClass} defaultValue={via[0].key}>
            {via.map((option) => <option key={option.key} value={option.key}>{option.de.nome}</option>)}
          </select>
        </div>
      ) : (
        <input type="hidden" name="via" value={via[0].key} />
      )}
      <label htmlFor={textId} className="sr-only">Mensagem para {conversa.titulo}</label>
      <div className="flex gap-2">
        <textarea
          id={textId}
          name="body"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          placeholder="digite uma mensagem…"
          className={cx(fieldClass, 'min-h-12 flex-1 resize-y')}
        />
        <Button type="submit" variant="solid" size="sm" disabled={busy || !texto.trim()}>enviar</Button>
      </div>
    </Form>
  )
}

/** Histórico e envio de uma conversa. O texto das mensagens é sempre renderizado como texto puro. */
export function Chat({ basePath, aberta, podeEnviar, feedback, busy = false }: ChatProps) {
  const { conversa, mensagens, maisAnteriores, paginas } = aberta
  const logRef = useRef<HTMLUListElement>(null)
  const last = mensagens[mensagens.length - 1]?.id
  useMarkRead(aberta)
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [conversa.id, last])

  const meus = new Set(conversa.meus.map((lado) => partyKey(party(lado))))
  const isMine = (lado: Lado) => lado.id !== null && meus.has(partyKey(party(lado)))
  const podeResponder = podeEnviar && !conversa.bloqueada && !conversa.arquivada && conversa.remetentes.length > 0
  const asBlock = conversa.bloqueadaComo ?? conversa.meus[0]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {conversa.bloqueada && <Badge tone="warn">bloqueada</Badge>}
          {conversa.arquivada && <Badge>arquivada</Badge>}
        </div>
        {asBlock && (
          <Form method="post" preventScrollReset>
            <input type="hidden" name="intent" value={conversa.bloqueadaPorMim ? 'unblock' : 'block'} />
            <input type="hidden" name="as" value={partyKey(party(asBlock))} />
            <Button type="submit" size="sm" variant={conversa.bloqueadaPorMim ? 'outline' : 'ghost'} disabled={busy}>
              {conversa.bloqueadaPorMim ? 'desbloquear' : 'bloquear conversa'}
            </Button>
          </Form>
        )}
      </div>

      {maisAnteriores && (
        <Link to={`${basePath}/${conversa.id}?paginas=${paginas + 1}`} preventScrollReset className="mb-2 self-center font-mono text-xs text-[var(--accent-text)] underline">
          carregar anteriores
        </Link>
      )}
      <ul ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-1" role="log" aria-label={`Conversa: ${conversa.titulo}`} aria-live="polite">
        {mensagens.map((mensagem) => (
          <Bubble key={mensagem.id} mensagem={mensagem} minha={isMine(mensagem.autor)} autor={!isMine(mensagem.autor) || conversa.meus.length > 1} />
        ))}
      </ul>

      {feedback && (
        <p role={feedback.ok ? 'status' : 'alert'} className={cx('mt-2 font-mono text-sm', feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]')}>
          {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
        </p>
      )}
      {conversa.bloqueada && (
        <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">
          Conversa bloqueada: ninguém envia mensagens até o desbloqueio.{' '}
          {conversa.bloqueadaPorMim ? 'Só quem bloqueou pode desbloquear, e foi você.' : 'Só quem bloqueou pode desbloquear.'}
        </p>
      )}
      {conversa.arquivada && (
        <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">Conversa arquivada: um dos lados não está mais disponível. O histórico continua visível.</p>
      )}
      {!podeEnviar && (
        <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">Seu perfil de acesso permite ler as mensagens, mas não enviar.</p>
      )}
      {podeResponder && <Composer aberta={aberta} feedback={feedback} busy={busy} />}
    </div>
  )
}
