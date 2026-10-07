/**
 * Regras de arquivos enviados (RN-09, RN-35), compartilhadas entre o navegador (conferência antecipada, só conveniência)
 * e o servidor (que confere o conteúdo de verdade antes de gravar no Storage). O banco e o Storage repetem os limites:
 * buckets com tipo e tamanho máximos, e RPCs que leem o tamanho e o tipo gravados pelo próprio Storage.
 * "MB" aqui são 1.000.000 de bytes, como nas regras de negócio.
 */
export const IMAGE_MAX_BYTES = 5_000_000
export const DOCUMENT_MAX_BYTES = 10_000_000
/** Imagens da galeria de um artista; a foto principal não conta (RN-09). */
export const GALLERY_MAX = 10

export type UploadKind = 'image' | 'document'
export type UploadExtension = 'jpg' | 'png' | 'webp' | 'pdf'

export const BUCKETS = { image: 'public-images', document: 'private-documents' } as const
export const MAX_BYTES = { image: IMAGE_MAX_BYTES, document: DOCUMENT_MAX_BYTES } as const

const TYPE_BY_EXTENSION: Record<UploadExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}
const EXTENSIONS: Record<UploadKind, readonly UploadExtension[]> = { image: ['jpg', 'png', 'webp'], document: ['pdf'] }

/** Valor do atributo `accept` do campo de arquivo. */
export const ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
  document: 'application/pdf,.pdf',
} as const

export const FORMAT_MESSAGE = {
  image: 'Formato não aceito. Envie uma imagem JPG, PNG ou WebP.',
  document: 'Formato não aceito. Envie um arquivo PDF.',
} as const
export const SIZE_MESSAGE = {
  image: 'A imagem passa de 5 MB. Envie um arquivo menor.',
  document: 'O PDF passa de 10 MB. Envie um arquivo menor.',
} as const
export const EMPTY_MESSAGE = 'Escolha um arquivo para enviar.'
export const CONTENT_MESSAGE = 'O conteúdo do arquivo não corresponde ao formato. Envie o arquivo original, sem renomear a extensão.'

/** Extensão que o tipo declarado do navegador representa para o tipo de arquivo pedido, ou `null` se não for aceito. */
function extensionFor(kind: UploadKind, declaredType: string): UploadExtension | null {
  return EXTENSIONS[kind].find((extension) => TYPE_BY_EXTENSION[extension] === declaredType.toLowerCase()) ?? null
}

/**
 * Conferência de metadados (tipo declarado e tamanho) que o navegador faz antes do envio: só poupa uma ida ao servidor.
 * Devolve a mensagem de erro, ou `null` se o arquivo parece aceitável.
 */
export function checkFileMeta(kind: UploadKind, file: { type: string; size: number }): string | null {
  if (file.size === 0) return EMPTY_MESSAGE
  if (!extensionFor(kind, file.type)) return FORMAT_MESSAGE[kind]
  if (file.size > MAX_BYTES[kind]) return SIZE_MESSAGE[kind]
  return null
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value)

/** Formato real do conteúdo, lido dos primeiros bytes (assinatura do arquivo); `null` se não for JPG, PNG, WebP nem PDF. */
export function sniffExtension(bytes: Uint8Array): UploadExtension | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // WebP: "RIFF" + tamanho (4 bytes) + "WEBP".
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  return null
}

export type PreparedUpload = { extension: UploadExtension; contentType: string; size: number }
export type UploadCheck = ({ ok: true } & PreparedUpload) | { ok: false; error: string }

/**
 * Conferência de servidor: tipo declarado aceito, tamanho dentro do limite (inclusive no limite) e conteúdo que
 * realmente é do formato declarado. A extensão e o tipo gravados no Storage vêm daqui, nunca do nome enviado.
 */
export function checkUpload(kind: UploadKind, bytes: Uint8Array, declaredType: string): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: EMPTY_MESSAGE }
  const declared = extensionFor(kind, declaredType)
  if (!declared) return { ok: false, error: FORMAT_MESSAGE[kind] }
  if (bytes.length > MAX_BYTES[kind]) return { ok: false, error: SIZE_MESSAGE[kind] }
  if (sniffExtension(bytes) !== declared) return { ok: false, error: CONTENT_MESSAGE }
  return { ok: true, extension: declared, contentType: TYPE_BY_EXTENSION[declared], size: bytes.length }
}

/** Caminho no Storage: `<id da entidade>/<nome aleatório>.<extensão>`, o formato que as constraints e políticas exigem. */
export const objectPath = (entityId: string, extension: UploadExtension, name = crypto.randomUUID()) =>
  `${entityId}/${name}.${extension}`

/** Tamanho legível em MB (1.000.000 de bytes), com vírgula decimal. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`
  return `${(bytes / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
}

/** Documentos privados abertos pela rota `/painel/documentos/:atuacaoId/:tipo`. */
export type DocumentSlug = 'presskit' | 'lista-servicos'
export const documentPath = (profileId: string, slug: DocumentSlug) => `/painel/documentos/${profileId}/${slug}`
