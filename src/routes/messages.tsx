import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { revalidateAfterSubmit } from '../lib/revalidate'
import { Messages } from '../pages/app/Messages'
import { loadMessages, messagesAction, threadPages } from '../server/messages.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import type { Route } from './+types/messages'

// `/painel/mensagens` e `/painel/mensagens/:conversationId`: lista e histórico no mesmo loader (uma só leitura por navegação).
export const loader = ({ request, params }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) =>
    loadMessages(client, { kind: 'account' }, { conversationId: params.conversationId, pages: threadPages(request) }),
  )
export const action = ({ request, params }: Route.ActionArgs) => messagesAction(request, { kind: 'account' }, params.conversationId)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export const meta = () => [{ title: 'Mensagens · CIRCUITO NE' }]

export default function MessagesRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <Messages {...loaderData} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Conversa não encontrada." backTo="/painel/mensagens" backLabel="voltar às mensagens" />
}
