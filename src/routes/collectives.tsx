import { CollectivesHub } from '../pages/public/CollectivesHub'
import { LoadError } from '../components/ui/LoadError'
import { loadCollectiveList } from '../server/collectives.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collectives'

export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadCollectiveList)
export const headers = supabaseRouteHeaders

export const meta = () => [
  { title: 'Coletivos e Produtoras · CIRCUITO NE' },
  { name: 'description', content: 'Coletivos e produtoras que movimentam a cena eletrônica do Nordeste.' },
]

export default function CollectivesRoute({ loaderData }: Route.ComponentProps) {
  return <CollectivesHub coletivos={loaderData.coletivos} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/" backLabel="voltar ao início" />
}
