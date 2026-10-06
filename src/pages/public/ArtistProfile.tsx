import { Link } from 'react-router'
import { Badge, Empty, LinkButton, Panel } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import { Social } from '../../components/ui/Social'
import { estiloLabels } from '../../lib/artist'
import { fmtDataHora } from '../../lib/utils'
import type { Evento } from '../../data/types'
import type { ArtistPageData } from '../../server/mappers/artists'

function EventLinks({ eventos }: { eventos: Evento[] }) {
  return (
    <ul className="space-y-2">
      {eventos.map((e) => (
        <li key={e.id}>
          <Link to={`/eventos/${e.id}`} className="flex items-center justify-between gap-4 border border-[var(--color-line)] p-3 transition-colors hover:border-[var(--accent)]">
            <span>
              <span className="block font-display font-bold">{e.nome}</span>
              <span className="font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(e.inicio)} · {e.cidade}/{e.estado}</span>
            </span>
            <span aria-hidden className="text-[var(--accent-text)]">→</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Perfil público: sem contato de booking, cachê ou presskit (dados restritos ao titular). */
export function ArtistProfile({ artista, proximos, anteriores }: ArtistPageData) {
  return (
    <AccentScope color={artista.corPredominante ?? '#ff2040'}>
      <div className="space-y-8">
        <Link to="/artistas" className="inline-block font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← artistas/</Link>

        <header className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
          <DuotoneImage src={artista.foto} alt={`Foto de apresentação de ${artista.nome}`} className="aspect-[3/4] w-full neon-border" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent-text)]">artista</p>
            <h1 className="mt-2 font-display text-4xl font-bold text-glow sm:text-5xl">{artista.nome}</h1>
            <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">{artista.cidade}/{artista.estado}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {estiloLabels(artista.estilos).map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
            </div>
            {artista.bio && <p className="mt-5 max-w-2xl whitespace-pre-line leading-relaxed text-[var(--foreground)]">{artista.bio}</p>}
            <div className="mt-5">
              <Social links={artista.social} />
            </div>
          </div>
        </header>

        <Panel title="próximos eventos">
          {proximos.length === 0 ? <Empty>Nenhum evento agendado no momento.</Empty> : <EventLinks eventos={proximos} />}
        </Panel>

        {anteriores.length > 0 && (
          <Panel title="eventos anteriores">
            <EventLinks eventos={anteriores} />
          </Panel>
        )}

        {artista.fotos.length > 0 && (
          <Panel title="galeria">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {artista.fotos.map((f, i) => (
                <DuotoneImage key={i} src={f} alt={`${artista.nome} — imagem ${i + 1}`} className="aspect-square w-full" scan={false} />
              ))}
            </div>
          </Panel>
        )}

        <div className="flex justify-center pt-4">
          <LinkButton to="/eventos" variant="ghost">ver todos os eventos do circuito →</LinkButton>
        </div>
      </div>
    </AccentScope>
  )
}
