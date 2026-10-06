// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { totp, totpWindow } from '../e2e/db/totp'

// Auxiliar do e2e de MFA: confere com os vetores do RFC 6238 (segredo ASCII "12345678901234567890", SHA-1).
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totp (auxiliar do e2e)', () => {
  it('reproduz os vetores do RFC 6238 em 6 dígitos', () => {
    expect(totp(SECRET, 59_000)).toBe('287082')
    expect(totp(SECRET, 1_111_111_109_000)).toBe('081804')
    expect(totp(SECRET, 1_111_111_111_000)).toBe('050471')
    expect(totp(SECRET, 1_234_567_890_000)).toBe('005924')
    expect(totp(SECRET, 2_000_000_000_000)).toBe('279037')
  })

  it('o código só muda a cada 30 segundos', () => {
    expect(totpWindow(29_999)).toBe(0)
    expect(totpWindow(30_000)).toBe(1)
    expect(totp(SECRET, 60_000)).toBe(totp(SECRET, 89_999))
    expect(totp(SECRET, 60_000)).not.toBe(totp(SECRET, 90_000))
  })

  it('recusa segredo fora de base32', () => {
    expect(() => totp('não é base32!')).toThrow()
  })
})
