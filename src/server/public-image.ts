/** Caminho de imagem como as constraints do banco o aceitam; qualquer outro valor vindo do banco nunca vira URL. */
const IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/

/**
 * URL pública de uma imagem do bucket `public-images`, ou `null` sem caminho (ou sem Supabase configurado). Como o bucket
 * é público, a URL funciona para qualquer visitante: os mapeadores só a usam para atuações, coletivos e eventos que a
 * página já pode exibir, e preferem sempre a imagem enviada ao link externo ou à imagem neutra.
 */
export function publicImageUrl(path: string | null | undefined): string | null {
  const base = process.env.SUPABASE_URL
  if (!base || !path || !IMAGE_PATH.test(path)) return null
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/public-images/${path}`
}
