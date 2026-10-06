import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from '../../router'
import { useStore } from '../../context/StoreContext'
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
