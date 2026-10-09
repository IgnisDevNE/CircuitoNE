import { serveImage } from '../server/image.server'
import type { Route } from './+types/image'

// Rota de recurso (sem tela): imagens do bucket privado `public-images`, lidas com a sessão de quem pede.
export const loader = ({ request, params }: Route.LoaderArgs) => serveImage(request, params['*'])
