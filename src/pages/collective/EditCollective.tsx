import { Form, Link } from 'react-router'
import type { ActionResult } from '../../lib/action-result'
import { PERMISSIONS, PERMISSION_LABELS } from '../../lib/collective-access'
import { CLOSE_CONFIRMATION } from '../../lib/collective-forms'
import type { ColetivoEdicao, EstadoMfa, MembroElenco, PerfilAcesso } from '../../server/mappers/collective-manage'
import { Badge, Button, Panel } from '../../components/ui/primitives'
import { Checkbox, Input, Select, Textarea } from '../../components/ui/form'
import { LocationFields } from '../../components/ui/LocationFields'
import { MfaDevNotice } from '../../components/ui/MfaDevNotice'

export interface EditCollectiveProps {
  coletivo: ColetivoEdicao
  /** Coletivo aprovado: só então existem perfis de acesso, transferência e encerramento. */
  aprovado: boolean
  perfis: PerfilAcesso[]
  /** Membros que podem receber a propriedade. */
  sucessores: MembroElenco[]
  /** Verificação em duas etapas da sessão atual: a transferência exige `confirmada`. */
  mfa: EstadoMfa
  /** Ambiente dev: a transferência não exige MFA; a seção traz o aviso de que produção a exige. */
  mfaOpcional?: boolean
  /** Resultado da última operação; só existe depois de o banco responder. */
  feedback?: ActionResult | null
  busy?: boolean
}

const MFA_TEXT: Record<Exclude<EstadoMfa, 'confirmada'>, string> = {
  ativar: 'A sua conta ainda não tem a verificação em duas etapas. Ative um aplicativo autenticador em Segurança para poder transferir a propriedade.',
  confirmar: 'Sua conta tem a verificação em duas etapas, mas esta sessão ainda não foi confirmada com o segundo fator. Confirme-a em Segurança e volte aqui.',
}

const SITUACAO = {
  pending: { label: 'em análise', tone: 'warn' },
  rejected: { label: 'recusado', tone: 'warn' },
  approved: { label: 'aprovado', tone: 'ok' },
  suspended: { label: 'suspenso', tone: 'warn' },
} as const

function Feedback({ feedback }: { feedback?: ActionResult | null }) {
  if (!feedback) return null
  return (
    <p role={feedback.ok ? 'status' : 'alert'} className={`font-mono text-sm ${feedback.ok ? 'text-[var(--color-ok)]' : 'text-[var(--accent-text)]'}`}>
      {feedback.ok ? feedback.message : `[erro] ${feedback.error}`}
    </p>
  )
}

function PermissionChecklist({ selected, name = 'permission' }: { selected: readonly string[]; name?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
        <span aria-hidden className="text-[var(--accent-text)]">$ </span>permissões
      </legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {PERMISSIONS.map((permission) => (
          <Checkbox key={permission} name={name} value={permission} defaultChecked={selected.includes(permission)} label={PERMISSION_LABELS[permission]} />
        ))}
      </div>
    </fieldset>
  )
}

function RoleEditor({ perfil, busy }: { perfil: PerfilAcesso; busy: boolean }) {
  if (perfil.embutido)
    return (
      <li className="border border-[var(--color-line)] p-3">
        <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
          {perfil.nome} <Badge>perfil inicial</Badge>
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">Sem permissões operacionais; recebido por quem entra. Não pode ser alterado nem excluído.</p>
      </li>
    )
  return (
    <li className="border border-[var(--color-line)] p-3">
      <details>
        <summary className="cursor-pointer font-mono text-sm">
          {perfil.nome}{' '}
          <span className="text-xs text-[var(--color-muted)]">
            ({perfil.permissoes.length === 0 ? 'sem permissões' : `${perfil.permissoes.length} permiss${perfil.permissoes.length === 1 ? 'ão' : 'ões'}`})
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="role-save" />
            <input type="hidden" name="role" value={perfil.id} />
            <Input label="Nome do perfil" name="role_name" defaultValue={perfil.nome} maxLength={100} required />
            <PermissionChecklist selected={perfil.permissoes} />
            <Button type="submit" variant="solid" size="sm" disabled={busy}>salvar perfil</Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="role-delete" />
            <input type="hidden" name="role" value={perfil.id} />
            <Button type="submit" variant="danger" size="sm" disabled={busy} aria-label={`Excluir o perfil ${perfil.nome}`}>excluir perfil</Button>
          </Form>
        </div>
      </details>
    </li>
  )
}

