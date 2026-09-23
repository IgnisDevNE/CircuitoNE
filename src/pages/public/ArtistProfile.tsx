import { Link, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Badge, Empty, LinkButton, Panel } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import { Social } from '../../components/ui/Social'
import { eventoNaoEncerrado, fmtDataHora } from '../../lib/utils'

export function ArtistProfile() {
  const { id } = useParams()
  const { artistas, eventos } = useStore()
  const artista = artistas.find((a) => a.id === id)
  usePageTitle(artista ? artista.nome : 'Artista')

  if (!artista) return <Empty>Artista não encontrado. <Link to="/artistas" className="text-[var(--accent-text)] underline">Voltar ao hub</Link></Empty>

  const proximos = eventos.filter((e) => eventoNaoEncerrado(e) && e.lineup.some((l) => l.artistaId === artista.id))

  return (
    <AccentScope color={artista.corPredominante}>
      <div className="space-y-8">
        <Link to="/artistas" className="inline-block font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← artistas/</Link>

        <header className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
          <DuotoneImage src={artista.fotoApresentacao} alt={`Foto de apresentação de ${artista.nome}`} className="aspect-[3/4] w-full neon-border" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent-text)]">artista</p>
            <h1 className="mt-2 font-display text-4xl font-bold text-glow sm:text-5xl">{artista.nome}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {artista.estilos.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
            </div>
            <p className="mt-5 max-w-2xl leading-relaxed text-[var(--foreground)]">{artista.bio}</p>
            <div className="mt-5">
              <Social links={artista.social} />
            </div>
          </div>
        </header>

        <Panel title="próximos eventos">
          {proximos.length === 0 ? (
            <Empty>Nenhum evento agendado no momento.</Empty>
          ) : (
            <ul className="space-y-2">
              {proximos.map((e) => (
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
          )}
        </Panel>

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
