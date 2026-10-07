import { crc32, deflateSync } from 'node:zlib'

/** PNG válido de 1x1 pixel na cor dada (o navegador o decodifica; a assinatura é o que o servidor confere). */
export function pngPixel(red: number, green: number, blue: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1, 0) // largura
  header.writeUInt32BE(1, 4) // altura
  header.set([8, 2, 0, 0, 0], 8) // 8 bits, RGB, sem entrelaçamento
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, red, green, blue]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const PNG_RED = pngPixel(255, 0, 64)
export const PNG_BLUE = pngPixel(0, 64, 255)
export const PNG_GREEN = pngPixel(0, 255, 64)

/** PDF mínimo (só a assinatura e a estrutura importam aqui). */
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')

export const png = (buffer: Buffer, name = 'foto.png') => ({ name, mimeType: 'image/png', buffer })
export const pdf = (name = 'documento.pdf') => ({ name, mimeType: 'application/pdf', buffer: PDF })

/** Arquivo acima/abaixo de um limite, preservando a assinatura do conteúdo base. */
export const padded = (base: Buffer, size: number) => Buffer.concat([base, Buffer.alloc(Math.max(0, size - base.length))])
