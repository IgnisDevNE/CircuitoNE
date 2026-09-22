import type { ReactNode } from 'react'
import { RouterProvider, Routes, Link } from './router'
import { StoreProvider } from './context/StoreContext'
import { ToastProvider } from './context/ToastContext'
import { PublicLayout } from './components/layout/PublicLayout'
import { AppShell } from './components/layout/AppShell'
import { CollectiveLayout } from './components/layout/CollectiveLayout'
import { Empty } from './components/ui/primitives'

import { Home } from './pages/public/Home'
import { ArtistsHub } from './pages/public/ArtistsHub'
import { ArtistProfile } from './pages/public/ArtistProfile'
import { CollectivesHub } from './pages/public/CollectivesHub'
import { CollectiveProfile } from './pages/public/CollectiveProfile'
import { EventsList } from './pages/public/EventsList'
import { EventPage } from './pages/public/EventPage'

import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'

import { Dashboard } from './pages/app/Dashboard'
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

const pub = (el: ReactNode) => <PublicLayout>{el}</PublicLayout>
const app = (el: ReactNode) => <AppShell>{el}</AppShell>
const col = (el: ReactNode) => (
  <AppShell>
    <CollectiveLayout>{el}</CollectiveLayout>
  </AppShell>
)

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <RouterProvider>
          <Routes
            routes={[
              // público
              { path: '/', element: pub(<Home />) },
              { path: '/artistas', element: pub(<ArtistsHub />) },
              { path: '/artistas/:id', element: pub(<ArtistProfile />) },
              { path: '/coletivos', element: pub(<CollectivesHub />) },
              { path: '/coletivos/:id', element: pub(<CollectiveProfile />) },
              { path: '/eventos', element: pub(<EventsList />) },
              { path: '/eventos/:id', element: pub(<EventPage />) },
              // auth
              { path: '/entrar', element: pub(<Login />) },
              { path: '/cadastro', element: pub(<Register mode="cadastro" />) },
              // logado
              { path: '/painel', element: app(<Dashboard />) },
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
