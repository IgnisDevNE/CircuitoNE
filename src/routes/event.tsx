import { EventPage } from '../pages/public/EventPage'
import { LoadError } from '../components/ui/LoadError'
import { loadEventPage } from '../server/events.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/event'

export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadEventPage(client, params.id), { anonymous: true })
export const headers = supabaseRouteHeaders

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `${loaderData?.evento.nome ?? 'Evento não encontrado'} · CIRCUITO NE` },
  { name: 'description', content: 'CircuitoNE: artistas, coletivos, eventos e profissionais da cena eletrônica.' },
]

export default function EventRoute({ loaderData }: Route.ComponentProps) {
  return <EventPage {...loaderData} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Evento não encontrado." backTo="/eventos" backLabel="Voltar" />
}
