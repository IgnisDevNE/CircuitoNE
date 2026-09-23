import type { ReactNode } from 'react'
import { Link, NavLink, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { Badge, Empty } from '../ui/primitives'
import { AccentScope } from '../ui/AccentScope'

export function useColetivo(id?: string) {
  const { coletivos, user } = useStore()
  const col = coletivos.find((c) => c.id === id)
  const membro = col?.membros.find((m) => m.userId === user?.id)
  const cargo = col?.cargos.find((c) => c.id === membro?.cargoId)
  return { col, cargo, nivel: cargo?.nivel ?? -1 }
}

export function CollectiveLayout({ children }: { children: ReactNode }) {
  const { id } = useParams()
  const { col, cargo, nivel } = useColetivo(id)

  if (!col) return <Empty>Coletivo não encontrado. <Link to="/painel/coletivos" className="text-[var(--accent-text)] underline">voltar</Link></Empty>
  if (!cargo) return <Empty>Você está sem vínculo com este coletivo. <Link to={`/coletivos/${col.id}`} className="text-[var(--accent-text)] underline">Ver perfil público</Link></Empty>

  // Abas gated por nível: 0 membro / 1 comunicação / 2 admin
  const pendentes = col.solicitacoes?.length ?? 0
  const tabs = [
    { to: `/coletivo/${col.id}/painel`, label: 'Dashboard', min: 0 },
    { to: `/coletivo/${col.id}/mensagens`, label: 'Mensagens', min: 1 },
    { to: `/coletivo/${col.id}/solicitacoes`, label: pendentes ? `Solicitações (${pendentes})` : 'Solicitações', min: 2 },
    { to: `/coletivo/${col.id}/eventos/novo`, label: 'Criar Evento', min: 2 },
    { to: `/coletivo/${col.id}/membros`, label: 'Membros', min: 2 },
    { to: `/coletivo/${col.id}/editar`, label: 'Editar', min: 2 },
    { to: `/coletivo/${col.id}/perfil`, label: 'Perfil Público', min: 2 },
  ].filter((t) => nivel >= t.min)

  return (
    <AccentScope color={col.corPredominante}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] pb-4">
          <div>
            <Link to="/painel/coletivos" className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← meus coletivos</Link>
            <h1 className="mt-1 font-display text-2xl font-bold text-glow">{col.nome}</h1>
          </div>
          <Badge tone={nivel >= 2 ? 'ok' : 'accent'}>{cargo?.nome ?? 'membro'} · nível {nivel}</Badge>
        </header>

        <nav aria-label="Seções do coletivo" className="flex flex-wrap gap-1 border-b border-[var(--color-line)]">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className="-mb-px border-b-2 border-transparent px-3 py-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)] hover:text-[var(--foreground)]"
              activeClassName="!border-[var(--accent)] !text-[var(--foreground)]"
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        {children}
      </div>
    </AccentScope>
  )
}
