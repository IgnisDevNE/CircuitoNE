import { Link } from 'react-router'
import { Badge, Empty, SectionHeading } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'
import type { CollectiveListData } from '../../server/mappers/collectives'

export function CollectivesHub({ coletivos }: CollectiveListData) {
  return (
    <div>
      <SectionHeading prompt="ls" sub="Coletivos e produtoras que movimentam a cena — organização, curadoria e estrutura.">coletivos/</SectionHeading>

      {/* Os cartões são h3: o h2 oculto mantém a ordem dos títulos (h1, h2, h3) para quem navega por eles. */}
      <h2 className="sr-only">Coletivos e produtoras</h2>
      {coletivos.length === 0 ? (
        <Empty>Nenhum coletivo ou produtora cadastrado ainda.</Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {coletivos.map((c) => (
            <li key={c.id}>
              <AccentScope color={c.corPredominante}>
                <Link to={`/coletivos/${c.id}`} className="group flex h-full flex-col overflow-hidden border border-[var(--color-line)] transition-colors hover:border-[var(--accent)]">
                  <DuotoneImage src={c.imagem} alt={`Imagem do ${c.tipo} ${c.nome}`} className="aspect-[2/1] w-full" />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone="accent">{c.tipo === 'produtora' ? 'Produtora' : 'Coletivo'}</Badge>
                      <span className="font-mono text-xs text-[var(--color-muted)]">{c.cidade}/{c.estado}</span>
                    </div>
                    <h3 className="font-display text-xl font-bold group-hover:text-[var(--accent-text)]">{c.nome}</h3>
                    <p data-teaser className="mt-2 line-clamp-2 flex-1 text-sm text-[var(--color-muted)]">{c.bio}</p>
                    <div className="mt-4 flex flex-wrap gap-1">
                      {c.atuacao.map((a) => <span key={a} className="font-mono text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">[{a}]</span>)}
                    </div>
                  </div>
                </Link>
              </AccentScope>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
