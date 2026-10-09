/** Caminho de imagem como as constraints do banco o aceitam; qualquer outro valor vindo do banco nunca vira URL. */
export const IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/

/**
 * URL de uma imagem do bucket `public-images`, ou `null` sem caminho. O bucket é privado: a imagem passa pela rota `/img/*`
 * (`image.server.ts`), que a baixa com a sessão de quem pede e deixa a política do Storage decidir se ela ainda é visível.
 * Os mapeadores só a usam para atuações, coletivos e eventos que a página já pode exibir, e preferem sempre a imagem
 * enviada ao link externo ou à imagem neutra.
 */
export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path || !IMAGE_PATH.test(path)) return null
  return `/img/${path}`
}
