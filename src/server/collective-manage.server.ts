import { can } from '../lib/collective-access'
import { IMAGE_MAX_BYTES } from '../lib/uploads'
import { parseCloseForm, parseCollectiveForm, parseCollectiveProfileForm, parseRoleForm, type Fields } from '../lib/collective-forms'
import { noPermission, requireAccess } from './collective-area.server'
import { mapMyCollectives } from './mappers/account'
import {
  mapCollectiveEdit,
  mapCollectiveRoles,
  mapMemberRoster,
  mfaState,
  type ColetivoEdicao,
  type EstadoMfa,
  type MembroElenco,
  type PerfilAcesso,
} from './mappers/collective-manage'
import { ActionFailure, callRpc, formId, runMutation } from './mutation.server'
import { readUpload, removeStored, returnedPath, storeUpload } from './storage.server'
import { HttpError, unavailable, unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new HttpError(404, 'Coletivo não encontrado.')

/** Descrição de até 10.000 caracteres (até 4 bytes cada, tripla em URL) mais os demais campos. */
export const COLLECTIVE_FORM_MAX_BYTES = 160 * 1024

export const collectiveEditPath = (id: string) => `/coletivo/${id}/editar`
export const collectiveProfilePath = (id: string) => `/coletivo/${id}/perfil`
export const collectiveMembersPath = (id: string) => `/coletivo/${id}/membros`

// ---- Loaders ----

export type EditCollectiveData = {
  coletivo: ColetivoEdicao
  /** O coletivo está aprovado: perfis de acesso, transferência e encerramento só existem então. */
  aprovado: boolean
  perfis: PerfilAcesso[]
  /** Membros que podem receber a propriedade (todos, menos o proprietário); o banco confere a elegibilidade. */
  sucessores: MembroElenco[]
  mfa: EstadoMfa
}

/** Verificação em duas etapas da sessão atual, como o Auth a enxerga (o banco confere o `aal` do JWT de novo). */
async function sessionMfa(client: SupabaseServerClient): Promise<EstadoMfa> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) throw unavailable()
  return mfaState(data.currentLevel, data.nextLevel)
}

/**
 * `/coletivo/:id/editar`: só o proprietário. Coletivo aprovado traz também os perfis de acesso, os sucessores possíveis
 * e a verificação em duas etapas da sessão; pendente ou recusado só o cadastro (para corrigir e reenviar, RN-30).
 * Quem não é membro (ou o coletivo está encerrado) recebe 404; membro que não é o proprietário, 403.
 */
export async function loadEditCollective(client: SupabaseServerClient, id: string): Promise<EditCollectiveData> {
  if (!uuid.test(id)) throw notFound()
  const mine = mapMyCollectives(unwrap(await client.rpc('list_my_collectives'))).find((c) => c.id === id)
  if (!mine || mine.situacao === 'closed') throw notFound()
  if (!mine.dono) throw noPermission('editar os dados')
  if (mine.situacao === 'suspended') throw new HttpError(403, 'Este coletivo está suspenso: os dados não podem ser editados.')
  const coletivo = mapCollectiveEdit(unwrap(await client.rpc('get_collective_status', { target: id })))
  if (coletivo.situacao !== 'approved') return { coletivo, aprovado: false, perfis: [], sucessores: [], mfa: 'ativar' }
  const [perfis, roster, mfa] = await Promise.all([
    client.rpc('get_collective_roles', { target: id }),
    client.rpc('get_collective_member_roster', { target: id }),
    sessionMfa(client),
  ])
  return {
    coletivo,
    aprovado: true,
    perfis: mapCollectiveRoles(unwrap(perfis)),
    sucessores: mapMemberRoster(unwrap(roster)).filter((membro) => !membro.dono),
    mfa,
  }
}

export type EditCollectiveProfileData = { coletivo: ColetivoEdicao }

/** `/coletivo/:id/perfil`: só o proprietário de um coletivo aprovado. */
export async function loadEditCollectiveProfile(client: SupabaseServerClient, id: string): Promise<EditCollectiveProfileData> {
  const access = await requireAccess(client, id)
  if (!access.dono) throw noPermission('editar o perfil público')
  return { coletivo: mapCollectiveEdit(unwrap(await client.rpc('get_collective_status', { target: id }))) }
}

