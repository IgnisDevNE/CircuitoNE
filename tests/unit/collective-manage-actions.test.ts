// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginAction } from '../../src/server/auth.server'
import { sessionCookie, AUTH_USER } from './session-cookie'
import { collectiveEditAction, collectiveMembersAction, collectiveProfileAction, TRANSFER_NEEDS_MFA } from '../../src/server/collective-manage.server'

const origin = 'https://circuitone-dev.magalz.space'
const C = '05000000-0000-4000-8000-000000000001'
const ROLE = '06000000-0000-4000-8000-000000000100'
const MEMBER = '01000000-0000-4000-8000-000000000005'
const OWNER = '01000000-0000-4000-8000-000000000001'

type Sent = { name: string; body: Record<string, unknown> }
let sent: Sent[]
let reply: (name: string) => Response
let level: 'aal1' | 'aal2'
/** Flags de ambiente do dev devolvidas por `get_environment_flags` (leitura; não conta como escrita em `sent`). */
let flags: string[]

const token = (aal: string) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: OWNER, aal, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'sig'].join('.')

beforeEach(() => {
  sent = []
  reply = () => new Response(null, { status: 204 })
  level = 'aal2'
  flags = []
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (path === '/auth/v1/token')
        return Response.json({
          access_token: token(level),
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: OWNER, email: 'owner@example.invalid', factors: [{ id: 'F', status: 'verified', factor_type: 'totp' }] },
        })
      if (path === '/auth/v1/user') return AUTH_USER(OWNER)
      if (path === '/rest/v1/rpc/get_account_session') return Response.json({ id: OWNER, name: 'Dona sintética', state: 'active', reason: null })
      if (!path.startsWith('/rest/v1/rpc/')) throw new Error(`HTTP inesperado: ${path}`)
      const name = path.replace('/rest/v1/rpc/', '')
      if (name === 'get_environment_flags') return Response.json(flags)
      sent.push({ name, body: init?.body ? JSON.parse(String(init.body)) : {} })
      return reply(name)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const dbError = (status: number, code: string, message: string) => () => Response.json({ code, message, details: null, hint: null }, { status })

/** Entra como a proprietária (o cliente real lê o nível `aal` do JWT da sessão) e devolve o cabeçalho Cookie. */
const signIn = async () => {
  const response = await loginAction(
    new Request(origin + '/entrar', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'owner@example.invalid', password: 'synthetic-password' }),
    }),
  )
  sent = []
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}

const post = (path: string, fields: Record<string, string | string[]>, init: { headers?: Record<string, string>; method?: string; body?: BodyInit } = {}) => {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) body.append(key, v)
  return new Request(origin + path, {
    method: init.method ?? 'POST',
    headers: { Origin: origin, Cookie: sessionCookie(OWNER), 'Content-Type': 'application/x-www-form-urlencoded', ...init.headers },
    body: init.body ?? body,
  })
}

type Outcome = { ok: boolean; message?: string; error?: string; fields?: Record<string, string>; status: number; headers: Headers }
/** Lê o resultado de `data()` sem depender dos detalhes do React Router. */
const outcome = async (promise: Promise<unknown> | unknown): Promise<Outcome> => {
  const result = (await promise) as { data: Omit<Outcome, 'status' | 'headers'>; init: { status: number; headers: Headers } }
  return { ...result.data, status: result.init.status, headers: result.init.headers }
}

const infoFields = (extra: Record<string, string> = {}) => ({
  intent: 'save',
  version: '3',
  kind: 'collective',
  name: 'Coletivo sintético',
  description: 'Descrição\r\nem duas linhas',
  activity: 'Música',
  city: 'Recife',
  state_code: 'PE',
  cnpj: '',
  ...extra,
})

