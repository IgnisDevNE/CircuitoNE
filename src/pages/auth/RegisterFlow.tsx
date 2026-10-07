import { useState } from 'react'
import { Form, Link } from 'react-router'
import { formatBrazilianPhone, type FlowResult, type RegistrationNotice, type RegistrationPage } from '../../lib/registration-forms'
import { Button, Panel } from '../../components/ui/primitives'
import { GenderSelect, Input } from '../../components/ui/form'
import { LocationFields } from '../../components/ui/LocationFields'
import { Stepper } from '../../components/ui/Stepper'
import { CpfInput } from './CpfInput'
import { Feedback, GeneralFeedback, ResendButton, errorsOf, useCooldown, valueOf, valuesOf } from './flow-ui'
import { ProfileFields } from './ProfileFields'

type FlowPage = RegistrationPage

const STEPS = ['Conta', 'Celular', 'Dados']
const STEP_INDEX: Record<FlowPage['step'], number> = { account: 0, email: 0, phone: 1, code: 1, data: 2 }

const NOTICE: Record<RegistrationNotice, string> = {
  invalida: 'Este link de confirmação é inválido, venceu ou já foi usado. Peça um novo e-mail abaixo.',
  indisponivel: 'Não foi possível confirmar o e-mail agora. Tente abrir o link de novo ou peça um novo e-mail abaixo.',
}

const alertClass = 'border border-[var(--accent)] px-3 py-2 font-mono text-sm text-[var(--accent-text)]'
const hiddenIntent = (intent: string) => <input type="hidden" name="intent" value={intent} />

/** Pedir outro e-mail de confirmação: com o endereço conhecido (campo oculto) ou digitado. */
function ResendEmailForm({ email, result, busy }: { email?: string; result?: FlowResult; busy?: boolean }) {
  const errors = errorsOf(result, 'resend-email')
  const left = useCooldown(result?.intent === 'resend-email' || result?.intent === 'signup' ? result : undefined)
  return (
    <Form method="post" className="space-y-3" noValidate>
      {hiddenIntent('resend-email')}
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <Input
          label="Reenviar para o e-mail"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={valueOf(result, 'resend-email', 'email')}
          error={errors.email}
          required
        />
      )}
      <Feedback result={result} intents={['resend-email']} />
      <ResendButton left={left} busy={busy} label="reenviar e-mail" />
    </Form>
  )
}

function ConfirmEmailPanel({ email, notice, result, busy }: { email: string; notice: RegistrationNotice | null; result?: FlowResult; busy?: boolean }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl">Confirme seu e-mail</h2>
      {notice && <p role="alert" className={alertClass}>{NOTICE[notice]}</p>}
      <p className="text-sm">
        Enviamos um link de confirmação para <strong className="break-all">{email}</strong>. Abra o e-mail, clique no link e você volta
        aqui para continuar o cadastro. Se não encontrar a mensagem, olhe a caixa de spam.
      </p>
      <ResendEmailForm email={email} result={result} busy={busy} />
      <p className="font-mono text-xs text-[var(--color-muted)]">
        Digitou o e-mail errado? <a href="/cadastro" className="text-[var(--accent-text)] underline">começar de novo</a>
      </p>
    </div>
  )
}

function AccountStep({ notice, result, busy }: { notice: RegistrationNotice | null; result?: FlowResult; busy?: boolean }) {
  const errors = errorsOf(result, 'signup')
  const sent = result?.ok && (result.intent === 'signup' || result.intent === 'resend-email') ? result.email : undefined
  if (sent) return <ConfirmEmailPanel email={sent} notice={null} result={result} busy={busy} />
  return (
    <div className="space-y-6">
      {notice && <p role="alert" className={alertClass}>{NOTICE[notice]}</p>}
      <Form method="post" className="space-y-4" noValidate>
        {hiddenIntent('signup')}
        <Input label="E-mail" name="email" type="email" autoComplete="email" maxLength={254} defaultValue={valueOf(result, 'signup', 'email')} error={errors.email} required />
        <Input label="Senha" name="senha" type="password" autoComplete="new-password" maxLength={72} error={errors.senha} hint="de 8 a 72 caracteres" required />
        <Input label="Confirmar senha" name="conf" type="password" autoComplete="new-password" maxLength={72} error={errors.conf} required />
        <Feedback result={result} intents={['signup']} />
        <Button type="submit" variant="solid" disabled={busy}>{busy ? 'aguarde…' : 'criar conta'}</Button>
      </Form>
      <details open={!!notice} className="border-t border-[var(--color-line)] pt-4">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">Já criou a conta e não recebeu o e-mail?</summary>
        <div className="mt-3">
          <ResendEmailForm result={result} busy={busy} />
        </div>
      </details>
    </div>
  )
}

