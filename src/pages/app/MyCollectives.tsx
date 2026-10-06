import { Form } from 'react-router'
import { Link } from '../../router'
import { TIPO_LABEL } from '../../data/types'
import type { ActionResult } from '../../lib/action-result'
import { fmtData } from '../../lib/utils'
import type { ColetivoSituacao } from '../../server/mappers/account'
import type { MyCollectivesData, SituacaoPedido } from '../../server/mappers/collective-area'
import { Badge, Button, Empty, Panel } from '../../components/ui/primitives'
import { Select, Textarea } from '../../components/ui/form'

export interface MyCollectivesProps extends MyCollectivesData {
  /** Resultado da última operação; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

const SITUACAO: Record<ColetivoSituacao, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  approved: { label: 'ativo', tone: 'ok' },
  pending: { label: 'em análise', tone: 'warn' },
  rejected: { label: 'recusado', tone: 'warn' },
  suspended: { label: 'suspenso', tone: 'warn' },
  closed: { label: 'encerrado', tone: 'neutral' },
}

const PEDIDO: Record<SituacaoPedido, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  pending: { label: 'pendente', tone: 'warn' },
  approved: { label: 'aprovado', tone: 'ok' },
  rejected: { label: 'recusado', tone: 'warn' },
  cancelled: { label: 'cancelado', tone: 'neutral' },
}

export function MyCollectives({ coletivos, perfis, pedidos, disponiveis, feedback, busy = false }: MyCollectivesProps) {
  const livres = disponiveis.filter((c) => !c.pendente)
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ coletivos_e_produtoras</h1>

      {feedback && (
        <p role={feedback.ok ? 'status' : 'alert'} className={`font-mono text-sm ${feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]'}`}>
          {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
        </p>
      )}

      {coletivos.length === 0 ? (
        <Empty>Você ainda não faz parte de nenhum coletivo/produtora.</Empty>
      ) : (
        <ul aria-label="Meus coletivos" className="grid gap-4 md:grid-cols-2">
          {coletivos.map((c) => {
            const situacao = SITUACAO[c.situacao]
            return (
              <li key={c.id}>
                <Panel title={c.tipo}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg font-bold">{c.nome}</h3>
                      <p className="font-mono text-xs text-[var(--color-muted)]">{c.cidade}/{c.estado}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={c.dono ? 'ok' : 'accent'}>{c.dono ? `${c.cargo} · responsável` : c.cargo}</Badge>
                      {c.situacao !== 'approved' && <Badge tone={situacao.tone}>{situacao.label}</Badge>}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link to={`/coletivo/${c.id}/painel`} className="inline-flex items-center border border-[var(--accent)] px-3 py-1.5 font-mono text-xs uppercase tracking-widest hover:bg-[var(--accent)]/15">
                      {c.situacao === 'approved' ? 'abrir dashboard →' : 'ver situação →'}
                    </Link>
                    {c.situacao === 'approved' && (
                      <Link to={`/coletivos/${c.id}`} className="inline-flex items-center font-mono text-xs text-[var(--accent-text)] hover:underline">perfil público</Link>
                    )}
                  </div>
                </Panel>
              </li>
            )
          })}
        </ul>
      )}

      <Panel title="meus pedidos de entrada">
        {pedidos.length === 0 ? (
          <Empty>Você ainda não pediu entrada em nenhum coletivo.</Empty>
        ) : (
          <ul className="space-y-2">
            {pedidos.map((pedido) => {
              const situacao = PEDIDO[pedido.situacao]
              return (
                <li key={pedido.id} className="flex flex-wrap items-center justify-between gap-3 border border-[var(--color-line)] p-3">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold">{pedido.coletivoNome ?? 'Coletivo indisponível'}</span>
                      <Badge tone={situacao.tone}>{situacao.label}</Badge>
                    </span>
                    <span className="block font-mono text-xs text-[var(--color-muted)]">enviado em {fmtData(pedido.criadoEm)}</span>
                  </span>
                  {pedido.situacao === 'pending' && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="cancel" />
                      <input type="hidden" name="request" value={pedido.id} />
                      <Button type="submit" size="sm" variant="danger" disabled={busy} aria-label={`Cancelar pedido para ${pedido.coletivoNome ?? 'o coletivo'}`}>cancelar pedido</Button>
                    </Form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="solicitar acesso">
        {livres.length === 0 ? (
          <Empty>Nenhum coletivo ou produtora aprovado disponível para novos pedidos.</Empty>
        ) : (
          // A chave remonta o formulário depois de cada pedido enviado, limpando a apresentação.
          <Form method="post" key={pedidos.length} className="space-y-4">
            <input type="hidden" name="intent" value="request" />
            <p className="font-mono text-sm text-[var(--color-muted)]">
              Escolha um coletivo/produtora aprovado. Quem gere os pedidos analisa a sua apresentação; se aprovado, você entra como Membro.
            </p>
            <Select
              label="Coletivo/Produtora"
              name="collective"
              required
              defaultValue=""
              options={[
                { value: '', label: '— selecione —' },
                ...livres.map((c) => ({ value: c.id, label: `${c.nome} (${c.tipo})` })),
              ]}
            />
            <Select
              label="Apresentar como"
              name="profile"
              defaultValue=""
              hint="opcional: uma das suas atuações, que quem analisa o pedido poderá ver"
              options={[
                { value: '', label: 'Só o meu nome' },
                ...perfis.map((p) => ({ value: p.id, label: `${TIPO_LABEL[p.tipo]} · ${p.nome}` })),
              ]}
            />
            <Textarea label="Mensagem" name="message" maxLength={2000} hint="opcional, até 2.000 caracteres" />
            <Button type="submit" variant="solid" disabled={busy}>enviar solicitação</Button>
          </Form>
        )}
        {disponiveis.some((c) => c.pendente) && (
          <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">
            Coletivos com pedido pendente não aparecem na lista; cancele o pedido acima para enviar outro.
          </p>
        )}
      </Panel>
    </div>
  )
}
