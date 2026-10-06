import type { ReactNode } from 'react'
import { RouterProvider, Routes, Link } from './router'
import { StoreProvider } from './context/StoreContext'
import { ToastProvider } from './context/ToastContext'
import { LegacyAppShell, LegacyDashboard, LegacyPublic } from './components/layout/LegacyShells'
import { CollectiveLayout } from './components/layout/CollectiveLayout'
import { Empty } from './components/ui/primitives'


import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'

import { EditData } from './pages/app/EditData'
import { EditProfile } from './pages/app/EditProfile'
import { Security } from './pages/app/Security'
import { Messages } from './pages/app/Messages'
import { MyCollectives } from './pages/app/MyCollectives'
import { Explore } from './pages/app/Explore'

import { CollectiveDashboard } from './pages/collective/CollectiveDashboard'
import { CollectiveMessages } from './pages/collective/CollectiveMessages'
import { PendingRequests } from './pages/collective/PendingRequests'
import { EditMembers } from './pages/collective/EditMembers'
import { EditCollective } from './pages/collective/EditCollective'
import { EditCollectiveProfile } from './pages/collective/EditCollectiveProfile'
import { CreateEvent } from './pages/collective/CreateEvent'

const pub = (el: ReactNode) => <LegacyPublic>{el}</LegacyPublic>
const app = (el: ReactNode) => <LegacyAppShell>{el}</LegacyAppShell>
const col = (el: ReactNode) => (
  <LegacyAppShell>
    <CollectiveLayout>{el}</CollectiveLayout>
  </LegacyAppShell>
)

export default function App({ initialNow }: { initialNow?: number } = {}) {
  return (
    <StoreProvider initialNow={initialNow}>
      <ToastProvider>
        <RouterProvider>
          <Routes
            routes={[
              // público
              // auth
              { path: '/entrar', element: pub(<Login />) },
              { path: '/cadastro', element: pub(<Register mode="cadastro" />) },
              // logado
              { path: '/painel', element: app(<LegacyDashboard />) },
              { path: '/painel/perfil/:atuacaoId', element: app(<EditProfile />) },
              { path: '/painel/dados', element: app(<EditData />) },
              { path: '/painel/dados/nova-atuacao', element: app(<Register mode="nova-atuacao" />) },
              { path: '/painel/seguranca', element: app(<Security />) },
              { path: '/painel/mensagens', element: app(<Messages />) },
              { path: '/painel/coletivos', element: app(<MyCollectives />) },
              { path: '/painel/explorar/artistas', element: app(<Explore kind="artistas" />) },
              { path: '/painel/explorar/servicos', element: app(<Explore kind="servicos" />) },
              { path: '/painel/explorar/audiovisual', element: app(<Explore kind="audiovisual" />) },
              { path: '/painel/explorar/coletivos', element: app(<Explore kind="coletivos" />) },
              // coletivo / produtora
              { path: '/coletivo/:id/painel', element: col(<CollectiveDashboard />) },
              { path: '/coletivo/:id/mensagens', element: col(<CollectiveMessages />) },
              { path: '/coletivo/:id/solicitacoes', element: col(<PendingRequests />) },
              { path: '/coletivo/:id/eventos/novo', element: col(<CreateEvent />) },
              { path: '/coletivo/:id/membros', element: col(<EditMembers />) },
              { path: '/coletivo/:id/editar', element: col(<EditCollective />) },
              { path: '/coletivo/:id/perfil', element: col(<EditCollectiveProfile />) },
            ]}
            notFound={pub(
              <Empty>
                404 — página não encontrada.{' '}
                <Link to="/" className="text-[var(--accent-text)] underline">
                  voltar ao início
                </Link>
              </Empty>,
            )}
          />
        </RouterProvider>
      </ToastProvider>
    </StoreProvider>
  )
}