function PhoneForm({ result, busy, label, feedback = true }: { result?: FlowResult; busy?: boolean; label: string; feedback?: boolean }) {
  const errors = errorsOf(result, 'send-phone')
  return (
    <Form method="post" className="space-y-4" noValidate>
      {hiddenIntent('send-phone')}
      <Input
        label="Celular"
        name="telefone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={30}
        defaultValue={valueOf(result, 'send-phone', 'telefone')}
        error={errors.telefone}
        hint="com DDD, ex.: 81 99999-0001"
        required
      />
      {feedback && <Feedback result={result} intents={['send-phone']} />}
      <Button type="submit" variant="solid" disabled={busy}>{busy ? 'enviando…' : label}</Button>
    </Form>
  )
}

function PhoneStep({ result, busy }: { result?: FlowResult; busy?: boolean }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl">Confirme seu celular</h2>
      <p className="text-sm">Vamos enviar um código por SMS para confirmar que o número é seu. Cada celular só pode ser usado em uma conta.</p>
      <PhoneForm result={result} busy={busy} label="enviar código por SMS" />
    </div>
  )
}

function CodeStep({ phone, result, busy }: { phone: string; result?: FlowResult; busy?: boolean }) {
  const errors = errorsOf(result, 'verify-phone')
  const left = useCooldown(result?.intent === 'send-phone' || result?.intent === 'resend-phone' || result?.intent === 'verify-phone' ? result : undefined)
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl">Digite o código</h2>
      <p className="text-sm">
        Enviamos um código de 6 dígitos por SMS para <strong>{formatBrazilianPhone(phone)}</strong>. Ele vale por pouco tempo.
      </p>
      <Form method="post" className="space-y-4" noValidate>
        {hiddenIntent('verify-phone')}
        <Input
          label="Código do SMS"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          error={errors.codigo}
          required
        />
        <Feedback result={result} intents={['verify-phone']} />
        <Button type="submit" variant="solid" disabled={busy}>{busy ? 'confirmando…' : 'confirmar celular'}</Button>
      </Form>
      <Form method="post" className="space-y-3 border-t border-[var(--color-line)] pt-4" noValidate>
        {hiddenIntent('resend-phone')}
        <Feedback result={result} intents={['send-phone', 'resend-phone']} />
        <ResendButton left={left} busy={busy} label="reenviar código" />
      </Form>
      <details open={!!errorsOf(result, 'send-phone').telefone} className="border-t border-[var(--color-line)] pt-4">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">Usar outro número</summary>
        <div className="mt-3">
          <PhoneForm result={result} busy={busy} label="enviar código para este número" feedback={false} />
        </div>
      </details>
    </div>
  )
}

