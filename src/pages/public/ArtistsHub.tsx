import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { SectionHeading, Empty, Badge } from '../../components/ui/primitives'
import { Input } from '../../components/ui/form'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { estiloLabels } from '../../lib/artist'
import { UFS_NORDESTE, type ArtistaResumo, type Estado } from '../../data/types'

/** Hub: a lista vem do banco (ordem alfabética); busca e filtros de estilo e de UF são feitos no cliente, e se combinam. */
export function ArtistsHub({ artistas }: { artistas: ArtistaResumo[] }) {
  const [q, setQ] = useState('')
  const [estilo, setEstilo] = useState<string | null>(null)
  const [uf, setUf] = useState<Estado | null>(null)

  // Só estilos principais (`music_styles`): cada par estilo/subestilo do artista conta para o estilo principal dele,
  // então escolher "techno" também traz quem tem só "melodic techno".
  const estilos = useMemo(
    () => [...new Set(artistas.flatMap((a) => a.estilos.map((e) => e.estilo)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [artistas],
  )

  const filtrados = artistas.filter((a) => {
    const matchQ = !q || a.nome.toLowerCase().includes(q.toLowerCase()) || a.bio.toLowerCase().includes(q.toLowerCase())
    const matchE = !estilo || a.estilos.some((e) => e.estilo === estilo)
    const matchU = !uf || a.estado === uf
    return matchQ && matchE && matchU
  })

  return (
    <div>
      <SectionHeading prompt="ls -la" sub="Grade de artistas cadastrados no circuito. Filtre por nome, estilo ou estado.">artistas/</SectionHeading>

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

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        <button onClick={() => setUf(null)} className="cursor-pointer" aria-pressed={uf === null}>
          <Badge tone={uf === null ? 'accent' : 'neutral'}>todos</Badge>
        </button>
        {UFS_NORDESTE.map((s) => (
          <button key={s} onClick={() => setUf(s === uf ? null : s)} className="cursor-pointer" aria-pressed={uf === s}>
            <Badge tone={uf === s ? 'accent' : 'neutral'}>{s}</Badge>
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <Empty>{artistas.length === 0 ? 'Nenhum artista publicado ainda.' : 'Nenhum artista encontrado para os filtros atuais.'}</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((a) => (
            <li key={a.id}>
              <article className="group h-full border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
                <Link to={`/artistas/${a.id}`} className="block">
                  <DuotoneImage src={a.foto} alt={`Foto de ${a.nome}`} className="aspect-[16/10] w-full" />
                </Link>
                <div className="space-y-3 p-4">
                  <div>
                    <Link to={`/artistas/${a.id}`}>
                      <h3 className="font-display text-lg font-bold group-hover:text-[var(--accent-text)]">{a.nome}</h3>
                    </Link>
                    <p className="mt-1 flex flex-wrap gap-1 font-mono text-xs text-[var(--color-muted)]">
                      {estiloLabels(a.estilos).map((s) => <span key={s}>#{s.toLowerCase().replace(/\s/g, '')}</span>)}
                    </p>
                  </div>
                  <p className="line-clamp-2 text-sm text-[var(--color-muted)]">{a.bio}</p>
                  <p className="font-mono text-xs text-[var(--color-muted)]">{a.cidade}/{a.estado}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
