import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COLLECTIVE_IMAGE_FALLBACK,
  DEFAULT_ACCENT,
  mapCollectiveList,
  mapCollectiveMembers,
  mapCollectiveRow,
  mapSocialLinks,
  splitActivity,
} from '../../src/server/mappers/collectives'

const row = {
  id: '05000000-0000-4000-8000-000000000001',
  kind: 'collective',
  name: 'Organização sintética 1',
  description: 'Fixture sem dados reais',
  activity: 'Eventos Musicais, Artistas',
  city: 'Recife',
  state_code: 'PE',
  social_links: {},
  color: '#8b5cf6',
  image_path: null,
}

describe('mapCollectiveRow', () => {
  it('converte a linha do banco para o tipo de UI, sem confundir UF com estado do ciclo de vida', () => {
    expect(mapCollectiveRow(row)).toEqual({
      id: row.id,
      nome: 'Organização sintética 1',
      tipo: 'coletivo',
      atuacao: ['Eventos Musicais', 'Artistas'],
      bio: 'Fixture sem dados reais',
      imagem: COLLECTIVE_IMAGE_FALLBACK,
      cidade: 'Recife',
      estado: 'PE',
      corPredominante: '#8b5cf6',
      social: {},
    })
  })

  it('produtora vira tipo "produtora"', () => {
    expect(mapCollectiveRow({ ...row, kind: 'producer' }).tipo).toBe('produtora')
  })

  it('sem cor (ou cor inválida) usa o destaque padrão', () => {
    expect(mapCollectiveRow({ ...row, color: null }).corPredominante).toBe(DEFAULT_ACCENT)
    expect(mapCollectiveRow({ ...row, color: 'red' }).corPredominante).toBe(DEFAULT_ACCENT)
  })

  describe('imagem (Storage)', () => {
    beforeEach(() => vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.test'))
    afterEach(() => vi.unstubAllEnvs())

    it('image_path vira a URL pública do bucket public-images', () => {
      expect(mapCollectiveRow({ ...row, image_path: `${row.id}/capa.png` }).imagem).toBe(
        `https://synthetic.supabase.test/storage/v1/object/public/public-images/${row.id}/capa.png`,
      )
    })

    it('sem imagem, caminho fora do formato das constraints ou sem Supabase configurado: imagem neutra', () => {
      expect(mapCollectiveRow({ ...row, image_path: null }).imagem).toBe(COLLECTIVE_IMAGE_FALLBACK)
      expect(mapCollectiveRow(row).imagem).toBe(COLLECTIVE_IMAGE_FALLBACK)
      expect(mapCollectiveRow({ ...row, image_path: '../../segredo.png' }).imagem).toBe(COLLECTIVE_IMAGE_FALLBACK)
      expect(mapCollectiveRow({ ...row, image_path: `${row.id}/capa.svg` }).imagem).toBe(COLLECTIVE_IMAGE_FALLBACK)
      vi.stubEnv('SUPABASE_URL', '')
      expect(mapCollectiveRow({ ...row, image_path: `${row.id}/capa.png` }).imagem).toBe(COLLECTIVE_IMAGE_FALLBACK)
    })
  })

  it.each([
    ['linha que não é objeto', null],
    ['kind desconhecido', { ...row, kind: 'label' }],
    ['UF desconhecida', { ...row, state_code: 'XX' }],
    ['nome ausente', { ...row, name: '' }],
    ['social_links que não é objeto', { ...row, social_links: [] }],
    ['atividade ausente', { ...row, activity: null }],
  ])('rejeita %s em vez de exibir dados parciais', (_label, value) => {
    expect(() => mapCollectiveRow(value)).toThrow('Resposta inválida')
  })
})

describe('mapCollectiveList', () => {
  it('preserva a ordem recebida e aceita lista vazia', () => {
    expect(mapCollectiveList([row, { ...row, id: 'x', name: 'B' }]).map((c) => c.nome)).toEqual([
      'Organização sintética 1',
      'B',
    ])
    expect(mapCollectiveList([])).toEqual([])
  })

  it('exige um array', () => {
    expect(() => mapCollectiveList({})).toThrow('Resposta inválida')
  })
})

describe('splitActivity', () => {
  it('separa por vírgula ou ponto e vírgula e descarta vazios', () => {
    expect(splitActivity('Eventos Musicais, Serviços;  Formação ,')).toEqual(['Eventos Musicais', 'Serviços', 'Formação'])
    expect(splitActivity('Música')).toEqual(['Música'])
  })
})

describe('mapSocialLinks', () => {
  it('renomeia website para site e mantém só URLs http(s) das chaves conhecidas', () => {
    expect(
      mapSocialLinks({
        instagram: 'https://instagram.example.invalid/x',
        website: 'https://site.example.invalid',
        youtube: 'javascript:alert(1)',
        tiktok: 'https://tiktok.example.invalid/x',
        soundcloud: 3,
      }),
    ).toEqual({ instagram: 'https://instagram.example.invalid/x', site: 'https://site.example.invalid' })
  })
})

describe('mapCollectiveMembers', () => {
  it('mapeia nome e perfil de artista vinculado (ou ausente)', () => {
    expect(
      mapCollectiveMembers([
        { name: 'Pessoa A', artist_profile_id: '02000000-0000-4000-8000-000000000001' },
        { name: 'Pessoa B', artist_profile_id: null },
      ]),
    ).toEqual([{ nome: 'Pessoa A', artistaId: '02000000-0000-4000-8000-000000000001' }, { nome: 'Pessoa B' }])
  })

  it('rejeita resposta malformada', () => {
    expect(() => mapCollectiveMembers({})).toThrow('Resposta inválida')
    expect(() => mapCollectiveMembers([{ name: '' }])).toThrow('Resposta inválida')
  })
})
