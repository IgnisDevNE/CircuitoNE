import { Form } from 'react-router'
import { Link } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { fmtDataHora } from '../../lib/utils'
import type { MembroElenco, PerfilAcesso } from '../../server/mappers/collective-manage'
import { Avatar, Badge, Button, Panel } from '../../components/ui/primitives'

export interface EditMembersProps {
  coletivo: { id: string }
  membros: MembroElenco[]
  /** Perfis de acesso que o proprietário pode atribuir. */
  perfis: PerfilAcesso[]
  /** Só o proprietário atribui perfis (RN-17); quem apenas remove membros vê o perfil de cada um. */
  podeAtribuir: boolean
  /** Resultado da última operação; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

function MemberRow({ membro, perfis, podeAtribuir, busy }: { membro: MembroElenco; perfis: PerfilAcesso[]; podeAtribuir: boolean; busy: boolean }) {
  return (
    <li className="space-y-3 border border-[var(--color-line)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar alt={membro.nome} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm">{membro.nome}</span>
          {membro.artista && (
            <Link to={`/artistas/${membro.artista.id}`} className="block truncate font-mono text-xs text-[var(--accent-text)] underline">{membro.artista.nome}</Link>
          )}
          <span className="block font-mono text-xs text-[var(--color-muted)]">
            {membro.ultimaAtividade ? `visto ${fmtDataHora(membro.ultimaAtividade)}` : 'sem atividade registrada'}
          </span>
        </span>
        <Badge tone={membro.dono ? 'ok' : 'neutral'}>{membro.dono ? 'proprietário' : membro.cargo}</Badge>
      </div>

      {!membro.dono && (
        <div className="flex flex-wrap items-end gap-3">
          {podeAtribuir && (
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="assign" />
              <input type="hidden" name="member" value={membro.userId} />
              <label className="font-mono text-xs text-[var(--color-muted)]">
                <span className="sr-only">Perfil de acesso de {membro.nome}</span>
                <select
                  name="role"
                  defaultValue={membro.cargoId}
                  aria-label={`Perfil de acesso de ${membro.nome}`}
                  className="border border-[var(--color-line)] bg-[var(--color-bg-elev)] px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--accent)]"
                >
                  {perfis.map((perfil) => (
                    <option key={perfil.id} value={perfil.id}>{perfil.nome}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm" variant="outline" disabled={busy} aria-label={`Atribuir perfil a ${membro.nome}`}>atribuir</Button>
            </Form>
          )}
          <details className="border border-[var(--color-line)] p-2">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-[var(--color-muted)] hover:text-[var(--foreground)]">remover</summary>
            <Form method="post" className="mt-2 space-y-2">
              <input type="hidden" name="intent" value="remove" />
              <input type="hidden" name="member" value={membro.userId} />
              <p className="max-w-xs font-mono text-xs">{membro.nome} perde o acesso ao coletivo na hora. Para voltar, precisará pedir entrada de novo.</p>
              <Button type="submit" size="sm" variant="danger" disabled={busy} aria-label={`Confirmar a remoção de ${membro.nome}`}>confirmar remoção</Button>
            </Form>
          </details>
        </div>
      )}
    </li>
  )
}

/** `/coletivo/:id/membros`: lista do coletivo com perfil de acesso e atividade; o proprietário nunca é removido nem rebaixado aqui. */
export function EditMembers({ coletivo, membros, perfis, podeAtribuir, feedback, busy = false }: EditMembersProps) {
  return (
    <Panel title="membros do coletivo">
      {feedback && (
        <p role={feedback.ok ? 'status' : 'alert'} className={`mb-4 font-mono text-sm ${feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]'}`}>
          {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
        </p>
      )}
      <p className="mb-4 font-mono text-xs text-[var(--color-muted)]">
        {podeAtribuir ? (
          <>
            Atribua perfis de acesso aos membros; os perfis são criados em <Link to={`/coletivo/${coletivo.id}/editar`} className="text-[var(--accent-text)] underline">Editar</Link>.
          </>
        ) : (
          'Seu perfil permite remover membros comuns. Atribuir perfis de acesso é exclusivo do proprietário.'
        )}{' '}
        O proprietário não pode ser removido nem rebaixado: para trocá-lo, transfira a propriedade.
      </p>
      <ul className="space-y-2" aria-label="Membros">
        {membros.map((membro) => (
          <MemberRow key={membro.userId} membro={membro} perfis={perfis} podeAtribuir={podeAtribuir} busy={busy} />
        ))}
      </ul>
    </Panel>
  )
}
