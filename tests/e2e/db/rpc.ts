import { createClient } from '@supabase/supabase-js'
import { fixturePassword } from './session'

/**
 * Chama um RPC como uma conta sintética, direto na API do Supabase local (chave publicável, RLS e RPCs como no app).
 * Serve para preparar e restaurar estado nos testes que mudam dados; as asserções ficam na interface.
 */
export async function rpcAs<T = unknown>(email: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.')
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: fixturePassword })
  if (signInError) throw new Error(`login de ${email}: ${signInError.message}`)
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data as T
}
