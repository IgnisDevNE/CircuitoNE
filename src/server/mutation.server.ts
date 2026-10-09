import { data, redirect } from 'react-router'
import type { ActionResult } from '../lib/action-result'
import { boundedBody, hasAuthCookie, readAccountSession, routePath, type UploadedFiles } from './auth.server'
import { createSupabaseServerClient, privateHeaders, type SupabaseServerClient } from './supabase.server'

export type { ActionResult }

/** Limite de espera por chamada ao Supabase nas ações com arquivo (a conexão de saída do servidor pode ser lenta). */
export const UPLOAD_TIMEOUT_MS = 60_000

/** Falha esperada de uma ação, já com mensagem em pt-BR e o status HTTP correspondente. */
export class ActionFailure extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503,
    message: string,
    /** Mensagem por campo do formulário, quando a recusa é de validação. */
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}

export const UNAVAILABLE_MESSAGE = 'Não foi possível concluir a operação. Tente novamente.'
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente para continuar.'

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
  // Mensagens (W10). Os limites de envio usam o errcode 54000.
  'Mensagem inválida': new ActionFailure(422, 'Escreva uma mensagem de até 2.000 caracteres.'),
  'Escolha outro interlocutor': new ActionFailure(422, 'Escolha outro interlocutor: não é possível enviar uma mensagem para si mesmo.'),
  'Representação inválida': new ActionFailure(400, 'Escolha com qual atuação ou coletivo enviar.'),
  'Envio não autorizado': new ActionFailure(403, 'Você não pode enviar mensagens por esta atuação ou coletivo, ou o interlocutor não está mais disponível.'),
  'Interlocutor indisponível': new ActionFailure(409, 'Este interlocutor não está disponível para receber mensagens.'),
  'Conta confirmada necessária': new ActionFailure(403, 'Confirme sua conta para enviar mensagens.'),
  'Conversa bloqueada': new ActionFailure(409, 'Esta conversa está bloqueada: ninguém pode enviar mensagens enquanto o bloqueio durar.'),
  'Limite de mensagens por minuto': new ActionFailure(429, 'Muitas mensagens em pouco tempo. Aguarde um minuto e tente de novo.'),
  'Limite de conversas por dia': new ActionFailure(429, 'Você atingiu o limite de novas conversas de hoje. Tente de novo amanhã.'),
  'Leitura não autorizada': new ActionFailure(403, 'Você não tem permissão para ler esta conversa.'),
  'Mensagem indisponível': new ActionFailure(409, 'Esta mensagem não está mais disponível.'),
  'Bloqueio não autorizado': new ActionFailure(403, 'Você não pode alterar o bloqueio desta conversa por esta atuação ou coletivo.'),
  'Denúncia não autorizada': new ActionFailure(403, 'Você não pode denunciar esta mensagem.'),
  'Motivo necessário': new ActionFailure(422, 'Explique o motivo em até 2.000 caracteres.'),
  'Operação não autorizada': new ActionFailure(403, 'Você não tem permissão para esta operação.'),
  // Gestão do coletivo (W9); o conflito de versão chega com o código 40001.
  'Coletivo alterado; recarregue': new ActionFailure(
    409,
    'Este coletivo foi alterado por outra pessoa enquanto você editava. A página foi recarregada com a versão mais recente: revise e repita a operação.',
  ),
  'Edição inválida': new ActionFailure(422, 'O banco recusou os dados informados. Revise os campos e tente de novo.'),
  'Dados de coletivo inválidos': new ActionFailure(422, 'O banco recusou os dados do coletivo. Revise os campos e tente de novo.'),
  'Produtora exige CNPJ': new ActionFailure(422, 'Produtora exige CNPJ.'),
  'CNPJ inválido': new ActionFailure(422, 'Corrija os campos destacados.', { cnpj: 'CNPJ inválido: confira os dígitos verificadores.' }),
  'Conta indisponível': new ActionFailure(403, 'Sua conta não está disponível para criar coletivos ou produtoras.'),
  'Permissões inválidas': new ActionFailure(422, 'As permissões escolhidas são inválidas.'),
  'Perfil/permissões inválidos': new ActionFailure(422, 'Já existe um perfil com esse nome, ou o nome e as permissões são inválidos.'),
  'Perfil indisponível': new ActionFailure(409, 'Este perfil de acesso não existe mais neste coletivo. A página foi recarregada.'),
  'Reatribua os membros antes de excluir o perfil': new ActionFailure(409, 'Há membros com este perfil. Atribua outro perfil a eles antes de excluí-lo.'),
  'Membro indisponível': new ActionFailure(409, 'Esta pessoa não é mais membro do coletivo. A página foi recarregada.'),
  'Proprietário não recebe outro perfil': new ActionFailure(403, 'O proprietário não recebe perfis de acesso. Transfira a propriedade antes de mudar o papel dele.'),
  'Transfira a propriedade antes de sair': new ActionFailure(403, 'O proprietário não pode ser removido do coletivo. Transfira a propriedade antes.'),
  'Transferência exige proprietário com MFA e sucessor elegível': new ActionFailure(
    403,
    'A transferência exige a sua sessão confirmada com o segundo fator e um membro com a verificação em duas etapas ativa, e-mail e celular confirmados.',
  ),
  // Eventos (RN-23..RN-27); o conflito de versão chega com o código 40001.
  'Evento alterado; recarregue': new ActionFailure(
    409,
    'Este evento foi alterado por outra pessoa enquanto você editava. A página foi recarregada com a versão mais recente: revise e repita a operação.',
  ),
  'Edição pública exige publicar': new ActionFailure(403, 'Alterar um evento publicado exige também a permissão de publicar eventos.'),
  'Evento cancelado não aceita edição': new ActionFailure(409, 'Este evento foi cancelado e não pode mais ser editado.'),
  'Transição inválida': new ActionFailure(409, 'Só rascunhos podem ser publicados.'),
  'Evento indisponível': new ActionFailure(404, 'Evento não encontrado.'),
  'Artista público indisponível': new ActionFailure(422, 'Um artista do lineup não está mais público. Remova-o ou informe só o nome.'),
  'Solicitação reutilizada com outros dados': new ActionFailure(
    409,
    'Este formulário já foi enviado com outros dados. Recarregue a página e tente de novo.',
  ),
  'Dados de evento/lineup inválidos': new ActionFailure(422, 'O banco recusou os dados do evento. Revise os campos e tente de novo.'),
  'Dados de evento inválidos': new ActionFailure(422, 'O banco recusou os dados do evento. Revise os campos e tente de novo.'),
  'Data exige instante ISO com fuso': new ActionFailure(422, 'Informe datas válidas para o início e o fim.'),
  'Vertente principal obrigatória': new ActionFailure(422, 'Corrija os campos destacados.', { style: 'Escolha a vertente principal do evento.' }),
  'Vertente principal inválida': new ActionFailure(422, 'Corrija os campos destacados.', { style: 'Escolha uma das vertentes da lista.' }),
  'Lineup inválido': new ActionFailure(422, 'O lineup é inválido.'),
  'Participação inválida': new ActionFailure(422, 'Uma participação do lineup é inválida.'),
  'Crédito exige texto': new ActionFailure(422, 'Uma participação do lineup é inválida.'),
  // Dados da conta e das atuações, fotos e documentos, exclusão (usadas por `account-settings.server.ts`).
  'Dados da conta inválidos': new ActionFailure(400, 'Os dados da conta são inválidos. Revise os campos e tente de novo.'),
  'Dados da atuação inválidos': new ActionFailure(400, 'Os dados da atuação são inválidos. Revise os campos e tente de novo.'),
  'Dados profissionais inválidos': new ActionFailure(400, 'Os dados profissionais são inválidos. Revise os campos e tente de novo.'),
  'Dados profissionais ausentes': new ActionFailure(409, 'Esta atuação ainda não tem dados profissionais.'),
  'Esta atuação não tem dados profissionais': new ActionFailure(400, 'Esta atuação não tem dados profissionais.'),
  'Estilo musical inválido': new ActionFailure(400, 'Estilo musical inválido. Escolha uma das opções da lista.'),
  'Subestilo musical inválido': new ActionFailure(400, 'Subestilo musical inválido. Escolha uma das opções da lista.'),
  'Classificação inválida': new ActionFailure(400, 'Classificação inválida. Escolha uma das opções da lista.'),
  'Informe de 1 a 50 estilos': new ActionFailure(400, 'Informe de 1 a 50 estilos.'),
  'Artista exige ao menos um estilo': new ActionFailure(400, 'Escolha ao menos um estilo.'),
  'Estilos são exclusivos de artistas': new ActionFailure(400, 'Somente atuações de artista têm estilos.'),
  'Somente atuações de artista podem ser publicadas': new ActionFailure(400, 'Somente atuações de artista podem ser publicadas.'),
  'Informe se o celular é WhatsApp e o outro número, se houver': new ActionFailure(400, 'Informe se o celular é WhatsApp e o outro número, se houver.'),
  'Imagem inválida': new ActionFailure(400, 'A imagem enviada é inválida. Envie outro arquivo.'),
  'Imagem indisponível': new ActionFailure(400, 'Esta imagem não está mais disponível. Recarregue a página.'),
  'Arquivo não encontrado ou inválido': new ActionFailure(400, 'O arquivo enviado não foi encontrado ou é inválido. Envie de novo.'),
  'Documento inválido': new ActionFailure(400, 'O documento enviado é inválido. Envie um PDF.'),
  'A galeria aceita até 10 imagens': new ActionFailure(409, 'A galeria aceita até 10 imagens. Remova uma para enviar outra.'),
  'Direção inválida': new ActionFailure(400, 'Direção inválida.'),
  'Proprietário requer transferência ou encerramento': new ActionFailure(
    409,
    'Você é proprietário de um coletivo: transfira a propriedade ou solicite o encerramento ao suporte antes de continuar.',
  ),
  'Transfira a propriedade ou solicite encerramento ao suporte': new ActionFailure(
    409,
    'Você é proprietário de um coletivo: transfira a propriedade ou solicite o encerramento ao suporte antes de excluir a conta.',
  ),
  'Limpeza externa não confirmada': new ActionFailure(409, 'A limpeza dos seus arquivos ainda não foi confirmada. Tente de novo mais tarde.'),
}

