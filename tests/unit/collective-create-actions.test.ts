// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadNewCollective, newCollectiveAction } from '../../src/server/collective-create.server'

const origin = 'https://circuitone-dev.magalz.space'
const path = '/painel/coletivos/novo'
const NEW = '05000000-0000-4000-8000-000000000099'
const REQUEST = '0b000000-0000-4000-8000-000000000001'

type Sent = { name: string; body: Record<string, unknown> }
let sent: Sent[]
let reply: (name: string) => Response

const mine = (state: string) => [
  { id: '05000000-0000-4000-8000-000000000001', name: 'Outro', kind: 'collective', city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Membro', is_owner: true },
  { id: NEW, name: 'Novo', kind: 'collective', city: 'Recife', state_code: 'PE', state, role_name: 'Membro', is_owner: true },
]

beforeEach(() => {
  sent = []
  reply = (name) => (name === 'create_collective' ? Response.json(NEW) : Response.json(mine('pending')))
  vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
  vi.stubEnv('APP_ORIGIN', origin)
  vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request | URL, init?: RequestInit) => {
      const target = new URL(String(url)).pathname
      if (!target.startsWith('/rest/v1/rpc/')) throw new Error(`HTTP inesperado: ${target}`)
      const name = target.replace('/rest/v1/rpc/', '')
      sent.push({ name, body: init?.body ? JSON.parse(String(init.body)) : {} })
      return reply(name)
    }),
  )
})
afterEach(() => vi.unstubAllEnvs())

const dbError = (status: number, code: string, message: string) => () => Response.json({ code, message, details: null, hint: null }, { status })

const post = (fields: Record<string, string | string[]>, init: { headers?: Record<string, string>; method?: string; url?: string } = {}) => {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) body.append(key, v)
  return new Request(origin + (init.url ?? path), {
    method: init.method ?? 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...init.headers },
    body,
  })
}

/** Lê o resultado de `data()` sem depender dos detalhes do React Router. */
const outcome = async (promise: Promise<unknown>) => {
  const result = (await promise) as { data: { ok: boolean; message?: string; error?: string; fields?: Record<string, string> }; init: { status: number } }
  return { ...result.data, status: result.init.status }
}

const collectiveFields = (extra: Record<string, string> = {}) => ({
  request: REQUEST,
  kind: 'collective',
  name: ' Coletivo sintético ',
  description: 'Descrição sintética',
  activity: 'Festas',
  state_code: 'PE',
  city: 'Recife',
  cnpj: '',
  instagram: 'https://instagram.example.invalid/c',
  site: '',
  use_color: 'on',
  color: '#8B5CF6',
  ...extra,
})

