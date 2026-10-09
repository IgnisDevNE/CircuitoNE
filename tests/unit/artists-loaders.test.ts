// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadArtistList, loadArtistPage } from '../../src/server/artists.server'
import { HOME_ARTISTS, HOME_COLLECTIVES, HOME_EVENTS, loadHome } from '../../src/server/home.server'
import type { SupabaseServerClient } from '../../src/server/supabase.server'

const artistId = '02000000-0000-4000-8000-000000000001'
const profileRow = (n: number) => ({
  id: `02000000-0000-4000-8000-00000000000${n}`,
  name: `Artista ${n}`,
  description: 'Fixture, sem dados reais',
  city: 'Recife',
  state_code: 'PE',
})
const fullProfile = {
  ...profileRow(1),
  kind: 'artist',
  published: true,
  color: '#8b5cf6',
  social_links: { instagram: 'https://instagram.example.invalid/a' },
}
const eventRow = (n: number) => ({
  id: `0a000000-0000-4000-8000-00000000000${n}`,
  collective_id: '05000000-0000-4000-8000-000000000001',
  name: `Evento sintético ${n}`,
  kind: 'festa',
  starts_at: '2026-10-07T15:00:00+00:00',
  ends_at: null,
  timezone: 'America/Fortaleza',
  city: 'Recife',
  state_code: 'PE',
  venue: 'Local sintético',
  is_free: true,
  ticket_url: null,
  cover_url: null,
  cover_path: null,
  rescheduled_at: null,
})
const collectiveRow = (n: number) => ({
  id: `05000000-0000-4000-8000-00000000000${n}`,
  name: `Organização ${n}`,
  kind: 'collective',
  city: 'Recife',
  state_code: 'PE',
})

const photoPath = (n: number, name = 'foto') => `02000000-0000-4000-8000-00000000000${n}/${name}.png`

type Result = { data: unknown; error: unknown; count?: number | null }
const ok = (data: unknown, count?: number): Result => ({ data, error: null, count })
const failure: Result = { data: null, error: { message: 'boom', code: 'PGRST000' }, count: null }

type Select = { table: string; columns: string; head: boolean; filters: unknown[][] }
/** Cliente fake: `tables` responde por tabela (ou por consulta) e `rpc` por nome (+ período). */
function fakeClient(
  rpc: Record<string, Result>,
  tables: Record<string, Result | ((select: Select) => Result)> = {},
) {
  const selects: Select[] = []
  const client = {
    rpc: vi.fn(async (name: string, args: { period?: string }) => {
      const entry = rpc[args.period ? `${name}:${args.period}` : name]
      if (!entry) throw new Error(`rpc inesperado: ${name}`)
      return entry
    }),
    from: vi.fn((table: string) => {
      const select: Select = { table, columns: '', head: false, filters: [] }
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn((columns: string, options?: { head?: boolean }) => {
        select.columns = columns
        select.head = !!options?.head
        selects.push(select)
        return builder
      })
      for (const method of ['eq', 'in', 'order', 'limit'])
        builder[method] = vi.fn((...args: unknown[]) => {
          select.filters.push([method, ...args])
          return builder
        })
      builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => {
        const entry = tables[table]
        if (!entry) return Promise.reject(new Error(`tabela inesperada: ${table}`)).catch(reject)
        return Promise.resolve(typeof entry === 'function' ? entry(select) : entry).then(resolve, reject)
      }
      return builder
    }),
  }
  return { client: client as unknown as SupabaseServerClient, selects, rpc: client.rpc }
}

