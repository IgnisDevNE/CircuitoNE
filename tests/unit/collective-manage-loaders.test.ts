// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCollectiveMembers, loadEditCollective, loadEditCollectiveProfile } from '../../src/server/collective-manage.server'
import { loadExplore } from '../../src/server/explore.server'
import { HttpError, type SupabaseServerClient } from '../../src/server/supabase.server'

const C = '05000000-0000-4000-8000-000000000001'
const OWNER = '01000000-0000-4000-8000-000000000001'
const MEMBER = '01000000-0000-4000-8000-000000000005'
const ROLE_MEMBER = '06000000-0000-4000-8000-000000000001'
const ROLE_OPS = '06000000-0000-4000-8000-000000000100'

type Result = { data: unknown; error: unknown }
const ok = (data: unknown): Result => ({ data, error: null })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' } }

type Aal = { currentLevel: string | null; nextLevel: string | null }

/** Cliente fake: RPCs por nome, tabelas por nome e o nível de MFA da sessão. */
function fakeClient(options: { rpc?: Record<string, Result>; tables?: Record<string, Result>; aal?: Aal | Error } = {}) {
  const rpc = vi.fn(async (name: string) => {
    const entry = options.rpc?.[name]
    if (!entry) throw new Error(`rpc inesperado: ${name}`)
    return entry
  })
  const queried: { table: string; calls: { method: string; args: unknown[] }[] }[] = []
  const from = vi.fn((table: string) => {
    const entry = options.tables?.[table]
    if (!entry) throw new Error(`tabela inesperada: ${table}`)
    const record = { table, calls: [] as { method: string; args: unknown[] }[] }
    queried.push(record)
    const builder: Record<string, unknown> = { then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(entry).then(resolve, reject) }
    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = (...args: unknown[]) => {
        record.calls.push({ method, args })
        return builder
      }
    }
    return builder
  })
  const getAuthenticatorAssuranceLevel = vi.fn(async () =>
    options.aal instanceof Error ? { data: null, error: options.aal } : { data: options.aal ?? { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null },
  )
  return { client: { rpc, from, auth: { mfa: { getAuthenticatorAssuranceLevel } } } as unknown as SupabaseServerClient, rpc, queried }
}

const mine = (extra: Record<string, unknown> = {}) => ({
  id: C, kind: 'collective', name: 'Organização sintética 1', city: 'Recife', state_code: 'PE', state: 'approved', role_name: 'Membro', is_owner: true, ...extra,
})
const status = (extra: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) => ({
  id: C,
  state: 'approved',
  version: 3,
  reason: 'Verificado',
  cnpj: null,
  profile: {
    id: C, kind: 'collective', name: 'Organização sintética 1', description: 'Fixture sem dados reais', activity: 'Música', city: 'Recife', state_code: 'PE',
    social_links: { instagram: 'https://instagram.com/x', website: 'https://x.example.invalid' }, color: '#8B5CF6', image_path: null, state: 'approved', version: 3, ...profile,
  },
  ...extra,
})
const roles = [
  { id: ROLE_MEMBER, name: 'Membro', permissions: [] },
  { id: ROLE_OPS, name: 'Operações sintéticas', permissions: ['create_events', 'send_messages'] },
]
const roster = [
  { user_id: OWNER, member_name: 'Pessoa sintética ativa', artist_profile_id: null, artist_name: null, role_id: ROLE_MEMBER, role_name: 'Membro', last_activity_at: null, is_owner: true },
  { user_id: MEMBER, member_name: 'Membro sintético ativo', artist_profile_id: '02000000-0000-4000-8000-000000000008', artist_name: 'Artista sintético do membro', role_id: ROLE_OPS, role_name: 'Operações sintéticas', last_activity_at: '2026-10-01T12:00:00+00:00', is_owner: false },
]
const access = (permissions: string[], owner = false) => ok({ owner, role_id: ROLE_MEMBER, permissions })
const status403 = { status: 403 }

