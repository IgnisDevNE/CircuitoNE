import { ESTADOS } from '../data/types'
import { normalizeCnpj, normalizeUrl, SOCIAL_FIELDS } from './account-forms'
import { isPermission, PERMISSIONS, type Permissao } from './collective-access'

/**
 * Formulários de gestão do coletivo (editar, perfil público, perfis de acesso): leitura e validação do envio, antes de
 * qualquer chamada ao banco. Espelham as constraints de `public.collectives` e das RPCs `edit_collective` e
 * `save_collective_role`; o banco continua sendo a autoridade. As chaves de `fields` são os `name` dos campos.
 */
export const NAME_MAX = 200
export const DESCRIPTION_MAX = 10000
export const ACTIVITY_MAX = 200
export const CITY_MAX = 150
export const ROLE_NAME_MAX = 100
export const REASON_MAX = 2000
export const CLOSE_CONFIRMATION = 'ENCERRAR'

const UFS: readonly string[] = ESTADOS.map((estado) => estado.value)
const length = (value: string) => [...value].length
/** O navegador envia quebras de linha como CRLF; o banco conta caracteres. */
const multiline = (value: string) => value.replace(/\r\n/g, '\n').trim()

export type Fields = Record<string, string>
export type Parsed<T> = { ok: true; payload: T } | { ok: false; fields: Fields }

/** Chave de `social_links` no banco para cada campo do formulário (o site é `website`). */
const SOCIAL_DB_KEY: Record<string, string> = { site: 'website' }

export type CollectivePayload = {
  name: string
  description: string
  activity: string
  city: string
  state_code: string
  /** Só vai quando o formulário o tem; nulo apaga o CNPJ de um coletivo (produtora exige). */
  cnpj: string | null
}

/** `/coletivo/:id/editar`: dados do cadastro. O tipo (coletivo/produtora) não muda depois de criado. */
export function parseCollectiveForm(form: URLSearchParams, producer: boolean): Parsed<CollectivePayload> {
  const fields: Fields = {}
  const get = (key: string) => (form.get(key) ?? '').trim()
  const name = get('name')
  if (!name) fields.name = 'Informe o nome.'
  else if (length(name) > NAME_MAX) fields.name = `O nome pode ter até ${NAME_MAX} caracteres.`
  const description = multiline(form.get('description') ?? '')
  if (!description) fields.description = 'Descreva o coletivo.'
  else if (length(description) > DESCRIPTION_MAX) fields.description = `A descrição pode ter até ${DESCRIPTION_MAX.toLocaleString('pt-BR')} caracteres.`
  const activity = get('activity')
  if (!activity) fields.activity = 'Informe a área de atuação.'
  else if (length(activity) > ACTIVITY_MAX) fields.activity = `Use até ${ACTIVITY_MAX} caracteres.`
  const city = get('city')
  if (!city) fields.city = 'Informe a cidade.'
  else if (length(city) > CITY_MAX) fields.city = `Use até ${CITY_MAX} caracteres.`
  const state = get('state_code')
  if (!UFS.includes(state)) fields.state_code = 'Escolha o estado.'
  const rawCnpj = get('cnpj')
  let cnpj: string | null = null
  if (rawCnpj) {
    cnpj = normalizeCnpj(rawCnpj)
    if (!cnpj) fields.cnpj = 'Informe o CNPJ com 14 caracteres (letras e números), com ou sem pontuação.'
  } else if (producer) fields.cnpj = 'Produtora exige CNPJ.'
  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, payload: { name, description, activity, city, state_code: state, cnpj } }
}

export type CollectiveProfilePayload = {
  description: string
  color: string | null
  social_links: Record<string, string>
}

/** `/coletivo/:id/perfil`: descrição pública, cor de destaque e redes sociais (a imagem entra com os uploads, W11). */
export function parseCollectiveProfileForm(form: URLSearchParams): Parsed<CollectiveProfilePayload> {
  const fields: Fields = {}
  const description = multiline(form.get('description') ?? '')
  if (!description) fields.description = 'Descreva o coletivo.'
  else if (length(description) > DESCRIPTION_MAX) fields.description = `A descrição pode ter até ${DESCRIPTION_MAX.toLocaleString('pt-BR')} caracteres.`
  const useColor = form.has('use_color')
  const color = (form.get('color') ?? '').trim()
  if (useColor && !/^#[0-9a-fA-F]{6}$/.test(color)) fields.color = 'Escolha uma cor válida.'
  const social: Record<string, string> = {}
  for (const key of SOCIAL_FIELDS) {
    const value = (form.get(key) ?? '').trim()
    if (!value) continue
    const url = normalizeUrl(value)
    if (url) social[SOCIAL_DB_KEY[key] ?? key] = url
    else fields[key] = 'Informe o endereço completo, começando por https://'
  }
  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, payload: { description, color: useColor ? color.toLowerCase() : null, social_links: social } }
}

export type RolePayload = { role_name: string; permissions: Permissao[] }

/** Perfil de acesso: nome e permissões do catálogo fixo (ADR 0008). Nada fora do catálogo passa. */
export function parseRoleForm(form: URLSearchParams): Parsed<RolePayload> {
  const fields: Fields = {}
  const name = (form.get('role_name') ?? '').trim()
  if (!name) fields.role_name = 'Informe o nome do perfil.'
  else if (length(name) > ROLE_NAME_MAX) fields.role_name = `O nome pode ter até ${ROLE_NAME_MAX} caracteres.`
  else if (name.toLocaleLowerCase('pt-BR') === 'membro') fields.role_name = '"Membro" é o perfil inicial de todo coletivo; escolha outro nome.'
  const submitted = form.getAll('permission')
  if (!submitted.every(isPermission)) fields.permission = 'Permissão desconhecida.'
  if (Object.keys(fields).length) return { ok: false, fields }
  // Na ordem do catálogo, sem repetições.
  return { ok: true, payload: { role_name: name, permissions: PERMISSIONS.filter((permission) => submitted.includes(permission)) } }
}

/** Motivo do encerramento: obrigatório, até 2.000 caracteres, e a confirmação digitada. */
export function parseCloseForm(form: URLSearchParams): Parsed<{ reason: string }> {
  const fields: Fields = {}
  const reason = multiline(form.get('reason') ?? '')
  if (!reason) fields.reason = 'Explique o motivo do encerramento.'
  else if (length(reason) > REASON_MAX) fields.reason = `O motivo pode ter até ${REASON_MAX.toLocaleString('pt-BR')} caracteres.`
  if ((form.get('confirmation') ?? '').trim() !== CLOSE_CONFIRMATION) fields.confirmation = `Digite ${CLOSE_CONFIRMATION} para confirmar.`
  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, payload: { reason } }
}
