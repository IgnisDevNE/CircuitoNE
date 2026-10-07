import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { EditMembers } from '../pages/collective/EditMembers'
import { collectiveMembersAction, loadCollectiveMembers } from '../server/collective-manage.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective-members'

export const loader = ({ request, params }: Route.LoaderArgs) => supabaseLoader(request, (client) => loadCollectiveMembers(client, params.id))
export const action = ({ request, params }: Route.ActionArgs) => collectiveMembersAction(request, params.id)
export const headers = supabaseRouteHeaders
// Recusa do banco ("já não é membro", perfil excluído) indica lista desatualizada: sempre recarrega.
export const shouldRevalidate = revalidateAfterSubmit

export default function CollectiveMembersRoute({ params, loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return (
    <EditMembers
      coletivo={{ id: params.id }}
      membros={loaderData.membros}
      perfis={loaderData.perfis}
      podeAtribuir={loaderData.podeAtribuir}
      feedback={actionData ?? null}
      busy={busy}
    />
  )
}

export function ErrorBoundary() {
  return <LoadError level="h2" notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
