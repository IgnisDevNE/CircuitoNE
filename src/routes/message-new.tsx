import { useNavigation } from 'react-router'
import { LoadError } from '../components/ui/LoadError'
import { NewMessage } from '../pages/app/NewMessage'
import { loadNewMessage, newMessageAction } from '../server/messages.server'
import { supabaseLoader, supabaseRouteHeaders } from '../server/supabase.server'
import { revalidateAfterSubmit } from '../lib/revalidate'
import type { Route } from './+types/message-new'

export const loader = ({ request }: Route.LoaderArgs) =>
  supabaseLoader(request, (client) => loadNewMessage(client, new URL(request.url).searchParams.get('para')))
export const action = ({ request }: Route.ActionArgs) => newMessageAction(request)
export const headers = supabaseRouteHeaders
export const shouldRevalidate = revalidateAfterSubmit

export const meta = () => [{ title: 'Nova mensagem · CIRCUITO NE' }]

export default function NewMessageRoute({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle'
  return <NewMessage {...loaderData} feedback={actionData ?? null} busy={busy} />
}

export function ErrorBoundary() {
  return <LoadError notFound="Interlocutor não encontrado." backTo="/painel/mensagens" backLabel="voltar às mensagens" />
}
