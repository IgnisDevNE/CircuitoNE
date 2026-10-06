import { useRouteLoaderData } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { CollectiveDashboard } from '../pages/collective/CollectiveDashboard'
import { loadCollectiveDashboard } from '../server/collective-area.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { loader as areaLoader } from './layouts/collective'
import type { Route } from './+types/collective-dashboard'

// Usa os cookies do titular: `list_collective_events` e `get_collective_access` rodam como ele. Sem `meta`: vale o do layout.
export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadCollectiveDashboard(client, params.id))
export const headers = supabaseRouteHeaders

export default function CollectiveDashboardRoute({ loaderData }: Route.ComponentProps) {
  // Coletivo, permissões e pedidos pendentes já vêm do layout `/coletivo/:id`.
  const area = useRouteLoaderData<typeof areaLoader>('routes/layouts/collective')
  if (area?.status !== 'available') return null
  return (
    <CollectiveDashboard
      coletivo={area.coletivo}
      permissoes={area.permissoes}
      pendentes={area.pendentes}
      eventos={loaderData.eventos}
      gestao={loaderData.gestao}
      mensagens={loaderData.mensagens}
    />
  )
}

export function ErrorBoundary() {
  return <LoadError notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
