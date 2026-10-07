import { describe, expect, it } from 'vitest'
import { accentContrastColor, accentTextColor, contrastRatio, ensureAccent } from '../../src/lib/utils'

const BG = '#050506'
// Fundos de index.css (--color-bg, --color-bg-elev, --color-surface) sobre os quais o destaque é desenhado.
const SURFACES = [BG, '#0b0b0d', '#101014']

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
// Grade de 4.096 cores (passos de 17 em cada canal): cobre pretos, azuis puros, neons e brancos.
const GRID = Array.from({ length: 4096 }, (_, n) => hex((n >> 8) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17))

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

  it('qualquer cor escolhida resulta em destaque de interface (3:1) e texto de destaque (4,5:1) legíveis em todos os fundos', () => {
    for (const color of GRID)
      for (const surface of SURFACES) {
        expect(contrastRatio(ensureAccent(color), surface), `${color} destaque sobre ${surface}`).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(accentTextColor(color), surface), `${color} texto sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
  })

  it('o texto de destaque também é legível sobre o tom de destaque (hover e item ativo, 12% a 15% sobre o fundo)', () => {
    const mix = (surface: string, color: string) => {
      const channel = (hexValue: string, at: number) => parseInt(hexValue.slice(at, at + 2), 16)
      return hex(...([1, 3, 5].map((at) => Math.round(channel(surface, at) + (channel(color, at) - channel(surface, at)) * 0.15)) as [number, number, number]))
    }
    for (const color of GRID) {
      const text = accentTextColor(color)
      for (const surface of SURFACES) expect(contrastRatio(text, mix(surface, text)), `${color} sobre tom em ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('o texto sobre o preenchimento do destaque (botão sólido) é preto ou branco e sempre alcança 4,5:1', () => {
    for (const color of GRID) {
      const accent = ensureAccent(color)
      const text = accentContrastColor(accent)
      expect(['#000000', '#ffffff']).toContain(text)
      expect(contrastRatio(text, accent), `${color} → ${accent}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
