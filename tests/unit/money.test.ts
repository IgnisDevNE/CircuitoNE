import { describe, expect, it } from 'vitest'
import { maskCache, parseCacheCents } from '../../src/lib/utils'

describe('cachê em reais', () => {
  it('preserva o valor quando a máscara é aplicada novamente', () => {
    expect(maskCache('R$ 1.500,00')).toBe('R$ 1.500,00')
    expect(maskCache(maskCache('1500,5'))).toBe('R$ 1.500,50')
  })

  it('não transforma entrada inválida em zero e mantém vazio opcional', () => {
    expect(maskCache('R$ abc')).toBe('R$ abc')
    expect(maskCache('1.50')).toBe('1.50')
    expect(maskCache('')).toBe('')
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
