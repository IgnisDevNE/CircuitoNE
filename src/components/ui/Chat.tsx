import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Form, Link, useFetcher } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { pendingOutgoing, type Outgoing } from '../../lib/chat'
import { MAX_MESSAGE_LENGTH, normalizeText, partyKey, routeKey } from '../../lib/messages'
import { cx, fmtDataHora } from '../../lib/utils'
import type { ConversaAberta, ConversaItem, Lado, Mensagem } from '../../server/mappers/messages'
import type { OutgoingApi, OutgoingDraft } from '../chat/useOutgoing'
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
  /** Mensagens em envio (otimista) desta tela; sem isto o campo só funciona como formulário comum. */
  outgoing?: OutgoingApi
  /** Mostra "Enviando como …" (a central da conta, em que cada conversa tem a sua atuação ou coletivo). */
  identidade?: boolean
}

const party = (lado: Lado) => ({ kind: lado.kind, id: lado.id ?? '' })

const fieldClass =
  'w-full bg-[var(--color-bg-elev)] border border-[var(--color-control)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]'
const linkButton =
  'inline-flex min-h-6 items-center px-1 font-mono text-[0.7rem] text-[var(--accent-text)] underline hover:text-[var(--foreground)]'

/** Balão de uma mensagem; `reportable` (padrão) oferece "denunciar" (um formulário da página, que o chat flutuante não usa). */
export function Bubble({ mensagem, minha, autor, reportable = true }: { mensagem: Mensagem; minha: boolean; autor: boolean; reportable?: boolean }) {
  return (
    <li className={cx('flex flex-col', minha ? 'items-end' : 'items-start')}>
      <div className={cx('max-w-[85%] border px-3 py-2', minha ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[var(--color-line)] bg-[var(--color-bg-elev)]')}>
        {autor && <p className="mb-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-[var(--accent-text)]">{mensagem.autor.nome}</p>}
        {/* Texto livre de outra pessoa: sempre texto puro (nunca HTML ou markdown), preservando as quebras de linha. */}
        <p className="whitespace-pre-wrap break-words text-sm">{mensagem.texto}</p>
      </div>
      <span className="mt-0.5 font-mono text-[0.6rem] text-[var(--color-muted)]">{fmtDataHora(mensagem.criadaEm)}</span>
      {!minha && reportable && (
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

/** Primeiros caracteres da mensagem, para os nomes acessíveis dos botões ("tentar de novo: Olá, tudo bem…"). */
const preview = (text: string) => {
  const chars = [...text.replace(/\s+/g, ' ')]
  return chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : chars.join('')
}

/**
 * Mensagem do próprio usuário que ainda não voltou do servidor: aparece na hora, marcada "enviando…". Se falhar, o balão fica,
 * com "mensagem não enviada" e o motivo embaixo; "tentar de novo" reenvia com a mesma chave (só quando tentar de novo pode ajudar).
 */
export function OutgoingBubble({
  item,
  autor,
  onRetry,
  onDiscard,
}: {
  item: Outgoing
  /** Nome de quem envia, quando a tela mostra o autor das mensagens próprias. */
  autor?: string
  onRetry: (requestId: string) => void
  onDiscard: (requestId: string) => void
}) {
  const failed = item.status === 'failed'
  return (
    <li className="flex flex-col items-end" data-outgoing={item.status}>
      <div
        className={cx(
          'max-w-[85%] border px-3 py-2',
          'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]',
          item.status === 'sending' && 'border-dashed',
          failed && 'border-dashed border-[var(--color-warn)]',
        )}
      >
        {autor && <p className="mb-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-[var(--accent-text)]">{autor}</p>}
        <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
      </div>
      {item.status === 'sending' && (
        <span role="status" className="mt-0.5 font-mono text-[0.6rem] text-[var(--color-muted)]">enviando…</span>
      )}
      {failed && (
        <div className="mt-0.5 flex max-w-[85%] flex-col items-end gap-0.5 font-mono text-[0.7rem]">
          <p role="alert" className="text-right text-[var(--accent-text)]">
            <strong className="font-semibold">mensagem não enviada</strong>
            {item.error && <span> · {item.error}</span>}
          </p>
          <span className="flex items-center gap-3">
            {item.retryable && (
              <button type="button" onClick={() => onRetry(item.requestId)} aria-label={`tentar de novo: enviar "${preview(item.body)}"`} className={linkButton}>
                tentar de novo
              </button>
            )}
            <button type="button" onClick={() => onDiscard(item.requestId)} aria-label={`descartar a mensagem não enviada "${preview(item.body)}"`} className={linkButton}>
              descartar
            </button>
          </span>
        </div>
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

function Composer({
  conversa,
  identidade,
  onSend,
}: {
  conversa: ConversaItem
  identidade: boolean
  onSend?: (draft: OutgoingDraft) => void
}) {
  const [texto, setTexto] = useState('')
  const [chosen, setChosen] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const via = conversa.remetentes.map((r) => ({ key: routeKey(party(r.de), party(r.para)), de: r.de }))
  const route = via.some((option) => option.key === chosen) ? chosen : via[0].key
  const textId = `mensagem-${conversa.id}`

  // Com JavaScript o envio é otimista: a mensagem entra na conversa na hora e o campo fica livre. Sem JavaScript (ou antes de a
  // página hidratar) o formulário segue como um envio comum para a ação da rota, que gera a chave de idempotência.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!onSend) return
    event.preventDefault()
    const body = normalizeText(texto)
    if (!body) return
    onSend({ conversationId: conversa.id, via: route, body })
    setTexto('')
    textRef.current?.focus()
  }

  return (
    <Form method="post" preventScrollReset onSubmit={submit} className="mt-3 shrink-0 space-y-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] pt-3">
      <input type="hidden" name="intent" value="send" />
      {via.length > 1 ? (
        <div>
          <label htmlFor={`via-${conversa.id}`} className="mb-1 block font-mono text-xs text-[var(--color-muted)]">Enviar como</label>
          <select id={`via-${conversa.id}`} name="via" className={fieldClass} value={route} onChange={(e) => setChosen(e.target.value)}>
            {via.map((option) => <option key={option.key} value={option.key}>{option.de.nome}</option>)}
          </select>
        </div>
      ) : (
        <>
          <input type="hidden" name="via" value={via[0].key} />
          {identidade && <p className="font-mono text-xs text-[var(--color-muted)]">Enviando como {via[0].de.nome}.</p>}
        </>
      )}
      <label htmlFor={textId} className="sr-only">Mensagem para {conversa.titulo}</label>
      <div className="flex gap-2">
        <textarea
          id={textId}
          ref={textRef}
          name="body"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          placeholder="digite uma mensagem…"
          className={cx(fieldClass, 'min-h-12 flex-1 resize-y')}
        />
        <Button type="submit" variant="solid" size="sm" disabled={!texto.trim()}>enviar</Button>
      </div>
    </Form>
  )
}

/** Histórico e envio de uma conversa. O texto das mensagens é sempre renderizado como texto puro. */
export function Chat({ basePath, aberta, podeEnviar, feedback, busy = false, outgoing, identidade = false }: ChatProps) {
  const { conversa, mensagens, maisAnteriores, paginas } = aberta
  const logRef = useRef<HTMLDivElement>(null)
  const last = mensagens[mensagens.length - 1]?.id
  useMarkRead(aberta)

  const pendentes = outgoing ? pendingOutgoing(outgoing.items.filter((item) => item.conversationId === conversa.id), mensagens) : []
  const prune = outgoing?.prune
  useEffect(() => prune?.(mensagens), [prune, mensagens])
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [conversa.id, last, pendentes.length])

  const meus = new Set(conversa.meus.map((lado) => partyKey(party(lado))))
  const isMine = (lado: Lado) => lado.id !== null && meus.has(partyKey(party(lado)))
  const ativa = !conversa.bloqueada && !conversa.arquivada
  const podeResponder = podeEnviar && ativa && conversa.remetentes.length > 0
  // O titular lê a conversa, mas nenhuma das pontas dele pode enviar (coletivo em que ele só tem "ler mensagens").
  const semPermissao = podeEnviar && ativa && conversa.remetentes.length === 0 && conversa.meus.length > 0
  const asBlock = conversa.bloqueadaComo ?? conversa.meus[0]
  const authorOf = (item: Outgoing) => {
    if (conversa.meus.length < 2) return undefined
    const from = item.via.split('>')[0]
    return conversa.remetentes.find((r) => partyKey(party(r.de)) === from)?.de.nome
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {conversa.bloqueada && <Badge tone="warn">bloqueada</Badge>}
          {conversa.arquivada && <Badge>arquivada</Badge>}
        </div>
        {asBlock?.id && (
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
      {/* O log é o contêiner (o `li` precisa de um `ul` de verdade); rolável, então entra na ordem do teclado (WCAG 2.1.1). */}
      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto p-1" role="log" aria-label={`Conversa: ${conversa.titulo}`} aria-live="polite" tabIndex={0}>
        <ul className="space-y-3">
          {mensagens.map((mensagem) => (
            <Bubble key={mensagem.id} mensagem={mensagem} minha={isMine(mensagem.autor)} autor={!isMine(mensagem.autor) || conversa.meus.length > 1} />
          ))}
          {outgoing &&
            pendentes.map((item) => (
              <OutgoingBubble key={item.requestId} item={item} autor={authorOf(item)} onRetry={outgoing.retry} onDiscard={outgoing.discard} />
            ))}
        </ul>
      </div>

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
      {semPermissao && (
        <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">
          Você pode ler esta conversa, mas não pode enviar mensagens como {conversa.meus.map((lado) => lado.nome).join(' ou ')}: o seu perfil de acesso no coletivo não inclui "enviar mensagens".
        </p>
      )}
      {podeResponder && <Composer key={conversa.id} conversa={conversa} identidade={identidade} onSend={outgoing?.send} />}
    </div>
  )
}
