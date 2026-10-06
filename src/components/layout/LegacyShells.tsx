import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useLocation, useParams } from '../../router'
import { useStore } from '../../context/StoreContext'
import { Badge, Empty } from '../ui/primitives'
import { AccentScope } from '../ui/AccentScope'
import { Dashboard } from '../../pages/app/Dashboard'
import { eventoNaoEncerrado, porProximidade } from '../../lib/utils'
import type { Collective, Estado, User } from '../../data/types'
import type { ColetivoSituacao, MeuColetivo, MeuPerfil, ProximoEvento } from '../../server/mappers/account'
import { AppShell } from './AppShell'
import { PublicLayout } from './PublicLayout'

/**
 * Adaptadores do protótipo (runtime `preview`): derivam das fixtures em memória as mesmas props que o
 * servidor entrega às telas reais. Saem junto com `StoreContext`/`mock.ts` (W12).
 */

export function LegacyPublic({ children }: { children: ReactNode }) {
  const { user } = useStore()
  return <PublicLayout signedIn={!!user}>{children}</PublicLayout>
}

function legacyPerfis(user: User): MeuPerfil[] {
  return user.atuacoes.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    nome: a.nome,
    cidade: user.cidade,
    estado: user.estado as Estado,
    publicado: a.tipo === 'artista',
    padrao: false,
  }))
}

function legacyColetivos(user: User, coletivos: Collective[]): MeuColetivo[] {
  return coletivos.flatMap((c) => {
    const membro = c.membros.find((m) => m.userId === user.id)
    if (!membro) return []
    const cargo = c.cargos.find((cg) => cg.id === membro.cargoId)
    return [
      {
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        cidade: c.cidade,
        estado: c.estado,
        situacao: 'approved' as ColetivoSituacao,
        cargo: cargo?.nome ?? 'Membro',
        dono: (cargo?.nivel ?? 0) >= 2,
      },
    ]
  })
}

function useLegacyAccount() {
  const { user, coletivos, threads } = useStore()
  if (!user) return null
  return {
    user,
    nome: user.nome,
    perfis: legacyPerfis(user),
    coletivos: legacyColetivos(user, coletivos),
    naoLidas: threads.reduce((n, t) => n + t.naoLidas, 0),
  }
}

export function LegacyAppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useStore()
  const account = useLegacyAccount()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const loggingOut = useRef(false)

  useEffect(() => {
    if (!user && !loggingOut.current && pathname !== '/') navigate('/entrar', { replace: true })
  }, [user, pathname, navigate])

  if (!account) return null
  return (
    <AppShell
      nome={account.nome}
      perfis={account.perfis}
      coletivos={account.coletivos}
      naoLidas={account.naoLidas}
      onLogout={() => {
        loggingOut.current = true
        logout()
        navigate('/')
      }}
    >
      {children}
    </AppShell>
  )
}

export function LegacyDashboard() {
  const { eventos, now } = useStore()
  const account = useLegacyAccount()
  if (!account) return null
  const artistas = new Map(account.perfis.filter((p) => p.tipo === 'artista').map((p) => [p.id, p.nome]))
  const proximos: ProximoEvento[] = eventos
    .filter((e) => eventoNaoEncerrado(e, now))
    .sort((a, b) => porProximidade(a, b, now))
    .flatMap((evento) => {
      const como = evento.lineup.flatMap((l) => (l.artistaId && artistas.has(l.artistaId) ? [artistas.get(l.artistaId)!] : []))
      return como.length ? [{ evento, como }] : []
    })
  return (
    <Dashboard
      nome={account.nome}
      perfis={account.perfis}
      coletivos={account.coletivos}
      naoLidas={account.naoLidas}
      proximos={proximos}
    />
  )
}

/** Coletivo do protótipo, com o nível numérico 0/1/2 do cargo (a área real usa permissões: `CollectiveLayout`). */
export function useColetivo(id?: string) {
  const { coletivos, user } = useStore()
  const col = coletivos.find((c) => c.id === id)
  const membro = col?.membros.find((m) => m.userId === user?.id)
  const cargo = col?.cargos.find((c) => c.id === membro?.cargoId)
  return { col, cargo, nivel: cargo?.nivel ?? -1 }
}

/** Layout do protótipo para as páginas de coletivo ainda não ligadas ao banco; sai junto com `StoreContext` (W12). */
export function LegacyCollectiveLayout({ children }: { children: ReactNode }) {
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
