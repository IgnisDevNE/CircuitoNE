import { useMemo, useState } from 'react'
import { Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { SectionHeading, Empty, Badge } from '../../components/ui/primitives'
import { Input } from '../../components/ui/form'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import { Social } from '../../components/ui/Social'
import { eventoNaoEncerrado, porProximidade } from '../../lib/utils'

export function ArtistsHub() {
  usePageTitle('Artistas')
  const { artistas, eventos, now } = useStore()
  const [q, setQ] = useState('')
  const [estilo, setEstilo] = useState<string | null>(null)

  const estilos = useMemo(() => [...new Set(artistas.flatMap((a) => a.estilos))].sort(), [artistas])

  const filtrados = artistas.filter((a) => {
    const matchQ = !q || a.nome.toLowerCase().includes(q.toLowerCase()) || a.bio.toLowerCase().includes(q.toLowerCase())
    const matchE = !estilo || a.estilos.includes(estilo)
    return matchQ && matchE
  })

  const proximoEvento = (artistaId: string) =>
    eventos
      .filter((e) => eventoNaoEncerrado(e, now) && e.lineup.some((l) => l.artistaId === artistaId))
      .sort((a, b) => porProximidade(a, b, now))[0]

  return (
    <div>
      <SectionHeading prompt="ls -la" sub="Grade de artistas cadastrados no circuito. Filtre por nome ou estilo.">artistas/</SectionHeading>

      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input label="Buscar" placeholder="nome, projeto, bio…" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
      </div>

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estilo">
        <button onClick={() => setEstilo(null)} className="cursor-pointer" aria-pressed={estilo === null}>
          <Badge tone={estilo === null ? 'accent' : 'neutral'}>todos</Badge>
        </button>
        {estilos.map((s) => (
          <button key={s} onClick={() => setEstilo(s === estilo ? null : s)} className="cursor-pointer" aria-pressed={estilo === s}>
            <Badge tone={estilo === s ? 'accent' : 'neutral'}>{s}</Badge>
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <Empty>Nenhum artista encontrado para os filtros atuais.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((a) => {
            const prox = proximoEvento(a.id)
            return (
              <li key={a.id}>
                <AccentScope color={a.corPredominante}>
                  <article className="group h-full border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
                    <Link to={`/artistas/${a.id}`} className="block">
                      <DuotoneImage src={a.fotoApresentacao} alt={`Foto de ${a.nome}`} className="aspect-[16/10] w-full" />
                    </Link>
                    <div className="space-y-3 p-4">
                      <div>
                        <Link to={`/artistas/${a.id}`}>
                          <h3 className="font-display text-lg font-bold group-hover:text-[var(--accent-text)]">{a.nome}</h3>
                        </Link>
                        <p className="mt-1 flex flex-wrap gap-1 font-mono text-xs text-[var(--color-muted)]">
                          {a.estilos.map((s) => <span key={s}>#{s.toLowerCase().replace(/\s/g, '')}</span>)}
                        </p>
                      </div>
                      <p className="line-clamp-2 text-sm text-[var(--color-muted)]">{a.bio}</p>
                      {prox && (
                        <p className="border-t border-[var(--color-line)] pt-2 font-mono text-xs">
                          <span className="text-[var(--accent-text)]">próximo:</span>{' '}
                          <Link to={`/eventos/${prox.id}`} className="hover:underline">{prox.nome}</Link>
                        </p>
                      )}
                      <Social links={a.social} />
                    </div>
                  </article>
                </AccentScope>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
