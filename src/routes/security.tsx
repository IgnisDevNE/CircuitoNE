import { useNavigation, useRouteLoaderData } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { Empty } from '../components/ui/primitives'
import { Security } from '../pages/app/Security'
import { loadSecurity, securityAction } from '../server/account-settings.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { loader as appLoader } from './layouts/app'
import type { Route } from './+types/security'

// O e-mail e os fatores de MFA vêm do Auth, validados no servidor; nenhuma chave de serviço é usada.
export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadSecurity)
export const action = ({ request }: Route.ActionArgs) => securityAction(request)
export const headers = supabaseRouteHeaders

export const meta = () => [{ title: 'Segurança · CIRCUITO NE' }]

export default function SecurityRoute({ loaderData, actionData }: Route.ComponentProps) {
  const shell = useRouteLoaderData<typeof appLoader>('routes/layouts/app')
  const busy = useNavigation().state === 'submitting'
  if (shell?.status !== 'active') return null
  if (!loaderData.seguranca) return <Empty>Não foi possível carregar os dados de segurança.</Empty>
  return <Security seguranca={loaderData.seguranca} mfaOpcional={loaderData.mfaOpcional} result={actionData} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/painel" backLabel="voltar ao dashboard" />
}
