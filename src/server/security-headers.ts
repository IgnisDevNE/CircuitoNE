/**
 * Cabeçalhos de segurança de toda resposta de documento (HTML). A CSP usa um nonce por requisição: o script inline de
 * hidratação do React Router e os scripts de streaming levam o mesmo nonce (passado ao `<ServerRouter nonce>` em
 * `entry.server.tsx`, de onde `<Scripts>`, `<ScrollRestoration>` e `<Links>` o herdam), então nenhum script inline sem
 * nonce roda. Estilos inline continuam permitidos (atributos `style` do React e do Tailwind) e as fontes vêm do Google Fonts.
 */

/** Nonce aleatório de 128 bits em base64, novo a cada requisição. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Política de conteúdo do documento. `img-src https:` cobre a capa de evento por link externo (RN de eventos) e `data:` as
 * imagens embutidas; as imagens enviadas vêm de `/img/*` (mesma origem). O navegador só fala com a própria origem
 * (`connect-src 'self'`): o Supabase é chamado pelo servidor. No `react-router dev` o HMR precisa de WebSocket.
 */
export function contentSecurityPolicy(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** Cabeçalhos fixos além da CSP. */
export const STATIC_SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
} as const

/** Grava a CSP (com o nonce da requisição) e os cabeçalhos fixos nos cabeçalhos da resposta do documento. */
export function applySecurityHeaders(headers: Headers, nonce: string, options: { dev?: boolean } = {}): Headers {
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce, options))
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) headers.set(name, value)
  return headers
}
