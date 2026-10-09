import { CREATED_PARAM, parseNewCollectiveForm } from '../lib/collective-forms'
import { MY_COLLECTIVES_PATH } from './collective-area.server'
import { COLLECTIVE_FORM_MAX_BYTES } from './collective-manage.server'
import { mapMyCollectives } from './mappers/account'
import { ActionFailure, callRpc, formId, runMutation, UNAVAILABLE_MESSAGE } from './mutation.server'
import { unwrap, type SupabaseServerClient } from './supabase.server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const NEW_COLLECTIVE_PATH = '/painel/coletivos/novo'

export type NewCollectiveData = { requestId: string }

/**
 * `/painel/coletivos/novo`: qualquer conta ativa (o layout do painel exige a sessão; o banco confere a conta de novo).
 * O identificador da solicitação nasce aqui, uma vez por carregamento do formulário, e viaja num campo oculto:
 * reenviar o mesmo formulário não cria dois coletivos.
 */
export function loadNewCollective(newRequestId: () => string = () => crypto.randomUUID()): NewCollectiveData {
  return { requestId: newRequestId() }
}

/** O coletivo recém-criado já está aprovado? (ambiente de desenvolvimento aprova na hora). Falha de leitura conta como "ainda não". */
async function approvedAlready(client: SupabaseServerClient, id: string) {
  try {
    return mapMyCollectives(unwrap(await client.rpc('list_my_collectives'))).some((c) => c.id === id && c.situacao === 'approved')
  } catch {
    return false
  }
}

/**
 * Cria o coletivo/produtora (`create_collective`): ele nasce em análise com a conta como proprietária. Se o banco já o
 * aprovou, segue para o dashboard dele; senão, para "meus coletivos", onde aparece como "em análise".
 */
export function newCollectiveAction(request: Request) {
  return runMutation(
    request,
    NEW_COLLECTIVE_PATH,
    async (client, form) => {
      const requestId = formId(form, 'request', 'Formulário inválido. Recarregue a página e tente de novo.')
      const parsed = parseNewCollectiveForm(form)
      if (!parsed.ok) throw new ActionFailure(422, 'Corrija os campos destacados.', parsed.fields)
      const created = await callRpc(client.rpc('create_collective', { payload: parsed.payload, request_id: requestId }))
      if (typeof created !== 'string' || !uuid.test(created)) throw new ActionFailure(503, UNAVAILABLE_MESSAGE)
      return (await approvedAlready(client, created))
        ? { redirectTo: `/coletivo/${created}/painel` }
        : { redirectTo: `${MY_COLLECTIVES_PATH}?${CREATED_PARAM}=1` }
    },
    { maxBytes: COLLECTIVE_FORM_MAX_BYTES },
  )
}
