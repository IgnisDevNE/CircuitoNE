import { Link } from 'react-router'
import { collectiveSections, type Permissao } from '../../lib/collective-access'
import { fmtDataHora } from '../../lib/utils'
import type { ColetivoArea, EventoGestao, ResumoMensagens } from '../../server/mappers/collective-area'
import { Badge, Empty, Panel } from '../../components/ui/primitives'
import { EventSheetLink } from '../../components/ui/EventSheet'

export interface CollectiveDashboardProps {
  coletivo: Pick<ColetivoArea, 'id' | 'nome' | 'dono'>
  permissoes: Permissao[]
  /** Pedidos de entrada pendentes; nulo quando o titular não gere pedidos. */
  pendentes: number | null
  eventos: EventoGestao[]
  /** Lista da gestão (rascunhos e cancelados incluídos) em vez dos eventos publicados. */
  gestao: boolean
  /** Conversas do coletivo; nulo quando o titular não pode ler mensagens. */
  mensagens: ResumoMensagens | null
}

const EVENT_ROW = 'flex items-center justify-between gap-4 border border-[var(--color-line)] p-3 hover:border-[var(--accent)]'

const plural =(n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function EventBadges({ evento }: { evento: EventoGestao }) {
  return (
    <>
      {evento.situacao === 'draft' && <Badge tone="warn">rascunho</Badge>}
      {evento.situacao === 'cancelled' && <Badge tone="warn">cancelado</Badge>}
      {evento.situacao !== 'cancelled' && evento.periodo === 'ongoing' && <Badge tone="ok">em andamento</Badge>}
      {evento.periodo === 'past' && <Badge>encerrado</Badge>}
    </>
  )
}

export function CollectiveDashboard({ coletivo, permissoes, pendentes, eventos, gestao, mensagens }: CollectiveDashboardProps) {
  const links = collectiveSections(coletivo.id, { dono: coletivo.dono, permissoes }, pendentes).filter((s) => s.key !== 'painel')
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="eventos" className="lg:col-span-2">
        {eventos.length === 0 ? (
          <Empty>{gestao ? 'Nenhum evento cadastrado.' : 'Nenhum evento publicado.'}</Empty>
        ) : (
          <ul className="space-y-2">
            {eventos.map((evento) => {
              const content = (
                <>
                  <span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold">{evento.nome}</span>
                      <EventBadges evento={evento} />
                    </span>
                    <span className="font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(evento.inicio)}</span>
                  </span>
                  <span aria-hidden className="text-[var(--accent-text)]">→</span>
                </>
              )
              return (
                <li key={evento.id}>
                  {gestao ? (
                    <Link to={`/coletivo/${coletivo.id}/eventos/${evento.id}`} className={EVENT_ROW}>{content}</Link>
                  ) : (
                    // Sem permissão de gestão a página é a pública: abre num painel lateral sem sair do painel do coletivo.
                    <EventSheetLink eventId={evento.id} nome={evento.nome} className={EVENT_ROW}>{content}</EventSheetLink>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {!gestao && (
          <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">
            Seu perfil não gere eventos: aparecem só os eventos publicados.
          </p>
        )}
      </Panel>

      <div className="space-y-6">
        {pendentes !== null && (
          <Panel title="solicitações de entrada">
            <p className="font-display text-4xl font-bold text-[var(--accent-text)]" aria-hidden>{pendentes}</p>
            <p className="mt-1 font-mono text-sm" role="status">
              {pendentes === 0 ? 'Nenhum pedido pendente.' : `${plural(pendentes, 'pedido pendente', 'pedidos pendentes')}.`}
            </p>
            <Link to={`/coletivo/${coletivo.id}/solicitacoes`} className="mt-2 inline-block font-mono text-xs text-[var(--accent-text)] hover:underline">ver solicitações →</Link>
          </Panel>
        )}

        {mensagens !== null && (
          <Panel title="mensagens do coletivo">
            <p className="font-display text-4xl font-bold text-[var(--accent-text)]" aria-hidden>{mensagens.naoLidas}</p>
            <p className="mt-1 font-mono text-sm">
              {plural(mensagens.naoLidas, 'mensagem não lida', 'mensagens não lidas')} em {plural(mensagens.conversas, 'conversa', 'conversas')}.
            </p>
            <Link to={`/coletivo/${coletivo.id}/mensagens`} className="mt-2 inline-block font-mono text-xs text-[var(--accent-text)] hover:underline">abrir chat →</Link>
          </Panel>
        )}

        <Panel title="atalhos">
          <ul className="space-y-1 font-mono text-sm">
            {links.map((link) => (
              <li key={link.key}>
                <Link to={link.to} className="text-[var(--accent-text)] hover:underline">{link.label}</Link>
              </li>
            ))}
            <li>
              <Link to={`/coletivos/${coletivo.id}`} className="text-[var(--accent-text)] hover:underline">Ver perfil público ↗</Link>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}
