import type { ReactNode } from 'react'
import { Link, NavLink } from '../../router'
import { collectiveSections, type Permissao } from '../../lib/collective-access'
import type { ColetivoArea } from '../../server/mappers/collective-area'
import { Badge } from '../ui/primitives'
import { AccentScope } from '../ui/AccentScope'

export interface CollectiveLayoutProps {
  coletivo: Pick<ColetivoArea, 'id' | 'nome' | 'cargo' | 'dono' | 'cor'>
  /** Permissões efetivas devolvidas pelo banco (`get_collective_access`); definem as seções do menu. */
  permissoes: Permissao[]
  /** Pedidos de entrada pendentes, quando o titular gere pedidos. */
  pendentes?: number | null
  children: ReactNode
}

/**
 * Casca da área interna de um coletivo aprovado. O menu só mostra as seções que as permissões liberam;
 * isso é conveniência: cada operação é autorizada de novo no banco.
 */
export function CollectiveLayout({ coletivo, permissoes, pendentes, children }: CollectiveLayoutProps) {
  const sections = collectiveSections(coletivo.id, { dono: coletivo.dono, permissoes }, pendentes)
  return (
    <AccentScope color={coletivo.cor}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] pb-4">
          <div>
            <Link to="/painel/coletivos" className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← meus coletivos</Link>
            <h1 className="mt-1 font-display text-2xl font-bold text-glow">{coletivo.nome}</h1>
          </div>
          <Badge tone={coletivo.dono ? 'ok' : 'accent'}>{coletivo.dono ? `${coletivo.cargo} · responsável` : coletivo.cargo}</Badge>
        </header>

        <nav aria-label="Seções do coletivo" className="flex flex-wrap gap-1 border-b border-[var(--color-line)]">
          {sections.map((section) => (
            <NavLink
              key={section.key}
              to={section.to}
              className="-mb-px border-b-2 border-transparent px-3 py-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)] hover:text-[var(--foreground)]"
              activeClassName="!border-[var(--accent)] !text-[var(--foreground)]"
            >
              {section.label}
            </NavLink>
          ))}
        </nav>

        {children}
      </div>
    </AccentScope>
  )
}
