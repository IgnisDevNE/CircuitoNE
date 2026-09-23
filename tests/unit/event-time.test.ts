import { describe, expect, it, vi } from 'vitest'
import { eventoNaoEncerrado, fmtData, fmtDataHora, parseFortalezaDateTime, porProximidade } from '../../src/lib/utils'
import type { Evento } from '../../src/data/types'
import { eventos } from '../../src/data/mock'

describe('horários de eventos em Fortaleza', () => {
  it('mantém intervalos válidos nas fixtures de eventos', () => {
    expect(eventos.every((evento) => !evento.fim || evento.fim > evento.inicio)).toBe(true)
  })

  it('converte a hora informada em Fortaleza para um instante absoluto', () => {
    expect(parseFortalezaDateTime('2026-09-23T19:30')).toBe('2026-09-23T22:30:00.000Z')
    expect(parseFortalezaDateTime('2026-02-30T19:30')).toBeNull()
    expect(parseFortalezaDateTime('2026-09-23T25:00')).toBeNull()
  })

  it('exibe a data e hora em Fortaleza mesmo quando o instante cruza a meia-noite UTC', () => {
    expect(fmtData('2026-09-24T01:30:00.000Z')).toBe('23 set 2026')
    expect(fmtDataHora('2026-09-24T01:30:00.000Z')).toBe('23 set 2026 · 22:30 (Fortaleza)')
  })

  it('mantém evento em andamento até o fim informado ou o fim do dia local', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const evento = { inicio: '2026-09-23T20:00:00.000Z', fim: null } as Evento
      vi.setSystemTime(new Date('2026-09-24T02:59:59.000Z'))
      expect(eventoNaoEncerrado(evento)).toBe(true)
      vi.setSystemTime(new Date('2026-09-24T03:00:00.000Z'))
      expect(eventoNaoEncerrado(evento)).toBe(false)

      evento.fim = '2026-09-24T04:00:00.000Z'
      expect(eventoNaoEncerrado(evento)).toBe(true)
      const futuro = { id: 'futuro', inicio: '2026-09-24T05:00:00.000Z', fim: null } as Evento
      expect([futuro, evento].sort(porProximidade)[0]).toBe(evento)
      vi.setSystemTime(new Date('2026-09-24T04:00:00.000Z'))
      expect(eventoNaoEncerrado(evento)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
