import { useEffect, useState } from 'react'
import { Form, Link } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { MAX_MESSAGE_LENGTH, routeKey } from '../../lib/messages'
import type { NewMessageData } from '../../server/mappers/messages'
import { Button, Empty, Panel } from '../../components/ui/primitives'

export interface NewMessageProps extends NewMessageData {
  feedback?: ActionResult | null
  busy?: boolean
}

const fieldClass =
  'w-full bg-[var(--color-bg-elev)] border border-[var(--color-line)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]'

/** Primeira mensagem para um artista ou coletivo; o envio cria (ou retoma) a conversa. */
export function NewMessage({ destinatario, remetentes, feedback, busy = false }: NewMessageProps) {
  const [texto, setTexto] = useState('')
  // Chave de idempotência gerada no navegador: um segundo clique no mesmo envio não duplica a mensagem.
  const [requestId, setRequestId] = useState('')
  useEffect(() => setRequestId(crypto.randomUUID()), [])
  const to = { kind: destinatario.kind, id: destinatario.id ?? '' }
  const options = remetentes.map((lado) => ({ key: routeKey({ kind: lado.kind, id: lado.id ?? '' }, to), nome: lado.nome }))
  return (
    <div className="space-y-6">
      <Link to="/painel/mensagens" className="inline-block font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← mensagens</Link>
      <h1 className="font-display text-2xl font-bold text-glow">$ nova_mensagem</h1>
      <Panel title={`para ${destinatario.nome}`}>
        {options.length === 0 ? (
          <Empty>Você não tem uma atuação que possa enviar mensagens para {destinatario.nome}.</Empty>
        ) : (
          <Form method="post" className="space-y-3">
            <input type="hidden" name="request_id" value={requestId} />
            {options.length > 1 ? (
              <div>
                <label htmlFor="nova-via" className="mb-1 block font-mono text-xs text-[var(--color-muted)]">Enviar como</label>
                <select id="nova-via" name="via" className={fieldClass} defaultValue={options[0].key}>
                  {options.map((option) => <option key={option.key} value={option.key}>{option.nome}</option>)}
                </select>
              </div>
            ) : (
              <>
                <input type="hidden" name="via" value={options[0].key} />
                <p className="font-mono text-xs text-[var(--color-muted)]">Enviando como {options[0].nome}.</p>
              </>
            )}
            <div>
              <label htmlFor="nova-mensagem" className="mb-1 block font-mono text-xs text-[var(--color-muted)]">Mensagem para {destinatario.nome}</label>
              <textarea
                id="nova-mensagem"
                name="body"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                required
                maxLength={MAX_MESSAGE_LENGTH}
                rows={5}
                aria-describedby="nova-mensagem-dica"
                className={`${fieldClass} resize-y`}
              />
              <p id="nova-mensagem-dica" className="mt-1 font-mono text-xs text-[var(--color-muted)]">Texto simples, até 2.000 caracteres.</p>
            </div>
            {feedback && !feedback.ok && (
              <p role="alert" className="font-mono text-sm text-[var(--accent-text)]">[erro] {feedback.error}</p>
            )}
            <Button type="submit" variant="solid" disabled={busy || !texto.trim()}>enviar mensagem</Button>
          </Form>
        )}
      </Panel>
    </div>
  )
}
