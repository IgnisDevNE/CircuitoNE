import { data } from 'react-router'
import type { ActionResult } from '../lib/action-result'
import { boundedForm, routePath } from './auth.server'
import { createSupabaseServerClient, privateHeaders, type SupabaseServerClient } from './supabase.server'

export type { ActionResult }

/** Falha esperada de uma ação, já com mensagem em pt-BR e o status HTTP correspondente. */
export class ActionFailure extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message)
  }
}

export const UNAVAILABLE_MESSAGE = 'Não foi possível concluir a operação. Tente novamente.'

/**
 * Mensagens que as funções do banco levantam de propósito (errcode 42501/22023), traduzidas para quem usa a tela.
 * Qualquer outro texto do banco nunca chega à tela.
 */
const KNOWN_FAILURES: Record<string, ActionFailure> = {
  'Conta já vinculada': new ActionFailure(409, 'Você já faz parte deste coletivo.'),
  'Já existe pedido com outra apresentação': new ActionFailure(
    409,
    'Você já tem um pedido pendente neste coletivo com outra apresentação. Cancele-o antes de enviar um novo.',
  ),
  'Apresentação inválida': new ActionFailure(
    422,
    'A apresentação é inválida: use até 2.000 caracteres e uma das suas próprias atuações.',
  ),
  'Coletivo indisponível': new ActionFailure(409, 'Este coletivo não está disponível para pedidos de entrada.'),
  'Conta/coletivo indisponível': new ActionFailure(409, 'Este coletivo ou a sua conta não está disponível para esta operação.'),
  'Pedido indisponível': new ActionFailure(409, 'Este pedido não está mais pendente.'),
  'Pedido já decidido ou decisão inválida': new ActionFailure(409, 'Este pedido já foi decidido.'),
  'Solicitante indisponível': new ActionFailure(409, 'A conta de quem fez o pedido não está mais disponível.'),
  'Operação não autorizada': new ActionFailure(403, 'Você não tem permissão para esta operação.'),
}

type RpcError = { code?: string; message?: string } | null

/** Traduz o erro de um RPC: mensagens conhecidas do banco, sessão expirada (401) ou indisponibilidade. */
export function rpcFailure(error: NonNullable<RpcError>, status?: number): ActionFailure {
  if (status === 401) return new ActionFailure(401, 'Sua sessão expirou. Entre novamente para continuar.')
  const known = error.message ? KNOWN_FAILURES[error.message] : undefined
  if (known && (error.code === '42501' || error.code === '22023')) return known
  return new ActionFailure(503, UNAVAILABLE_MESSAGE)
}

/** Executa um RPC de escrita e lança `ActionFailure` se o banco recusar; devolve o valor de retorno. */
export async function callRpc<T>(call: PromiseLike<{ data: T; error: RpcError; status: number }>): Promise<T> {
  const { data: value, error, status } = await call
  if (error) throw rpcFailure(error, status)
  return value
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Identificador vindo do formulário; qualquer outra coisa é uma requisição inválida. */
export function formId(form: URLSearchParams, key: string, message: string): string {
  const value = form.get(key) ?? ''
  if (!UUID.test(value)) throw new ActionFailure(400, message)
  return value
}

/**
 * Casca comum das ações de escrita: só POST no caminho esperado (sem o sufixo `.data` do single fetch), origem
 * confiável vinda da configuração, corpo limitado, cliente Supabase com os cookies do titular e respostas privadas
 * com os cookies renovados. A mensagem de sucesso é a devolvida por `work`, que só roda depois do RPC responder.
 */
export async function runMutation(
  request: Request,
  path: string,
  work: (client: SupabaseServerClient, form: URLSearchParams) => Promise<string>,
) {
  const headers = privateHeaders()
  const reply = (result: ActionResult, status: number) => data(result, { status, headers })
  if (request.method !== 'POST' || routePath(request) !== path) return reply({ ok: false, error: 'Operação indisponível.' }, 405)
  // A origem externa vem da configuração; não confiar em cabeçalhos forwarded do cliente.
  if (
    !process.env.APP_ORIGIN ||
    request.headers.get('origin') !== process.env.APP_ORIGIN ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return reply({ ok: false, error: 'Origem recusada.' }, 403)
  try {
    const form = await boundedForm(request)
    const message = await work(createSupabaseServerClient(request, headers), form)
    return reply({ ok: true, message }, 200)
  } catch (error) {
    if (error instanceof ActionFailure) return reply({ ok: false, error: error.message }, error.status)
    if (error instanceof Response) return reply({ ok: false, error: 'Requisição inválida.' }, error.status === 413 ? 413 : 415)
    return reply({ ok: false, error: UNAVAILABLE_MESSAGE }, 503)
  }
}
