import { Form } from 'react-router'
import { type ActionResult } from '../../lib/account-forms'
import { DOCUMENT_MAX_BYTES, documentPath, formatSize, GALLERY_MAX, IMAGE_MAX_BYTES } from '../../lib/uploads'
import type { ImagemPerfil, PerfilEdicao } from '../../server/mappers/account-settings'
import { Button, Panel } from '../../components/ui/primitives'
import { FileField } from '../../components/ui/FileField'
import { MfaDevNotice } from '../../components/ui/MfaDevNotice'
import { errorsFor, FormFeedback } from './account-ui'

type Props = {
  perfil: PerfilEdicao
  result?: ActionResult
  busy?: boolean
  /** Ambiente dev: a MFA não é exigida; o texto sobre quem abre o arquivo deixa de citá-la e traz o aviso. */
  mfaOpcional?: boolean
}

const MB = (bytes: number) => (bytes / 1_000_000).toLocaleString('pt-BR')

function Thumb({ image, alt, className }: { image: ImagemPerfil; alt: string; className?: string }) {
  return image.url ? (
    <img src={image.url} alt={alt} loading="lazy" className={className} />
  ) : (
    <span className="flex aspect-square items-center justify-center border border-[var(--color-line)] font-mono text-xs text-[var(--color-muted)]">sem prévia</span>
  )
}

/** Foto principal e galeria do artista (RN-09): até 10 imagens JPG, PNG ou WebP de até 5 MB, mais a foto principal. */
export function PhotosPanel({ perfil, result, busy }: Props) {
  const main = perfil.imagens.find((image) => image.posicao === 0)
  const gallery = perfil.imagens.filter((image) => image.posicao >= 1).sort((a, b) => a.posicao - b.posicao)
  const mainErrors = errorsFor(result, 'upload-photo')
  const galleryErrors = errorsFor(result, 'upload-gallery')
  const full = gallery.length >= GALLERY_MAX
  return (
    <Panel title="fotos">
      <p className="mb-4 font-mono text-xs text-[var(--color-muted)]">
        Aparecem na página pública do artista. JPG, PNG ou WebP, até {MB(IMAGE_MAX_BYTES)} MB por imagem. A foto principal não conta na galeria.
        Se o perfil não estiver público, as imagens só ficam visíveis para você.
      </p>

      <section aria-labelledby="foto-principal" className="space-y-3">
        <h3 id="foto-principal" className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">foto principal</h3>
        {main && (
          <div className="flex flex-wrap items-end gap-3">
            <Thumb image={main} alt={`Foto principal de ${perfil.nome}`} className="h-40 w-32 border border-[var(--color-line)] object-cover" />
            <Form method="post">
              <input type="hidden" name="intent" value="remove-photo" />
              <input type="hidden" name="imagem" value={main.id} />
              <Button type="submit" variant="danger" size="sm" disabled={busy} aria-label="Remover a foto principal">remover foto</Button>
            </Form>
          </div>
        )}
        <Form method="post" encType="multipart/form-data" className="max-w-md space-y-3">
          <input type="hidden" name="intent" value="upload-photo" />
          <FileField label={main ? 'Trocar a foto principal' : 'Enviar foto principal'} kind="image" error={mainErrors.arquivo} />
          <FormFeedback result={result} intent={['upload-photo', 'remove-photo']} />
          <Button type="submit" variant="solid" size="sm" disabled={busy}>{busy ? 'enviando…' : main ? 'trocar foto' : 'enviar foto'}</Button>
        </Form>
      </section>

      <section aria-labelledby="galeria" className="mt-8 space-y-3">
        <h3 id="galeria" className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">galeria ({gallery.length}/{GALLERY_MAX})</h3>
        {gallery.length > 0 && (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((image, index) => (
              <li key={image.id} className="space-y-2 border border-[var(--color-line)] p-2">
                <Thumb image={image} alt={`Imagem ${index + 1} da galeria de ${perfil.nome}`} className="aspect-square w-full object-cover" />
                <p className="font-mono text-[0.65rem] text-[var(--color-muted)]">#{index + 1} · {formatSize(image.bytes)}</p>
                <div className="flex flex-wrap gap-1">
                  {(['earlier', 'later'] as const).map((direction) => (
                    <Form key={direction} method="post">
                      <input type="hidden" name="intent" value="move-gallery" />
                      <input type="hidden" name="imagem" value={image.id} />
                      <input type="hidden" name="direcao" value={direction} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={busy || (direction === 'earlier' ? index === 0 : index === gallery.length - 1)}
                        aria-label={`${direction === 'earlier' ? 'Mover para antes' : 'Mover para depois'}: imagem ${index + 1}`}
                      >
                        {direction === 'earlier' ? '←' : '→'}
                      </Button>
                    </Form>
                  ))}
                  <Form method="post">
                    <input type="hidden" name="intent" value="remove-gallery" />
                    <input type="hidden" name="imagem" value={image.id} />
                    <Button type="submit" variant="danger" size="sm" disabled={busy} aria-label={`Remover a imagem ${index + 1} da galeria`}>remover</Button>
                  </Form>
                </div>
              </li>
            ))}
          </ol>
        )}
        {full ? (
          <p className="font-mono text-xs text-[var(--color-muted)]">A galeria está cheia. Remova uma imagem para enviar outra.</p>
        ) : (
          <Form method="post" encType="multipart/form-data" className="max-w-md space-y-3">
            <input type="hidden" name="intent" value="upload-gallery" />
            <FileField label="Adicionar imagem à galeria" kind="image" error={galleryErrors.arquivo} />
            <Button type="submit" variant="solid" size="sm" disabled={busy}>{busy ? 'enviando…' : 'adicionar à galeria'}</Button>
          </Form>
        )}
        <FormFeedback result={result} intent={['upload-gallery', 'remove-gallery', 'move-gallery']} />
      </section>
    </Panel>
  )
}

