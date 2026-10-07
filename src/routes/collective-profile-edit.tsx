import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { EditCollectiveProfile } from '../pages/collective/EditCollectiveProfile'
import { collectiveProfileAction, loadEditCollectiveProfile } from '../server/collective-manage.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective-profile-edit'

export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadEditCollectiveProfile(client, params.id))
export const action = ({ request, params }: Route.ActionArgs) => collectiveProfileAction(request, params.id)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export default function CollectiveProfileEditRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <EditCollectiveProfile coletivo={loaderData.coletivo} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
