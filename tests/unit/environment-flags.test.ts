// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { loadEditCollective } from '../../src/server/collective-manage.server'
import { loadEnvironmentFlags } from '../../src/server/environment.server'
import { loadExplore } from '../../src/server/explore.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }

/** Cliente fake com `get_environment_flags` (resultado, ou erro lançado) e o restante que os carregadores usam. */
function fakeClient(flags: Result | Error, extra: { rpc?: Record<string, Result>; tables?: Record<string, Result>; aal?: { currentLevel: string; nextLevel: string } } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_environment_flags') {
      if (flags instanceof Error) throw flags
      return flags
    }
    const entry = extra.rpc?.[name]
    if (!entry) throw new Error(`rpc inesperado: ${name}`)
    return entry
  })
  const from = vi.fn((table: string) => {
    const entry = extra.tables?.[table]
    if (!entry) throw new Error(`tabela inesperada: ${table}`)
    const builder: Record<string, unknown> = { then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(entry).then(resolve, reject) }
    for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = () => builder
    return builder
  })
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({ data: extra.aal ?? { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }))
  return { client: { rpc, from, auth: { mfa: { getAuthenticatorAssuranceLevel } } } as unknown as SupabaseServerClient, rpc, getAuthenticatorAssuranceLevel }
}

describe('loadEnvironmentFlags', () => {
  it('lê as duas flags do banco', async () => {
    const { client } = fakeClient(ok(['auto_approve_collectives', 'mfa_optional']))
    expect(await loadEnvironmentFlags(client)).toEqual({ mfaOptional: true, autoApproveCollectives: true })
  })

  it('cada flag isolada; nomes desconhecidos são ignorados', async () => {
    expect(await loadEnvironmentFlags(fakeClient(ok(['mfa_optional'])).client)).toEqual({ mfaOptional: true, autoApproveCollectives: false })
    expect(await loadEnvironmentFlags(fakeClient(ok(['auto_approve_collectives', 'outra'])).client)).toEqual({ mfaOptional: false, autoApproveCollectives: true })
  })

  it('produção/CI: tabela vazia deixa tudo desligado', async () => {
    expect(await loadEnvironmentFlags(fakeClient(ok([])).client)).toEqual({ mfaOptional: false, autoApproveCollectives: false })
  })

  it('erro do banco, resposta inesperada ou exceção: tudo desligado, sem propagar o erro', async () => {
    const off = { mfaOptional: false, autoApproveCollectives: false }
    expect(await loadEnvironmentFlags(fakeClient(failure).client)).toEqual(off)
    expect(await loadEnvironmentFlags(fakeClient(ok(null)).client)).toEqual(off)
    expect(await loadEnvironmentFlags(fakeClient(ok('mfa_optional')).client)).toEqual(off)
    expect(await loadEnvironmentFlags(fakeClient(new Error('rede')).client)).toEqual(off)
  })

  it('uma única chamada por cliente (requisição)', async () => {
    const { client, rpc } = fakeClient(ok(['mfa_optional']))
    await Promise.all([loadEnvironmentFlags(client), loadEnvironmentFlags(client)])
    await loadEnvironmentFlags(client)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('carregadores repassam a flag', () => {
  const C = '05000000-0000-4000-8000-000000000001'
  const editRpc = {
    list_my_collectives: ok([{ id: C, kind: 'collective', name: 'Organização sintética 1', city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Membro', is_owner: true }]),
    get_collective_status: ok({
      id: C, state: 'approved', version: 3, reason: null, cnpj: null,
      profile: { id: C, kind: 'collective', name: 'Organização sintética 1', description: 'Fixture', activity: 'Música', city: 'Recife', state_code: 'PE', social_links: {}, color: null, image_path: null, state: 'approved', version: 3 },
    }),
    get_collective_roles: ok([]),
    get_collective_member_roster: ok([]),
  }

  it('edição do coletivo: sem a flag o nível da sessão decide (aal1 com fator pede confirmação)', async () => {
    const { client } = fakeClient(ok([]), { rpc: editRpc, aal: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    expect(await loadEditCollective(client, C)).toMatchObject({ mfa: 'confirmar', mfaOpcional: false })
  })

  it('edição do coletivo: com mfa_optional a transferência já está liberada, qualquer que seja a sessão', async () => {
    const { client, getAuthenticatorAssuranceLevel } = fakeClient(ok(['mfa_optional']), { rpc: editRpc, aal: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    expect(await loadEditCollective(client, C)).toMatchObject({ mfa: 'confirmada', mfaOpcional: true })
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()
  })

  it('edição do coletivo pendente: nem consulta as flags', async () => {
    const pending = { ...editRpc, list_my_collectives: ok([{ id: C, kind: 'collective', name: 'x', city: 'Recife', state_code: 'PE', state: 'pending', role_name: 'Membro', is_owner: true }]) }
    const { client, rpc } = fakeClient(ok(['mfa_optional']), {
      rpc: { ...pending, get_collective_status: ok({ ...(editRpc.get_collective_status.data as object), state: 'pending', profile: { ...(editRpc.get_collective_status.data as { profile: object }).profile, state: 'pending' } }) },
    })
    expect(await loadEditCollective(client, C)).toMatchObject({ aprovado: false, mfaOpcional: false })
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('get_environment_flags')
  })

  it('catálogo: perfis levam a flag; coletivos não precisam dela', async () => {
    const tables = { profiles: ok([]), professional_details: ok([]), artist_styles: ok([]) }
    const on = fakeClient(ok(['mfa_optional']), { rpc: { list_my_profiles: ok([]) }, tables })
    expect(await loadExplore(on.client, 'artistas')).toMatchObject({ kind: 'artistas', mfaOpcional: true })
    const off = fakeClient(ok([]), { rpc: { list_my_profiles: ok([]) }, tables })
    expect(await loadExplore(off.client, 'artistas')).toMatchObject({ mfaOpcional: false })
    const broken = fakeClient(failure, { rpc: { list_my_profiles: ok([]) }, tables })
    expect(await loadExplore(broken.client, 'artistas')).toMatchObject({ mfaOpcional: false })
  })
})
