import { Link } from 'react-router'
import { Avatar, Badge, Empty, Panel } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import { Social } from '../../components/ui/Social'
import { fmtDataHora } from '../../lib/utils'
import type { Evento } from '../../data/types'
import type { CollectivePageData } from '../../server/mappers/collectives'

function EventLinks({ eventos }: { eventos: Evento[] }) {
  return (
    <ul className="space-y-2">
      {eventos.map((e) => (
        <li key={e.id}>
          <Link to={`/eventos/${e.id}`} className="flex items-center justify-between gap-4 border border-[var(--color-line)] p-3 transition-colors hover:border-[var(--accent)]">
            <span>
              <span className="block font-display font-bold">{e.nome}</span>
              <span className="font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(e.inicio)} · {e.local}</span>
            </span>
            <span aria-hidden className="text-[var(--accent-text)]">→</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function CollectiveProfile({ coletivo: col, membros, proximos, anteriores }: CollectivePageData) {
  return (
    <AccentScope color={col.corPredominante}>
      <div className="space-y-8">
        <Link to="/coletivos" className="inline-block font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← coletivos/</Link>

        <header className="relative overflow-hidden neon-border">
          <DuotoneImage src={col.imagem} alt={`Capa do ${col.tipo} ${col.nome}`} className="aspect-[3/1] w-full" />
          <div className="p-6">
            <div className="flex items-center gap-2">
              <Badge tone="accent">{col.tipo === 'produtora' ? 'Produtora' : 'Coletivo'}</Badge>
              <span className="font-mono text-xs text-[var(--color-muted)]">{col.cidade}/{col.estado}</span>
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold text-glow">{col.nome}</h1>
            <p className="mt-3 max-w-3xl leading-relaxed text-[var(--foreground)]">{col.bio}</p>
            <div className="mt-4"><Social links={col.social} /></div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="próximos eventos">
              {proximos.length === 0 ? <Empty>Sem eventos agendados.</Empty> : <EventLinks eventos={proximos} />}
            </Panel>
            {anteriores.length > 0 && (
              <Panel title="eventos anteriores">
                <EventLinks eventos={anteriores} />
              </Panel>
            )}
          </div>

          <Panel title={`membros (${membros.length})`}>
            {membros.length === 0 ? (
              <Empty>Nenhum membro para exibir.</Empty>
            ) : (
              <ul className="space-y-2">
                {membros.map((m, i) => {
                  const inner = (
                    <span className="flex items-center gap-3">
                      <Avatar alt={m.nome} size={32} />
                      <span className="block min-w-0 truncate font-mono text-sm">{m.nome}</span>
                    </span>
                  )
                  return (
                    <li key={`${i}-${m.nome}`}>
                      {m.artistaId ? (
                        <Link to={`/artistas/${m.artistaId}`} className="block border border-transparent p-1 hover:border-[var(--accent)]">
                          {inner}
                        </Link>
                      ) : (
                        <div className="p-1">{inner}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-3 font-mono text-[0.65rem] text-[var(--color-muted)]">↗ membros com perfil de artista são clicáveis</p>
          </Panel>
        </div>
      </div>
    </AccentScope>
  )
}
