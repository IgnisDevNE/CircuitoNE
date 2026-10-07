import { openDocument } from '../server/documents.server'
import type { Route } from './+types/document'

// Rota de recurso (sem tela): redireciona para o PDF privado com um endereço assinado de poucos segundos.
export const loader = ({ request, params }: Route.LoaderArgs) => openDocument(request, params.atuacaoId, params.tipo)
