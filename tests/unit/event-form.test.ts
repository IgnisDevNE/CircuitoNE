import { describe, expect, it } from 'vitest'
import { encodeLineupEntry, parseEventForm, type EventPayload } from '../../src/lib/event-form'
import { parseFortalezaDateTime, toFortalezaInput } from '../../src/lib/utils'

const ARTIST = '02000000-0000-4000-8000-000000000001'
const ARTIST_2 = '02000000-0000-4000-8000-000000000002'

const body = (fields: Record<string, string | string[]> = {}) => {
  const form = new URLSearchParams()
  const values: Record<string, string | string[]> = {
    name: 'Festa sintética',
    kind: 'festa',
    description: '',
    starts_at: '2030-05-10T20:00',
    ends_at: '',
    state_code: 'PE',
    city: 'Recife',
    venue: 'Local sintético',
    ticket_url: 'https://tickets.example.invalid/e',
    cover_url: '',
    ...fields,
  }
  for (const [key, value] of Object.entries(values)) for (const v of Array.isArray(value) ? value : [value]) form.append(key, v)
  return form
}
const fieldsOf = (form: URLSearchParams) => {
  const result = parseEventForm(form)
  if (result.ok) throw new Error('esperava erros')
  return result.fields
}
const payloadOf = (form: URLSearchParams): EventPayload => {
  const result = parseEventForm(form)
  if (!result.ok) throw new Error(JSON.stringify(result.fields))
  return result.payload
}

