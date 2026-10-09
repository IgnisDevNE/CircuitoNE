import type { SupabaseServerClient } from './supabase.server'

/**
 * Flags de ambiente do dev (W17). O banco é a autoridade: `private.environment_flags` só tem linhas no projeto dev
 * (seed `dev-flags`); produção e CI a mantêm vazia. A UI usa estas flags apenas para avisar e para não bloquear.
 */
export type EnvironmentFlags = {
  /** MFA (aal2) não é exigido; as telas avisam que será exigido em produção. */
  mfaOptional: boolean
  /** Coletivos criados já nascem aprovados. */
  autoApproveCollectives: boolean
}

const OFF: EnvironmentFlags = { mfaOptional: false, autoApproveCollectives: false }

const cache = new WeakMap<object, Promise<EnvironmentFlags>>()

async function read(client: SupabaseServerClient): Promise<EnvironmentFlags> {
  try {
    const { data, error } = await client.rpc('get_environment_flags')
    if (error || !Array.isArray(data)) return OFF
    return { mfaOptional: data.includes('mfa_optional'), autoApproveCollectives: data.includes('auto_approve_collectives') }
  } catch {
    // Sem a leitura, vale a regra de produção: nenhuma flag ligada.
    return OFF
  }
}

/** Lê as flags (uma chamada por cliente, ou seja, por requisição); qualquer falha as trata como desligadas. */
export function loadEnvironmentFlags(client: SupabaseServerClient): Promise<EnvironmentFlags> {
  let flags = cache.get(client)
  if (!flags) {
    flags = read(client)
    cache.set(client, flags)
  }
  return flags
}