/** `/coletivo/:id/editar`: cadastro, perfis de acesso e zona de perigo; só o proprietário (RN-17/19/21). */
export function EditCollective({ coletivo, aprovado, perfis, sucessores, mfa, mfaOpcional = false, feedback, busy = false }: EditCollectiveProps) {
  const failed = feedback && !feedback.ok ? feedback : null
  const errors = failed?.fields ?? {}
  const situacao = SITUACAO[coletivo.situacao]
  const recusado = coletivo.situacao === 'rejected'
  return (
    <div className="space-y-6">
      <Feedback feedback={feedback} />

      {!aprovado && (
        <p role="note" className="font-mono text-xs text-[var(--color-muted)]">
          <Badge tone={situacao.tone}>{situacao.label}</Badge>{' '}
          {recusado
            ? 'Corrija os dados e reenvie para uma nova análise. As funções internas só abrem depois da aprovação.'
            : 'Você pode corrigir os dados enquanto a análise não termina. As funções internas só abrem depois da aprovação.'}
        </p>
      )}

      <Panel title="informações">
        {/* A versão na chave refaz o formulário com os dados do banco depois de salvar ou de um conflito de versão. */}
        <Form method="post" key={coletivo.versao} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="version" value={coletivo.versao} />
          <input type="hidden" name="kind" value={coletivo.tipo === 'produtora' ? 'producer' : 'collective'} />
          <Input label="Nome" name="name" defaultValue={coletivo.nome} error={errors.name} maxLength={200} required />
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]"><span aria-hidden className="text-[var(--accent-text)]">$ </span>Tipo</p>
            <p className="px-3 py-2 font-mono text-sm">{coletivo.tipo === 'produtora' ? 'Produtora' : 'Coletivo'}</p>
            <p className="font-mono text-xs text-[var(--color-muted)]">O tipo não muda depois do cadastro.</p>
          </div>
          <LocationFields ufName="state_code" cityName="city" defaultUf={coletivo.estado} defaultCity={coletivo.cidade} ufError={errors.state_code} cityError={errors.city} />
          <div className="sm:col-span-2"><Input label="Área de atuação" name="activity" defaultValue={coletivo.atuacao} error={errors.activity} maxLength={200} required /></div>
          <div className="sm:col-span-2"><Textarea label="Descrição" name="description" defaultValue={coletivo.descricao} error={errors.description} rows={5} required /></div>
          <div className="sm:col-span-2">
            <Input
              label="CNPJ"
              name="cnpj"
              defaultValue={coletivo.cnpj}
              error={errors.cnpj}
              required={coletivo.tipo === 'produtora'}
              hint={coletivo.tipo === 'produtora' ? 'obrigatório para produtoras' : 'opcional'}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" name="intent" value="save" variant="solid" disabled={busy}>salvar</Button>
            {recusado && <Button type="submit" name="intent" value="resubmit" variant="outline" disabled={busy}>salvar e reenviar para análise</Button>}
            <span className="font-mono text-xs text-[var(--color-muted)]">versão {coletivo.versao}</span>
          </div>
        </Form>
      </Panel>

      {aprovado && (
        <>
          <Panel title="perfis de acesso">
            <p className="mb-4 font-mono text-xs text-[var(--color-muted)]">
              Cada perfil reúne permissões específicas. Só você cria, edita e atribui perfis (em <Link to={`/coletivo/${coletivo.id}/membros`} className="text-[var(--accent-text)] underline">Membros</Link>);
              transferir a propriedade e encerrar o coletivo nunca são delegáveis. Mudanças valem já na próxima operação de quem tem o perfil.
            </p>
            <ul className="space-y-2" aria-label="Perfis de acesso">
              {perfis.map((perfil) => (
                <RoleEditor key={`${perfil.id}:${perfil.nome}:${perfil.permissoes.join(',')}`} perfil={perfil} busy={busy} />
              ))}
            </ul>
            <Form method="post" className="mt-4 space-y-3 border-t border-[var(--color-line)] pt-4">
              <input type="hidden" name="intent" value="role-save" />
              <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">criar perfil</p>
              <Input label="Nome do novo perfil" name="role_name" placeholder="ex: Produção" maxLength={100} required />
              <PermissionChecklist selected={[]} />
              <Button type="submit" variant="outline" disabled={busy}>+ criar perfil</Button>
            </Form>
          </Panel>

          <Panel title="zona de perigo">
            <section aria-label="Transferir a propriedade" className="space-y-3">
              <h3 className="font-mono text-sm font-bold">Transferir a propriedade</h3>
              <p className="max-w-2xl font-mono text-xs text-[var(--color-muted)]">
                A pessoa escolhida passa a ser a única responsável pelo coletivo e você vira Membro, sem permissões, até receber um novo perfil dela.
                {mfaOpcional
                  ? 'Exige um membro com e-mail e celular confirmados.'
                  : 'Exige a sua sessão confirmada com o segundo fator (aal2) e um membro com verificação em duas etapas, e-mail e celular confirmados.'}
              </p>
              <MfaDevNotice show={mfaOpcional} />
              {mfa !== 'confirmada' && !mfaOpcional ? (
                <p role="note" className="border border-[var(--color-line)] p-3 font-mono text-xs">
                  {MFA_TEXT[mfa]}{' '}
                  <Link to="/painel/seguranca" className="text-[var(--accent-text)] underline">ir para Segurança</Link>
                </p>
              ) : sucessores.length === 0 ? (
                <p role="note" className="border border-[var(--color-line)] p-3 font-mono text-xs">Não há outro membro para receber a propriedade. Aprove um pedido de entrada primeiro.</p>
              ) : (
                <Form method="post" className="max-w-md space-y-3">
                  <input type="hidden" name="intent" value="transfer" />
                  <Select
                    label="Novo proprietário"
                    name="successor"
                    defaultValue={sucessores[0].userId}
                    options={sucessores.map((membro) => ({ value: membro.userId, label: membro.nome }))}
                  />
                  <Checkbox name="confirm" value="yes" label="Entendo que deixo de ser a pessoa responsável por este coletivo" />
                  <Button type="submit" variant="danger" disabled={busy}>transferir propriedade</Button>
                </Form>
              )}
            </section>

            <section aria-label="Encerrar o coletivo" className="mt-6 space-y-3 border-t border-[var(--color-line)] pt-4">
              <h3 className="font-mono text-sm font-bold">Encerrar o coletivo</h3>
              <p className="max-w-2xl font-mono text-xs text-[var(--color-muted)]">
                O coletivo sai do site e todo acesso interno acaba, inclusive o seu. Não dá para desfazer.
              </p>
              <details className="max-w-md border border-[var(--color-line)] p-2">
                <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-[var(--color-muted)] hover:text-[var(--foreground)]">encerrar coletivo</summary>
                <Form method="post" className="mt-3 space-y-3">
                  <input type="hidden" name="intent" value="close" />
                  <Textarea label="Motivo do encerramento" name="reason" rows={3} maxLength={2000} required />
                  <Input label={`Digite ${CLOSE_CONFIRMATION} para confirmar`} name="confirmation" autoComplete="off" required />
                  <Button type="submit" variant="danger" size="sm" disabled={busy}>confirmar encerramento</Button>
                </Form>
              </details>
            </section>
          </Panel>
        </>
      )}
    </div>
  )
}
