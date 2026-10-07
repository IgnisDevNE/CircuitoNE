import { describe, expect, it } from 'vitest'
import { ESTADOS } from '../../src/data/types'
import { birthdateStatus, cpfError, formatCpf, normalizeCpf, validEmail } from '../../src/lib/registration-validation'

describe('validação de cadastro', () => {
  it('normaliza CPF válido e rejeita dígitos inválidos ou texto estranho', () => {
    expect(normalizeCpf('123.456.789-09')).toBe('12345678909')
    expect(normalizeCpf('12345678900')).toBeNull()
    expect(normalizeCpf('11111111111')).toBeNull()
    expect(normalizeCpf('abc12345678909')).toBeNull()
  })

  it('máscara do CPF à medida que se digita (só dígitos, até 11)', () => {
    expect(formatCpf('')).toBe('')
    expect(formatCpf('5299')).toBe('529.9')
    expect(formatCpf('529982')).toBe('529.982')
    expect(formatCpf('5299822472')).toBe('529.982.247-2')
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
    expect(formatCpf('529.982.247-25999')).toBe('529.982.247-25')
    expect(formatCpf('abc 529x982')).toBe('529.982')
  })

  it('erro imediato do CPF: dígitos verificadores, todos iguais ou incompleto; vazio fica para o envio', () => {
    expect(cpfError('529.982.247-25')).toBeNull()
    expect(cpfError('52998224725')).toBeNull()
    expect(cpfError('')).toBeNull()
    expect(cpfError('  ')).toBeNull()
    for (const invalid of ['529.982.247-26', '111.111.111-11', '000.000.000-00', '529.982.247', '5299']) expect(cpfError(invalid), invalid).toBe('Informe um CPF válido.')
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