describe('loadArtistList', () => {
  beforeEach(() => vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.test'))
  afterEach(() => vi.unstubAllEnvs())

  it('lista os artistas visíveis com estilos e foto principal, em três consultas e sem tocar em dados profissionais', async () => {
    const { client, selects } = fakeClient(
      {},
      {
        profiles: ok([profileRow(1), profileRow(2)]),
        artist_styles: ok([
          { profile_id: profileRow(1).id, style: 'techno', substyle: null },
          { profile_id: profileRow(2).id, style: 'house', substyle: 'afro house' },
        ]),
        profile_images: ok([{ profile_id: profileRow(1).id, position: 0, object_path: photoPath(1) }]),
      },
    )
    const { artistas } = await loadArtistList(client)
    expect(artistas.map((a) => [a.nome, a.estilos])).toEqual([
      ['Artista 1', [{ estilo: 'techno' }]],
      ['Artista 2', [{ estilo: 'house', subestilo: 'afro house' }]],
    ])
    // A foto enviada vira URL pública do Storage; sem foto, a imagem neutra.
    expect(artistas.map((a) => a.foto)).toEqual([
      `/img/${photoPath(1)}`,
      '/artist-photo-fallback.svg',
    ])
    expect(selects.map((s) => s.table)).toEqual(['profiles', 'artist_styles', 'profile_images'])
    expect(selects[2]).toMatchObject({ columns: 'profile_id,position,object_path' })
    expect(selects[2].filters).toContainEqual(['eq', 'position', 0])
    expect(selects[0].columns).toBe('id,name,description,city,state_code')
    expect(selects[0].filters).toContainEqual(['eq', 'kind', 'artist'])
    expect(client.from).not.toHaveBeenCalledWith('professional_details')
  })

  it('lista vazia é um resultado válido', async () => {
    const { client } = fakeClient({}, { profiles: ok([]), artist_styles: ok([]), profile_images: ok([]) })
    expect(await loadArtistList(client)).toEqual({ artistas: [] })
  })

  it('erro em qualquer consulta vira 503 e nunca uma lista vazia', async () => {
    const ready = { profiles: ok([]), artist_styles: ok([]), profile_images: ok([]) }
    for (const broken of ['profiles', 'artist_styles', 'profile_images'])
      await expect(loadArtistList(fakeClient({}, { ...ready, [broken]: failure }).client)).rejects.toMatchObject({ status: 503 })
  })
})

describe('loadArtistPage', () => {
  const rpc = (extra: Record<string, Result> = {}) => ({
    get_profile: ok(fullProfile),
    'list_events:ongoing': ok([eventRow(2)]),
    'list_events:future': ok([eventRow(1)]),
    'list_events:past': ok([eventRow(3)]),
    ...extra,
  })
  const tables = { artist_styles: ok([{ style: 'techno', substyle: 'melodic techno' }]), profile_images: ok([]) }

  it('carrega perfil, estilos e eventos: em andamento antes dos futuros, passados à parte', async () => {
    const { client, rpc: spy, selects } = fakeClient(rpc(), tables)
    const page = await loadArtistPage(client, artistId)
    expect(page.artista).toMatchObject({
      nome: 'Artista 1',
      corPredominante: '#8b5cf6',
      estilos: [{ estilo: 'techno', subestilo: 'melodic techno' }],
      social: { instagram: 'https://instagram.example.invalid/a' },
    })
    expect(page.proximos.map((e) => e.nome)).toEqual(['Evento sintético 2', 'Evento sintético 1'])
    expect(page.anteriores.map((e) => e.nome)).toEqual(['Evento sintético 3'])
    expect(spy).toHaveBeenCalledWith('get_profile', { target: artistId })
    for (const period of ['ongoing', 'future', 'past']) expect(spy).toHaveBeenCalledWith('list_events', { period, artist: artistId })
    expect(selects).toHaveLength(2)
    expect(selects[0]).toMatchObject({ table: 'artist_styles', columns: 'style,substyle' })
    expect(selects[0].filters).toContainEqual(['eq', 'profile_id', artistId])
    expect(selects[1]).toMatchObject({ table: 'profile_images', columns: 'profile_id,position,object_path' })
    expect(selects[1].filters).toContainEqual(['eq', 'profile_id', artistId])
  })

  it('foto principal e galeria (em ordem) viram URLs públicas do Storage', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.test/')
    try {
      const url = (name: string) => `/img/${photoPath(1, name)}`
      const { client } = fakeClient(rpc(), {
        ...tables,
        profile_images: ok([
          { profile_id: artistId, position: 2, object_path: photoPath(1, 'g2') },
          { profile_id: artistId, position: 0, object_path: photoPath(1, 'principal') },
          { profile_id: artistId, position: 1, object_path: photoPath(1, 'g1') },
          // Caminho fora do formato das constraints nunca vira URL.
          { profile_id: artistId, position: 3, object_path: '../../etc/passwd' },
        ]),
      })
      const { artista } = await loadArtistPage(client, artistId)
      expect(artista.foto).toBe(url('principal'))
      expect(artista.fotos).toEqual([url('g1'), url('g2')])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('artista sem eventos nem estilos ainda é uma página válida', async () => {
    const { client } = fakeClient(
      rpc({ 'list_events:ongoing': ok([]), 'list_events:future': ok([]), 'list_events:past': ok([]) }),
      { artist_styles: ok([]), profile_images: ok([]) },
    )
    const page = await loadArtistPage(client, artistId)
    expect(page.proximos).toEqual([])
    expect(page.anteriores).toEqual([])
    expect(page.artista.estilos).toEqual([])
  })

  it('UUID inválido é 404 sem consultar o banco', async () => {
    const { client, rpc: spy } = fakeClient(rpc(), tables)
    await expect(loadArtistPage(client, 'art-anerie')).rejects.toMatchObject({ status: 404, message: 'Artista não encontrado.' })
    expect(spy).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalled()
  })

  it('perfil invisível (null) ou que não é de artista é 404', async () => {
    await expect(loadArtistPage(fakeClient(rpc({ get_profile: ok(null) }), tables).client, artistId)).rejects.toMatchObject({ status: 404 })
    await expect(
      loadArtistPage(fakeClient(rpc({ get_profile: ok({ ...fullProfile, kind: 'services' }) }), tables).client, artistId),
    ).rejects.toMatchObject({ status: 404 })
  })

  it.each(['get_profile', 'list_events:ongoing', 'list_events:future', 'list_events:past'])(
    'erro em %s é 503',
    async (name) => {
      await expect(loadArtistPage(fakeClient(rpc({ [name]: failure }), tables).client, artistId)).rejects.toMatchObject({ status: 503 })
    },
  )

  it('erro na consulta de estilos ou de fotos é 503', async () => {
    await expect(loadArtistPage(fakeClient(rpc(), { ...tables, artist_styles: failure }).client, artistId)).rejects.toMatchObject({ status: 503 })
    await expect(loadArtistPage(fakeClient(rpc(), { ...tables, profile_images: failure }).client, artistId)).rejects.toMatchObject({ status: 503 })
  })

  it('perfil inexistente não esconde falha de dados: 404 só quando o RPC responde null sem erro', async () => {
    await expect(loadArtistPage(fakeClient(rpc({ get_profile: failure }), tables).client, artistId)).rejects.toMatchObject({ status: 503 })
  })
})

describe('loadHome', () => {
  const home = (overrides: Record<string, Result | ((select: Select) => Result)> = {}, extraRpc: Record<string, Result> = {}) =>
    fakeClient(
      { 'list_events:ongoing': ok([eventRow(2)]), 'list_events:future': ok([eventRow(1), eventRow(6), eventRow(7), eventRow(8)]), ...extraRpc },
      {
        profiles: (select) => (select.head ? ok(null, 12) : ok([profileRow(1), profileRow(2)])),
        collectives: (select) => (select.head ? ok(null, 5) : ok([collectiveRow(1)])),
        artist_styles: ok([{ profile_id: profileRow(1).id, style: 'techno', substyle: 'hypnotic techno' }]),
        profile_images: ok([]),
        ...overrides,
      },
    )

  it('reúne os próximos eventos (em andamento primeiro), artistas, coletivos e totais', async () => {
    const { client, selects } = home()
    const data = await loadHome(client)
    expect(data.proximos.map((e) => e.nome)).toEqual(['Evento sintético 2', 'Evento sintético 1', 'Evento sintético 6'])
    expect(data.proximos).toHaveLength(HOME_EVENTS)
    expect(data.artistas.map((a) => [a.nome, a.estilos])).toEqual([
      ['Artista 1', [{ estilo: 'techno', subestilo: 'hypnotic techno' }]],
      ['Artista 2', []],
    ])
    expect(data.coletivos).toEqual([{ id: collectiveRow(1).id, nome: 'Organização 1', tipo: 'coletivo', cidade: 'Recife', estado: 'PE' }])
    expect(data.totais).toEqual({ artistas: 12, coletivos: 5, eventos: 5 })
    const artists = selects.find((s) => s.table === 'profiles' && !s.head)!
    expect(artists.filters).toContainEqual(['limit', HOME_ARTISTS])
    expect(selects.find((s) => s.table === 'collectives' && !s.head)!.filters).toContainEqual(['limit', HOME_COLLECTIVES])
    const styles = selects.find((s) => s.table === 'artist_styles')!
    expect(styles.filters).toContainEqual(['in', 'profile_id', [profileRow(1).id, profileRow(2).id]])
    const photos = selects.find((s) => s.table === 'profile_images')!
    expect(photos.filters).toContainEqual(['in', 'profile_id', [profileRow(1).id, profileRow(2).id]])
    expect(photos.filters).toContainEqual(['eq', 'position', 0])
  })

  it('sem dados tudo é vazio e os estilos nem são consultados', async () => {
    const { client, selects } = home(
      { profiles: (s) => (s.head ? ok(null, 0) : ok([])), collectives: (s) => (s.head ? ok(null, 0) : ok([])) },
      { 'list_events:ongoing': ok([]), 'list_events:future': ok([]) },
    )
    expect(await loadHome(client)).toEqual({
      proximos: [],
      artistas: [],
      coletivos: [],
      totais: { artistas: 0, coletivos: 0, eventos: 0 },
    })
    expect(selects.some((s) => s.table === 'artist_styles' || s.table === 'profile_images')).toBe(false)
  })

  it('falha em qualquer fonte é 503, inclusive total ausente', async () => {
    await expect(loadHome(home({}, { 'list_events:future': failure }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadHome(home({ profiles: (s) => (s.head ? ok(null, 1) : failure) }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadHome(home({ profiles: (s) => (s.head ? failure : ok([])) }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadHome(home({ profiles: (s) => (s.head ? ok(null, undefined) : ok([])) }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadHome(home({ collectives: failure }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadHome(home({ artist_styles: failure }).client)).rejects.toMatchObject({ status: 503 })
    await expect(loadHome(home({ profile_images: failure }).client)).rejects.toMatchObject({ status: 503 })
  })
})

describe('loaders das rotas', () => {
  const origin = 'https://circuitone-dev.magalz.space'
  let calls: { path: string; headers: Headers }[]
  beforeEach(() => {
    calls = []
    vi.stubEnv('CIRCUITONE_RUNTIME', 'development')
    vi.stubEnv('SUPABASE_URL', 'https://odphoxozclrshqjgwbqk.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic')
  })
  afterEach(() => vi.unstubAllEnvs())
  const stubFetch = (handler: (path: string) => Response | Promise<Response>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(url)).pathname
        calls.push({ path, headers: new Headers(init?.headers) })
        return handler(path)
      }),
    )
  const thrown = async (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => e as { data: unknown; init: ResponseInit })
  const withSession = (path: string) =>
    new Request(origin + path, { headers: { cookie: 'sb-odphoxozclrshqjgwbqk-auth-token=base64-eyJ4IjoxfQ' } })
  const paths = () => calls.map((call) => call.path)

  it('hub: dados com cabeçalhos privados e consulta anônima mesmo com sessão no cookie', async () => {
    const { loader } = await import('../../src/routes/artists')
    stubFetch((path) => Response.json(path.endsWith('profiles') ? [profileRow(1)] : []))
    const result = (await loader({ request: withSession('/artistas') } as never)) as unknown as {
      data: { artistas: { nome: string }[] }
      init: { headers: Headers }
    }
    expect(result.data.artistas.map((a) => a.nome)).toEqual(['Artista 1'])
    expect(result.init.headers.get('cache-control')).toContain('no-store')
    expect(paths().sort()).toEqual(['/rest/v1/artist_styles', '/rest/v1/profile_images', '/rest/v1/profiles'])
    for (const { headers } of calls) {
      // Só a chave publicável: nunca o token do visitante, para que o RLS seja o do papel anon.
      expect(headers.get('authorization')).toBe('Bearer sb_publishable_synthetic')
    }
  })

  it('hub: falha do PostgREST e runtime sem configuração do Supabase respondem 503', async () => {
    const { loader } = await import('../../src/routes/artists')
    stubFetch(() => Response.json({ message: 'down' }, { status: 500 }))
    expect((await thrown(loader({ request: new Request(origin + '/artistas') } as never) as Promise<unknown>))?.init.status).toBe(503)
    vi.stubEnv('CIRCUITONE_RUNTIME', '')
    calls = []
    expect((await thrown(loader({ request: new Request(origin + '/artistas') } as never) as Promise<unknown>))?.init.status).toBe(503)
    expect(calls).toEqual([])
  })

  it('perfil: id que não é UUID e id inexistente respondem 404 com mensagem', async () => {
    const { loader } = await import('../../src/routes/artist')
    stubFetch((path) => (path.includes('list_events') ? Response.json([]) : Response.json(path.endsWith('get_profile') ? null : [])))
    const bad = await thrown(loader({ request: new Request(origin), params: { id: 'art-anerie' } } as never) as Promise<unknown>)
    expect(bad?.init.status).toBe(404)
    expect(calls).toEqual([])
    const missing = await thrown(loader({ request: new Request(origin), params: { id: artistId } } as never) as Promise<unknown>)
    expect(missing?.init.status).toBe(404)
    expect(missing?.data).toEqual({ message: 'Artista não encontrado.' })
  })

  it('perfil: carrega pelo PostgREST sem consultar dados profissionais', async () => {
    const { loader } = await import('../../src/routes/artist')
    stubFetch((path) => {
      if (path.endsWith('get_profile')) return Response.json(fullProfile)
      if (path.endsWith('list_events') || path.endsWith('profile_images')) return Response.json([])
      return Response.json([{ style: 'techno', substyle: null }])
    })
    const result = (await loader({ request: withSession('/artistas/' + artistId), params: { id: artistId } } as never)) as unknown as {
      data: { artista: { nome: string } }
    }
    expect(result.data.artista.nome).toBe('Artista 1')
    expect(paths().sort()).toEqual([
      '/rest/v1/artist_styles',
      '/rest/v1/profile_images',
      '/rest/v1/rpc/get_profile',
      '/rest/v1/rpc/list_events',
      '/rest/v1/rpc/list_events',
      '/rest/v1/rpc/list_events',
    ])
    expect(paths().some((path) => path.includes('professional_details'))).toBe(false)
  })

  it('home: entrega os destaques e responde 503 quando o banco falha', async () => {
    const { loader } = await import('../../src/routes/home')
    stubFetch((path) => (path.includes('rpc') ? Response.json([]) : Response.json([], { headers: { 'content-range': '*/0' } })))
    const result = (await loader({ request: new Request(origin + '/') } as never)) as unknown as {
      data: { totais: { artistas: number } }
      init: { headers: Headers }
    }
    expect(result.data.totais).toEqual({ artistas: 0, coletivos: 0, eventos: 0 })
    expect(result.init.headers.get('cache-control')).toContain('no-store')
    stubFetch(() => Response.json({ message: 'down' }, { status: 500 }))
    expect((await thrown(loader({ request: new Request(origin + '/') } as never) as Promise<unknown>))?.init.status).toBe(503)
  })
})
