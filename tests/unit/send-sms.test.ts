// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createHandler, readBody, type Publisher } from '../../supabase/functions/send-sms/handler.ts'
import {
  buildMessage,
  isAllowedDestination,
  normalizeDestination,
  parsePrefixes,
  parseSecrets,
  snsErrorCode,
  snsPublishBody,
  validOtp,
  verifyWebhook,
} from '../../supabase/functions/send-sms/sms.ts'

const SECRET_BYTES = Buffer.from('segredo-sintetico-de-teste-32-bytes!')
const HOOK_SECRET = `v1,whsec_${SECRET_BYTES.toString('base64')}`
const NOW = 1_800_000_000_000

function signed(body: string, options: { id?: string; timestamp?: number; secret?: Buffer } = {}) {
  const id = options.id ?? 'msg_1'
  const timestamp = options.timestamp ?? NOW / 1000
  const signature = createHmac('sha256', options.secret ?? SECRET_BYTES).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Headers({
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  })
}

describe('pure helpers', () => {
  it('normalizes the destination to E.164 and rejects anything else', () => {
    expect(normalizeDestination('5581999900001')).toBe('+5581999900001')
    expect(normalizeDestination('+5581999900001')).toBe('+5581999900001')
    expect(normalizeDestination(' +5581999900001 ')).toBe('+5581999900001')
    for (const bad of ['', '0123456789', '+55 81 99990-0001', '+1234567', '+1234567890123456', 'abc', null, undefined, 5581999900001])
      expect(normalizeDestination(bad)).toBeNull()
  })

  it('allows only configured country prefixes (default +55)', () => {
    expect(parsePrefixes(undefined)).toEqual(['+55'])
    expect(parsePrefixes('')).toEqual(['+55'])
    expect(parsePrefixes('+55, +351')).toEqual(['+55', '+351'])
    expect(isAllowedDestination('+5581999900001', ['+55'])).toBe(true)
    expect(isAllowedDestination('+14155550100', ['+55'])).toBe(false)
    expect(isAllowedDestination('+14155550100', ['55'])).toBe(false)
  })

  it('builds a pt-BR message and validates the code', () => {
    expect(buildMessage('123456')).toBe('CircuitoNE: seu código é 123456. Não compartilhe.')
    expect(validOtp('123456')).toBe(true)
    expect(validOtp('12')).toBe(false)
    expect(validOtp('12a456')).toBe(false)
    expect(validOtp(123456)).toBe(false)
  })

  it('builds a transactional SNS Publish request body', () => {
    const body = new URLSearchParams(snsPublishBody('+5581999900001', 'Olá'))
    expect(Object.fromEntries(body)).toEqual({
      Action: 'Publish',
      Version: '2010-03-31',
      PhoneNumber: '+5581999900001',
      Message: 'Olá',
      'MessageAttributes.entry.1.Name': 'AWS.SNS.SMS.SMSType',
      'MessageAttributes.entry.1.Value.DataType': 'String',
      'MessageAttributes.entry.1.Value.StringValue': 'Transactional',
    })
  })

  it('extracts only the SNS error code, never the rest of the response', () => {
    expect(snsErrorCode('<ErrorResponse><Error><Code>InvalidParameter</Code><Message>+5581 not verified</Message></Error></ErrorResponse>')).toBe('InvalidParameter')
    expect(snsErrorCode('garbage')).toBe('Unknown')
  })

  it('parses secrets with the v1,whsec_ prefix, bare whsec_ and several values', () => {
    expect(parseSecrets(HOOK_SECRET)).toHaveLength(1)
    expect(Buffer.from(parseSecrets(HOOK_SECRET)[0]).equals(SECRET_BYTES)).toBe(true)
    expect(parseSecrets(`whsec_${SECRET_BYTES.toString('base64')}|${HOOK_SECRET}`)).toHaveLength(2)
    expect(parseSecrets(undefined)).toEqual([])
    expect(parseSecrets('v1,whsec_***not base64***')).toEqual([])
  })
})

