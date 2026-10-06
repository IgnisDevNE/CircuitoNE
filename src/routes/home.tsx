import { Home } from '../pages/public/Home'
import { LoadError } from '../components/ui/LoadError'
import { loadHome } from '../server/home.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/home'

export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadHome, { anonymous: true })
export const headers = supabaseRouteHeaders

export const meta = () => [
  { title: 'Início · CIRCUITO NE' },
  { name: 'description', content: 'CircuitoNE: artistas, coletivos, eventos e profissionais da cena eletrônica.' },
]

export default function HomeRoute({ loaderData }: Route.ComponentProps) {
  return <Home {...loaderData} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/" backLabel="tentar novamente" />
}
