import { describe, expect, it } from 'vitest'
import {
  ACCEPT,
  CONTENT_MESSAGE,
  DOCUMENT_MAX_BYTES,
  EMPTY_MESSAGE,
  FORMAT_MESSAGE,
  GALLERY_MAX,
  IMAGE_MAX_BYTES,
  SIZE_MESSAGE,
  checkFileMeta,
  checkUpload,
  documentPath,
  formatSize,
  objectPath,
  sniffExtension,
} from '../../src/lib/uploads'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]
/** Arquivo com a assinatura dada, preenchido até `size` bytes. */
const file = (signature: number[], size = signature.length) => {
  const bytes = new Uint8Array(size)
  bytes.set(signature.slice(0, size))
  return bytes
}

describe('limites (RN-09, RN-35): MB são 1.000.000 de bytes', () => {
  it('constantes', () => {
    expect(IMAGE_MAX_BYTES).toBe(5_000_000)
    expect(DOCUMENT_MAX_BYTES).toBe(10_000_000)
    expect(GALLERY_MAX).toBe(10)
  })

  it('imagem de exatamente 5.000.000 bytes vale; um byte a mais, não', () => {
    expect(checkUpload('image', file(PNG, 5_000_000), 'image/png')).toMatchObject({ ok: true, extension: 'png', size: 5_000_000 })
    expect(checkUpload('image', file(PNG, 5_000_001), 'image/png')).toEqual({ ok: false, error: SIZE_MESSAGE.image })
  })

  it('PDF de exatamente 10.000.000 bytes vale; um byte a mais, não', () => {
    expect(checkUpload('document', file(PDF, 10_000_000), 'application/pdf')).toMatchObject({ ok: true, extension: 'pdf' })
    expect(checkUpload('document', file(PDF, 10_000_001), 'application/pdf')).toEqual({ ok: false, error: SIZE_MESSAGE.document })
  })
})

describe('checkUpload (servidor)', () => {
  it.each([
    ['jpg', JPEG, 'image/jpeg'],
    ['png', PNG, 'image/png'],
    ['webp', WEBP, 'image/webp'],
  ] as const)('aceita %s e grava a extensão e o tipo do conteúdo, não do nome', (extension, signature, type) => {
    expect(checkUpload('image', file(signature, 100), type)).toEqual({ ok: true, extension, contentType: type, size: 100 })
  })

  it('tipo declarado em maiúsculas é normalizado', () => {
    expect(checkUpload('image', file(PNG, 10), 'IMAGE/PNG')).toMatchObject({ ok: true, extension: 'png' })
  })

  it('formatos fora da lista, para cada tipo de arquivo', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'image/heic', 'application/pdf', 'text/html', '']) expect(checkUpload('image', file(PNG, 10), type)).toEqual({ ok: false, error: FORMAT_MESSAGE.image })
    for (const type of ['image/png', 'application/zip', 'application/octet-stream', '']) expect(checkUpload('document', file(PDF, 10), type)).toEqual({ ok: false, error: FORMAT_MESSAGE.document })
  })

  it('conteúdo incompatível com o formato declarado é recusado (RN-09)', () => {
    expect(checkUpload('image', file(JPEG, 100), 'image/png')).toEqual({ ok: false, error: CONTENT_MESSAGE })
    expect(checkUpload('image', file(PDF, 100), 'image/jpeg')).toEqual({ ok: false, error: CONTENT_MESSAGE })
    expect(checkUpload('image', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png')).toEqual({ ok: false, error: CONTENT_MESSAGE })
    expect(checkUpload('document', file(PNG, 100), 'application/pdf')).toEqual({ ok: false, error: CONTENT_MESSAGE })
    expect(checkUpload('document', new TextEncoder().encode('<html><script>alert(1)</script>'), 'application/pdf')).toEqual({ ok: false, error: CONTENT_MESSAGE })
  })

  it('RIFF que não é WebP e arquivos curtos demais para a assinatura são recusados', () => {
    const wave = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]
    expect(checkUpload('image', file(wave), 'image/webp')).toEqual({ ok: false, error: CONTENT_MESSAGE })
    expect(checkUpload('image', Uint8Array.from([0x89, 0x50]), 'image/png')).toEqual({ ok: false, error: CONTENT_MESSAGE })
    expect(checkUpload('image', Uint8Array.from([0x52, 0x49, 0x46, 0x46]), 'image/webp')).toEqual({ ok: false, error: CONTENT_MESSAGE })
  })

  it('arquivo vazio', () => {
    expect(checkUpload('image', new Uint8Array(), 'image/png')).toEqual({ ok: false, error: EMPTY_MESSAGE })
  })
})

