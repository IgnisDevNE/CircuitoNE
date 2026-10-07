import { Form, Link } from 'react-router'
import { EVENTO_TIPO_LABEL } from '../../data/types'
import type { ActionResult } from '../../lib/action-result'
import { fmtDataHora } from '../../lib/utils'
import type { ArtistaOpcao, EventActions, EventoGerido } from '../../server/mappers/events-manage'
import { Badge, Button, Panel } from '../../components/ui/primitives'
import { Markdown } from '../../components/ui/Markdown'
import { eventToFormValues, EventForm } from './EventForm'

export interface ManageEventProps {
  evento: EventoGerido
  acoes: EventActions
  artistas: ArtistaOpcao[]
  /** Resultado da última operação; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

const SITUACAO = {
  draft: { label: 'rascunho', tone: 'warn' },
  published: { label: 'publicado', tone: 'ok' },
  cancelled: { label: 'cancelado', tone: 'warn' },
} as const

const tipo = (evento: EventoGerido) => (evento.tipo === 'outros' && evento.tipoOutro ? evento.tipoOutro : EVENTO_TIPO_LABEL[evento.tipo])

/** `/coletivo/:id/eventos/:eventId`: situação do evento e as ações que as permissões e o estado atual permitem. */
export function ManageEvent({ evento, acoes, artistas, feedback, busy = false }: ManageEventProps) {
  const situacao = SITUACAO[evento.situacao]
  const failed = feedback && !feedback.ok ? feedback : null
  return (
    <div className="space-y-6">
      <Link to={`/coletivo/${evento.coletivoId}/painel`} className="font-mono text-xs text-[var(--color-muted)] hover:text-[var(--accent-text)]">← dashboard do coletivo</Link>

      {feedback && (
        <p role={feedback.ok ? 'status' : 'alert'} className={`font-mono text-sm ${feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]'}`}>
          {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
        </p>
      )}

      <Panel title="evento">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-display text-xl font-bold">{evento.nome}</span>
              <Badge tone={situacao.tone}>{situacao.label}</Badge>
              {evento.situacao !== 'cancelled' && evento.periodo === 'ongoing' && <Badge tone="ok">em andamento</Badge>}
              {evento.periodo === 'past' && <Badge>encerrado</Badge>}
            </p>
            <p className="font-mono text-xs text-[var(--color-muted)]">
              {tipo(evento)} · {fmtDataHora(evento.inicio)}
              {evento.fim ? ` até ${fmtDataHora(evento.fim)}` : ''} · {evento.local}, {evento.cidade}/{evento.estado}
            </p>
            <p className="font-mono text-xs text-[var(--color-muted)]">versão {evento.versao}</p>
            {evento.reagendadoEm && <p className="font-mono text-xs text-[var(--color-warn)]">Evento reagendado: a página pública informa a nova data.</p>}
          </div>
          {evento.situacao === 'published' && (
            <Link to={`/eventos/${evento.id}`} className="font-mono text-xs text-[var(--accent-text)] hover:underline">ver página pública ↗</Link>
          )}
        </div>

        {(acoes.publicar || acoes.cancelar) && (
          <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-[var(--color-line)] pt-4">
            {acoes.publicar && (
              <Form method="post">
                <input type="hidden" name="version" value={evento.versao} />
                <Button type="submit" name="intent" value="publish" variant="solid" disabled={busy}>publicar evento</Button>
              </Form>
            )}
            {acoes.cancelar && (
              <details className="border border-[var(--color-line)] p-2">
                <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-[var(--color-muted)] hover:text-[var(--foreground)]">cancelar evento</summary>
                <Form method="post" className="mt-3 space-y-3">
                  <input type="hidden" name="version" value={evento.versao} />
                  <p className="max-w-md font-mono text-xs">
                    {evento.situacao === 'published'
                      ? 'O evento sai da agenda pública e das agendas dos artistas; o link direto continua mostrando um aviso de cancelamento. Não dá para desfazer.'
                      : 'O rascunho será marcado como cancelado e não poderá mais ser editado nem publicado. Não dá para desfazer.'}
                  </p>
                  <Button type="submit" name="intent" value="cancel" variant="danger" size="sm" disabled={busy}>confirmar cancelamento</Button>
                </Form>
              </details>
            )}
          </div>
        )}
      </Panel>

      {acoes.editar ? (
        // A versão na chave refaz o formulário com os dados do banco depois de salvar ou de um conflito de versão.
        <EventForm
          key={evento.versao}
          initial={eventToFormValues(evento)}
          artistas={artistas}
          errors={failed?.fields}
          busy={busy}
          hidden={{ intent: 'update', version: String(evento.versao) }}
          upload={{ capaEnviada: evento.capaEnviada }}
          submitLabel="salvar alterações"
          note={evento.situacao === 'published' ? 'Este evento está publicado: ao salvar, a alteração aparece na página pública imediatamente.' : undefined}
        />
      ) : (
        <Panel title="detalhes">
          <p className="mb-3 font-mono text-xs text-[var(--color-muted)]">
            {evento.situacao === 'cancelled'
              ? 'Evento cancelado: não pode mais ser editado.'
              : evento.situacao === 'published'
                ? 'Alterar um evento publicado exige as permissões de editar e de publicar eventos.'
                : 'Seu perfil não permite editar este evento.'}
          </p>
          {evento.descricao.trim() ? <Markdown source={evento.descricao} /> : <p className="font-mono text-xs text-[var(--color-muted)]">Sem descrição.</p>}
          {evento.lineup.length > 0 && (
            <>
              <h3 className="mt-4 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">lineup</h3>
              <ul className="mt-1 flex flex-wrap gap-2 font-mono text-sm">
                {evento.lineup.map((item, i) => (
                  <li key={`${item.nome}-${i}`}>{item.nome}{item.artistaId ? ' (hub)' : ''}</li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}
    </div>
  )
}
