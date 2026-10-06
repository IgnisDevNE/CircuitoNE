import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { ManageEvent } from '../pages/collective/ManageEvent'
import { createAnonymousClient, eventManageAction, loadEventManage } from '../server/events-manage.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/event-manage'

export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadEventManage(client, createAnonymousClient(request), params.id, params.eventId))
export const action = ({ request, params }: Route.ActionArgs) => eventManageAction(request, params.id, params.eventId)
export const headers = supabaseRouteHeaders
// Recusas do banco (conflito de versão, evento já cancelado) indicam página desatualizada: sempre recarrega.
export const shouldRevalidate = revalidateAfterSubmit

export const meta = ({ loaderData }: Route.MetaArgs) => [{ title: `${loaderData?.evento.nome ?? 'Evento'} · Gestão · CIRCUITO NE` }]

export default function EventManageRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <ManageEvent evento={loaderData.evento} acoes={loaderData.acoes} artistas={loaderData.artistas} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Evento não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
