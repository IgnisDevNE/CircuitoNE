import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { EditCollective } from '../pages/collective/EditCollective'
import { collectiveEditAction, loadEditCollective } from '../server/collective-manage.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective-edit'

export const loader = ({ request, params }: Route.LoaderArgs) => supabaseLoader(request, (client) => loadEditCollective(client, params.id))
export const action = ({ request, params }: Route.ActionArgs) => collectiveEditAction(request, params.id)
export const headers = supabaseRouteHeaders
// Recusas do banco (conflito de versão, perfil já excluído) indicam página desatualizada: sempre recarrega.
export const shouldRevalidate = revalidateAfterSubmit

export default function CollectiveEditRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <EditCollective {...loaderData} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError level="h2" notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