describe('collectiveEditAction: dados do cadastro', () => {
  const path = `/coletivo/${C}/editar`
  const edit = (fields: Record<string, string | string[]>, init = {}) => outcome(collectiveEditAction(post(path, fields, init), C))

  it('salva com a versão que a pessoa viu e só diz "salvo" depois do RPC', async () => {
    const result = await edit(infoFields())
    expect(sent).toEqual([
      {
        name: 'edit_collective',
        body: {
          target: C,
          expected_version: 3,
          resubmit: false,
          payload: { name: 'Coletivo sintético', description: 'Descrição\nem duas linhas', activity: 'Música', city: 'Recife', state_code: 'PE', cnpj: null },
        },
      },
    ])
    expect(result).toMatchObject({ ok: true, status: 200, message: 'Alterações salvas.' })
    expect(result.headers.get('cache-control')).toContain('no-store')
  })

  it('reenviar um coletivo recusado usa resubmit e normaliza o CNPJ', async () => {
    const result = await edit(infoFields({ intent: 'resubmit', kind: 'producer', cnpj: '12.ABC.345/01DE-35' }))
    expect(sent[0].body).toMatchObject({ resubmit: true, payload: { cnpj: '12ABC34501DE35' } })
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining('Dados reenviados') })
  })

  it('conflito de versão vira 409 com a mensagem de recarregar, nunca sucesso', async () => {
    reply = dbError(409, '40001', 'Coletivo alterado; recarregue')
    const result = await edit(infoFields())
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(result.error).toMatch(/alterado por outra pessoa/)
  })

  it('validação por campo antes do banco: produtora sem CNPJ, UF e descrição vazias', async () => {
    const result = await edit(infoFields({ kind: 'producer', cnpj: '', description: '  ', state_code: 'XX' }))
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      error: 'Corrija os campos destacados.',
      fields: { cnpj: 'Produtora exige CNPJ.', description: 'Descreva o coletivo.', state_code: 'Escolha o estado.' },
    })
    expect(sent).toEqual([])
  })

  it('versão, operação e identificadores inválidos não chegam ao banco', async () => {
    for (const version of ['', '0', 'abc', '1.5']) expect(await edit(infoFields({ version })), version).toMatchObject({ ok: false, status: 400 })
    expect(await edit({ intent: 'delete-everything' })).toMatchObject({ ok: false, status: 400, error: 'Operação inválida.' })
    expect(await edit({ intent: 'role-delete', role: 'x' })).toMatchObject({ ok: false, status: 400 })
    expect(await edit({ intent: 'transfer', successor: 'x' })).toMatchObject({ ok: false, status: 400 })
    expect(sent).toEqual([])
  })

  it.each([
    ['Operação não autorizada', '42501', 403, 'Você não tem permissão para esta operação.'],
    ['Produtora exige CNPJ', '22023', 422, 'Produtora exige CNPJ.'],
    ['Dados de coletivo inválidos', '22023', 422, 'O banco recusou os dados do coletivo. Revise os campos e tente de novo.'],
  ])('erro do banco "%s" chega traduzido', async (message, code, status, expected) => {
    reply = dbError(400, code, message)
    expect(await edit(infoFields())).toMatchObject({ ok: false, status, error: expected })
  })

  it('texto desconhecido do banco não vaza', async () => {
    reply = dbError(500, 'XX000', 'relation "private.collective_details" is broken')
    const result = await edit(infoFields())
    expect(result).toMatchObject({ ok: false, status: 503 })
    expect(JSON.stringify(result)).not.toContain('collective_details')
  })

  it('recusa método, caminho, origem e conteúdo indevidos antes de qualquer RPC; aceita o sufixo .data', async () => {
    expect(await outcome(collectiveEditAction(new Request(origin + path, { method: 'GET' }), C))).toMatchObject({ ok: false, status: 405 })
    expect(await outcome(collectiveEditAction(post(`/coletivo/${C}/perfil`, infoFields()), C))).toMatchObject({ ok: false, status: 405 })
    expect(await edit(infoFields(), { headers: { Origin: 'https://evil.example.invalid' } })).toMatchObject({ ok: false, status: 403, error: 'Origem recusada.' })
    expect(await edit(infoFields(), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).toMatchObject({ ok: false, status: 403 })
    expect(await outcome(collectiveEditAction(post(path, {}, { headers: { 'Content-Type': 'application/json' }, body: '{}' }), C))).toMatchObject({ ok: false, status: 415 })
    expect(sent).toEqual([])
    expect(await outcome(collectiveEditAction(post(`${path}.data`, infoFields()), C))).toMatchObject({ ok: true })
  })

  it('aceita descrição longa (10.000 caracteres acentuados) e continua limitando o corpo', async () => {
    expect(await edit(infoFields({ description: 'á'.repeat(10000) }))).toMatchObject({ ok: true })
    expect(await outcome(collectiveEditAction(post(path, {}, { body: 'x='.padEnd(200 * 1024, 'a') }), C))).toMatchObject({ ok: false, status: 413 })
  })

  it('coletivo que não é UUID responde 404 sem tentar nada', () => {
    expect(() => collectiveEditAction(post('/coletivo/x/editar', {}), 'x')).toThrow()
    expect(() => collectiveProfileAction(post('/coletivo/x/perfil', {}), 'x')).toThrow()
    expect(() => collectiveMembersAction(post('/coletivo/x/membros', {}), 'x')).toThrow()
  })
})

