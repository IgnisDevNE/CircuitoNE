import { chatAction, chatLoader } from '../../server/chat.server'
import type { Route } from './+types/chat'

// Rotas de recurso (sem tela) do chat flutuante: `/api/chat/abrir`, `/conversa` (GET) e `/enviar`, `/lida` (POST).
// Respondem sempre JSON e nunca redirecionam: quem chama é uma janela sobre a página atual.
export const loader = ({ request, params }: Route.LoaderArgs) => chatLoader(request, params['*'])
export const action = ({ request, params }: Route.ActionArgs) => chatAction(request, params['*'])
