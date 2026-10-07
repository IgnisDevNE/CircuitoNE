import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ESTADOS } from '../../src/data/types'
import { checkLocation, cidadeDaUf, municipiosDe } from '../../src/lib/municipios'

const migration = readFileSync('supabase/migrations/20261011100000_municipalities.sql', 'utf8')
// `(1100015,'Alta Floresta D''Oeste','RO'),` -> código, nome, UF
const rows = [...migration.matchAll(/^\((\d{7}),'((?:[^']|'')+)','([A-Z]{2})'\)[,;]\r?$/gm)].map((match) => ({ code: Number(match[1]), name: match[2].replace(/''/g, "'"), state: match[3] }))

describe('municípios (IBGE)', () => {
  it('tem as 27 UFs, cada uma com cidades em ordem alfabética (pt-BR) e sem repetição', () => {
    let total = 0
    for (const { value } of ESTADOS) {
      const cities = municipiosDe(value)
      expect(cities.length, value).toBeGreaterThan(0)
      expect(new Set(cities).size, value).toBe(cities.length)
      expect([...cities].sort((a, b) => a.localeCompare(b, 'pt-BR')), value).toEqual([...cities])
      total += cities.length
    }
    expect(total).toBe(5571)
    expect(municipiosDe('DF')).toEqual(['Brasília'])
    expect(municipiosDe('XX')).toEqual([])
    expect(municipiosDe('toString')).toEqual([])
  })

  it('cidade só vale na UF dela, com a grafia oficial', () => {
    expect(cidadeDaUf('CE', 'Juazeiro do Norte')).toBe(true)
    expect(cidadeDaUf('BA', 'Juazeiro')).toBe(true)
    expect(cidadeDaUf('PE', 'Juazeiro do Norte')).toBe(false)
    expect(cidadeDaUf('PE', 'recife')).toBe(false)
    expect(cidadeDaUf('PE', 'Recife ')).toBe(false)
    expect(cidadeDaUf('MA', 'São Luís')).toBe(true)
    expect(cidadeDaUf('MT', 'Boa Esperança do Norte')).toBe(true)
    expect(cidadeDaUf('XX', 'Recife')).toBe(false)
    expect(cidadeDaUf('constructor', 'Recife')).toBe(false)
  })

  it('checkLocation: UF primeiro, depois a cidade da UF', () => {
    const run = (city: string, state: string) => {
      const errors: Record<string, string> = {}
      checkLocation(errors, { city: 'cidade', state: 'estado' }, city, state)
      return errors
    }
    expect(run('Recife', 'PE')).toEqual({})
    expect(run('', 'PE')).toEqual({ cidade: 'Escolha a cidade.' })
    expect(run('Recife', 'CE')).toEqual({ cidade: 'Escolha uma cidade de CE da lista.' })
    expect(run('Recife', '')).toEqual({ estado: 'Escolha o estado.', cidade: 'Escolha primeiro o estado e depois a cidade.' })
    expect(run('', 'XX')).toEqual({ estado: 'Escolha o estado.', cidade: 'Escolha a cidade.' })
  })

  it('o conjunto do banco (migração gerada) é exatamente o do app', () => {
    expect(rows).toHaveLength(5571)
    expect(new Set(rows.map((row) => row.code)).size).toBe(5571)
    expect(rows.find((row) => row.name === 'Juazeiro do Norte')).toMatchObject({ code: 2307304, state: 'CE' })
    expect(rows.find((row) => row.name === "Alta Floresta D'Oeste")).toMatchObject({ code: 1100015, state: 'RO' })
    for (const { value } of ESTADOS) {
      expect(rows.filter((row) => row.state === value).map((row) => row.name).sort(), value).toEqual([...municipiosDe(value)].sort())
    }
  })
})
