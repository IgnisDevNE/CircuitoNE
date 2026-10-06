import { describe, expect, it } from 'vitest'
import {
  ARTIST_PHOTO_FALLBACK,
  groupArtistStyles,
  mapArtistProfile,
  mapArtistSummaries,
} from '../../src/server/mappers/artists'
import { mapCollectiveHighlights } from '../../src/server/mappers/home'
import { estiloLabels } from '../../src/lib/artist'

const id = '02000000-0000-4000-8000-000000000001'
const profileRow = {
  id,
  name: 'Artista sintético público',
  description: 'Fixture, sem dados reais',
  city: 'Recife',
  state_code: 'PE',
}
const styleRow = (style: string, substyle: string | null = null, profile_id = id) => ({ profile_id, style, substyle })

describe('mapArtistSummaries', () => {
  it('converte as colunas liberadas ao visitante, sem confundir UF, e usa a foto neutra', () => {
    expect(mapArtistSummaries([profileRow], [styleRow('techno')])).toEqual([
      {
        id,
        nome: 'Artista sintético público',
        bio: 'Fixture, sem dados reais',
        cidade: 'Recife',
        estado: 'PE',
        estilos: [{ estilo: 'techno' }],
        foto: ARTIST_PHOTO_FALLBACK,
      },
    ])
  })

  it('agrupa estilos por artista, preservando a ordem recebida, e aceita artista sem estilos', () => {
    const other = { ...profileRow, id: '02000000-0000-4000-8000-000000000009', name: 'Outro' }
    const result = mapArtistSummaries(
      [profileRow, other],
      [styleRow('techno', 'hypnotic techno'), styleRow('house', null, other.id), styleRow('ambient')],
    )
    expect(result[0].estilos).toEqual([{ estilo: 'techno', subestilo: 'hypnotic techno' }, { estilo: 'ambient' }])
    expect(result[1].estilos).toEqual([{ estilo: 'house' }])
    expect(mapArtistSummaries([profileRow], [])[0].estilos).toEqual([])
  })

  it('aceita descrição vazia e preserva a ordem do banco', () => {
    const rows = [{ ...profileRow, description: '' }, { ...profileRow, id: 'b', name: 'A' }]
    expect(mapArtistSummaries(rows, []).map((a) => [a.nome, a.bio])).toEqual([
      ['Artista sintético público', ''],
      ['A', 'Fixture, sem dados reais'],
    ])
  })

  it.each([
    ['perfis que não são lista', {}, []],
    ['estilos que não são lista', [profileRow], null],
    ['linha que não é objeto', [null], []],
    ['nome vazio', [{ ...profileRow, name: '' }], []],
    ['UF desconhecida', [{ ...profileRow, state_code: 'XX' }], []],
    ['estilo sem nome', [profileRow], [styleRow('')]],
  ])('falha com resposta malformada: %s', (_label, profiles, styles) => {
    expect(() => mapArtistSummaries(profiles, styles)).toThrow('Resposta inválida')
  })
})

describe('groupArtistStyles', () => {
  it('ignora subestilo nulo ou vazio', () => {
    const grouped = groupArtistStyles([styleRow('techno', ''), styleRow('techno', null)])
    expect(grouped.get(id)).toEqual([{ estilo: 'techno' }, { estilo: 'techno' }])
  })
})

describe('mapArtistProfile', () => {
  const full = {
    ...profileRow,
    kind: 'artist',
    published: true,
    color: '#8B5CF6',
    social_links: {
      instagram: 'https://instagram.example.invalid/a',
      website: 'https://site.example.invalid',
      youtube: 'javascript:alert(1)',
      tiktok: 'https://tiktok.example.invalid/a',
    },
    created_at: '2026-10-01T00:00:00+00:00',
    updated_at: '2026-10-01T00:00:00+00:00',
  }

  it('mapeia a projeção pública: cor, redes (website vira site) e estilos', () => {
    const artist = mapArtistProfile(full, [{ style: 'techno', substyle: 'melodic techno' }])!
    expect(artist).toEqual({
      id,
      nome: 'Artista sintético público',
      bio: 'Fixture, sem dados reais',
      cidade: 'Recife',
      estado: 'PE',
      estilos: [{ estilo: 'techno', subestilo: 'melodic techno' }],
      foto: ARTIST_PHOTO_FALLBACK,
      corPredominante: '#8B5CF6',
      fotos: [],
      social: { instagram: 'https://instagram.example.invalid/a', site: 'https://site.example.invalid' },
    })
  })

  it('descarta cor inválida e redes ausentes ou nulas', () => {
    expect(mapArtistProfile({ ...full, color: 'roxo', social_links: null }, [])!).toMatchObject({
      corPredominante: undefined,
      social: {},
    })
    expect(mapArtistProfile({ ...full, color: null, social_links: {} }, [])!.corPredominante).toBeUndefined()
  })

  it('perfil que não é de artista não tem página pública', () => {
    expect(mapArtistProfile({ ...full, kind: 'services' }, [])).toBeNull()
  })

  it('não expõe dados profissionais mesmo se vierem na resposta', () => {
    const artist = mapArtistProfile(
      { ...full, booking_email: 'x@example.invalid', fee_cents: 1, presskit_url: 'https://p.example.invalid', owner_id: 'o' },
      [],
    )!
    expect(JSON.stringify(artist)).not.toMatch(/booking|fee|presskit|owner|x@example/)
  })

  it.each([
    ['linha que não é objeto', null, []],
    ['estilos que não são lista', full, {}],
    ['redes que não são objeto', { ...full, social_links: 'x' }, []],
  ])('falha com resposta malformada: %s', (_label, row, styles) => {
    expect(() => mapArtistProfile(row, styles)).toThrow('Resposta inválida')
  })
})

describe('mapCollectiveHighlights', () => {
  const row = { id: '05000000-0000-4000-8000-000000000001', name: 'Organização sintética 1', kind: 'collective', city: 'Recife', state_code: 'PE' }

  it('converte tipo e UF', () => {
    expect(mapCollectiveHighlights([row, { ...row, kind: 'producer' }])).toEqual([
      { id: row.id, nome: row.name, tipo: 'coletivo', cidade: 'Recife', estado: 'PE' },
      { id: row.id, nome: row.name, tipo: 'produtora', cidade: 'Recife', estado: 'PE' },
    ])
    expect(mapCollectiveHighlights([])).toEqual([])
  })

  it.each([{}, [null], [{ ...row, kind: 'outro' }], [{ ...row, state_code: 'XX' }], [{ ...row, name: '' }]])(
    'falha com resposta malformada: %j',
    (rows) => {
      expect(() => mapCollectiveHighlights(rows)).toThrow('Resposta inválida')
    },
  )
})

describe('estiloLabels', () => {
  it('mostra o subestilo quando há, senão o estilo, sem repetir', () => {
    expect(
      estiloLabels([
        { estilo: 'techno', subestilo: 'hypnotic techno' },
        { estilo: 'ambient' },
        { estilo: 'house', subestilo: 'hypnotic techno' },
      ]),
    ).toEqual(['hypnotic techno', 'ambient'])
  })
})
