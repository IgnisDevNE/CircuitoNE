import { Link, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { useColetivo } from '../../components/layout/CollectiveLayout'
import { Badge, Empty, Panel } from '../../components/ui/primitives'
import { Avatar } from '../../components/ui/primitives'
import { eventoNaoEncerrado, fmtDataHora, porProximidade } from '../../lib/utils'

export function CollectiveDashboard() {
  const { id } = useParams()
  const { col, nivel } = useColetivo(id)
  const { eventos, threads } = useStore()
  usePageTitle(col ? `${col.nome} · Dashboard` : 'Coletivo')

  if (!col) return null
  const eventosCol = eventos.filter((e) => e.coletivoId === col.id).sort(porProximidade)
  const naoLidas = threads.filter((t) => t.coletivoId === col.id).reduce((n, t) => n + t.naoLidas, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="eventos" className="lg:col-span-2">
        {eventosCol.length === 0 ? (
          <Empty>Nenhum evento cadastrado.</Empty>
        ) : (
          <ul className="space-y-2">
            {eventosCol.map((e) => {
              const naoEncerrado = eventoNaoEncerrado(e)
              return (
                <li key={e.id}>
                  <Link to={`/eventos/${e.id}`} className="flex items-center justify-between gap-4 border border-[var(--color-line)] p-3 hover:border-[var(--accent)]">
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="font-display font-bold">{e.nome}</span>
                        {!naoEncerrado && <Badge tone="warn">passado</Badge>}
                      </span>
                      <span className="font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(e.inicio)} · {e.local}</span>
                    </span>
                    <span aria-hidden className="text-[var(--accent-text)]">→</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <div className="space-y-6">
        {nivel >= 1 && (
          <Panel title="mensagens não lidas">
            <p className="font-display text-4xl font-bold text-[var(--accent-text)]">{naoLidas}</p>
            <Link to={`/coletivo/${col.id}/mensagens`} className="mt-2 inline-block font-mono text-xs text-[var(--accent-text)] hover:underline">abrir chat →</Link>
          </Panel>
        )}

        <Panel title={`membros (${col.membros.length})`}>
          <ul className="space-y-2">
            {col.membros.map((m) => {
              const cargo = col.cargos.find((c) => c.id === m.cargoId)
              return (
                <li key={m.userId} className="flex items-center gap-3">
                  <Avatar alt={m.nome} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm">{m.nome}</span>
                    <span className="block font-mono text-xs text-[var(--color-muted)]">{cargo?.nome} · visto {m.lastSeen}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