describe('Standard Webhooks signature', () => {
  const keys = parseSecrets(HOOK_SECRET)
  const body = '{"user":{"phone":"5581999900001"},"sms":{"otp":"123456"}}'

  it('accepts a valid signature, also among several space-separated ones', async () => {
    expect(await verifyWebhook(body, signed(body), keys, NOW)).toBe(true)
    const headers = signed(body)
    headers.set('webhook-signature', `v1,AAAA ${headers.get('webhook-signature')}`)
    expect(await verifyWebhook(body, headers, keys, NOW)).toBe(true)
  })

  it('refuses a tampered body, wrong secret, other id or missing headers', async () => {
    expect(await verifyWebhook(body + ' ', signed(body), keys, NOW)).toBe(false)
    expect(await verifyWebhook(body, signed(body, { secret: Buffer.from('outro-segredo-qualquer') }), keys, NOW)).toBe(false)
    const other = signed(body)
    other.set('webhook-id', 'msg_2')
    expect(await verifyWebhook(body, other, keys, NOW)).toBe(false)
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const headers = signed(body)
      headers.delete(name)
      expect(await verifyWebhook(body, headers, keys, NOW)).toBe(false)
    }
    expect(await verifyWebhook(body, signed(body), [], NOW)).toBe(false)
  })

  it('refuses malformed signatures and timestamps outside the 5 minute tolerance', async () => {
    const headers = signed(body)
    headers.set('webhook-signature', 'v2,abc')
    expect(await verifyWebhook(body, headers, keys, NOW)).toBe(false)
    headers.set('webhook-signature', 'v1,***')
    expect(await verifyWebhook(body, headers, keys, NOW)).toBe(false)
    expect(await verifyWebhook(body, signed(body, { timestamp: NOW / 1000 - 301 }), keys, NOW)).toBe(false)
    expect(await verifyWebhook(body, signed(body, { timestamp: NOW / 1000 + 301 }), keys, NOW)).toBe(false)
    expect(await verifyWebhook(body, signed(body, { timestamp: NOW / 1000 - 299 }), keys, NOW)).toBe(true)
    const bad = signed(body)
    bad.set('webhook-timestamp', 'abc')
    expect(await verifyWebhook(body, bad, keys, NOW)).toBe(false)
  })
})

describe('handler', () => {
  const keys = parseSecrets(HOOK_SECRET)
  const payload = (user: object = { phone: '5581999900001' }, otp: unknown = '123456') => JSON.stringify({ user, sms: { otp } })
  const setup = (publish: Publisher = async () => ({ ok: true })) => {
    const spy = vi.fn(publish)
    const log = vi.fn()
    const handler = createHandler({ keys, allowedPrefixes: ['+55'], publish: spy, now: () => NOW, log })
    const call = (body: string, headers = signed(body), method = 'POST') =>
      handler(new Request('https://x.invalid/functions/v1/send-sms', { method, headers, body: method === 'POST' ? body : undefined }))
    return { spy, log, call }
  }
  const errorOf = async (response: Response) => ((await response.json()) as { error: { http_code: number; message: string } }).error

  it('publishes the message and answers 200 {}', async () => {
    const { spy, call } = setup()
    const response = await call(payload())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(spy).toHaveBeenCalledWith({ phone: '+5581999900001', message: 'CircuitoNE: seu código é 123456. Não compartilhe.' })
  })

  it('sends to new_phone, the field GoTrue uses for a pending phone change', async () => {
    const { spy, call } = setup()
    const response = await call(payload({ phone: '', new_phone: '5585981063091' }))
    expect(response.status).toBe(200)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ phone: '+5585981063091' }))
  })

  it('sends to phone_change when the number is being changed', async () => {
    const { spy, call } = setup()
    await call(payload({ phone: '', phone_change: '5581999900002' }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ phone: '+5581999900002' }))
  })

  it('refuses a bad signature before reading the payload', async () => {
    const { spy, call } = setup()
    const body = payload()
    const response = await call(body, signed(body, { secret: Buffer.from('errado') }))
    expect(response.status).toBe(401)
    expect(await errorOf(response)).toEqual({ http_code: 401, message: 'Assinatura inválida.' })
    expect((await call(body, new Headers())).status).toBe(401)
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses other methods, invalid JSON, missing fields and destinations outside the allowed prefixes', async () => {
    const { spy, call } = setup()
    expect((await call('', new Headers(), 'GET')).status).toBe(405)
    expect((await call('not json')).status).toBe(400)
    expect((await call(payload({}))).status).toBe(400)
    expect((await call(payload({ phone: '5581999900001' }, 'abc'))).status).toBe(400)
    const abroad = await call(payload({ phone: '14155550100' }))
    expect(abroad.status).toBe(400)
    expect((await errorOf(abroad)).message).toBe('Este número não pode receber SMS.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses oversized bodies', async () => {
    const { call } = setup()
    const huge = 'x'.repeat(17 * 1024)
    expect((await call(huge)).status).toBe(413)
  })

  it('refuses a chunked body without Content-Length once it passes 16 KiB, without reading the rest', async () => {
    const { spy } = setup()
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++
          controller.enqueue(new Uint8Array(4 * 1024).fill(120))
        },
      },
      { highWaterMark: 0 },
    )
    const request = new Request('https://x.invalid/functions/v1/send-sms', { method: 'POST', body: stream, duplex: 'half', headers: { 'transfer-encoding': 'chunked' } } as RequestInit)
    expect(request.headers.get('content-length')).toBeNull()
    const response = await createHandler({ keys, allowedPrefixes: ['+55'], publish: spy, now: () => NOW })(request)
    expect(response.status).toBe(413)
    expect(await errorOf(response)).toEqual({ http_code: 413, message: 'Corpo grande demais.' })
    // 16 KiB cabem; o quinto pedaço de 4 KiB estoura o limite e a leitura para ali (nada de ler o fluxo inteiro).
    expect(pulls).toBe(5)
    expect(spy).not.toHaveBeenCalled()
  })

  it('counts bytes, not characters: multibyte text past 16 KiB is refused even with fewer characters', async () => {
    const { call } = setup()
    const euros = '€'.repeat(6000) // 6.000 caracteres, 18.000 bytes
    expect(euros.length).toBeLessThan(16 * 1024)
    expect((await call(euros)).status).toBe(413)
  })

  it('maps SNS failures and exceptions to a hook error without logging code, phone or secrets', async () => {
    const rejected = setup(async () => ({ ok: false, code: 'InvalidParameter', status: 400 }))
    const response = await rejected.call(payload())
    expect(response.status).toBe(502)
    expect(await errorOf(response)).toEqual({ http_code: 502, message: 'Não foi possível enviar o SMS agora.' })
    expect(rejected.log).toHaveBeenCalledWith('send-sms: publish rejected', { code: 'InvalidParameter', status: 400 })

    const thrown = setup(async () => {
      throw new Error('ECONNRESET +5581999900001 123456')
    })
    expect((await thrown.call(payload())).status).toBe(502)
    const logged = JSON.stringify([...rejected.log.mock.calls, ...thrown.log.mock.calls])
    expect(logged).not.toMatch(/5581999900001|123456|whsec/)
  })
})

