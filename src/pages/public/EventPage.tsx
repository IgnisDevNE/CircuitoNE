import { Link } from 'react-router'
import { Badge, Panel, btnClass } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import { Markdown } from '../../components/ui/Markdown'
import { fmtDataHora, tipoEventoLabel } from '../../lib/utils'
import type { EventPageData } from '../../server/mappers/events'

export function EventPage({ evento: ev, coletivo: col, periodo, situacao }: EventPageData) {
  const cancelado = situacao === 'cancelled'

  return (
    <AccentScope color={col?.cor ?? '#ff2040'}>
      <div className="space-y-8">
        <Link to="/eventos" className="inline-block font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← eventos/</Link>

        {/* capa no topo */}
        <DuotoneImage src={ev.capa} alt={`Capa do evento ${ev.nome}`} className="aspect-[21/9] w-full neon-border" />

        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{tipoEventoLabel(ev)}</Badge>
            {ev.estilo && <Badge tone="neutral">{ev.estilo}</Badge>}
            {ev.gratuito ? <Badge tone="ok">Gratuito</Badge> : <Badge tone="neutral">Ingresso</Badge>}
            {cancelado && <Badge tone="warn">Cancelado</Badge>}
            {!cancelado && periodo === 'ongoing' && <Badge tone="warn">Em andamento</Badge>}
            {!cancelado && periodo === 'past' && <Badge tone="warn">Evento passado</Badge>}
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold text-glow sm:text-5xl">{ev.nome}</h1>
          {col && (
            <p className="mt-2 font-mono text-sm text-[var(--color-muted)]">
              por <Link to={`/coletivos/${col.id}`} className="text-[var(--accent-text)] underline">{col.nome}</Link>
            </p>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
          <Panel title="descrição">
            <Markdown source={ev.descricao} />
          </Panel>

          <div className="space-y-6">
            <Panel title="detalhes">
              <dl className="space-y-3 font-mono text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">início</dt>
                  <dd>{fmtDataHora(ev.inicio)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">fim</dt>
                  <dd>{ev.fim ? fmtDataHora(ev.fim) : 'Não informado'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">local</dt>
                  <dd>{ev.local}<br />{ev.cidade}/{ev.estado}</dd>
                </div>
              </dl>
              {!cancelado && (
                <div className="mt-4">
                  {ev.gratuito ? (
                    <p className="border border-[var(--color-ok)] px-3 py-2 text-center font-mono text-sm text-[var(--color-ok)]">
                      Entrada gratuita — é só chegar!
                    </p>
                  ) : (
                    <a href={ev.ingressoLink} target="_blank" rel="noopener noreferrer" className={btnClass('solid', 'md', 'w-full')}>
                      Comprar ingresso ↗
                    </a>
                  )}
                </div>
              )}
            </Panel>

            <Panel title={`line-up (${ev.lineup.length})`}>
              <ul className="space-y-1.5">
                {ev.lineup.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 font-mono text-sm">
                    <span aria-hidden className="text-[var(--accent-text)]">▸</span>
                    {l.artistaId ? (
                      <Link to={`/artistas/${l.artistaId}`} className="underline underline-offset-2 hover:text-[var(--accent-text)]">{l.nome}</Link>
                    ) : (
                      <span>{l.nome}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </AccentScope>
  )
}
