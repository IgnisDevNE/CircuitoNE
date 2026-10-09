/**
 * Cookie de sessão sintético do Supabase (formato do `@supabase/ssr`: `base64-` + JSON da sessão em base64url), para testes
 * de ações que conferem a sessão antes de ler o corpo (envios de arquivo). O `fetch` simulado precisa responder
 * `GET /auth/v1/user` (use `AUTH_USER`) e `get_account_session`.
 */
const REF = 'odphoxozclrshqjgwbqk'

export const sessionCookie = (userId: string, ref = REF) => {
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'sig'].join('.')
  const session = { access_token: jwt, refresh_token: 'refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: userId } }
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

export const AUTH_USER = (userId: string) => Response.json({ id: userId, email: 'owner@example.invalid' })
export const ACCOUNT_SESSION = (userId: string) => Response.json({ id: userId, name: 'Dona sintética', state: 'active', reason: null })
