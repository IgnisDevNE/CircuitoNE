import { describe, expect, it } from 'vitest'
import { ESTADOS } from '../../src/data/types'
import { birthdateStatus, normalizeCpf, validEmail } from '../../src/lib/registration-validation'
import { maskCPF } from '../../src/lib/utils'

describe('validação de cadastro', () => {
  it('normaliza CPF válido e rejeita dígitos inválidos ou texto estranho', () => {
    expect(normalizeCpf('123.456.789-09')).toBe('12345678909')
    expect(normalizeCpf('12345678900')).toBeNull()
    expect(normalizeCpf('11111111111')).toBeNull()
    expect(normalizeCpf('abc12345678909')).toBeNull()
    expect(maskCPF('abc12345678909')).toBe('abc12345678909')
    expect(maskCPF('123456789099')).toBe('123456789099')
  })

  it('rejeita e-mail sem domínio e data inexistente; aceita 18 anos completos', () => {
    expect(validEmail('ana@example.org')).toBe(true)
    expect(validEmail('ana@')).toBe(false)
    expect(validEmail('ana b@example.org')).toBe(false)
    expect(validEmail('a..b@example.org')).toBe(false)
    expect(validEmail('a@example..org')).toBe(false)
    expect(validEmail('a@-example.org')).toBe(false)
    const today = new Date('2026-09-23T15:00:00Z')
    expect(birthdateStatus('2008-09-23', today)).toBe('valid')
    expect(birthdateStatus('2008-09-23', new Date('2026-09-23T02:59:59Z'))).toBe('underage')
    expect(birthdateStatus('2008-09-24', today)).toBe('underage')
    expect(birthdateStatus('2008-02-30', today)).toBe('invalid')
    expect(birthdateStatus('2027-01-01', today)).toBe('invalid')
  })

  it('oferece todas as unidades federativas do Brasil', () => {
    expect(new Set(ESTADOS.map((estado) => estado.value)).size).toBe(27)
    expect(ESTADOS.some((estado) => estado.value === 'SP')).toBe(true)
    expect(ESTADOS.some((estado) => estado.value === 'DF')).toBe(true)
  })
})
