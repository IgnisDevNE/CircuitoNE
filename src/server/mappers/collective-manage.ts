import { ESTADOS, type Estado, type SocialLinks } from '../../data/types'
import { isPermission, type Permissao } from '../../lib/collective-access'
import { mapSocialLinks } from './collectives'
import { instant, invalid, isRow, oneOf, optionalText, text, type Row } from './row'

const UFS = ESTADOS.map((estado) => estado.value) as Estado[]

/** O perfil inicial de todo coletivo; as demais permissões nunca o alteram (ADR 0008). */
export const MEMBER_ROLE_NAME = 'Membro'

export type SituacaoEdicao = 'pending' | 'rejected' | 'approved' | 'suspended'

/** Cadastro do coletivo como o proprietário o vê (`get_collective_status`): inclui o CNPJ e a versão para a edição otimista. */
export type ColetivoEdicao = {
  id: string
  versao: number
  situacao: SituacaoEdicao
  /** Motivo da última decisão da administração (só faz sentido para recusa/suspensão). */
  motivo: string | null
  tipo: 'coletivo' | 'produtora'
  nome: string
  descricao: string
  atuacao: string
  cidade: string
  estado: Estado
  cnpj: string
  /** Cor de destaque escolhida; nula quando o coletivo usa a padrão. */
  cor: string | null
  social: SocialLinks
}

const anyText = (row: Row, key: string) => {
  const value = row[key]
  if (typeof value !== 'string') throw invalid()
  return value
}

/** Resultado de `get_collective_status`: o estado do pedido + a linha pública do coletivo (sem `owner_user_id`). */
export function mapCollectiveEdit(value: unknown): ColetivoEdicao {
  if (!isRow(value) || !isRow(value.profile)) throw invalid()
  const profile = value.profile
  const version = value.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw invalid()
  const color = optionalText(profile, 'color')
  return {
    id: text(value, 'id'),
    versao: version,
    situacao: oneOf(text(value, 'state'), ['pending', 'rejected', 'approved', 'suspended'] as const),
    motivo: optionalText(value, 'reason') ?? null,
    tipo: oneOf(text(profile, 'kind'), ['collective', 'producer'] as const) === 'producer' ? 'produtora' : 'coletivo',
    nome: text(profile, 'name'),
    descricao: anyText(profile, 'description'),
    atuacao: anyText(profile, 'activity'),
    cidade: text(profile, 'city'),
    estado: oneOf(text(profile, 'state_code'), UFS),
    cnpj: optionalText(value, 'cnpj') ?? '',
    cor: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null,
    social: mapSocialLinks(profile.social_links ?? {}),
  }
}

/** Perfil de acesso do coletivo (`get_collective_roles`). */
export type PerfilAcesso = { id: string; nome: string; permissoes: Permissao[]; embutido: boolean }

export function mapCollectiveRoles(rows: unknown): PerfilAcesso[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row)) throw invalid()
    const permissions = row.permissions
    if (!Array.isArray(permissions) || !permissions.every(isPermission)) throw invalid()
    const nome = text(row, 'name')
    return { id: text(row, 'id'), nome, permissoes: [...new Set(permissions)], embutido: nome === MEMBER_ROLE_NAME }
  })
}

/** Membro na lista do coletivo (`get_collective_member_roster`). */
export type MembroElenco = {
  userId: string
  nome: string
  /** Atuação artística padrão, quando pública (RN-20). */
  artista: { id: string; nome: string } | null
  cargoId: string
  cargo: string
  /** Sem registro de atividade ainda: nulo. */
  ultimaAtividade: string | null
  dono: boolean
}

export function mapMemberRoster(rows: unknown): MembroElenco[] {
  if (!Array.isArray(rows)) throw invalid()
  return rows.map((row: unknown) => {
    if (!isRow(row) || typeof row.is_owner !== 'boolean') throw invalid()
    const artistId = optionalText(row, 'artist_profile_id')
    const activity = optionalText(row, 'last_activity_at')
    return {
      userId: text(row, 'user_id'),
      nome: text(row, 'member_name'),
      artista: artistId ? { id: artistId, nome: text(row, 'artist_name') } : null,
      cargoId: text(row, 'role_id'),
      cargo: text(row, 'role_name'),
      ultimaAtividade: activity ? instant(activity) : null,
      dono: row.is_owner,
    }
  })
}

/** Nível de verificação da sessão (`auth.mfa.getAuthenticatorAssuranceLevel`) traduzido para o que a tela precisa. */
export type EstadoMfa = 'confirmada' | 'confirmar' | 'ativar'

export const mfaState = (current: string | null | undefined, next: string | null | undefined): EstadoMfa =>
  current === 'aal2' ? 'confirmada' : next === 'aal2' ? 'confirmar' : 'ativar'
