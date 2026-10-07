import {
  BUCKETS,
  checkFileMeta,
  checkUpload,
  EMPTY_MESSAGE,
  FORMAT_MESSAGE,
  objectPath,
  SIZE_MESSAGE,
  type PreparedUpload,
  type UploadKind,
} from '../lib/uploads'
import type { UploadedFiles } from './auth.server'
import { ActionFailure, UNAVAILABLE_MESSAGE } from './mutation.server'
import type { SupabaseServerClient } from './supabase.server'

/**
 * Arquivos no Supabase Storage (RN-09, RN-35). O servidor é quem envia, com a sessão do titular: o navegador nunca fala
 * com o Storage, o upload passa pela conferência de conteúdo daqui e a autorização final são as políticas de
 * `storage.objects` e as RPCs que ligam o arquivo à linha (migração `storage_buckets`). Depois de cada troca, o objeto
 * anterior é apagado, mas só depois de a nova referência estar gravada.
 */

export { publicImageUrl } from './public-image'

export type ReadUpload = ({ ok: true; bytes: Uint8Array } & PreparedUpload) | { ok: false; error: string }

/**
 * Lê o arquivo do campo, confere tipo, tamanho e conteúdo (assinatura real do arquivo, não o nome nem o tipo declarado) e
 * devolve os bytes prontos para o Storage. Falha de validação volta como mensagem em pt-BR, nunca como exceção.
 */
export async function readUpload(files: UploadedFiles, field: string, kind: UploadKind): Promise<ReadUpload> {
  const file = files.get(field)
  if (!file) return { ok: false, error: EMPTY_MESSAGE }
  // Tipo declarado e tamanho já recusam sem ler o arquivo.
  const early = checkFileMeta(kind, file)
  if (early) return { ok: false, error: early }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const checked = checkUpload(kind, bytes, file.type)
  return checked.ok ? { ...checked, bytes } : checked
}

type StorageFailure = { message?: string; status?: number; statusCode?: string | number }

/** O Storage recusou o envio: tamanho, tipo ou política viram mensagem própria; o resto, indisponibilidade. */
export function storageFailure(error: StorageFailure, kind: UploadKind): ActionFailure {
  const status = Number(error.status ?? error.statusCode)
  if (status === 413) return new ActionFailure(422, SIZE_MESSAGE[kind])
  if (status === 415) return new ActionFailure(422, FORMAT_MESSAGE[kind])
  if (status === 401) return new ActionFailure(401, 'Sua sessão expirou. Entre novamente para continuar.')
  if (status === 403) return new ActionFailure(403, 'Você não tem permissão para enviar este arquivo.')
  return new ActionFailure(503, UNAVAILABLE_MESSAGE)
}

/**
 * Envia o arquivo para `<entidade>/<nome aleatório>.<ext>` e devolve o caminho. O nome é novo a cada envio: nada é
 * sobrescrito e a imagem antiga continua válida até a RPC trocar a referência. O cache longo é seguro pelo mesmo motivo.
 */
export async function storeUpload(
  client: SupabaseServerClient,
  kind: UploadKind,
  entityId: string,
  upload: { bytes: Uint8Array } & PreparedUpload,
): Promise<string> {
  const path = objectPath(entityId, upload.extension)
  const { error } = await client.storage.from(BUCKETS[kind]).upload(path, upload.bytes, {
    contentType: upload.contentType,
    upsert: false,
    cacheControl: kind === 'image' ? '31536000' : '3600',
  })
  if (error) throw storageFailure(error, kind)
  return path
}

/**
 * Apaga objetos que deixaram de ser referenciados. É limpeza: uma falha não desfaz a operação que já foi gravada no banco
 * (o objeto fica órfão, sem aparecer em lugar nenhum) e por isso nunca é lançada.
 */
export async function removeStored(client: SupabaseServerClient, kind: UploadKind, paths: unknown[]): Promise<void> {
  const list = paths.filter((path): path is string => typeof path === 'string' && path.length > 0)
  if (list.length === 0) return
  try {
    const { error } = await client.storage.from(BUCKETS[kind]).remove(list)
    if (error) console.error('storage cleanup failed', { bucket: BUCKETS[kind], count: list.length })
  } catch {
    console.error('storage cleanup failed', { bucket: BUCKETS[kind], count: list.length })
  }
}

/** Caminho que uma RPC devolve (`text`, ou campo de um JSON), ou `null`. */
export const returnedPath = (value: unknown, key?: string): string | null => {
  const candidate = key && typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : value
  return typeof candidate === 'string' && candidate ? candidate : null
}
