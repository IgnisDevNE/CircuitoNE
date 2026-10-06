import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { PendingRequests } from '../pages/collective/PendingRequests'
import { collectiveRequestsAction, loadCollectiveRequests } from '../server/collective-area.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective-requests'

export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadCollectiveRequests(client, params.id))
export const action = ({ request, params }: Route.ActionArgs) => collectiveRequestsAction(request, params.id)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export default function CollectiveRequestsRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <PendingRequests pedidos={loaderData.pedidos} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
