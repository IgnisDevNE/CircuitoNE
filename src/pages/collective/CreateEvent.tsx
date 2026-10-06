import { useState } from 'react'
import type { ActionResult } from '../../lib/action-result'
import type { ArtistaOpcao } from '../../server/mappers/events-manage'
import { EMPTY_EVENT_VALUES, EventForm } from './EventForm'

export interface CreateEventProps {
  /** Identificador da solicitação, gerado ao carregar o formulário: reenviar o mesmo formulário não cria outro evento. */
  requestId: string
  artistas: ArtistaOpcao[]
  /** Resultado da última tentativa; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

/** `/coletivo/:id/eventos/novo`: cria um rascunho, que só vira público quando alguém com "publicar eventos" o publica (RN-27). */
export function CreateEvent({ requestId, artistas, feedback, busy = false }: CreateEventProps) {
  // Fixo enquanto o formulário estiver montado, mesmo que o loader rode de novo depois de uma recusa.
  const [request] = useState(requestId)
  const failed = feedback && !feedback.ok ? feedback : null
  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-[var(--color-muted)]">
        O evento nasce como <strong>rascunho</strong>: ele só aparece na agenda pública depois de publicado.
      </p>
      {failed && (
        <p role="alert" className="font-mono text-sm text-[var(--accent-text)]">
          [erro] {failed.error}
        </p>
      )}
      <EventForm
        initial={EMPTY_EVENT_VALUES}
        artistas={artistas}
        errors={failed?.fields}
        busy={busy}
        hidden={{ request }}
        submitLabel="salvar rascunho"
      />
    </div>
  )
}
