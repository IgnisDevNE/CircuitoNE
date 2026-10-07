import { describe, expect, it } from 'vitest'
import { accentTextColor, contrastRatio, ensureAccent } from '../../src/lib/utils'

const BG = '#050506'

describe('contraste WCAG do destaque escolhido pelo coletivo ou artista', () => {
  it('usa os coeficientes de luminância do WCAG (azul puro é escuro: 0,0722)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5)
    // Luminâncias relativas: vermelho 0,2126, verde 0,7152, azul 0,0722.
    expect(contrastRatio('#ff0000', '#000000')).toBeCloseTo((0.2126 + 0.05) / 0.05, 3)
    expect(contrastRatio('#00ff00', '#000000')).toBeCloseTo((0.7152 + 0.05) / 0.05, 3)
    expect(contrastRatio('#0000ff', '#000000')).toBeCloseTo((0.0722 + 0.05) / 0.05, 3)
  })

  it('o destaque para elementos de interface alcança 3:1 sobre o fundo, inclusive para azuis escuros', () => {
    for (const color of ['#0000ff', '#000080', '#1a1a8c', '#220033', '#ff2040', '#ffffff'])
      expect(contrastRatio(ensureAccent(color), BG), color).toBeGreaterThanOrEqual(3)
  })

  it('o destaque para texto pequeno alcança 4,5:1 sobre o fundo, inclusive para azuis puros', () => {
    for (const color of ['#0000ff', '#000080', '#1a1a8c', '#220033', '#ff2040', '#ffffff'])
      expect(contrastRatio(accentTextColor(color), BG), color).toBeGreaterThanOrEqual(4.5)
  })

  it('uma cor ilegível cai para o vermelho padrão no destaque de interface', () => {
    expect(ensureAccent('não é cor')).toMatch(/^#[0-9a-f]{6}$/)
  })
})
