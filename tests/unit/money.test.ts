import { describe, expect, it } from 'vitest'
import { formatCacheCents, parseCacheCents } from '../../src/lib/utils'

describe('cachê em reais', () => {
  it('formata centavos inteiros em reais brasileiros e lê o resultado de volta', () => {
    expect(formatCacheCents(150000)).toBe('R$ 1.500,00')
    expect(formatCacheCents(150050)).toBe('R$ 1.500,50')
    expect(formatCacheCents(1)).toBe('R$ 0,01')
    for (const cents of [0, 1, 99, 100, 150050, 123456789]) expect(parseCacheCents(formatCacheCents(cents))).toBe(cents)
  })

  it('converte apenas quantias brasileiras válidas em centavos inteiros', () => {
    expect(parseCacheCents('R$ 1.500,00')).toBe(150000)
    expect(parseCacheCents('1500,5')).toBe(150050)
    expect(parseCacheCents('0,01')).toBe(1)
    for (const invalid of ['', 'R$ abc', '1.50', '1.500,000', '-10', '999999999999999999999999']) {
      expect(parseCacheCents(invalid)).toBeNull()
    }
  })
})
