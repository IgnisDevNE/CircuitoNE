import { describe, expect, it } from 'vitest'
import { parentStyle, toggleStyle, withParentStyles } from '../../src/lib/style-selection'

describe('seleção de estilos', () => {
  it('o estilo principal de um subestilo é o prefixo antes de "|"', () => {
    expect(parentStyle('techno|acid techno')).toBe('techno')
    expect(parentStyle('techno')).toBeNull()
  })

  it('subestilo escolhido traz o principal (sem repetir nem mexer no resto)', () => {
    expect(withParentStyles(['house|deep house'])).toEqual(['house|deep house', 'house'])
    expect(withParentStyles(['house', 'house|deep house', 'techno'])).toEqual(['house', 'house|deep house', 'techno'])
    expect(withParentStyles([])).toEqual([])
  })

  it('marcar um subestilo marca o principal; marcar o principal não marca subestilos', () => {
    expect(toggleStyle([], 'house|deep house', true)).toEqual(['house|deep house', 'house'])
    expect(toggleStyle(['house'], 'house|deep house', true)).toEqual(['house', 'house|deep house'])
    expect(toggleStyle([], 'house', true)).toEqual(['house'])
  })

  it('desmarcar o principal desmarca os subestilos dele; desmarcar um subestilo mantém o principal', () => {
    expect(toggleStyle(['house', 'house|deep house', 'house|acid house', 'techno', 'techno|acid techno'], 'house', false)).toEqual(['techno', 'techno|acid techno'])
    expect(toggleStyle(['house', 'house|deep house', 'house|acid house'], 'house|deep house', false)).toEqual(['house', 'house|acid house'])
  })
})
