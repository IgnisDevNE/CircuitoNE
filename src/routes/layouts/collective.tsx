import { Outlet } from 'react-router'
import { CollectiveLayout } from '../../components/layout/CollectiveLayout'
import { LoadError } from '../../components/ui/LoadError'
import { CollectiveUnavailable } from '../../pages/collective/CollectiveUnavailable'
import { loadCollectiveArea } from '../../server/collective-area.server'
import { revalidateAfterSubmit } from '../../lib/revalidate'
import { supabaseLoader, supabaseRouteHeaders } from '../../server/supabase.server'
import type { Route } from './+types/collective'

/**
 * Layout `/coletivo/:id/*`, dentro do layout autenticado. Quem não é membro (ou o coletivo não existe/está encerrado)
 * recebe 404, sem revelar a existência. Coletivo ainda não aprovado mostra só o estado (RN-30); aprovado, o menu
 * segue as permissões efetivas do titular (`get_collective_access`).
 *
 * As rotas filhas com loader respondem 403 quando o acesso efetivo não existe (coletivo não aprovado) e DEVEM exportar
 * o próprio `ErrorBoundary`: sem ele o erro subiria para o deste layout e esconderia o estado bloqueado.
 */
export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadCollectiveArea(client, params.id))
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

const SECTIONS: Record<string, string> = { painel: 'Dashboard', solicitacoes: 'Solicitações' }

// O título da seção ligada ao banco vem daqui (as rotas filhas ligadas não definem `meta`, o que sobrescreveria este).
export const meta = ({ loaderData, location }: Route.MetaArgs) => {
  const section = SECTIONS[location.pathname.replace(/\/$/, '').split('/').pop() ?? '']
  const name = loaderData?.coletivo.nome ?? 'Coletivo'
  return [{ title: `${name}${section ? ` · ${section}` : ''} · CIRCUITO NE` }]
}

export default function CollectiveAreaRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.status === 'unavailable')
    return <CollectiveUnavailable coletivo={loaderData.coletivo} situacao={loaderData.situacao} motivo={loaderData.motivo} />
  return (
    <CollectiveLayout coletivo={loaderData.coletivo} permissoes={loaderData.permissoes} pendentes={loaderData.pendentes}>
      <Outlet />
    </CollectiveLayout>
  )
}

export function ErrorBoundary() {
  return <LoadError notFound="Coletivo não encontrado." backTo="/painel/coletivos" backLabel="voltar para meus coletivos" />
}
