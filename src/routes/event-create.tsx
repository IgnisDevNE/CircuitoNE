import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { CreateEvent } from '../pages/collective/CreateEvent'
import { createAnonymousClient, eventCreateAction, loadEventCreate } from '../server/events-manage.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/event-create'

// Usa os cookies do titular (`get_collective_access`); os artistas do lineup vêm de uma consulta anônima.
export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadEventCreate(client, createAnonymousClient(request), params.id))
export const action = ({ request, params }: Route.ActionArgs) => eventCreateAction(request, params.id)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export default function EventCreateRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <CreateEvent requestId={loaderData.requestId} artistas={loaderData.artistas} estilos={loaderData.estilos} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError level="h2" notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