/**
 * Documento privado da atuação (RN-35): presskit em PDF para artista; lista de serviços e equipamentos em PDF para
 * serviços. Visível só para o titular e para proprietários de coletivos aprovados, com MFA (RN-07).
 */
export function DocumentPanel({ perfil, result, busy, mfaOpcional = false }: Props) {
  const artist = perfil.tipo === 'artista'
  if (!perfil.profissional || (!artist && perfil.tipo !== 'servicos')) return null
  const bytes = artist ? perfil.profissional.presskitPdfBytes : perfil.profissional.listaServicosBytes
  const slug = artist ? 'presskit' : 'lista-servicos'
  const title = artist ? 'presskit em PDF' : 'lista de serviços e equipamentos (PDF)'
  const errors = errorsFor(result, 'upload-document')
  return (
    <Panel title={title}>
      <p className="mb-4 font-mono text-xs text-[var(--color-muted)]">
        {artist
          ? 'O presskit é um link ou um PDF, nunca os dois: enviar o PDF remove o link informado nos dados profissionais. '
          : ''}
        PDF de até {MB(DOCUMENT_MAX_BYTES)} MB. Privado: não aparece em nenhuma página pública; só você e proprietários de coletivos aprovados{mfaOpcional ? '' : ', com MFA,'} conseguem abri-lo.
      </p>
      <MfaDevNotice show={mfaOpcional} className="mb-4" />
      {bytes !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <a
            href={documentPath(perfil.id, slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-[var(--accent-text)] hover:underline"
          >
            abrir o PDF enviado ({formatSize(bytes)}) ↗
          </a>
          <Form method="post">
            <input type="hidden" name="intent" value="remove-document" />
            <Button type="submit" variant="danger" size="sm" disabled={busy}>remover PDF</Button>
          </Form>
        </div>
      )}
      <Form method="post" encType="multipart/form-data" className="max-w-md space-y-3">
        <input type="hidden" name="intent" value="upload-document" />
        <FileField label={bytes !== null ? 'Substituir o PDF' : 'Enviar PDF'} kind="document" error={errors.arquivo} />
        <FormFeedback result={result} intent={['upload-document', 'remove-document']} />
        <Button type="submit" variant="solid" size="sm" disabled={busy}>{busy ? 'enviando…' : bytes !== null ? 'substituir PDF' : 'enviar PDF'}</Button>
      </Form>
    </Panel>
  )
}
