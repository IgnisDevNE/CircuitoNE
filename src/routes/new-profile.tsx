import { useNavigation, useRouteLoaderData } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { NewProfile } from '../pages/app/NewProfile'
import { loadNewProfile, newProfileAction } from '../server/registration.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { loader as appLoader } from './layouts/app'
import type { Route } from './+types/new-profile'

// A taxonomia de estilos é pública; quem cria é a conta ativa (create_profile recusa as demais).
export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadNewProfile)
export const action = ({ request }: Route.ActionArgs) => newProfileAction(request)
export const headers = supabaseRouteHeaders

export const meta = () => [{ title: 'Nova atuação · CIRCUITO NE' }]

export default function NewProfileRoute({ loaderData, actionData }: Route.ComponentProps) {
  const shell = useRouteLoaderData<typeof appLoader>('routes/layouts/app')
  const busy = useNavigation().state === 'submitting'
  // Conta restrita: o layout já mostra o aviso.
  if (shell?.status !== 'active') return null
  return <NewProfile taxonomia={loaderData.taxonomia} nome={shell.nome} local={loaderData.local} result={actionData} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/painel/dados" backLabel="voltar aos dados" />
}