describe('sniffExtension', () => {
  it('reconhece os quatro formatos e nada mais', () => {
    expect(sniffExtension(file(JPEG))).toBe('jpg')
    expect(sniffExtension(file(PNG))).toBe('png')
    expect(sniffExtension(file(WEBP))).toBe('webp')
    expect(sniffExtension(file(PDF))).toBe('pdf')
    expect(sniffExtension(new TextEncoder().encode('GIF89a'))).toBeNull()
    expect(sniffExtension(new Uint8Array())).toBeNull()
  })
})

describe('checkFileMeta (navegador)', () => {
  it('só confere tipo declarado e tamanho', () => {
    expect(checkFileMeta('image', { type: 'image/png', size: 100 })).toBeNull()
    expect(checkFileMeta('image', { type: 'image/png', size: 5_000_000 })).toBeNull()
    expect(checkFileMeta('image', { type: 'image/png', size: 5_000_001 })).toBe(SIZE_MESSAGE.image)
    expect(checkFileMeta('image', { type: 'image/gif', size: 100 })).toBe(FORMAT_MESSAGE.image)
    expect(checkFileMeta('image', { type: 'image/png', size: 0 })).toBe(EMPTY_MESSAGE)
    expect(checkFileMeta('document', { type: 'application/pdf', size: 10_000_000 })).toBeNull()
    expect(checkFileMeta('document', { type: 'application/pdf', size: 10_000_001 })).toBe(SIZE_MESSAGE.document)
    expect(checkFileMeta('document', { type: 'image/png', size: 10 })).toBe(FORMAT_MESSAGE.document)
  })

  it('o atributo accept lista só o que o servidor aceita', () => {
    expect(ACCEPT.image.split(',')).toEqual(['image/jpeg', 'image/png', 'image/webp', '.jpg', '.jpeg', '.png', '.webp'])
    expect(ACCEPT.document.split(',')).toEqual(['application/pdf', '.pdf'])
  })
})

describe('caminhos e tamanhos', () => {
  it('o caminho segue o formato das constraints do banco: <id>/<nome>.<ext>', () => {
    const id = '02000000-0000-4000-8000-000000000001'
    const imageRule = new RegExp(`^${id}/[a-zA-Z0-9_-]+\\.(jpg|jpeg|png|webp)$`)
    const documentRule = new RegExp(`^${id}/[a-zA-Z0-9_-]+\\.pdf$`)
    for (const extension of ['jpg', 'png', 'webp'] as const) expect(objectPath(id, extension)).toMatch(imageRule)
    expect(objectPath(id, 'pdf')).toMatch(documentRule)
    expect(objectPath(id, 'png')).not.toBe(objectPath(id, 'png'))
    expect(objectPath(id, 'png', 'fixo')).toBe(`${id}/fixo.png`)
  })

  it('formatSize', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1500)).toBe('2 KB')
    expect(formatSize(2_500_000)).toBe('2,5 MB')
    expect(formatSize(10_000_000)).toBe('10,0 MB')
  })

  it('documentPath', () => {
    expect(documentPath('abc', 'lista-servicos')).toBe('/painel/documentos/abc/lista-servicos')
  })
})
