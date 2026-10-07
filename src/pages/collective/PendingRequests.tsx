import { Form, Link } from 'react-router'
import { TIPO_LABEL } from '../../data/types'
import { fmtDataHora } from '../../lib/utils'
import type { ActionResult } from '../../lib/action-result'
import type { PedidoEntrada } from '../../server/mappers/collective-area'
import { Avatar, Badge, Button, Empty, Panel } from '../../components/ui/primitives'

export interface PendingRequestsProps {
  pedidos: PedidoEntrada[]
  /** Resultado da última decisão; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

export function PendingRequests({ pedidos, feedback, busy = false }: PendingRequestsProps) {
  return (
    <Panel title="solicitações pendentes">
      {feedback && (
        <p role={feedback.ok ? 'status' : 'alert'} className={`mb-4 font-mono text-sm ${feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]'}`}>
          {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
        </p>
      )}
      <p className="mb-4 font-mono text-xs text-[var(--color-muted)]">
        Quem for aprovado entra com o perfil <strong>Membro</strong>, sem permissões operacionais. Perfis de acesso são atribuídos só pelo proprietário.
      </p>
      {pedidos.length === 0 ? (
        <Empty>Nenhuma solicitação de acesso pendente.</Empty>
      ) : (
        <ul className="space-y-2">
          {pedidos.map((pedido, i) => (
            <li key={pedido.id} className="animate-fade-up border border-[var(--color-line)] p-3" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar alt={pedido.nome} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-mono text-sm">{pedido.nome}</span>
                  {pedido.atuacao && (
                    <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      {pedido.atuacao.tipo === 'artista' && pedido.atuacao.publicada ? (
                        <Link to={`/artistas/${pedido.atuacao.id}`} className="break-words text-[var(--accent-text)] underline">{pedido.atuacao.nome}</Link>
                      ) : (
                        <span className="break-words">{pedido.atuacao.nome}</span>
                      )}
                      <Badge tone="accent">{TIPO_LABEL[pedido.atuacao.tipo]}</Badge>
                    </span>
                  )}
                  <span className="block font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(pedido.criadoEm)}</span>
                </span>
                <Form method="post" className="flex gap-2">
                  <input type="hidden" name="request" value={pedido.id} />
                  <Button type="submit" name="intent" value="approve" size="sm" disabled={busy} aria-label={`Aprovar pedido de ${pedido.nome}`}>aprovar</Button>
                  <Button type="submit" name="intent" value="decline" size="sm" variant="danger" disabled={busy} aria-label={`Recusar pedido de ${pedido.nome}`}>recusar</Button>
                </Form>
              </div>
              {pedido.mensagem && (
                <p className="mt-2 whitespace-pre-line border-l-2 border-[var(--color-line)] pl-3 font-mono text-sm text-[var(--color-muted)]">
                  “{pedido.mensagem}”
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