function DataStep({ page, result, busy }: { page: Extract<FlowPage, { step: 'data' }>; result?: FlowResult; busy?: boolean }) {
  const errors = errorsOf(result, 'complete')
  const value = (key: string, initial = '') => valueOf(result, 'complete', key, initial)
  const [whatsapp, setWhatsapp] = useState(value('whatsapp', 'same'))
  return (
    <Form method="post" className="space-y-6" noValidate>
      {hiddenIntent('complete')}
      <input type="hidden" name="requestId" value={page.requestId} />
      <div className="space-y-1 font-mono text-xs text-[var(--color-muted)]">
        <p>E-mail confirmado: <span className="break-all text-[var(--foreground)]">{page.email}</span></p>
        <p>Celular confirmado: <span className="text-[var(--foreground)]">{formatBrazilianPhone(page.phone)}</span></p>
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-display text-xl">Seus dados</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome completo" name="nome" defaultValue={value('nome')} error={errors.nome} maxLength={200} autoComplete="name" required />
          <GenderSelect defaultValue={value('genero')} error={errors.genero} />
          <Input label="Data de nascimento" name="nascimento" type="date" defaultValue={value('nascimento')} error={errors.nascimento} autoComplete="bday" hint="é preciso ter 18 anos completos" required />
          <CpfInput defaultValue={value('cpf')} serverError={errors.cpf} />
          <LocationFields ufName="estado" cityName="cidade" defaultUf={value('estado')} defaultCity={value('cidade')} ufError={errors.estado} cityError={errors.cidade} />
        </div>
        <fieldset aria-describedby={errors.whatsapp ? 'whatsapp-erro' : undefined}>
          <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
            <span aria-hidden className="text-[var(--accent-text)]">$ </span>WhatsApp (contato privado, não é público)
          </legend>
          <div className="space-y-2 font-mono text-sm">
            {(
              [
                ['same', 'Meu celular também é WhatsApp'],
                ['other', 'Meu WhatsApp é outro número'],
                ['none', 'Não uso WhatsApp / prefiro não informar'],
              ] as const
            ).map(([option, label]) => (
              <label key={option} className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="whatsapp" value={option} checked={whatsapp === option} onChange={() => setWhatsapp(option)} className="accent-[var(--accent)]" />
                {label}
              </label>
            ))}
          </div>
          {errors.whatsapp && <p id="whatsapp-erro" className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.whatsapp}</p>}
          {whatsapp === 'other' && (
            <div className="mt-3 max-w-xs">
              <Input label="Número do WhatsApp" name="whatsappNumero" type="tel" defaultValue={value('whatsappNumero')} error={errors.whatsappNumero} hint="com DDD, ex.: 81 99999-0000" autoComplete="tel" />
            </div>
          )}
        </fieldset>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 font-display text-xl">Sua primeira atuação</legend>
        <p className="text-sm text-[var(--color-muted)]">Escolha uma. Você poderá adicionar outras depois, em Dados da conta. A cidade e o estado são os da sua conta.</p>
        <ProfileFields
          taxonomia={page.taxonomia}
          errors={errors}
          tipo={value('tipo')}
          nome={value('atuacaoNome')}
          estilos={valuesOf(result, 'complete', 'estilo')}
        />
      </fieldset>

      {errors.requestId && <p role="alert" className={alertClass}>{errors.requestId}</p>}
      <Feedback result={result} intents={['complete']} />
      <Button type="submit" variant="solid" disabled={busy}>{busy ? 'concluindo…' : 'concluir cadastro ✓'}</Button>
    </Form>
  )
}

export function RegisterFlow({ page, result, busy }: { page: FlowPage; result?: FlowResult; busy?: boolean }) {
  const index = STEP_INDEX[page.step]
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-12">
      <Link to="/" className="font-display text-xl text-[var(--accent-text)]">CIRCUITO_NE</Link>
      <h1 className="mb-1 mt-8 font-display text-2xl font-bold text-glow">
        <span className="text-[var(--accent-text)]">$ novo_cadastro</span>
      </h1>
      <p className="mb-6 font-mono text-sm text-[var(--color-muted)]">Crie sua conta, confirme seus contatos e escolha sua atuação.</p>
      <Stepper steps={STEPS} current={index} />
      <Panel title={`etapa ${index + 1}/${STEPS.length}`}>
        <div className="mb-4 empty:hidden"><GeneralFeedback result={result} /></div>
        {page.step === 'account' && <AccountStep notice={page.notice} result={result} busy={busy} />}
        {page.step === 'email' && <ConfirmEmailPanel email={page.email} notice={page.notice} result={result} busy={busy} />}
        {page.step === 'phone' && <PhoneStep result={result} busy={busy} />}
        {page.step === 'code' && <CodeStep phone={page.phone} result={result} busy={busy} />}
        {page.step === 'data' && <DataStep page={page} result={result} busy={busy} />}
      </Panel>
      {page.step === 'account' && (
        <p className="mt-4 text-center font-mono text-xs text-[var(--color-muted)]">
          Já tem conta? <Link to="/entrar" className="text-[var(--accent-text)] hover:underline">entrar</Link>
        </p>
      )}
      {page.step !== 'account' && (
        <form method="post" action="/sair" className="mt-4 text-center">
          <button type="submit" className="font-mono text-xs text-[var(--color-muted)] underline hover:text-[var(--foreground)]">sair e continuar depois</button>
        </form>
      )}
    </main>
  )
}
