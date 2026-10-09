import { eventSheetLoader } from '../../server/events.server'
import type { Route } from './+types/event'

// Rota de recurso (sem tela) do painel lateral do evento: `/api/eventos/:id` responde JSON com o detalhe público.
export const loader = ({ request, params }: Route.LoaderArgs) => eventSheetLoader(request, params.id)