describe('loadNewCollective', () => {
  it('gera um identificador de solicitação por carregamento do formulário', () => {
    const ids = ['a', 'b']
    expect(loadNewCollective(() => ids.shift()!)).toEqual({ requestId: 'a' })
    expect(loadNewCollective(() => ids.shift()!)).toEqual({ requestId: 'b' })
    expect(loadNewCollective().requestId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('newCollectiveAction', () => {
  const create = (fields: Record<string, string | string[]>, init = {}) => newCollectiveAction(post(fields, init))
  const createOutcome = (fields: Record<string, string | string[]>, init = {}) => outcome(create(fields, init))

  it('mapeia o formulário para o payload de create_collective e, em análise, volta para "meus coletivos" com o aviso', async () => {
    const response = (await create(collectiveFields())) as Response
    expect(sent[0]).toEqual({
      name: 'create_collective',
      body: {
        request_id: REQUEST,
        payload: {
          kind: 'collective',
          name: 'Coletivo sintético',
          description: 'Descrição sintética',
          activity: 'Festas',
          city: 'Recife',
          state_code: 'PE',
          color: '#8b5cf6',
          social_links: { instagram: 'https://instagram.example.invalid/c' },
        },
      },
    })
    // Depois do RPC, lê os coletivos do titular para decidir o destino.
    expect(sent.map((s) => s.name)).toEqual(['create_collective', 'list_my_collectives'])
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/painel/coletivos?criado=1')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('já aprovado (ambiente de desenvolvimento): segue para o dashboard do coletivo', async () => {
    reply = (name) => (name === 'create_collective' ? Response.json(NEW) : Response.json(mine('approved')))
    const response = (await create(collectiveFields())) as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/coletivo/${NEW}/painel`)
  })

  it('falha ao ler a situação não desfaz a criação: cai em "meus coletivos"', async () => {
    reply = (name) => (name === 'create_collective' ? Response.json(NEW) : dbError(500, 'XX000', 'quebrou')())
    const response = (await create(collectiveFields())) as Response
    expect(response.headers.get('location')).toBe('/painel/coletivos?criado=1')
  })

  it('produtora vai com o CNPJ normalizado', async () => {
    await create(collectiveFields({ kind: 'producer', cnpj: '12.345.678/0001-95' }))
    expect(sent[0].body.payload).toMatchObject({ kind: 'producer', cnpj: '12345678000195' })
  })

  it('produtora sem CNPJ: 422 no campo "cnpj" e nenhum RPC', async () => {
    expect(await createOutcome(collectiveFields({ kind: 'producer' }))).toMatchObject({
      ok: false,
      status: 422,
      error: 'Corrija os campos destacados.',
      fields: { cnpj: 'Produtora exige CNPJ.' },
    })
    expect(sent).toEqual([])
  })

  it('validação por campo antes do banco: tipo, nome, cidade fora da UF, cor e rede inválidos', async () => {
    const { kind: _kind, ...semTipo } = collectiveFields({ name: '', city: 'Fortaleza', color: 'vermelho', instagram: 'instagram.com/x' })
    const result = await createOutcome(semTipo)
    expect(result).toMatchObject({ ok: false, status: 422 })
    expect(Object.keys(result.fields ?? {}).sort()).toEqual(['city', 'color', 'instagram', 'kind', 'name'])
    expect(sent).toEqual([])
  })

  it('identificador da solicitação ausente ou inválido não chega ao banco', async () => {
    const { request: _request, ...semRequest } = collectiveFields()
    expect(await createOutcome(semRequest)).toMatchObject({ ok: false, status: 400, error: 'Formulário inválido. Recarregue a página e tente de novo.' })
    expect(await createOutcome(collectiveFields({ request: 'qualquer-coisa' }))).toMatchObject({ ok: false, status: 400 })
    expect(sent).toEqual([])
  })

  it('reenvio do mesmo formulário usa a mesma solicitação (o banco devolve o mesmo coletivo)', async () => {
    const first = (await create(collectiveFields())) as Response
    const second = (await create(collectiveFields())) as Response
    const requests = sent.filter((s) => s.name === 'create_collective').map((s) => s.body.request_id)
    expect(requests).toEqual([REQUEST, REQUEST])
    expect(second.headers.get('location')).toBe(first.headers.get('location'))
  })

  it.each([
    ['Conta indisponível', '42501', 403, 'Sua conta não está disponível para criar coletivos ou produtoras.'],
    ['Produtora exige CNPJ', '22023', 422, 'Produtora exige CNPJ.'],
    ['Dados de coletivo inválidos', '22023', 422, 'O banco recusou os dados do coletivo. Revise os campos e tente de novo.'],
    ['Solicitação reutilizada com outros dados', '22023', 409, 'Este formulário já foi enviado com outros dados. Recarregue a página e tente de novo.'],
  ])('erro do banco "%s" chega traduzido e nunca como sucesso', async (message, code, status, expected) => {
    reply = dbError(400, code, message)
    expect(await createOutcome(collectiveFields())).toMatchObject({ ok: false, status, error: expected })
  })

  it('sessão expirada, texto desconhecido do banco e resposta sem identificador não vazam nem fingem sucesso', async () => {
    reply = dbError(401, 'PGRST301', 'JWT expired')
    expect(await createOutcome(collectiveFields())).toMatchObject({ ok: false, status: 401 })
    reply = dbError(500, 'XX000', 'relation "private.collective_details" is broken')
    const result = await createOutcome(collectiveFields())
    expect(result).toMatchObject({ ok: false, status: 503, error: 'Não foi possível concluir a operação. Tente novamente.' })
    expect(JSON.stringify(result)).not.toContain('collective_details')
    reply = () => Response.json({ not: 'a uuid' })
    expect(await createOutcome(collectiveFields())).toMatchObject({ ok: false, status: 503 })
  })

  it('normaliza o sufixo .data do single fetch e recusa método, caminho e origem indevidos', async () => {
    expect(((await create(collectiveFields(), { url: `${path}.data` })) as Response).status).toBe(302)
    expect(await createOutcome(collectiveFields(), { method: 'PUT' })).toMatchObject({ ok: false, status: 405 })
    expect(await createOutcome(collectiveFields(), { url: '/painel/coletivos' })).toMatchObject({ ok: false, status: 405 })
    expect(await createOutcome(collectiveFields(), { headers: { Origin: 'https://outro.example.invalid' } })).toMatchObject({ ok: false, status: 403 })
  })
})
