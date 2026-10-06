import type { ReactNode } from 'react'
import { RouterProvider, Routes, Link } from './router'
import { StoreProvider } from './context/StoreContext'
import { ToastProvider } from './context/ToastContext'
import { LegacyAppShell, LegacyCollectiveLayout, LegacyDashboard, LegacyPublic } from './components/layout/LegacyShells'
import { Empty } from './components/ui/primitives'


import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'

import { LegacyEditData } from './pages/legacy/LegacyEditData'
import { LegacyEditProfile } from './pages/legacy/LegacyEditProfile'
import { LegacySecurity } from './pages/legacy/LegacySecurity'
import { LegacyMessages } from './pages/legacy/LegacyMessages'
import { Explore } from './pages/app/Explore'

import { LegacyCollectiveMessages } from './pages/legacy/LegacyCollectiveMessages'
import { EditMembers } from './pages/collective/EditMembers'
import { EditCollective } from './pages/collective/EditCollective'
import { EditCollectiveProfile } from './pages/collective/EditCollectiveProfile'
import { LegacyCreateEvent } from './pages/collective/LegacyCreateEvent'

const pub = (el: ReactNode) => <LegacyPublic>{el}</LegacyPublic>
const app = (el: ReactNode) => <LegacyAppShell>{el}</LegacyAppShell>
const col = (el: ReactNode) => (
  <LegacyAppShell>
    <LegacyCollectiveLayout>{el}</LegacyCollectiveLayout>
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
              { path: '/painel/perfil/:atuacaoId', element: app(<LegacyEditProfile />) },
              { path: '/painel/dados', element: app(<LegacyEditData />) },
              { path: '/painel/dados/nova-atuacao', element: app(<Register mode="nova-atuacao" />) },
              { path: '/painel/seguranca', element: app(<LegacySecurity />) },
              { path: '/painel/mensagens', element: app(<LegacyMessages />) },
              { path: '/painel/explorar/artistas', element: app(<Explore kind="artistas" />) },
              { path: '/painel/explorar/servicos', element: app(<Explore kind="servicos" />) },
              { path: '/painel/explorar/audiovisual', element: app(<Explore kind="audiovisual" />) },
              { path: '/painel/explorar/coletivos', element: app(<Explore kind="coletivos" />) },
              // coletivo / produtora
              { path: '/coletivo/:id/mensagens', element: col(<LegacyCollectiveMessages />) },
              { path: '/coletivo/:id/eventos/novo', element: col(<LegacyCreateEvent />) },
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
