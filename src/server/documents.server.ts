import { redirect } from 'react-router'
import { BUCKETS, type DocumentSlug } from '../lib/uploads'
import { readAccountSession } from './auth.server'
import { createSupabaseServerClient, privateHeaders } from './supabase.server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Coluna de `professional_details` de cada documento: `presskit` (artista) ou `lista-servicos` (serviços). */
export const DOCUMENT_KINDS = { presskit: 'presskit_path', 'lista-servicos': 'services_pdf_path' } as const satisfies Record<DocumentSlug, string>

/** Quanto tempo o endereço assinado vale: o suficiente para o navegador abrir o PDF logo após o clique. */
export const SIGNED_URL_SECONDS = 60

const missing = (headers: Headers) => new Response('Documento não encontrado.', { status: 404, headers })

/**
 * Abre um documento privado (presskit ou lista de serviços/equipamentos, RN-07/RN-35). Quem decide é o banco: só vê o
 * caminho quem a RLS de `professional_details` deixa ler (o titular, ou o proprietário de coletivo aprovado com MFA), e só
 * obtém o endereço assinado quem a política do bucket deixa ler. O endereço vale poucos segundos e é gerado a cada clique;
 * nunca vai para o HTML nem para dados de loader. Sem sessão vai para o login; sem permissão (ou sem arquivo), 404.
 */
export async function openDocument(request: Request, profileId: string, slug: string): Promise<Response> {
  const headers = privateHeaders()
  if (!UUID.test(profileId) || !Object.hasOwn(DOCUMENT_KINDS, slug)) return missing(headers)
  try {
    const client = createSupabaseServerClient(request, headers)
    const session = await readAccountSession(client, request, headers)
    if (session.kind === 'error') return new Response('Serviço temporariamente indisponível.', { status: 503, headers })
    if (session.kind === 'anonymous') return redirect('/entrar', { status: 303, headers })
    if (session.account.state !== 'active') return new Response('Conta sem acesso.', { status: 403, headers })
    const column = DOCUMENT_KINDS[slug as DocumentSlug]
    const { data: row, error } = await client.from('professional_details').select(column).eq('profile_id', profileId).maybeSingle()
    if (error) return new Response('Serviço temporariamente indisponível.', { status: 503, headers })
    const path = row ? (row as Record<string, unknown>)[column] : null
    if (typeof path !== 'string' || !path) return missing(headers)
    const signed = await client.storage.from(BUCKETS.document).createSignedUrl(path, SIGNED_URL_SECONDS)
    // Recusa da política e objeto ausente chegam igual: não distinguir.
    if (signed.error || !signed.data?.signedUrl) return missing(headers)
    return redirect(signed.data.signedUrl, { status: 302, headers })
  } catch {
    return new Response('Serviço temporariamente indisponível.', { status: 503, headers })
  }
}
