import { Link, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Badge, Button, Empty, Panel } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import { Markdown } from '../../components/ui/Markdown'
import { useToast } from '../../context/ToastContext'
import { fmtDataHora, isFuturo, tipoEventoLabel } from '../../lib/utils'

export function EventPage() {
  const { id } = useParams()
  const { eventos, coletivos } = useStore()
  const toast = useToast()
  const ev = eventos.find((e) => e.id === id)
  usePageTitle(ev ? ev.nome : 'Evento')

  if (!ev) return <Empty>Evento não encontrado. <Link to="/eventos" className="text-[var(--accent-text)] underline">Voltar</Link></Empty>

  const col = coletivos.find((c) => c.id === ev.coletivoId)
  const futuro = isFuturo(ev.inicio)

  return (
    <AccentScope color={col?.corPredominante ?? '#ff2040'}>
      <div className="space-y-8">
        <Link to="/eventos" className="inline-block font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← eventos/</Link>

        {/* capa no topo */}
        <DuotoneImage src={ev.capa} alt={`Capa do evento ${ev.nome}`} className="aspect-[21/9] w-full neon-border" />

        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{tipoEventoLabel(ev)}</Badge>
            {ev.gratuito ? <Badge tone="ok">Gratuito</Badge> : <Badge tone="neutral">Ingresso</Badge>}
            {!futuro && <Badge tone="warn">Evento passado</Badge>}
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold text-glow sm:text-5xl">{ev.nome}</h1>
          {col && (
            <p className="mt-2 font-mono text-sm text-[var(--color-muted)]">
              por <Link to={`/coletivos/${col.id}`} className="text-[var(--accent-text)] hover:underline">{col.nome}</Link>
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
                  <dd>{fmtDataHora(ev.fim)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">local</dt>
                  <dd>{ev.local}<br />{ev.cidade}/{ev.estado}</dd>
                </div>
              </dl>
              <div className="mt-4">
                {ev.gratuito ? (
                  <Button variant="solid" className="w-full" onClick={() => toast('Entrada gratuita — é só chegar!', 'ok')}>
                    Entrada gratuita
                  </Button>
                ) : (
                  <a href={ev.ingressoLink} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="solid" className="w-full">Comprar ingresso ↗</Button>
                  </a>
                )}
              </div>
            </Panel>

            <Panel title={`line-up (${ev.lineup.length})`}>
              <ul className="space-y-1.5">
                {ev.lineup.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 font-mono text-sm">
                    <span aria-hidden className="text-[var(--accent-text)]">▸</span>
                    {l.artistaId ? (
                      <Link to={`/artistas/${l.artistaId}`} className="hover:text-[var(--accent-text)] hover:underline">{l.nome}</Link>
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