describe('readBody', () => {
  const requestOf = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request('https://x.invalid/', { method: 'POST', body, headers })

  it('reads text up to the limit in bytes and decodes UTF-8', async () => {
    expect(await readBody(requestOf('olá, código 123456 — ok'))).toBe('olá, código 123456 — ok')
    expect(await readBody(requestOf(null))).toBe('')
    expect(await readBody(requestOf('x'.repeat(16 * 1024)))).toHaveLength(16 * 1024)
    expect(await readBody(requestOf('x'.repeat(16 * 1024 + 1)))).toBeNull()
  })

  it('the limit is in bytes: the boundary falls inside multibyte characters', async () => {
    // 5.461 euros = 16.383 bytes (cabe); mais um = 16.386 (não cabe), embora tenha só 5.462 caracteres.
    expect(await readBody(requestOf('€'.repeat(5461)))).toHaveLength(5461)
    expect(await readBody(requestOf('€'.repeat(5462)))).toBeNull()
    expect(await readBody(requestOf('€€€€'))).toBe('€€€€')
    expect(await readBody(requestOf('€'.repeat(4)), 11)).toBeNull()
    expect(await readBody(requestOf('€'.repeat(3)), 9)).toBe('€€€')
  })

  it('does not trust a small or missing Content-Length', async () => {
    const big = new Uint8Array(20 * 1024).fill(97)
    expect(await readBody(requestOf(big, { 'content-length': '10' }))).toBeNull()
    expect(await readBody(requestOf(big, { 'content-length': 'abc' }))).toBeNull()
    // Um Content-Length maior que o limite recusa sem ler nada.
    let pulled = false
    const stream = new ReadableStream<Uint8Array>({ pull() { pulled = true } }, { highWaterMark: 0 })
    const declared = new Request('https://x.invalid/', { method: 'POST', body: stream, duplex: 'half', headers: { 'content-length': String(1024 * 1024) } } as RequestInit)
    expect(await readBody(declared)).toBeNull()
    expect(pulled).toBe(false)
  })

  it('joins chunks split anywhere, including inside a multibyte character', async () => {
    const bytes = new TextEncoder().encode('código: €uro')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3))
        controller.close()
      },
    })
    const request = new Request('https://x.invalid/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    expect(await readBody(request)).toBe('código: €uro')
  })
})
