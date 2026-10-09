// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applySecurityHeaders, contentSecurityPolicy, createNonce, STATIC_SECURITY_HEADERS } from '../../src/server/security-headers'
import { privateHeaders } from '../../src/server/supabase.server'

describe('createNonce', () => {
  it('base64 de 128 bits, diferente a cada chamada', () => {
    const first = createNonce()
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    expect(new Set(Array.from({ length: 50 }, createNonce)).size).toBe(50)
  })
})

describe('contentSecurityPolicy', () => {
  const directives = (policy: string) => Object.fromEntries(policy.split('; ').map((part) => [part.split(' ')[0], part.split(' ').slice(1)]))

  it('scripts só da própria origem e com o nonce; nada de unsafe-inline nem unsafe-eval em script', () => {
    const policy = directives(contentSecurityPolicy('abc123=='))
    expect(policy['script-src']).toEqual(["'self'", "'nonce-abc123=='"])
    expect(policy['default-src']).toEqual(["'self'"])
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['base-uri']).toEqual(["'none'"])
    expect(policy['form-action']).toEqual(["'self'"])
    expect(policy['frame-ancestors']).toEqual(["'none'"])
    expect(policy['connect-src']).toEqual(["'self'"])
    expect(policy['script-src'].join(' ')).not.toMatch(/unsafe/)
  })

  it('estilos e fontes do Google Fonts; imagens da origem, https e data', () => {
    const policy = directives(contentSecurityPolicy('n'))
    expect(policy['style-src']).toEqual(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'])
    expect(policy['font-src']).toEqual(["'self'", 'https://fonts.gstatic.com'])
    expect(policy['img-src']).toEqual(["'self'", 'https:', 'data:'])
  })

  it('só o modo de desenvolvimento libera WebSocket (HMR)', () => {
    expect(directives(contentSecurityPolicy('n', { dev: true }))['connect-src']).toEqual(["'self'", 'ws:', 'wss:'])
    expect(directives(contentSecurityPolicy('n', { dev: false }))['connect-src']).toEqual(["'self'"])
  })
})

describe('applySecurityHeaders', () => {
  it('grava a CSP com o nonce e os cabeçalhos fixos, sem apagar os existentes', () => {
    const headers = new Headers({ 'Content-Type': 'text/html', 'Set-Cookie': 'a=b' })
    expect(applySecurityHeaders(headers, 'xyz')).toBe(headers)
    expect(headers.get('content-security-policy')).toContain("'nonce-xyz'")
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=(), payment=()')
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(headers.get('content-type')).toBe('text/html')
    expect(headers.getSetCookie()).toEqual(['a=b'])
    expect(Object.keys(STATIC_SECURITY_HEADERS)).toHaveLength(5)
  })

  it('uma CSP anterior (do Caddy, por exemplo) é substituída, não somada', () => {
    const headers = new Headers({ 'Content-Security-Policy': "default-src 'none'" })
    applySecurityHeaders(headers, 'n1')
    expect(headers.get('content-security-policy')).not.toContain("default-src 'none'")
  })
})

describe('respostas de dados e de recurso', () => {
  it('privateHeaders já traz nosniff', () => {
    expect(privateHeaders().get('x-content-type-options')).toBe('nosniff')
  })
})
