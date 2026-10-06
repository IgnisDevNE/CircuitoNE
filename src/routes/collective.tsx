import { CollectiveProfile } from '../pages/public/CollectiveProfile'
import { LoadError } from '../components/ui/LoadError'
import { loadCollectivePage } from '../server/collectives.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective'

export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadCollectivePage(client, params.id))
export const headers = supabaseRouteHeaders

export const meta = ({ loaderData }: Route.MetaArgs) => [
  { title: `${loaderData?.coletivo.nome ?? 'Coletivo não encontrado'} · CIRCUITO NE` },
  { name: 'description', content: 'CircuitoNE: artistas, coletivos, eventos e profissionais da cena eletrônica.' },
]

export default function CollectiveRoute({ loaderData }: Route.ComponentProps) {
  return <CollectiveProfile {...loaderData} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Coletivo não encontrado." backTo="/coletivos" backLabel="Voltar" />
}