describe('collectiveEditAction: perfis de acesso', () => {
  const path = `/coletivo/${C}/editar`
  const roles = (fields: Record<string, string | string[]>) => outcome(collectiveEditAction(post(path, fields), C))

  it('cria um perfil com as permissões do catálogo, na ordem do catálogo e sem repetição', async () => {
    const result = await roles({ intent: 'role-save', role_name: ' Produção ', permission: ['send_messages', 'create_events', 'create_events'] })
    expect(sent).toEqual([{ name: 'save_collective_role', body: { target: C, target_role: null, role_name: 'Produção', permissions: ['create_events', 'send_messages'] } }])
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining('Perfil criado') })
  })

  it('edita um perfil existente com o identificador dele e permite zero permissões', async () => {
    const result = await roles({ intent: 'role-save', role: ROLE, role_name: 'Operações', permission: [] })
    expect(sent).toEqual([{ name: 'save_collective_role', body: { target: C, target_role: ROLE, role_name: 'Operações', permissions: [] } }])
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining('Perfil atualizado') })
  })

  it('permissão fora do catálogo, nome vazio ou "Membro" nunca chegam ao banco', async () => {
    expect(await roles({ intent: 'role-save', role_name: 'X', permission: ['transfer_ownership'] })).toMatchObject({ ok: false, status: 422, error: 'Permissão desconhecida.' })
    expect(await roles({ intent: 'role-save', role_name: '  ', permission: [] })).toMatchObject({ ok: false, status: 422, error: 'Informe o nome do perfil.' })
    expect(await roles({ intent: 'role-save', role_name: 'membro', permission: [] })).toMatchObject({ ok: false, status: 422 })
    expect(await roles({ intent: 'role-save', role: 'x', role_name: 'Ok', permission: [] })).toMatchObject({ ok: false, status: 400 })
    expect(sent).toEqual([])
  })

  it('exclui um perfil; o banco recusa se há membros', async () => {
    expect(await roles({ intent: 'role-delete', role: ROLE })).toMatchObject({ ok: true, message: 'Perfil excluído.' })
    expect(sent).toEqual([{ name: 'delete_collective_role', body: { target: C, target_role: ROLE } }])
    reply = dbError(400, '22023', 'Reatribua os membros antes de excluir o perfil')
    expect(await roles({ intent: 'role-delete', role: ROLE })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('Atribua outro perfil') })
  })

  it('nome repetido (violação de constraint no banco) vira mensagem clara', async () => {
    reply = dbError(400, '22023', 'Perfil/permissões inválidos')
    expect(await roles({ intent: 'role-save', role_name: 'Duplicado', permission: [] })).toMatchObject({ ok: false, status: 422, error: expect.stringContaining('Já existe um perfil') })
  })
})

