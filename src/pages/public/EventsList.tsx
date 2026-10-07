import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, Empty, PRESSED_BADGE as pressed, SectionHeading } from '../../components/ui/primitives'
import { DuotoneImage } from '../../components/ui/DuotoneImage'
import { fmtDataHora, tipoEventoLabel } from '../../lib/utils'
import type { Evento } from '../../data/types'

/** Agenda: a ordem já vem do banco (em andamento primeiro, depois futuros por início). */
export function EventsList({ ongoing, future }: { ongoing: Evento[]; future: Evento[] }) {
  const [estado, setEstado] = useState<string | null>(null)

  const todos = [...ongoing, ...future]
  const emAndamento = new Set(ongoing.map((e) => e.id))
  const visiveis = todos.filter((e) => !estado || e.estado === estado)
  const estados = [...new Set(todos.map((e) => e.estado))]

  return (
    <div>
      <SectionHeading prompt="grep --upcoming" sub="Agenda de eventos em andamento e futuros no circuito.">eventos.log</SectionHeading>

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        <button onClick={() => setEstado(null)} aria-pressed={estado === null} className="cursor-pointer">
          <Badge tone={estado === null ? 'accent' : 'neutral'} className={estado === null ? pressed : undefined}>todos os estados</Badge>
        </button>
        {estados.map((s) => (
          <button key={s} onClick={() => setEstado(s === estado ? null : s)} aria-pressed={estado === s} className="cursor-pointer">
            <Badge tone={estado === s ? 'accent' : 'neutral'} className={estado === s ? pressed : undefined}>{s}</Badge>
          </button>
        ))}
      </div>

      {/* Os cartões são h3: o h2 oculto mantém a ordem dos títulos (h1, h2, h3) para quem navega por eles. */}
      <h2 className="sr-only">Eventos</h2>
      {visiveis.length === 0 ? (
        <Empty>Nenhum evento futuro cadastrado.</Empty>
      ) : (
        <ul className="space-y-4">
          {visiveis.map((e) => (
            <li key={e.id}>
              <Link to={`/eventos/${e.id}`} className="group grid gap-4 border border-[var(--color-line)] transition-colors hover:border-[var(--accent)] sm:grid-cols-[220px_1fr]">
                <DuotoneImage src={e.capa} alt={`Capa do evento ${e.nome}`} className="aspect-[16/9] w-full sm:aspect-auto sm:h-full" />
                <div className="flex flex-col justify-center p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{tipoEventoLabel(e)}</Badge>
                    {e.estilo && <Badge tone="neutral">{e.estilo}</Badge>}
                    {e.gratuito ? <Badge tone="ok">Gratuito</Badge> : <Badge tone="neutral">Ingresso</Badge>}
                    {emAndamento.has(e.id) && <Badge tone="warn">Em andamento</Badge>}
                  </div>
                  <h3 className="font-display text-xl font-bold group-hover:text-[var(--accent-text)]">{e.nome}</h3>
                  <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">{fmtDataHora(e.inicio)}</p>
                  <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">{e.local} · {e.cidade}/{e.estado}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
