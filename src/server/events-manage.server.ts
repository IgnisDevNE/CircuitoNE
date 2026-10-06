import { EVENT_PERMISSIONS, can } from '../lib/collective-access'
import { parseEventForm } from '../lib/event-form'
import { noPermission, requireAccess } from './collective-area.server'
import { mapArtistOptions, mapManagedEvent, type ArtistaOpcao, type EventActions, type EventoGerido } from './mappers/events-manage'
import { ActionFailure, UNAVAILABLE_MESSAGE, callRpc, formId, runMutation } from './mutation.server'
import { createSupabaseServerClient, HttpError, unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const eventNotFound = () => new HttpError(404, 'Evento não encontrado.')

/** O corpo inclui a descrição Markdown (até 20.000 caracteres) e o lineup: bem acima do limite padrão das ações. */
export const EVENT_FORM_MAX_BYTES = 300 * 1024
/** Quantos artistas públicos o seletor do lineup oferece. */
export const ARTIST_OPTIONS_LIMIT = 500

export const eventCreatePath = (collective: string) => `/coletivo/${collective}/eventos/novo`
export const eventManagePath = (collective: string, event: string) => `/coletivo/${collective}/eventos/${event}`

/** Cliente do visitante anônimo: para um login, RLS também expõe atuações não publicadas, que o lineup nunca oferece. */
export const createAnonymousClient = (request: Request) => createSupabaseServerClient(new Request(request.url), new Headers())

/** Artistas publicados (RLS do visitante), em ordem alfabética, para escolher no lineup. */
export async function loadArtistOptions(anonymous: SupabaseServerClient): Promise<ArtistaOpcao[]> {
  return mapArtistOptions(
    unwrap(await anonymous.from('profiles').select('id,name').eq('kind', 'artist').order('name').order('id').limit(ARTIST_OPTIONS_LIMIT)),
  )
}

export type EventCreateData = { requestId: string; artistas: ArtistaOpcao[] }

/**
 * `/coletivo/:id/eventos/novo`: exige "criar eventos" (RN-23). O identificador da solicitação nasce aqui, uma vez por
 * carregamento do formulário, e viaja num campo oculto: reenvios do mesmo formulário não criam dois eventos.
 */
export async function loadEventCreate(
  client: SupabaseServerClient,
  anonymous: SupabaseServerClient,
  id: string,
  newRequestId: () => string = () => crypto.randomUUID(),
): Promise<EventCreateData> {
  const access = await requireAccess(client, id)
  if (!can(access, 'create_events')) throw noPermission('criar eventos')
  return { requestId: newRequestId(), artistas: await loadArtistOptions(anonymous) }
}

export type EventManageData = { evento: EventoGerido; acoes: EventActions; artistas: ArtistaOpcao[] }

/**
 * `/coletivo/:id/eventos/:eventId`: qualquer permissão de eventos abre a página; cada ação exige a sua. Editar rascunho
 * pede "editar eventos"; alterar evento publicado pede também "publicar eventos"; cancelado não se edita.
 * Evento inexistente ou de outro coletivo responde 404 igual.
 */
export async function loadEventManage(
  client: SupabaseServerClient,
  anonymous: SupabaseServerClient,
  id: string,
  eventId: string,
): Promise<EventManageData> {
  const access = await requireAccess(client, id)
  if (!EVENT_PERMISSIONS.some((permission) => can(access, permission))) throw noPermission('gerir eventos')
  if (!uuid.test(eventId)) throw eventNotFound()
  const row = unwrap(await client.rpc('get_event', { target: eventId }))
  if (row === null) throw eventNotFound()
  const evento = mapManagedEvent(row)
  if (evento.coletivoId !== id) throw eventNotFound()
  const acoes: EventActions = {
    editar: evento.situacao !== 'cancelled' && can(access, 'edit_events') && (evento.situacao !== 'published' || can(access, 'publish_events')),
    publicar: evento.situacao === 'draft' && can(access, 'publish_events'),
    cancelar: evento.situacao !== 'cancelled' && can(access, 'cancel_events'),
  }
  return { evento, acoes, artistas: acoes.editar ? await loadArtistOptions(anonymous) : [] }
}

/** Criar rascunho (`create_event`) e seguir para a página de gestão do evento criado. */
export function eventCreateAction(request: Request, id: string) {
  if (!uuid.test(id)) throw new Response('Coletivo não encontrado', { status: 404 })
  return runMutation(
    request,
    eventCreatePath(id),
    async (client, form) => {
      const requestId = formId(form, 'request', 'Formulário inválido. Recarregue a página e tente de novo.')
      const parsed = parseEventForm(form)
      if (!parsed.ok) throw new ActionFailure(422, 'Corrija os campos destacados.', parsed.fields)
      const created = await callRpc(client.rpc('create_event', { collective: id, payload: parsed.payload, request_id: requestId }))
      if (typeof created !== 'string' || !uuid.test(created)) throw new ActionFailure(503, UNAVAILABLE_MESSAGE)
      return { redirectTo: eventManagePath(id, created) }
    },
    { maxBytes: EVENT_FORM_MAX_BYTES },
  )
}

const expectedVersion = (form: URLSearchParams) => {
  const value = form.get('version') ?? ''
  const version = /^[0-9]{1,9}$/.test(value) ? Number(value) : 0
  if (version < 1) throw new ActionFailure(400, 'Versão do evento inválida. Recarregue a página.')
  return version
}

/** Salvar, publicar ou cancelar: cada ação manda a versão que a pessoa viu; o banco recusa se mudou (409). */
export function eventManageAction(request: Request, id: string, eventId: string) {
  if (!uuid.test(id) || !uuid.test(eventId)) throw new Response('Evento não encontrado', { status: 404 })
  return runMutation(
    request,
    eventManagePath(id, eventId),
    async (client, form) => {
      const intent = form.get('intent')
      if (intent !== 'update' && intent !== 'publish' && intent !== 'cancel') throw new ActionFailure(400, 'Operação inválida.')
      const version = expectedVersion(form)
      if (intent === 'update') {
        const parsed = parseEventForm(form)
        if (!parsed.ok) throw new ActionFailure(422, 'Corrija os campos destacados.', parsed.fields)
        await callRpc(client.rpc('update_event', { target: eventId, expected_version: version, payload: parsed.payload }))
        return 'Alterações salvas.'
      }
      if (intent === 'publish') {
        await callRpc(client.rpc('publish_event', { target: eventId, expected_version: version }))
        return 'Evento publicado. Ele já aparece na agenda pública.'
      }
      await callRpc(client.rpc('cancel_event', { target: eventId, expected_version: version }))
      return 'Evento cancelado.'
    },
    { maxBytes: EVENT_FORM_MAX_BYTES },
  )
}
