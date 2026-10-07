import municipios from '../data/municipios.json'
import { ESTADOS } from '../data/types'

/**
 * Municípios brasileiros por UF (`src/data/municipios.json`): lista oficial da API de localidades do IBGE, consultada em
 * 07/10/2026 (https://servicodados.ibge.gov.br/api/v1/localidades/municipios; regenerada por
 * `scripts/generate-municipios.mjs`). O banco guarda a mesma lista em `public.municipalities` e toda cidade gravada
 * precisa existir lá para a UF informada. Os nomes seguem a grafia oficial e a ordem alfabética do pt-BR.
 */
const byState = municipios as Record<string, string[]>
const hasState = (uf: string) => Object.prototype.hasOwnProperty.call(byState, uf)
const sets = new Map<string, Set<string>>()

/** Cidades da UF, em ordem alfabética (vazia para UF desconhecida). */
export function municipiosDe(uf: string): readonly string[] {
  return hasState(uf) ? byState[uf] : []
}

/** A cidade existe na UF, com a grafia oficial. */
export function cidadeDaUf(uf: string, cidade: string): boolean {
  if (!hasState(uf)) return false
  let set = sets.get(uf)
  if (!set) sets.set(uf, (set = new Set(byState[uf])))
  return set.has(cidade)
}

const UFS: readonly string[] = ESTADOS.map((estado) => estado.value)

/**
 * Valida o par UF/cidade de um formulário e acrescenta os erros por campo (`keys` são os `name` dos campos). A UF vem
 * primeiro: sem UF válida, a cidade só pode ser exigida; com ela, precisa ser uma cidade da UF.
 */
export function checkLocation(errors: Record<string, string>, keys: { city: string; state: string }, city: string, state: string): void {
  const validState = UFS.includes(state)
  if (!validState) errors[keys.state] = 'Escolha o estado.'
  if (!city) errors[keys.city] = 'Escolha a cidade.'
  else if (!validState) errors[keys.city] = 'Escolha primeiro o estado e depois a cidade.'
  else if (!cidadeDaUf(state, city)) errors[keys.city] = `Escolha uma cidade de ${state} da lista.`
}
