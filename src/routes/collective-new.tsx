import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { NewCollective } from '../pages/app/NewCollective'
import { loadNewCollective, newCollectiveAction } from '../server/collective-create.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective-new'

// A conta vem do cookie do titular (o layout do painel valida a sessão); `create_collective` confere a conta ativa.
export const loader = ({ request }: Route.LoaderArgs) => supabaseLoader(request, async () => loadNewCollective())
export const action = ({ request }: Route.ActionArgs) => newCollectiveAction(request)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export const meta = () => [{ title: 'Novo coletivo/produtora · CIRCUITO NE' }]

export default function NewCollectiveRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <NewCollective requestId={loaderData.requestId} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Página não encontrada." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
