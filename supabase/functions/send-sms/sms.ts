// Parte pura da Edge Function `send-sms` (Send SMS Auth Hook): sem APIs do Deno nem imports `npm:`, para ser
// testada com Vitest. Nada daqui registra o código, o telefone ou segredos.

const encoder = new TextEncoder()

export type HookError = { error: { http_code: number; message: string } }

/** Formato de erro do Auth Hook HTTP: status 4xx/5xx e `{ error: { http_code, message } }`. */
export function hookError(status: number, message: string): Response {
  const body: HookError = { error: { http_code: status, message } }
  return Response.json(body, { status })
}

export const hookSuccess = () => Response.json({}, { status: 200 })

/** E.164 com o "+" (o Auth guarda o número sem ele): 8 a 15 dígitos, sem zero inicial. */
export function normalizeDestination(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.trim().replace(/^\+/, '')
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
}

/** Só destinos com um dos prefixos (ex.: `+55`) recebem SMS: limita o custo de um abuso do envio. */
export function isAllowedDestination(phone: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => prefix.startsWith('+') && phone.startsWith(prefix))
}

/** Lista de prefixos separada por vírgula; vazia ou ausente vale `+55`. */
export function parsePrefixes(raw: string | undefined): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return list.length ? list : ['+55']
}

/** Código numérico do Auth (4 a 10 dígitos). */
export const validOtp = (otp: unknown): otp is string => typeof otp === 'string' && /^\d{4,10}$/.test(otp)

export const buildMessage = (otp: string) => `CircuitoNE: seu código é ${otp}. Não compartilhe.`

/** Corpo (form-urlencoded) da ação `Publish` do SNS: SMS transacional para um número. */
export function snsPublishBody(phone: string, message: string): string {
  return new URLSearchParams({
    Action: 'Publish',
    Version: '2010-03-31',
    PhoneNumber: phone,
    Message: message,
    'MessageAttributes.entry.1.Name': 'AWS.SNS.SMS.SMSType',
    'MessageAttributes.entry.1.Value.DataType': 'String',
    'MessageAttributes.entry.1.Value.StringValue': 'Transactional',
  }).toString()
}

/** `<Code>` da resposta de erro do SNS (nunca o texto inteiro, que pode conter o número). */
export function snsErrorCode(xml: string): string {
  const code = /<Code>([A-Za-z0-9.]{1,64})<\/Code>/.exec(xml)?.[1]
  return code ?? 'Unknown'
}

// ---- Standard Webhooks (https://www.standardwebhooks.com) ----

export const TOLERANCE_SECONDS = 300

function base64Bytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) return null
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/** `SEND_SMS_HOOK_SECRETS` (`v1,whsec_<base64>`): aceita vários segredos separados por `|` e o prefixo `whsec_` solto. */
export function parseSecrets(raw: string | undefined): Uint8Array[] {
  return (raw ?? '')
    .split('|')
    .map((item) => item.trim().replace(/^v1,/, '').replace(/^whsec_/, ''))
    .map(base64Bytes)
    .filter((key): key is Uint8Array => !!key && key.length > 0)
}

/**
 * Verifica a assinatura do webhook: HMAC-SHA256 de `id.timestamp.corpo`, comparado em tempo constante
 * (`crypto.subtle.verify`), com tolerância de 5 minutos no relógio. Qualquer cabeçalho ausente ou malformado recusa.
 */
export async function verifyWebhook(
  body: string,
  headers: Headers,
  keys: Uint8Array[],
  nowMs: number = Date.now(),
): Promise<boolean> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatures = headers.get('webhook-signature')
  if (!id || !timestamp || !signatures || keys.length === 0) return false
  if (!/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false
  const content = encoder.encode(`${id}.${timestamp}.${body}`)
  const candidates = signatures
    .split(' ')
    .map((item) => /^v1,([A-Za-z0-9+/]+={0,2})$/.exec(item)?.[1])
    .map((value) => (value ? base64Bytes(value) : null))
    .filter((value): value is Uint8Array => !!value)
  for (const secret of keys) {
    const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    for (const signature of candidates)
      if (await crypto.subtle.verify('HMAC', key, signature as BufferSource, content)) return true
  }
  return false
}
