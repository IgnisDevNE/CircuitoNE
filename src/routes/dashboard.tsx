import { useRouteLoaderData } from 'react-router'
import { Dashboard } from '../pages/app/Dashboard'
import { loadDashboard } from '../server/account.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { loader as appLoader } from './layouts/app'
import type { Route } from './+types/dashboard'

// Usa os cookies do titular: `list_my_profiles` e `list_events` rodam como ele (RLS).
export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadDashboard)
export const headers = supabaseRouteHeaders

export const meta = () => [{ title: 'Dashboard · CIRCUITO NE' }]

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  // Nome, atuações, coletivos e mensagens não lidas já vêm do layout autenticado (uma consulta só por navegação).
  const shell = useRouteLoaderData<typeof appLoader>('routes/layouts/app')
  if (shell?.status !== 'active') return null
  return (
    <Dashboard
      nome={shell.nome}
      perfis={shell.perfis}
      coletivos={shell.coletivos}
      naoLidas={shell.naoLidas}
      proximos={loaderData.proximos}
    />
  )
}
