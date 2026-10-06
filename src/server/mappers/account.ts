import { ESTADOS, type AtuacaoTipo, type Estado, type Evento } from '../../data/types'
import { invalid, isRow, oneOf, text } from './row'

/** Atuação do titular logado (`list_my_profiles`). Só o dono enxerga `published`; as colunas públicas não o trazem. */
export type MeuPerfil = {
  id: string
  tipo: AtuacaoTipo
  nome: string
  cidade: string
  estado: Estado
  publicado: boolean
  /** Artista padrão da conta (`default_artist_profile_id`). */
  padrao: boolean
}

export type ColetivoSituacao = 'pending' | 'approved' | 'rejected' | 'suspended' | 'closed'

/** Coletivo em que o titular é membro (`list_my_collectives`), com o cargo dele. */
export type MeuColetivo = {
  id: string
  nome: string
  tipo: 'coletivo' | 'produtora'
  cidade: string
  estado: Estado
  situacao: ColetivoSituacao
  cargo: string
  dono: boolean
}

/** Evento futuro/em andamento em que alguma atuação artística publicada do titular está na line-up. */
export type ProximoEvento = { evento: Evento; como: string[] }

const UFS = ESTADOS.map((estado) => estado.value) as Estado[]
const KIND_TIPO = { artist: 'artista', services: 'servicos', audiovisual: 'audiovisual', member: 'integrante' } as const
const SITUACOES = ['pending', 'approved', 'rejected', 'suspended', 'closed'] as const

const flag = (row: Record<string, unknown>, key: string) => {
  const value = row[key]
  if (typeof value !== 'boolean') throw invalid()
  return value
}

export function mapMyProfiles(rows: unknown): MeuPerfil[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    return {
      id: text(row, 'id'),
      tipo: KIND_TIPO[oneOf(text(row, 'kind'), Object.keys(KIND_TIPO) as (keyof typeof KIND_TIPO)[])],
      nome: text(row, 'name'),
      cidade: text(row, 'city'),
      // Na UI `estado` é a UF (`state_code`).
      estado: oneOf(text(row, 'state_code'), UFS),
      publicado: flag(row, 'published'),
      padrao: flag(row, 'is_default'),
    }
  })
}

export function mapMyCollectives(rows: unknown): MeuColetivo[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    return {
      id: text(row, 'id'),
      nome: text(row, 'name'),
      tipo: oneOf(text(row, 'kind'), ['collective', 'producer'] as const) === 'producer' ? 'produtora' : 'coletivo',
      cidade: text(row, 'city'),
      estado: oneOf(text(row, 'state_code'), UFS),
      situacao: oneOf(text(row, 'state'), SITUACOES),
      cargo: text(row, 'role_name'),
      dono: flag(row, 'is_owner'),
    }
  })
}

/** Soma `unread_count` das conversas de `list_conversations` (uma página, no máximo 50 conversas). */
export function sumUnread(rows: unknown): number {
  if (!Array.isArray(rows)) throw invalid()
  return rows.reduce<number>((total, row: unknown) => {
    if (!isRow(row)) throw invalid()
    const count = row.unread_count
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw invalid()
    return total + count
  }, 0)
}