describe('collectiveEditAction: transferir a propriedade e encerrar', () => {
  const path = `/coletivo/${C}/editar`
  const withCookie = async (fields: Record<string, string | string[]>) => {
    const cookie = await signIn()
    return outcome(collectiveEditAction(post(path, fields, { headers: { Cookie: cookie } }), C))
  }

  it('sessão aal1: recusa antes do banco e explica como confirmar', async () => {
    level = 'aal1'
    const result = await withCookie({ intent: 'transfer', successor: MEMBER, confirm: 'yes' })
    expect(result).toMatchObject({ ok: false, status: 403, error: TRANSFER_NEEDS_MFA })
    expect(sent).toEqual([])
  })

  it('dev (flag mfa_optional): a sessão aal1 também transfere; o banco continua decidindo', async () => {
    level = 'aal1'
    flags = ['mfa_optional']
    const cookie = await signIn()
    const response = (await collectiveEditAction(post(path, { intent: 'transfer', successor: MEMBER, confirm: 'yes' }, { headers: { Cookie: cookie } }), C)) as Response
    expect(sent).toEqual([{ name: 'transfer_collective_ownership', body: { target: C, successor: MEMBER } }])
    expect(response.status).toBe(302)
  })

  it('dev: só a flag de coletivos aprovados automaticamente não dispensa a MFA da transferência', async () => {
    level = 'aal1'
    flags = ['auto_approve_collectives']
    expect(await withCookie({ intent: 'transfer', successor: MEMBER, confirm: 'yes' })).toMatchObject({ ok: false, status: 403, error: TRANSFER_NEEDS_MFA })
    expect(sent).toEqual([])
  })

  it('sessão aal2: transfere e só então redireciona para o painel (já sem poderes de dono)', async () => {
    const cookie = await signIn()
    const response = (await collectiveEditAction(post(path, { intent: 'transfer', successor: MEMBER, confirm: 'yes' }, { headers: { Cookie: cookie } }), C)) as Response
    expect(sent).toEqual([{ name: 'transfer_collective_ownership', body: { target: C, successor: MEMBER } }])
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/coletivo/${C}/painel`)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('o banco continua a autoridade: sucessor inelegível ou sem MFA é 403, sem redirecionar', async () => {
    reply = dbError(400, '42501', 'Transferência exige proprietário com MFA e sucessor elegível')
    const result = await withCookie({ intent: 'transfer', successor: MEMBER, confirm: 'yes' })
    expect(result).toMatchObject({ ok: false, status: 403, error: expect.stringContaining('segundo fator') })
  })

  it('exige sucessor válido e a confirmação marcada', async () => {
    expect(await withCookie({ intent: 'transfer', successor: 'x', confirm: 'yes' })).toMatchObject({ ok: false, status: 400 })
    expect(await withCookie({ intent: 'transfer', successor: MEMBER })).toMatchObject({ ok: false, status: 422 })
    expect(sent).toEqual([])
  })

  it('sem sessão (sem cookie) a transferência não chega ao banco', async () => {
    expect(await outcome(collectiveEditAction(post(path, { intent: 'transfer', successor: MEMBER, confirm: 'yes' }), C))).toMatchObject({ ok: false, status: 403 })
    expect(sent).toEqual([])
  })

  it('encerrar exige motivo e a confirmação digitada, e redireciona para meus coletivos depois do RPC', async () => {
    expect(await outcome(collectiveEditAction(post(path, { intent: 'close', reason: '', confirmation: 'ENCERRAR' }), C))).toMatchObject({ ok: false, status: 422, error: 'Explique o motivo do encerramento.' })
    expect(await outcome(collectiveEditAction(post(path, { intent: 'close', reason: 'Fim do projeto', confirmation: 'encerrar?' }), C))).toMatchObject({ ok: false, status: 422 })
    expect(sent).toEqual([])
    const response = (await collectiveEditAction(post(path, { intent: 'close', reason: 'Fim do projeto', confirmation: 'ENCERRAR' }), C)) as Response
    expect(sent).toEqual([{ name: 'close_collective', body: { target: C, reason: 'Fim do projeto' } }])
    expect(response.headers.get('location')).toBe('/painel/coletivos')
  })

  it('encerrar recusado pelo banco não redireciona', async () => {
    reply = dbError(400, '42501', 'Operação não autorizada')
    expect(await outcome(collectiveEditAction(post(path, { intent: 'close', reason: 'Fim', confirmation: 'ENCERRAR' }), C))).toMatchObject({ ok: false, status: 403 })
  })
})

describe('collectiveProfileAction', () => {
  const path = `/coletivo/${C}/perfil`
  const profile = (fields: Record<string, string | string[]>) => outcome(collectiveProfileAction(post(path, fields), C))

  it('salva descrição, cor e redes (site vira website) com a versão vista', async () => {
    const result = await profile({ version: '4', description: 'Nova descrição', use_color: 'on', color: '#8B5CF6', instagram: 'https://instagram.com/x', site: 'https://x.example.invalid', youtube: '' })
    expect(sent).toEqual([
      {
        name: 'edit_collective',
        body: {
          target: C,
          expected_version: 4,
          payload: { description: 'Nova descrição', color: '#8b5cf6', social_links: { instagram: 'https://instagram.com/x', website: 'https://x.example.invalid' } },
        },
      },
    ])
    expect(result).toMatchObject({ ok: true, message: 'Perfil público atualizado.' })
  })

  it('sem usar cor, a cor é apagada (nulo) e as redes ficam vazias', async () => {
    await profile({ version: '4', description: 'Texto', color: '#8b5cf6' })
    expect(sent[0].body.payload).toEqual({ description: 'Texto', color: null, social_links: {} })
  })

  it('endereço inválido, cor inválida e descrição vazia: erro por campo, sem RPC', async () => {
    const result = await profile({ version: '4', description: '', use_color: 'on', color: 'roxo', instagram: 'javascript:alert(1)' })
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      fields: { description: 'Descreva o coletivo.', color: 'Escolha uma cor válida.', instagram: 'Informe o endereço completo, começando por https://' },
    })
    expect(sent).toEqual([])
  })

  it('conflito de versão: 409, sem sucesso', async () => {
    reply = dbError(409, '40001', 'Coletivo alterado; recarregue')
    expect(await profile({ version: '1', description: 'Texto' })).toMatchObject({ ok: false, status: 409 })
  })
})

describe('collectiveMembersAction', () => {
  const path = `/coletivo/${C}/membros`
  const members = (fields: Record<string, string | string[]>) => outcome(collectiveMembersAction(post(path, fields), C))

  it('atribui um perfil e remove um membro pelos RPCs do banco', async () => {
    expect(await members({ intent: 'assign', member: MEMBER, role: ROLE })).toMatchObject({ ok: true, message: expect.stringContaining('Perfil de acesso atribuído') })
    expect(await members({ intent: 'remove', member: MEMBER })).toMatchObject({ ok: true, message: 'Membro removido do coletivo.' })
    expect(sent).toEqual([
      { name: 'assign_collective_role', body: { target: C, member: MEMBER, target_role: ROLE } },
      { name: 'remove_collective_member', body: { target: C, member: MEMBER } },
    ])
  })

  it('proteção do proprietário: o banco recusa remover ou rebaixar e a tela mostra o motivo', async () => {
    reply = dbError(400, '42501', 'Transfira a propriedade antes de sair')
    expect(await members({ intent: 'remove', member: OWNER })).toMatchObject({ ok: false, status: 403, error: expect.stringContaining('não pode ser removido') })
    reply = dbError(400, '42501', 'Proprietário não recebe outro perfil')
    expect(await members({ intent: 'assign', member: OWNER, role: ROLE })).toMatchObject({ ok: false, status: 403, error: expect.stringContaining('não recebe perfis') })
  })

  it('quem não pode (perfil sem permissão) recebe 403; membro já removido, 409', async () => {
    reply = dbError(400, '42501', 'Operação não autorizada')
    expect(await members({ intent: 'remove', member: MEMBER })).toMatchObject({ ok: false, status: 403 })
    reply = dbError(400, '22023', 'Membro indisponível')
    expect(await members({ intent: 'assign', member: MEMBER, role: ROLE })).toMatchObject({ ok: false, status: 409 })
    reply = dbError(400, '22023', 'Perfil indisponível')
    expect(await members({ intent: 'assign', member: MEMBER, role: ROLE })).toMatchObject({ ok: false, status: 409 })
  })

  it('operação e identificadores inválidos não chegam ao banco', async () => {
    expect(await members({ intent: 'promote', member: MEMBER })).toMatchObject({ ok: false, status: 400 })
    expect(await members({ intent: 'assign', member: 'x', role: ROLE })).toMatchObject({ ok: false, status: 400 })
    expect(await members({ intent: 'assign', member: MEMBER })).toMatchObject({ ok: false, status: 400 })
    expect(await members({ intent: 'remove', member: '' })).toMatchObject({ ok: false, status: 400 })
    expect(sent).toEqual([])
  })
})

describe('sessão antes do corpo (envio da imagem do coletivo)', () => {
  const tracked = (headers: Record<string, string>) => {
    const state = { pulls: 0 }
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          state.pulls++
          controller.enqueue(new Uint8Array(1024))
        },
      },
      { highWaterMark: 0 },
    )
    const request = new Request(`${origin}/coletivo/${C}/perfil`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=zzz', ...headers }, body, duplex: 'half' } as RequestInit)
    return { request, state }
  }

  it('visitante: 401 sem ler o corpo nem consultar o Auth', async () => {
    const { request, state } = tracked({})
    expect(await outcome(collectiveProfileAction(request, C))).toMatchObject({ ok: false, status: 401 })
    expect(state.pulls).toBe(0)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('sessão sem conta (invalidada): 401 sem ler o corpo', async () => {
    const cookie = await signIn()
    vi.mocked(fetch).mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname
      if (path === '/auth/v1/user') return AUTH_USER(OWNER)
      if (path === '/rest/v1/rpc/get_account_session') return Response.json(null)
      throw new Error(`HTTP inesperado: ${path}`)
    })
    const { request, state } = tracked({ Cookie: cookie })
    expect(await outcome(collectiveProfileAction(request, C))).toMatchObject({ ok: false, status: 401 })
    expect(state.pulls).toBe(0)
  })
})