export type CollectiveMembersData = {
  membros: MembroElenco[]
  /** Perfis de acesso para atribuir; só o proprietário os lê e atribui (RN-17). */
  perfis: PerfilAcesso[]
  podeAtribuir: boolean
}

/** `/coletivo/:id/membros`: o proprietário ou quem tem "remover membros"; só o proprietário atribui perfis. */
export async function loadCollectiveMembers(client: SupabaseServerClient, id: string): Promise<CollectiveMembersData> {
  const access = await requireAccess(client, id)
  if (!access.dono && !can(access, 'remove_members')) throw noPermission('gerir os membros')
  const [roster, roles] = await Promise.all([
    client.rpc('get_collective_member_roster', { target: id }),
    access.dono ? client.rpc('get_collective_roles', { target: id }) : Promise.resolve(null),
  ])
  return {
    membros: mapMemberRoster(unwrap(roster)),
    perfis: roles ? mapCollectiveRoles(unwrap(roles)) : [],
    podeAtribuir: access.dono,
  }
}

// ---- Actions ----

const checkId = (id: string) => {
  if (!uuid.test(id)) throw new Response('Coletivo não encontrado', { status: 404 })
}

const expectedVersion = (form: URLSearchParams) => {
  const value = form.get('version') ?? ''
  const version = /^[0-9]{1,9}$/.test(value) ? Number(value) : 0
  if (version < 1) throw new ActionFailure(400, 'Versão do coletivo inválida. Recarregue a página.')
  return version
}

const invalidFields = (fields: Fields) => new ActionFailure(422, 'Corrija os campos destacados.', fields)
/** Formulários sem campos próprios na tela (perfis, encerramento): a primeira mensagem vai no aviso do topo. */
const firstMessage = (fields: Fields) => new ActionFailure(422, Object.values(fields)[0] ?? 'Dados inválidos.')

export const TRANSFER_NEEDS_MFA =
  'Para transferir a propriedade, confirme esta sessão com o segundo fator em Segurança e tente de novo.'

/**
 * Editar, reenviar, perfis de acesso, transferir a propriedade e encerrar. Cada ação confere de novo no banco
 * (propriedade, estado, versão e MFA); o que a tela esconde ou mostra não autoriza nada.
 */
export function collectiveEditAction(request: Request, id: string) {
  checkId(id)
  return runMutation(
    request,
    collectiveEditPath(id),
    async (client, form) => {
      const intent = form.get('intent')
      switch (intent) {
        case 'save':
        case 'resubmit': {
          const parsed = parseCollectiveForm(form, form.get('kind') === 'producer')
          if (!parsed.ok) throw invalidFields(parsed.fields)
          await callRpc(
            client.rpc('edit_collective', {
              target: id,
              expected_version: expectedVersion(form),
              payload: parsed.payload,
              resubmit: intent === 'resubmit',
            }),
          )
          return intent === 'resubmit' ? 'Dados reenviados. A administração do site vai analisar o coletivo de novo.' : 'Alterações salvas.'
        }
        case 'role-save': {
          const parsed = parseRoleForm(form)
          if (!parsed.ok) throw firstMessage(parsed.fields)
          const role = form.get('role') ? formId(form, 'role', 'Perfil inválido.') : null
          await callRpc(
            client.rpc('save_collective_role', {
              target: id,
              // O banco cria um perfil novo quando o identificador é nulo; os tipos gerados não marcam o parâmetro como opcional.
              target_role: role as string,
              role_name: parsed.payload.role_name,
              permissions: parsed.payload.permissions,
            }),
          )
          return role ? 'Perfil atualizado. A mudança vale já na próxima operação de quem o tem.' : 'Perfil criado. Atribua-o a um membro em Membros.'
        }
        case 'role-delete':
          await callRpc(client.rpc('delete_collective_role', { target: id, target_role: formId(form, 'role', 'Perfil inválido.') }))
          return 'Perfil excluído.'
        case 'transfer': {
          const successor = formId(form, 'successor', 'Escolha quem recebe a propriedade.')
          if (form.get('confirm') !== 'yes') throw new ActionFailure(422, 'Confirme que entende que você deixa de ser a pessoa responsável.')
          // Recusa antes do banco quando a sessão ainda não passou pelo segundo fator; o RPC confere de novo.
          if ((await sessionMfa(client)) !== 'confirmada') throw new ActionFailure(403, TRANSFER_NEEDS_MFA)
          await callRpc(client.rpc('transfer_collective_ownership', { target: id, successor }))
          return { redirectTo: `/coletivo/${id}/painel` }
        }
        case 'close': {
          const parsed = parseCloseForm(form)
          if (!parsed.ok) throw firstMessage(parsed.fields)
          await callRpc(client.rpc('close_collective', { target: id, reason: parsed.payload.reason }))
          return { redirectTo: '/painel/coletivos' }
        }
        default:
          throw new ActionFailure(400, 'Operação inválida.')
      }
    },
    { maxBytes: COLLECTIVE_FORM_MAX_BYTES },
  )
}