describe('loadEditCollective', () => {
  it('proprietário de coletivo aprovado: cadastro, perfis de acesso, sucessores (sem o dono) e MFA da sessão', async () => {
    const { client } = fakeClient({
      rpc: { list_my_collectives: ok([mine()]), get_collective_status: ok(status()), get_collective_roles: ok(roles), get_collective_member_roster: ok(roster) },
      aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
    })
    const data = await loadEditCollective(client, C)
    expect(data.aprovado).toBe(true)
    expect(data.coletivo).toMatchObject({ id: C, versao: 3, situacao: 'approved', nome: 'Organização sintética 1', estado: 'PE', cor: '#8b5cf6', cnpj: '', social: { instagram: 'https://instagram.com/x', site: 'https://x.example.invalid' } })
    expect(data.perfis).toEqual([
      { id: ROLE_MEMBER, nome: 'Membro', permissoes: [], embutido: true },
      { id: ROLE_OPS, nome: 'Operações sintéticas', permissoes: ['create_events', 'send_messages'], embutido: false },
    ])
    expect(data.sucessores.map((membro) => membro.nome)).toEqual(['Membro sintético ativo'])
    expect(data.mfa).toBe('confirmada')
  })

  it('imagem enviada: URL da rota /img; sem imagem, nula', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.test')
    try {
      const withImage = fakeClient({ rpc: { list_my_collectives: ok([mine({ state: 'pending' })]), get_collective_status: ok(status({ state: 'pending' }, { image_path: `${C}/capa.png` })) } })
      expect((await loadEditCollective(withImage.client, C)).coletivo.imagem).toBe(`/img/${C}/capa.png`)
      const without = fakeClient({ rpc: { list_my_collectives: ok([mine({ state: 'pending' })]), get_collective_status: ok(status({ state: 'pending' })) } })
      expect((await loadEditCollective(without.client, C)).coletivo.imagem).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [{ currentLevel: 'aal1', nextLevel: 'aal2' }, 'confirmar'],
    [{ currentLevel: 'aal1', nextLevel: 'aal1' }, 'ativar'],
  ])('MFA da sessão %j vira "%s"', async (aal, expected) => {
    const { client } = fakeClient({
      rpc: { list_my_collectives: ok([mine()]), get_collective_status: ok(status()), get_collective_roles: ok([]), get_collective_member_roster: ok([]) },
      aal,
    })
    expect((await loadEditCollective(client, C)).mfa).toBe(expected)
  })

  it('coletivo recusado: só o cadastro (para corrigir e reenviar), sem consultar perfis, membros nem MFA', async () => {
    const { client, rpc } = fakeClient({
      rpc: { list_my_collectives: ok([mine({ state: 'rejected' })]), get_collective_status: ok(status({ state: 'rejected', reason: 'Documentação incompleta' }, { kind: 'producer', state: 'rejected' }) as never) },
    })
    const data = await loadEditCollective(client, C)
    expect(data).toMatchObject({ aprovado: false, perfis: [], sucessores: [], coletivo: { situacao: 'rejected', motivo: 'Documentação incompleta', tipo: 'produtora' } })
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['list_my_collectives', 'get_collective_status'])
  })

  it('só o proprietário: membro comum recebe 403 e nenhum dado do coletivo é pedido', async () => {
    const { client, rpc } = fakeClient({ rpc: { list_my_collectives: ok([mine({ is_owner: false })]) } })
    await expect(loadEditCollective(client, C)).rejects.toMatchObject(status403)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('não membro, coletivo encerrado e identificador inválido recebem 404; suspenso, 403', async () => {
    const other = '05000000-0000-4000-8000-000000000009'
    await expect(loadEditCollective(fakeClient({ rpc: { list_my_collectives: ok([mine()]) } }).client, other)).rejects.toMatchObject({ status: 404 })
    await expect(loadEditCollective(fakeClient({ rpc: { list_my_collectives: ok([mine({ state: 'closed' })]) } }).client, C)).rejects.toMatchObject({ status: 404 })
    await expect(loadEditCollective(fakeClient({}).client, 'x')).rejects.toMatchObject({ status: 404 })
    await expect(loadEditCollective(fakeClient({ rpc: { list_my_collectives: ok([mine({ state: 'suspended' })]) } }).client, C)).rejects.toMatchObject(status403)
  })

  it('falhas do banco ou do Auth viram 503, nunca dados vazios', async () => {
    await expect(loadEditCollective(fakeClient({ rpc: { list_my_collectives: failure } }).client, C)).rejects.toMatchObject({ status: 503 })
    const base = { list_my_collectives: ok([mine()]), get_collective_status: ok(status()), get_collective_roles: ok(roles), get_collective_member_roster: ok(roster) }
    await expect(loadEditCollective(fakeClient({ rpc: { ...base, get_collective_roles: failure } }).client, C)).rejects.toBeInstanceOf(HttpError)
    await expect(loadEditCollective(fakeClient({ rpc: base, aal: new Error('auth fora do ar') }).client, C)).rejects.toMatchObject({ status: 503 })
    await expect(loadEditCollective(fakeClient({ rpc: { ...base, get_collective_status: ok({ nonsense: true }) } }).client, C)).rejects.toThrow()
  })
})

describe('loadEditCollectiveProfile', () => {
  it('proprietário recebe o cadastro; membro com permissões operacionais recebe 403', async () => {
    const owner = fakeClient({ rpc: { get_collective_access: access([], true), get_collective_status: ok(status()) } })
    expect((await loadEditCollectiveProfile(owner.client, C)).coletivo).toMatchObject({ versao: 3, nome: 'Organização sintética 1' })
    const member = fakeClient({ rpc: { get_collective_access: access(['manage_requests', 'remove_members', 'create_events', 'edit_events', 'publish_events', 'cancel_events', 'read_messages', 'send_messages']) } })
    await expect(loadEditCollectiveProfile(member.client, C)).rejects.toMatchObject(status403)
  })

  it('coletivo não aprovado (sem acesso efetivo) responde 403 e id inválido 404', async () => {
    await expect(loadEditCollectiveProfile(fakeClient({ rpc: { get_collective_access: ok(null) } }).client, C)).rejects.toMatchObject(status403)
    await expect(loadEditCollectiveProfile(fakeClient({}).client, 'x')).rejects.toMatchObject({ status: 404 })
  })
})

describe('loadCollectiveMembers', () => {
  it('proprietário: lista, perfis para atribuir e pode atribuir', async () => {
    const { client } = fakeClient({ rpc: { get_collective_access: access([], true), get_collective_member_roster: ok(roster), get_collective_roles: ok(roles) } })
    const data = await loadCollectiveMembers(client, C)
    expect(data.podeAtribuir).toBe(true)
    expect(data.perfis).toHaveLength(2)
    expect(data.membros).toEqual([
      { userId: OWNER, nome: 'Pessoa sintética ativa', artista: null, cargoId: ROLE_MEMBER, cargo: 'Membro', ultimaAtividade: null, dono: true },
      {
        userId: MEMBER,
        nome: 'Membro sintético ativo',
        artista: { id: '02000000-0000-4000-8000-000000000008', nome: 'Artista sintético do membro' },
        cargoId: ROLE_OPS,
        cargo: 'Operações sintéticas',
        ultimaAtividade: '2026-10-01T12:00:00.000Z',
        dono: false,
      },
    ])
  })

  it('membro com "remover membros": vê a lista, não lê nem atribui perfis (só o dono)', async () => {
    const { client, rpc } = fakeClient({ rpc: { get_collective_access: access(['remove_members']), get_collective_member_roster: ok(roster) } })
    const data = await loadCollectiveMembers(client, C)
    expect(data).toMatchObject({ podeAtribuir: false, perfis: [] })
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('get_collective_roles')
  })

  it('membro sem permissão recebe 403 sem consultar a lista; coletivo não aprovado também', async () => {
    const plain = fakeClient({ rpc: { get_collective_access: access(['create_events', 'read_messages']) } })
    await expect(loadCollectiveMembers(plain.client, C)).rejects.toMatchObject(status403)
    expect(plain.rpc).toHaveBeenCalledTimes(1)
    await expect(loadCollectiveMembers(fakeClient({ rpc: { get_collective_access: ok(null) } }).client, C)).rejects.toMatchObject(status403)
  })

  it('lista malformada do banco falha em vez de renderizar parcialmente', async () => {
    const { client } = fakeClient({ rpc: { get_collective_access: access([], true), get_collective_member_roster: ok([{ user_id: OWNER }]), get_collective_roles: ok(roles) } })
    await expect(loadCollectiveMembers(client, C)).rejects.toThrow()
  })
})

describe('loadExplore', () => {
  const profileRow = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: `Descrição de ${name}`, city: 'Recife', state_code: 'PE', ...extra })
  const MINE = '02000000-0000-4000-8000-000000000001'
  const OTHER = '02000000-0000-4000-8000-000000000008'
  const detail = (profile_id: string, extra: Record<string, unknown> = {}) => ({
    profile_id, booking_email: 'booking@example.invalid', contact_email: null, contact_phone: '+5581999000001', fee_cents: 150000, cnpj: null,
    service_type: null, service_other: null, audiovisual_type: null, presskit_url: 'https://presskit.example.invalid/a', portfolio_url: null, ...extra,
  })
  const mineRows = [{ id: MINE, kind: 'artist', name: 'Minha atuação', city: 'Recife', state_code: 'PE', published: true, is_default: true }]
  const styles = [{ profile_id: OTHER, style: 'techno', substyle: null }]

  it('leitor comum: o banco só devolve a linha profissional da atuação dele; os demais ficam sem dados restritos e há aviso', async () => {
    const { client, queried } = fakeClient({
      rpc: { list_my_profiles: ok(mineRows) },
      tables: {
        profiles: ok([profileRow(MINE, 'Minha atuação'), profileRow(OTHER, 'Artista do membro')]),
        professional_details: ok([detail(MINE)]),
        artist_styles: ok(styles),
      },
    })
    const data = await loadExplore(client, 'artistas')
    if (data.kind === 'coletivos') throw new Error('esperava perfis')
    expect(data.restritoIndisponivel).toBe(true)
    expect(data.perfis.map((perfil) => [perfil.nome, perfil.minha, perfil.restrito !== null])).toEqual([
      ['Minha atuação', true, true],
      ['Artista do membro', false, false],
    ])
    expect(data.perfis[1].estilos).toEqual([{ estilo: 'techno' }])
    // Só as colunas liberadas e o tipo da página. Os caminhos dos PDFs privados são lidos só para saber se há arquivo (o RLS os entrega ao dono e ao leitor elegível).
    const details = queried.find((entry) => entry.table === 'professional_details')!
    expect(details.calls).toContainEqual({ method: 'eq', args: ['kind', 'artist'] })
    expect(JSON.stringify(details.calls)).toContain('presskit_path,services_pdf_path')
    const profiles = queried.find((entry) => entry.table === 'profiles')!
    expect(profiles.calls).toContainEqual({ method: 'select', args: ['id,name,description,city,state_code'] })
  })

  it('proprietário elegível com MFA: o banco devolve as linhas de todos, formatadas, e o aviso some', async () => {
    const { client } = fakeClient({
      rpc: { list_my_profiles: ok(mineRows) },
      tables: {
        profiles: ok([profileRow(MINE, 'Minha atuação'), profileRow(OTHER, 'Artista do membro')]),
        professional_details: ok([detail(MINE), detail(OTHER)]),
        artist_styles: ok(styles),
      },
    })
    const data = await loadExplore(client, 'artistas')
    if (data.kind === 'coletivos') throw new Error('esperava perfis')
    expect(data.restritoIndisponivel).toBe(false)
    expect(data.perfis[1].restrito).toEqual({ emailBooking: 'booking@example.invalid', telefone: '+5581999000001', cache: 'R$ 1.500,00', presskit: 'https://presskit.example.invalid/a' })
  })

  it('PDFs privados: o catálogo só sabe que existem (o caminho do arquivo nunca chega à tela)', async () => {
    const { client } = fakeClient({
      rpc: { list_my_profiles: ok([]) },
      tables: {
        profiles: ok([profileRow(OTHER, 'Artista com PDF')]),
        professional_details: ok([detail(OTHER, { presskit_path: `${OTHER}/kit.pdf`, presskit_bytes: 2000, services_pdf_path: null })]),
        artist_styles: ok([]),
      },
    })
    const data = await loadExplore(client, 'artistas')
    if (data.kind === 'coletivos') throw new Error('esperava perfis')
    expect(data.perfis[0].restrito).toMatchObject({ presskitPdf: true })
    expect(data.perfis[0].restrito).not.toHaveProperty('listaServicosPdf')
    expect(JSON.stringify(data)).not.toContain('kit.pdf')
  })

  it('serviços e audiovisual: o tipo é dado restrito e vem rotulado; artistas não consultam estilos nos outros tipos', async () => {
    const { client, queried } = fakeClient({
      rpc: { list_my_profiles: ok([]) },
      tables: {
        profiles: ok([profileRow(OTHER, 'Som & Luz')]),
        professional_details: ok([detail(OTHER, { service_type: 'other', service_other: 'Cenografia', booking_email: null, fee_cents: null, presskit_url: null, contact_email: 'contato@example.invalid' })]),
      },
    })
    const data = await loadExplore(client, 'servicos')
    if (data.kind === 'coletivos') throw new Error('esperava perfis')
    expect(data.perfis[0].restrito).toMatchObject({ tipo: 'Outros: Cenografia', tipoValor: 'other', emailContato: 'contato@example.invalid' })
    expect(queried.map((entry) => entry.table).sort()).toEqual(['professional_details', 'profiles'])
    expect(queried.find((entry) => entry.table === 'profiles')!.calls).toContainEqual({ method: 'eq', args: ['kind', 'services'] })
  })

  it('coletivos: só a projeção pública dos aprovados, sem consultar dados profissionais', async () => {
    const { client, queried } = fakeClient({
      tables: {
        collectives: ok([{ id: C, kind: 'producer', name: 'Produtora sintética', description: 'Fixture', activity: 'Música, Eventos', city: 'Recife', state_code: 'PE', social_links: {}, color: null, image_path: null }]),
      },
    })
    const data = await loadExplore(client, 'coletivos')
    if (data.kind !== 'coletivos') throw new Error('esperava coletivos')
    expect(data.coletivos).toMatchObject([{ id: C, nome: 'Produtora sintética', tipo: 'produtora', atuacao: ['Música', 'Eventos'], estado: 'PE' }])
    expect(queried.map((entry) => entry.table)).toEqual(['collectives'])
  })

  it('tipo desconhecido responde 404; falha do banco, 503; linha de tipo desconhecido não é aceita', async () => {
    await expect(loadExplore(fakeClient({}).client, 'admin')).rejects.toMatchObject({ status: 404 })
    await expect(loadExplore(fakeClient({}).client, undefined)).rejects.toMatchObject({ status: 404 })
    const broken = fakeClient({ rpc: { list_my_profiles: ok([]) }, tables: { profiles: failure, professional_details: ok([]), artist_styles: ok([]) } })
    await expect(loadExplore(broken.client, 'artistas')).rejects.toMatchObject({ status: 503 })
    const badType = fakeClient({
      rpc: { list_my_profiles: ok([]) },
      tables: { profiles: ok([profileRow(OTHER, 'X')]), professional_details: ok([detail(OTHER, { service_type: 'teletransporte' })]) },
    })
    await expect(loadExplore(badType.client, 'servicos')).rejects.toThrow()
  })
})
