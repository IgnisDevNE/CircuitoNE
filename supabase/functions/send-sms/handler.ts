import {
  buildMessage,
  hookError,
  hookSuccess,
  isAllowedDestination,
  normalizeDestination,
  validOtp,
  verifyWebhook,
} from './sms.ts'

/** Resultado da publicação no SNS; `code` é o código de erro do SNS (nunca o número nem o texto da mensagem). */
export type PublishResult = { ok: true } | { ok: false; code: string; status: number }
export type Publisher = (input: { phone: string; message: string }) => Promise<PublishResult>

export type HandlerDeps = {
  /** Chaves HMAC já decodificadas de `SEND_SMS_HOOK_SECRETS`. */
  keys: Uint8Array[]
  allowedPrefixes: string[]
  publish: Publisher
  now?: () => number
  log?: (message: string, details: Record<string, string | number>) => void
}

/** O corpo do hook tem poucos centenas de bytes; acima disso, não é o Auth. */
const MAX_BODY = 16 * 1024

/**
 * Lê o corpo como fluxo e para ao passar de `MAX_BODY` BYTES, qualquer que seja o `Content-Length` (ausente, falso ou com
 * `Transfer-Encoding: chunked`): o que passa do limite nunca é acumulado. Conta bytes, não caracteres (UTF-8 de vários
 * bytes não escapa do limite). `null` = grande demais.
 */
export async function readBody(request: Request, limit = MAX_BODY): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > limit) return null
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

type HookPayload = { user?: { phone?: unknown; new_phone?: unknown; phone_change?: unknown }; sms?: { otp?: unknown } }

/**
 * Handler do Send SMS Auth Hook: confere a assinatura, lê o destinatário e o código e publica um SMS transacional.
 * Sucesso: 200 `{}`. Falha: status 4xx/5xx com `{ error: { http_code, message } }`.
 */
export function createHandler(deps: HandlerDeps) {
  const log = deps.log ?? (() => undefined)
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return hookError(405, 'Método não permitido.')
    const body = await readBody(request)
    if (body === null) return hookError(413, 'Corpo grande demais.')
    if (!(await verifyWebhook(body, request.headers, deps.keys, deps.now?.()))) return hookError(401, 'Assinatura inválida.')

    let payload: HookPayload
    try {
      payload = JSON.parse(body) as HookPayload
    } catch {
      return hookError(400, 'Requisição inválida.')
    }
    // Troca de celular: o GoTrue serializa o número novo como `new_phone` (`phone` é o antigo ou vazio).
    const user = payload.user
    const phone = normalizeDestination(user?.new_phone || user?.phone_change || user?.phone)
    const otp = payload.sms?.otp
    if (!phone || !validOtp(otp)) {
      // Só indica o que faltou; nunca registra número ou código.
      log('send-sms: invalid payload', { phone: phone ? 'present' : 'missing', otp: validOtp(otp) ? 'present' : 'missing' })
      return hookError(400, 'Requisição inválida.')
    }
    if (!isAllowedDestination(phone, deps.allowedPrefixes)) return hookError(400, 'Este número não pode receber SMS.')

    let result: PublishResult
    try {
      result = await deps.publish({ phone, message: buildMessage(otp) })
    } catch {
      log('send-sms: publish failed', { reason: 'exception' })
      return hookError(502, 'Não foi possível enviar o SMS agora.')
    }
    if (!result.ok) {
      log('send-sms: publish rejected', { code: result.code, status: result.status })
      return hookError(502, 'Não foi possível enviar o SMS agora.')
    }
    return hookSuccess()
  }
}
