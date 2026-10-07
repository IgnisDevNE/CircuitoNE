import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_COVER_FALLBACK,
  mapEventDetail,
  mapEventList,
  mapEventListRow,
} from '../../src/server/mappers/events'

const listRow = {
  id: '0a000000-0000-4000-8000-000000000001',
  collective_id: '05000000-0000-4000-8000-000000000001',
  name: 'Evento sintético 1',
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
}

const detailRow = {
  ...listRow,
  other_kind: null,
  description: '**Fixture**, sem dados reais',
  state: 'published',
  period: 'future',
  lineup: [
    { name: 'Artista sintético público', artist_id: '02000000-0000-4000-8000-000000000001' },
    { name: 'Crédito sintético sem vínculo', artist_id: null },
  ],
}

describe('mapEventListRow', () => {
  it('converte a linha do RPC para o tipo de UI, sem confundir UF com estado do ciclo de vida', () => {
    expect(mapEventListRow(listRow)).toEqual({
      id: listRow.id,
      nome: 'Evento sintético 1',
      tipo: 'festa',
      tipoOutro: undefined,
      descricao: '',
      inicio: '2026-10-07T15:00:00.000Z',
      fim: null,
      estado: 'PE',
      cidade: 'Recife',
      local: 'Local sintético',
      coletivoId: listRow.collective_id,
      lineup: [],
      ingressoLink: undefined,
      gratuito: true,
      capa: EVENT_COVER_FALLBACK,
    })
  })

  it('usa capa e ingresso quando existem e normaliza o fim', () => {
    const evento = mapEventListRow({
      ...listRow,
      is_free: false,
      ticket_url: 'https://tickets.example.invalid/fixture',
      cover_url: 'https://img.example.invalid/capa.jpg',
      ends_at: '2026-10-08T03:00:00+00:00',
    })
    expect(evento.capa).toBe('https://img.example.invalid/capa.jpg')
    expect(evento.ingressoLink).toBe('https://tickets.example.invalid/fixture')
    expect(evento.gratuito).toBe(false)
    expect(evento.fim).toBe('2026-10-08T03:00:00.000Z')
  })

  it('vertente principal: texto do banco; ausente (evento anterior à coluna) fica indefinida', () => {
    expect(mapEventListRow({ ...listRow, style: 'techno' }).estilo).toBe('techno')
    expect(mapEventListRow({ ...listRow, style: null }).estilo).toBeUndefined()
    expect(mapEventListRow(listRow).estilo).toBeUndefined()
    expect(() => mapEventListRow({ ...listRow, style: 7 })).toThrow('Resposta inválida')
  })

  describe('capa enviada (Storage)', () => {
    const path = `${listRow.id}/capa.webp`
    beforeEach(() => vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.test'))
    afterEach(() => vi.unstubAllEnvs())

    it('cover_path vira a URL pública do bucket public-images', () => {
      expect(mapEventListRow({ ...listRow, cover_path: path }).capa).toBe(`https://synthetic.supabase.test/storage/v1/object/public/public-images/${path}`)
    })

    it('a capa enviada vale mais que o link externo', () => {
      expect(mapEventListRow({ ...listRow, cover_path: path, cover_url: 'https://img.example.invalid/capa.jpg' }).capa).toContain('/public-images/')
    })

    it('caminho fora do formato ou sem Supabase configurado cai no link ou na capa neutra', () => {
      expect(mapEventListRow({ ...listRow, cover_path: '../x.png', cover_url: 'https://img.example.invalid/capa.jpg' }).capa).toBe('https://img.example.invalid/capa.jpg')
      expect(mapEventListRow({ ...listRow, cover_path: '../x.png' }).capa).toBe(EVENT_COVER_FALLBACK)
      vi.stubEnv('SUPABASE_URL', '')
      expect(mapEventListRow({ ...listRow, cover_path: path }).capa).toBe(EVENT_COVER_FALLBACK)
    })
  })

  it('ignora capa e ingresso que não sejam http(s)', () => {
    const evento = mapEventListRow({ ...listRow, cover_url: 'javascript:alert(1)', ticket_url: 'javascript:alert(1)' })
    expect(evento.capa).toBe(EVENT_COVER_FALLBACK)
    expect(evento.ingressoLink).toBeUndefined()
  })

  it.each([
    ['sem id', { ...listRow, id: undefined }],
    ['tipo desconhecido', { ...listRow, kind: 'rave' }],
    ['UF inválida', { ...listRow, state_code: 'XX' }],
    ['data inválida', { ...listRow, starts_at: 'ontem' }],
    ['nulo', null],
  ])('rejeita linha malformada: %s', (_name, row) => {
    expect(() => mapEventListRow(row)).toThrow('Resposta inválida')
  })
})

describe('mapEventList', () => {
  it('rejeita resposta que não seja lista', () => {
    expect(() => mapEventList({})).toThrow('Resposta inválida')
    expect(mapEventList([listRow])).toHaveLength(1)
  })
})

describe('mapEventDetail', () => {
  it('mapeia descrição, line-up com e sem vínculo, período e situação', () => {
    const { evento, periodo, situacao } = mapEventDetail(detailRow)
    expect(evento.descricao).toBe('**Fixture**, sem dados reais')
    expect(evento.lineup).toEqual([
      { artistaId: '02000000-0000-4000-8000-000000000001', nome: 'Artista sintético público' },
      { nome: 'Crédito sintético sem vínculo' },
    ])
    expect('artistaId' in evento.lineup[1]).toBe(false)
    expect(periodo).toBe('future')
    expect(situacao).toBe('published')
  })

  it('preserva o tipo livre de "outros" e a situação cancelada', () => {
    const { evento, situacao, periodo } = mapEventDetail({
      ...detailRow,
      kind: 'outros',
      other_kind: 'Ensaio de agenda',
      state: 'cancelled',
      period: 'past',
    })
    expect(evento.tipo).toBe('outros')
    expect(evento.tipoOutro).toBe('Ensaio de agenda')
    expect(situacao).toBe('cancelled')
    expect(periodo).toBe('past')
  })

  it.each([
    ['período', { ...detailRow, period: 'agora' }],
    ['situação', { ...detailRow, state: 'archived' }],
    ['line-up', { ...detailRow, lineup: 'x' }],
    ['item do line-up', { ...detailRow, lineup: [{ artist_id: null }] }],
  ])('rejeita detalhe malformado: %s', (_name, row) => {
    expect(() => mapEventDetail(row)).toThrow('Resposta inválida')
  })
})
