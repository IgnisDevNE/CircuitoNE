import { BUCKETS } from '../lib/uploads'
import { IMAGE_PATH } from './public-image'
import { createSupabaseServerClient, privateHeaders } from './supabase.server'

/** Tipos que o bucket aceita; qualquer outro tipo devolvido pelo Storage vira 404 (nunca se repassa o tipo do objeto). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Sem detalhe: arquivo inexistente, recusa da política, caminho inválido e falha do Storage são indistinguíveis. */
const notFound = (headers: Headers) => new Response('Not found', { status: 404, headers: noStore(headers) })

const noStore = (headers: Headers) => {
  headers.set('Content-Type', 'text/plain; charset=utf-8')
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

/**
 * Serve uma imagem do bucket `public-images` (privado) para `/img/<entidade>/<arquivo>`. O objeto é baixado com o cliente
 * Supabase da requisição: com cookies de sessão, a do titular (que vê os próprios rascunhos no painel); sem eles, como
 * visitante. Quem decide se a imagem pode ser vista é a política de leitura de `storage.objects` (artista publicado,
 * coletivo aprovado, evento visível, ou quem pode escrevê-la); depois de despublicar, a imagem some. O cache é privado e
 * curto (5 minutos) pelo mesmo motivo.
 */
export async function serveImage(request: Request, path: string | undefined): Promise<Response> {
  const headers = privateHeaders()
  if ((request.method !== 'GET' && request.method !== 'HEAD') || !path || !IMAGE_PATH.test(path)) return notFound(headers)
  try {
    const client = createSupabaseServerClient(request, headers)
    const { data, error } = await client.storage.from(BUCKETS.image).download(path)
    if (error || !data) return notFound(headers)
    const type = data.type.split(';')[0].trim().toLowerCase()
    if (!IMAGE_TYPES.has(type)) return notFound(headers)
    const bytes = new Uint8Array(await data.arrayBuffer())
    const result = new Headers({
      'Content-Type': type,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=300',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    })
    // Cookies de sessão renovados durante a leitura continuam valendo.
    for (const cookie of headers.getSetCookie()) result.append('Set-Cookie', cookie)
    return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers: result })
  } catch {
    return notFound(headers)
  }
}
