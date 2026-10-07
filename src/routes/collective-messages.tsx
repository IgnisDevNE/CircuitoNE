import { useNavigation, useParams } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { CollectiveMessages } from '../pages/collective/CollectiveMessages'
import { loadMessages, messagesAction, threadPages } from '../server/messages.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/collective-messages'

// Sem `meta`: vale o do layout do coletivo. Exige "ler mensagens" (403 sem ela); o layout só esconde o menu.
export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) =>
    loadMessages(client, { kind: 'collective', id: params.id }, { conversationId: params.conversationId, pages: threadPages(request) }),
  )
export const action = ({ request, params }: Route.ActionArgs) =>
  messagesAction(request, { kind: 'collective', id: params.id }, params.conversationId)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export default function CollectiveMessagesRoute({ loaderData, actionData, params }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <CollectiveMessages {...loaderData} coletivoId={params.id} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  const { id } = useParams()
  return <LoadError level="h2" notFound="Conversa não encontrada." backTo={`/coletivo/${id}/painel`} backLabel="voltar ao dashboard do coletivo" />
}
