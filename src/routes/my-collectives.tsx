import { useNavigation, useSearchParams } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { MyCollectives } from '../pages/app/MyCollectives'
import { loadMyCollectivesPage, myCollectivesAction } from '../server/collective-area.server'
import { CREATED_PARAM } from '../lib/collective-forms'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/my-collectives'

// Usa os cookies do titular: as listas e os pedidos rodam como ele (RLS e RPCs).
export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, loadMyCollectivesPage)
export const action = ({ request }: Route.ActionArgs) => myCollectivesAction(request)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export const meta = () => [{ title: 'Meus Coletivos · CIRCUITO NE' }]

export default function MyCollectivesRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  const [params] = useSearchParams()
  return <MyCollectives {...loaderData} feedback={actionData ?? null} criado={params.has(CREATED_PARAM)} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/painel" backLabel="voltar ao dashboard" />
}