describe('parseEventForm', () => {
  it('monta o payload do RPC: horário de Fortaleza vira instante absoluto e fim vazio continua vazio', () => {
    expect(payloadOf(body())).toEqual({
      name: 'Festa sintética',
      kind: 'festa',
      other_kind: null,
      description: '',
      starts_at: '2030-05-10T23:00:00.000Z',
      ends_at: null,
      state_code: 'PE',
      city: 'Recife',
      venue: 'Local sintético',
      is_free: false,
      ticket_url: 'https://tickets.example.invalid/e',
      cover_url: null,
      lineup: [],
    })
  })

  it('fim informado é convertido; fim igual ou anterior ao início é recusado', () => {
    expect(payloadOf(body({ ends_at: '2030-05-11T02:30' })).ends_at).toBe('2030-05-11T05:30:00.000Z')
    expect(fieldsOf(body({ ends_at: '2030-05-10T20:00' }))).toEqual({ ends_at: 'O fim deve ser posterior ao início.' })
    expect(fieldsOf(body({ ends_at: '2030-05-10T19:59' })).ends_at).toBe('O fim deve ser posterior ao início.')
    expect(fieldsOf(body({ ends_at: 'amanhã' })).ends_at).toBe('Informe uma data e hora de fim válidas.')
  })

  it('início obrigatório e válido (datas inexistentes não passam)', () => {
    expect(fieldsOf(body({ starts_at: '' })).starts_at).toBe('Informe a data e a hora de início.')
    expect(fieldsOf(body({ starts_at: '2030-02-30T20:00' })).starts_at).toBe('Informe uma data e hora de início válidas.')
    expect(fieldsOf(body({ starts_at: '2030-05-10T25:00' })).starts_at).toBe('Informe uma data e hora de início válidas.')
  })

  it('"outros" exige a descrição do tipo; outros tipos descartam o texto', () => {
    expect(fieldsOf(body({ kind: 'outros' })).other_kind).toBe('Descreva o tipo do evento.')
    expect(payloadOf(body({ kind: 'outros', other_kind: '  Sarau  ' }))).toMatchObject({ kind: 'outros', other_kind: 'Sarau' })
    expect(payloadOf(body({ kind: 'festival', other_kind: 'resto' })).other_kind).toBeNull()
    expect(fieldsOf(body({ kind: 'balada' })).kind).toBe('Escolha o tipo do evento.')
  })

  it('gratuito ou link de ingresso, nunca os dois', () => {
    const free = payloadOf(body({ is_free: 'on', ticket_url: 'https://tickets.example.invalid/e' }))
    expect(free).toMatchObject({ is_free: true, ticket_url: null })
    expect(fieldsOf(body({ ticket_url: '' })).ticket_url).toBe('Informe o link de ingresso ou marque o evento como gratuito.')
    for (const bad of ['ftp://x.example.invalid/e', 'javascript:alert(1)', 'tickets.example.invalid', 'https://', 'https://a b.example.invalid'])
      expect(fieldsOf(body({ ticket_url: bad })).ticket_url, bad).toBe('Informe um link http:// ou https:// válido.')
    expect(fieldsOf(body({ ticket_url: `https://x.example.invalid/${'a'.repeat(2048)}` })).ticket_url).toBeTruthy()
  })

  it('capa é opcional e só aceita http(s)', () => {
    expect(payloadOf(body({ cover_url: 'https://img.example.invalid/c.jpg' })).cover_url).toBe('https://img.example.invalid/c.jpg')
    expect(fieldsOf(body({ cover_url: 'data:image/png;base64,AAAA' })).cover_url).toBe('Informe um link http:// ou https:// válido para a capa.')
  })

  it('campos obrigatórios e limites de tamanho do banco', () => {
    expect(fieldsOf(body({ name: '  ', city: '', venue: '', state_code: 'XX' }))).toEqual({
      name: 'Informe o nome do evento.',
      city: 'Informe a cidade.',
      venue: 'Informe o local.',
      state_code: 'Escolha o estado.',
    })
    expect(fieldsOf(body({ name: 'n'.repeat(201) })).name).toMatch(/até 200/)
    expect(fieldsOf(body({ city: 'c'.repeat(151) })).city).toMatch(/até 150/)
    expect(fieldsOf(body({ venue: 'v'.repeat(501) })).venue).toMatch(/até 500/)
    expect(fieldsOf(body({ description: 'd'.repeat(20001) })).description).toMatch(/até 20\.000/)
    expect(payloadOf(body({ description: 'd'.repeat(20000) })).description).toHaveLength(20000)
  })

  it('descrição: quebras CRLF do navegador viram LF', () => {
    expect(payloadOf(body({ description: '# Título\r\n\r\nTexto' })).description).toBe('# Título\n\nTexto')
  })

  it('lineup: artista vinculado ou nome livre, na ordem enviada', () => {
    const lineup = [encodeLineupEntry({ artistaId: ARTIST, nome: 'x' }), encodeLineupEntry({ nome: ' Convidada livre ' }), encodeLineupEntry({ artistaId: ARTIST_2, nome: 'y' })]
    expect(payloadOf(body({ lineup })).lineup).toEqual([{ artist_id: ARTIST }, { name: 'Convidada livre' }, { artist_id: ARTIST_2 }])
  })

  it('lineup: artista repetido, vínculo inválido, nome vazio ou longo demais e excesso de participações são recusados', () => {
    expect(fieldsOf(body({ lineup: [`a:${ARTIST}`, `a:${ARTIST}`] })).lineup).toBe('Cada artista aparece uma única vez no lineup.')
    for (const bad of ['a:não-é-uuid', 'n:', 'n:   ', `n:${'x'.repeat(201)}`, 'x:qualquer', 'sem-prefixo'])
      expect(fieldsOf(body({ lineup: [bad] })).lineup, bad).toMatch(/Cada participação/)
    expect(fieldsOf(body({ lineup: Array.from({ length: 101 }, (_, i) => `n:Nome ${i}`) })).lineup).toBe('O lineup aceita até 100 participações.')
    expect(payloadOf(body({ lineup: Array.from({ length: 100 }, (_, i) => `n:Nome ${i}`) })).lineup).toHaveLength(100)
  })

  it('nomes livres repetidos são permitidos', () => {
    expect(payloadOf(body({ lineup: ['n:Dupla', 'n:Dupla'] })).lineup).toEqual([{ name: 'Dupla' }, { name: 'Dupla' }])
  })

  it('reúne todos os erros de uma vez', () => {
    expect(Object.keys(fieldsOf(new URLSearchParams()))).toEqual(['name', 'kind', 'starts_at', 'state_code', 'city', 'venue', 'ticket_url'])
  })
})

describe('toFortalezaInput', () => {
  it('é o inverso de parseFortalezaDateTime, qualquer que seja o fuso do ambiente', () => {
    for (const local of ['2030-05-10T20:00', '2030-05-10T00:00', '2030-12-31T23:59', '2026-10-06T09:05']) {
      const instant = parseFortalezaDateTime(local)!
      expect(toFortalezaInput(instant)).toBe(local)
    }
    expect(toFortalezaInput('2030-05-10T23:00:00.000Z')).toBe('2030-05-10T20:00')
    expect(toFortalezaInput('2030-05-11T02:30:00+00:00')).toBe('2030-05-10T23:30')
  })

  it('instante inválido vira campo vazio', () => {
    expect(toFortalezaInput('não é data')).toBe('')
  })
})
