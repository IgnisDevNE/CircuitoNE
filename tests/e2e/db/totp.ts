import { createHmac } from 'node:crypto'

// TOTP (RFC 6238: HMAC-SHA1, passo de 30 s, 6 dígitos) para completar a ativação de MFA no e2e sem depender de aplicativo.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const STEP_MS = 30_000

function base32Decode(secret: string) {
  const bits = [...secret.replace(/[\s=]/g, '').toUpperCase()]
    .map((char) => {
      const index = BASE32.indexOf(char)
      if (index < 0) throw new Error('Segredo TOTP não está em base32')
      return index.toString(2).padStart(5, '0')
    })
    .join('')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export const totpWindow = (at = Date.now()) => Math.floor(at / STEP_MS)

export function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(totpWindow(at)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}
