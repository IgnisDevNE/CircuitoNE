import { Link } from '../../router'
import { useStore } from '../../context/StoreContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { Badge, LinkButton, SectionHeading } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { AccentScope } from '../../components/ui/AccentScope'

export function CollectivesHub() {
  usePageTitle('Coletivos e Produtoras')
  const { coletivos, user } = useStore()

  const isAdmin =
    !!user &&
    coletivos.some((c) =>
      c.membros.some((m) => m.userId === user.id && (c.cargos.find((cg) => cg.id === m.cargoId)?.nivel ?? 0) >= 2),
    )

  return (
    <div>
      <SectionHeading prompt="ls" sub="Coletivos e produtoras que movimentam a cena — organização, curadoria e estrutura.">coletivos/</SectionHeading>

      {isAdmin && (
        <nav aria-label="Explorar (administradores)" className="mb-6 border border-dashed border-[var(--color-line)] p-4">
          <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-[var(--color-muted)]">explorar · acesso de administrador</p>
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/painel/explorar/artistas" variant="outline" size="sm">Explorar Artistas</LinkButton>
            <LinkButton to="/painel/explorar/servicos" variant="outline" size="sm">Explorar Serviços</LinkButton>
            <LinkButton to="/painel/explorar/audiovisual" variant="outline" size="sm">Explorar Audiovisual</LinkButton>
            <LinkButton to="/painel/explorar/coletivos" variant="outline" size="sm">Explorar Coletivos</LinkButton>
          </div>
        </nav>
      )}

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
                  <p className="mt-2 line-clamp-2 flex-1 text-sm text-[var(--color-muted)]">{c.bio}</p>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {c.atuacao.map((a) => <span key={a} className="font-mono text-[0.65rem] uppercase tracking-widest text-[var(--color-muted)]">[{a}]</span>)}
                  </div>
                </div>
              </Link>
            </AccentScope>
          </li>
        ))}
      </ul>
    </div>
  )
}
