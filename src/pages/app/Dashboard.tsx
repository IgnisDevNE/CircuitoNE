import { Link } from 'react-router'
import { Badge, Empty, LinkButton, Panel } from '../../components/ui/primitives'
import { BootLog } from '../../components/ui/anim'
import { EventSheetLink } from '../../components/ui/EventSheet'
import { fmtDataHora } from '../../lib/utils'
import { TIPO_LABEL } from '../../data/types'
import type { ColetivoSituacao, MeuColetivo, MeuPerfil, ProximoEvento } from '../../server/mappers/account'

export interface DashboardProps {
  nome: string
  perfis: MeuPerfil[]
  coletivos: MeuColetivo[]
  naoLidas: number
  proximos: ProximoEvento[]
}

const SITUACAO: Record<ColetivoSituacao, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  approved: { label: 'ativo', tone: 'ok' },
  pending: { label: 'em análise', tone: 'warn' },
  rejected: { label: 'recusado', tone: 'warn' },
  suspended: { label: 'suspenso', tone: 'warn' },
  closed: { label: 'encerrado', tone: 'neutral' },
}

export function Dashboard({ nome, perfis, coletivos, naoLidas, proximos }: DashboardProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-glow">
          olá, {nome.split(' ')[0]}<span className="cursor-blink text-[var(--accent-text)]">_</span>
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">atuações ativas</p>
        {perfis.length === 0 ? (
          <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">Nenhuma atuação cadastrada.</p>
        ) : (
          <ul className="mt-1 space-y-1 font-mono text-sm">
            {perfis.map((a, i) => (
              <li key={a.id} className="animate-fade-up flex flex-wrap items-center gap-2" style={{ animationDelay: `${i * 120}ms` }}>
                <span aria-hidden className="text-[var(--color-ok)]">›</span>
                <span className="text-[var(--foreground)]">{TIPO_LABEL[a.tipo]}</span>
                <span className="text-[var(--color-muted)]">— {a.nome}</span>
                {a.tipo === 'artista' && (
                  <Badge tone={a.publicado ? 'ok' : 'neutral'}>{a.publicado ? 'perfil público' : 'não publicado'}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <BootLog className="border border-[var(--color-line)] p-4 lg:col-span-3" lines={[
          `atuações: ${perfis.length}`,
          `coletivos vinculados: ${coletivos.length}`,
          `eventos com você na line-up: ${proximos.length}`,
          `mensagens não lidas: ${naoLidas}`,
        ]} />

        <Panel title="próximos eventos" className="lg:col-span-2">
          {proximos.length === 0 ? (
            <Empty>Nenhum evento com as suas atuações na line-up.</Empty>
          ) : (
            <ul className="space-y-2">
              {proximos.map(({ evento, como }) => (
                <li key={evento.id}>
                  <EventSheetLink eventId={evento.id} nome={evento.nome} className="flex items-center justify-between gap-4 border border-[var(--color-line)] p-3 hover:border-[var(--accent)]">
                    <span>
                      <span className="block font-display font-bold">{evento.nome}</span>
                      <span className="block font-mono text-xs text-[var(--color-muted)]">{fmtDataHora(evento.inicio)} · {evento.cidade}/{evento.estado}</span>
                      <span className="block font-mono text-xs text-[var(--color-muted)]">como {como.join(', ')}</span>
                    </span>
                    <span aria-hidden className="text-[var(--accent-text)]">→</span>
                  </EventSheetLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="meus coletivos" actions={<LinkButton to="/painel/coletivos" size="sm" variant="ghost">abrir<span className="sr-only"> meus coletivos</span></LinkButton>}>
            {coletivos.length === 0 ? (
              <Empty>Você ainda não participa de coletivos.</Empty>
            ) : (
              <ul className="space-y-3">
                {coletivos.map((c) => {
                  const situacao = SITUACAO[c.situacao]
                  return (
                    <li key={c.id} className="border-l-2 border-[var(--color-line)] pl-3">
                      {c.situacao === 'approved' ? (
                        <Link to={`/coletivo/${c.id}/painel`} className="font-display font-bold hover:text-[var(--accent-text)]">{c.nome}</Link>
                      ) : (
                        <span className="font-display font-bold">{c.nome}</span>
                      )}
                      <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
                        <span>{c.dono ? `${c.cargo} · responsável` : c.cargo}</span>
                        {c.situacao !== 'approved' && <Badge tone={situacao.tone}>{situacao.label}</Badge>}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="mensagens" actions={<LinkButton to="/painel/mensagens" size="sm" variant="ghost">abrir<span className="sr-only"> mensagens</span></LinkButton>}>
            <p className="font-mono text-sm" role="status">
              {naoLidas === 0
                ? 'Nenhuma mensagem não lida.'
                : naoLidas === 1
                  ? '1 mensagem não lida.'
                  : `${naoLidas} mensagens não lidas.`}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
