import { useNavigation, useRouteLoaderData } from 'react-router'
import { Empty } from '../components/ui/primitives'
import { EditData } from '../pages/app/EditData'
import { accountDataAction, loadAccountData } from '../server/account-settings.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { loader as appLoader } from './layouts/app'
import type { Route } from './+types/account-data'

// Roda com a identidade do titular: as RPCs `get/update_my_account_details` só atendem a própria conta ativa.
export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadAccountData)
export const action = ({ request }: Route.ActionArgs) => accountDataAction(request)
export const headers = supabaseRouteHeaders

export const meta = () => [{ title: 'Editar Dados · CIRCUITO NE' }]

export default function AccountDataRoute({ loaderData, actionData }: Route.ComponentProps) {
  const shell = useRouteLoaderData<typeof appLoader>('routes/layouts/app')
  const busy = useNavigation().state === 'submitting'
  // Conta restrita: o layout já mostra o aviso e nenhum dado é carregado.
  if (shell?.status !== 'active') return null
  if (!loaderData.conta) return <Empty>Não foi possível carregar os dados da conta.</Empty>
  return <EditData conta={loaderData.conta} perfis={shell.perfis} result={actionData} busy={busy} />
}
