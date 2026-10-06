import { EventsList } from '../pages/public/EventsList'
import { LoadError } from '../components/ui/LoadError'
import { loadEventList } from '../server/events.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/events'

export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadEventList, { anonymous: true })
export const headers = supabaseRouteHeaders

export const meta = () => [
  { title: 'Eventos Programados · CIRCUITO NE' },
  { name: 'description', content: 'Agenda de eventos em andamento e futuros no circuito eletrônico do Nordeste.' },
]

export default function EventsRoute({ loaderData }: Route.ComponentProps) {
  return <EventsList ongoing={loaderData.ongoing} future={loaderData.future} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/" backLabel="voltar ao início" />
}