/**
 * SQLSTATE que as funções do banco usam de propósito: recusa (42501), dado inválido (22023), estado que impede a operação
 * (55000), conflito de versão (40001) e limite de envio (54000).
 */
const KNOWN_CODES = ['42501', '22023', '55000', '40001', '54000']

type RpcError = { code?: string; message?: string } | null

/**
 * A falha esperada que o erro do banco representa (código e mensagem da lista), ou `undefined`. Texto que não está na lista
 * nunca chega à tela: quem chama usa a mensagem genérica.
 */
export function knownFailure(error: { code?: string; message?: string }): ActionFailure | undefined {
  const known = Object.prototype.hasOwnProperty.call(KNOWN_FAILURES, error.message ?? '') ? KNOWN_FAILURES[error.message!] : undefined
  return known && error.code && KNOWN_CODES.includes(error.code) ? known : undefined
}

/** Traduz o erro de um RPC: mensagens conhecidas do banco, sessão expirada (401) ou indisponibilidade. */
export function rpcFailure(error: NonNullable<RpcError>, status?: number): ActionFailure {
  if (status === 401) return new ActionFailure(401, SESSION_EXPIRED_MESSAGE)
  return knownFailure(error) ?? new ActionFailure(503, UNAVAILABLE_MESSAGE)
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
  work: (
    client: SupabaseServerClient,
    form: URLSearchParams,
    files: UploadedFiles,
  ) => Promise<string | { redirectTo: string } | { message: string; extra: Record<string, unknown> }>,
  /** `maxBytes`: corpo urlencoded. `uploadBytes`: corpo multipart (formulários com arquivo); sem ele, multipart é recusado. */
  options: { maxBytes?: number; uploadBytes?: number } = {},
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
    let client: SupabaseServerClient | undefined
    if (options.uploadBytes) {
      // Ações com arquivo: a sessão é conferida antes de ler o corpo, para que um visitante não faça o servidor receber até
      // dezenas de MB. Sem o cookie de sessão nem se consulta o Auth.
      if (!hasAuthCookie(request)) throw new ActionFailure(401, SESSION_EXPIRED_MESSAGE)
      client = createSupabaseServerClient(request, headers, { timeoutMs: UPLOAD_TIMEOUT_MS })
      const session = await readAccountSession(client, request, headers)
      if (session.kind === 'error') throw new ActionFailure(503, UNAVAILABLE_MESSAGE)
      if (session.kind === 'anonymous') throw new ActionFailure(401, SESSION_EXPIRED_MESSAGE)
    }
    const { form, files } = await boundedBody(request, { limit: options.maxBytes, uploadLimit: options.uploadBytes })
    client ??= createSupabaseServerClient(request, headers)
    const outcome = await work(client, form, files)
    // Também o redirecionamento só acontece depois do RPC; os cookies renovados seguem na resposta.
    if (typeof outcome === 'string') return reply({ ok: true, message: outcome }, 200)
    // `extra`: dados que a tela precisa depois do RPC (por exemplo, a conversa criada pelo envio do chat flutuante).
    if ('extra' in outcome) return reply({ ok: true, message: outcome.message, ...outcome.extra }, 200)
    return redirect(outcome.redirectTo, { headers })
  } catch (error) {
    if (error instanceof ActionFailure)
      return reply({ ok: false, error: error.message, ...(error.fields ? { fields: error.fields } : {}) }, error.status)
    if (error instanceof Response) return reply({ ok: false, error: 'Requisição inválida.' }, error.status === 413 ? 413 : 415)
    return reply({ ok: false, error: UNAVAILABLE_MESSAGE }, 503)
  }
}
