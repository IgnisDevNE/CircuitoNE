import { Form } from 'react-router'
import { CONFIRM_DELETE_ACCOUNT, PASSWORD_MIN, type ActionResult, type MfaEnrollment } from '../../lib/account-forms'
import type { SegurancaDados } from '../../server/mappers/account-settings'
import { Button, Panel } from '../../components/ui/primitives'
import { Input } from '../../components/ui/form'
import { errorsFor, FormFeedback, GeneralFeedback, valueFor } from './account-ui'

export interface SecurityProps {
  seguranca: SegurancaDados
  result?: ActionResult
  busy?: boolean
}

const MFA_INTENTS = ['mfa-enroll', 'mfa-verify', 'mfa-elevate', 'mfa-remove', 'mfa-cancel'] as const

/** Cadastro de TOTP em andamento: vem do resultado da ação (a chave aparece só nesta resposta). */
function enrollmentOf(result: ActionResult | undefined): MfaEnrollment | undefined {
  if (!result || (result.intent !== 'mfa-enroll' && result.intent !== 'mfa-verify')) return undefined
  return result.enrollment
}

function CodeField({ error, label = 'Código do aplicativo' }: { error?: string; label?: string }) {
  return (
    <Input
      label={label}
      name="codigo"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      maxLength={7}
      error={error}
      hint="6 dígitos"
    />
  )
}

export function Security({ seguranca, result, busy }: SecurityProps) {
  const emailErrors = errorsFor(result, 'change-email')
  const passwordErrors = errorsFor(result, 'change-password')
  const enrollment = enrollmentOf(result)
  const mfaActive = seguranca.fatores.length > 0

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ seguranca</h1>
      <GeneralFeedback result={result} />

      <Panel title="alterar e-mail">
        <p className="mb-4 font-mono text-sm">
          E-mail atual: <strong className="break-all">{seguranca.email ?? 'não disponível'}</strong>
        </p>
        {seguranca.emailPendente && (
          <p className="mb-4 font-mono text-xs text-[var(--color-warn)]">
            Aguardando confirmação do novo e-mail ({seguranca.emailPendente}). Abra o link enviado para concluir a troca.
          </p>
        )}
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="change-email" />
          <Input
            label="Novo e-mail"
            name="email"
            type="email"
            defaultValue={valueFor(result, 'change-email', 'email', '')}
            error={emailErrors.email}
            required
            autoComplete="email"
            hint="enviaremos um link de confirmação; o e-mail só muda depois dele"
          />
          <FormFeedback result={result} intent="change-email" />
          <Button type="submit" variant="solid" disabled={busy}>enviar confirmação</Button>
        </Form>
      </Panel>

      <Panel title="alterar senha">
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="change-password" />
          <Input label="Senha atual" name="atual" type="password" error={passwordErrors.atual} autoComplete="current-password" required />
          <Input label="Nova senha" name="nova" type="password" error={passwordErrors.nova} hint={`mínimo ${PASSWORD_MIN} caracteres`} autoComplete="new-password" required />
          <Input label="Confirmar nova senha" name="conf" type="password" error={passwordErrors.conf} autoComplete="new-password" required />
          <FormFeedback result={result} intent="change-password" />
          <Button type="submit" variant="solid" disabled={busy}>alterar senha</Button>
        </Form>
      </Panel>

      <Panel title="autenticação em dois fatores">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Use um aplicativo autenticador (TOTP). Proprietários de coletivo precisam dela para acessar o diretório restrito e transferir a propriedade.
          </p>
          <FormFeedback result={result} intent={[...MFA_INTENTS]} />

          {enrollment ? (
            <Form method="post" className="space-y-4" noValidate>
              <input type="hidden" name="factorId" value={enrollment.factorId} />
              <input type="hidden" name="segredo" value={enrollment.secret} />
              <input type="hidden" name="uri" value={enrollment.uri} />
              <input type="hidden" name="qr" value={enrollment.qr} />
              <p className="font-mono text-sm">1. Escaneie o QR code no aplicativo ou digite a chave abaixo.</p>
              {enrollment.qr && (
                <img src={enrollment.qr} alt="QR code para cadastrar o aplicativo autenticador" width={192} height={192} className="border border-[var(--color-line)] bg-white p-2" />
              )}
              <p className="font-mono text-sm">
                Chave: <code data-testid="mfa-secret" className="break-all select-all">{enrollment.secret}</code>
              </p>
              <p className="font-mono text-sm">2. Informe o código de 6 dígitos que o aplicativo mostra.</p>
              <CodeField error={errorsFor(result, 'mfa-verify').codigo} />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" name="intent" value="mfa-verify" variant="solid" disabled={busy}>ativar</Button>
                <Button type="submit" name="intent" value="mfa-cancel" variant="ghost" disabled={busy}>cancelar</Button>
              </div>
            </Form>
          ) : mfaActive ? (
            <div className="space-y-4">
              <p className="font-mono text-sm text-[var(--color-ok)]">Ativada.</p>
              {seguranca.precisaConfirmar && (
                <Form method="post" className="space-y-4 border border-[var(--color-warn)] p-3" noValidate>
                  <input type="hidden" name="intent" value="mfa-elevate" />
                  <input type="hidden" name="factorId" value={seguranca.fatores[0].id} />
                  <p className="font-mono text-xs text-[var(--color-warn)]">
                    Esta sessão ainda não confirmou o segundo fator. Informe o código para liberar as ações que exigem MFA.
                  </p>
                  <CodeField error={errorsFor(result, 'mfa-elevate').codigo} label="Código para confirmar a sessão" />
                  <Button type="submit" variant="outline" disabled={busy}>confirmar sessão</Button>
                </Form>
              )}
              {seguranca.fatores.map((fator) => (
                <Form key={fator.id} method="post" className="space-y-4 border border-[var(--color-line)] p-3" noValidate>
                  <input type="hidden" name="intent" value="mfa-remove" />
                  <input type="hidden" name="factorId" value={fator.id} />
                  <p className="font-mono text-sm">{fator.nome}</p>
                  <CodeField error={errorsFor(result, 'mfa-remove').codigo} label="Código para remover" />
                  <Button type="submit" variant="danger" disabled={busy}>remover autenticação em dois fatores</Button>
                </Form>
              ))}
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="mfa-enroll" />
              <p className="mb-4 font-mono text-sm text-[var(--color-muted)]">Desativada.</p>
              <Button type="submit" variant="solid" disabled={busy}>configurar aplicativo autenticador</Button>
            </Form>
          )}
        </div>
      </Panel>

      <Panel title="excluir conta">
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          A exclusão apaga seus dados e permite um novo cadastro com o mesmo CPF. As mensagens enviadas permanecem, sem identificar você, e nos line-ups fica só o nome creditado, sem link. Se houver denúncia aberta envolvendo você, a conta é bloqueada na hora e a eliminação completa aguarda a análise (até 30 dias). Cópias de segurança são apagadas em até 7 dias. Proprietários de coletivo precisam transferir a propriedade antes.
        </p>
        <Form method="post" className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="request-deletion" />
          <Input
            label={`Digite ${CONFIRM_DELETE_ACCOUNT} para confirmar`}
            name="confirmacao"
            autoComplete="off"
            error={errorsFor(result, 'request-deletion').confirmacao}
          />
          <FormFeedback result={result} intent="request-deletion" />
          <Button type="submit" variant="danger" disabled={busy}>solicitar exclusão da conta</Button>
        </Form>
      </Panel>
    </div>
  )
}