/** Imagem do coletivo: um formulário de texto de até 160 KiB, ou multipart com o arquivo de até 5 MB. */
export const COLLECTIVE_UPLOAD_MAX_BYTES = COLLECTIVE_FORM_MAX_BYTES + IMAGE_MAX_BYTES + 64 * 1024

/**
 * Perfil público do coletivo: descrição, cor e redes (`edit_collective`, com a versão otimista) e a imagem
 * (`set_collective_image`, só do proprietário; independe da versão do cadastro). A troca grava a nova referência antes
 * de apagar o objeto anterior, e uma recusa do banco descarta o objeto recém-enviado.
 */
export function collectiveProfileAction(request: Request, id: string) {
  checkId(id)
  return runMutation(
    request,
    collectiveProfilePath(id),
    async (client, form, files) => {
      const intent = form.get('intent')
      if (intent === 'upload-image') {
        const upload = await readUpload(files, 'arquivo', 'image')
        if (!upload.ok) throw new ActionFailure(422, upload.error, { arquivo: upload.error })
        const path = await storeUpload(client, 'image', id, upload)
        let previous: unknown
        try {
          previous = await callRpc(client.rpc('set_collective_image', { target: id, object_path: path }))
        } catch (error) {
          await removeStored(client, 'image', [path])
          throw error
        }
        await removeStored(client, 'image', [returnedPath(previous)])
        return 'Imagem do coletivo atualizada.'
      }
      if (intent === 'remove-image') {
        // O banco aceita caminho nulo para remover; os tipos gerados não o marcam como opcional.
        const previous = await callRpc(client.rpc('set_collective_image', { target: id, object_path: null as unknown as string }))
        await removeStored(client, 'image', [returnedPath(previous)])
        return 'Imagem removida. O coletivo volta a usar a imagem padrão.'
      }
      const parsed = parseCollectiveProfileForm(form)
      if (!parsed.ok) throw invalidFields(parsed.fields)
      await callRpc(client.rpc('edit_collective', { target: id, expected_version: expectedVersion(form), payload: parsed.payload }))
      return 'Perfil público atualizado.'
    },
    { maxBytes: COLLECTIVE_FORM_MAX_BYTES, uploadBytes: COLLECTIVE_UPLOAD_MAX_BYTES },
  )
}

/** Atribuir perfil de acesso (só o proprietário) e remover membro; o banco recusa tocar no proprietário. */
export function collectiveMembersAction(request: Request, id: string) {
  checkId(id)
  return runMutation(request, collectiveMembersPath(id), async (client, form) => {
    const intent = form.get('intent')
    if (intent === 'assign') {
      await callRpc(
        client.rpc('assign_collective_role', {
          target: id,
          member: formId(form, 'member', 'Membro inválido.'),
          target_role: formId(form, 'role', 'Escolha um perfil de acesso.'),
        }),
      )
      return 'Perfil de acesso atribuído. Vale já na próxima operação do membro.'
    }
    if (intent === 'remove') {
      await callRpc(client.rpc('remove_collective_member', { target: id, member: formId(form, 'member', 'Membro inválido.') }))
      return 'Membro removido do coletivo.'
    }
    throw new ActionFailure(400, 'Operação inválida.')
  })
}
