import { Outlet } from 'react-router'
import { AppShell } from '../../components/layout/AppShell'
import { LoadError } from '../../components/ui/LoadError'
import { Panel } from '../../components/ui/primitives'
import { RestrictedAccount } from '../../pages/app/RestrictedAccount'
import { appLayoutLoader } from '../../server/account.server'
import { supabaseRouteHeaders } from '../../server/supabase.server'
import type { Route } from './+types/app'

/**
 * Layout autenticado de `/painel/*` e `/coletivo/*`. O loader valida a sessão no servidor (getUser +
 * `get_account_session`): visitante vai para `/entrar`; conta suspensa, em exclusão ou incompleta vê só o aviso.
 */
export const loader = ({ request }: Route.LoaderArgs) => appLayoutLoader(request)
export const headers = supabaseRouteHeaders

export default function AppRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.status === 'restricted')
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-12">
        <Panel title="Minha conta">
          <RestrictedAccount nome={loaderData.nome} situacao={loaderData.situacao} motivo={loaderData.motivo} />
        </Panel>
      </main>
    )
  return (
    <AppShell
      nome={loaderData.nome}
      perfis={loaderData.perfis}
      coletivos={loaderData.coletivos}
      naoLidas={loaderData.naoLidas}
    >
      <Outlet />
    </AppShell>
  )
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/" backLabel="voltar ao início" />
}
