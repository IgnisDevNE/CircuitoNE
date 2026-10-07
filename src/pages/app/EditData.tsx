import { useState } from 'react'
import { Form, Link } from 'react-router'
import { ESTADOS, TIPO_LABEL } from '../../data/types'
import type { ActionResult } from '../../lib/account-forms'
import type { ContaDados, WhatsappEscolha } from '../../server/mappers/account-settings'
import type { MeuPerfil } from '../../server/mappers/account'
import { Badge, Button, LinkButton, Panel } from '../../components/ui/primitives'
import { Input, Select } from '../../components/ui/form'
import { errorsFor, FormFeedback, GeneralFeedback, valueFor } from './account-ui'

const SUPPORT_EMAIL = 'ignisdev@magalz.space'

export interface EditDataProps {
  conta: ContaDados
  perfis: MeuPerfil[]
  /** Resposta da última ação enviada a esta página. */
  result?: ActionResult
  busy?: boolean
}

/** `2026-01-31` -> `31/01/2026` (sem passar por Date: não há fuso a aplicar). */
export const formatDate = (iso: string) => iso.split('-').reverse().join('/')

/** `+5581999000001` -> `+55 (81) 99900-0001`; formatos que não são brasileiros ficam como estão. */
export function formatPhone(e164: string) {
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164)
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : e164
}

const whatsappChoice = (whatsapp: WhatsappEscolha) => whatsapp.tipo
const whatsappNumber = (whatsapp: WhatsappEscolha) => (whatsapp.tipo === 'other' ? whatsapp.numero : '')

export function EditData({ conta, perfis, result, busy }: EditDataProps) {
  const errors = errorsFor(result, 'save-account')
  const value = (key: string, saved: string) => valueFor(result, 'save-account', key, saved)
  const [choice, setChoice] = useState(() => value('whatsapp', whatsappChoice(conta.whatsapp)))
  const correction = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Correção de CPF')}`

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-glow">$ editar_dados</h1>
      <GeneralFeedback result={result} />

      <Panel title="dados gerais">
        <Form method="post" className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="intent" value="save-account" />
          <Input label="Nome completo" name="nome" defaultValue={value('nome', conta.nome)} error={errors.nome} required autoComplete="name" />
          <Input label="Gênero (opcional)" name="genero" defaultValue={value('genero', conta.genero ?? '')} error={errors.genero} hint="deixe em branco para não informar" />
          <Input label="Cidade" name="cidade" defaultValue={value('cidade', conta.cidade)} error={errors.cidade} required autoComplete="address-level2" />
          <Select
            label="Estado"
            name="estado"
            defaultValue={value('estado', conta.estado)}
            error={errors.estado}
            options={ESTADOS.map((s) => ({ value: s.value, label: s.label }))}
            required
          />

          <fieldset className="sm:col-span-2" aria-describedby={errors.whatsapp ? 'whatsapp-erro' : undefined}>
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
                  <input type="radio" name="whatsapp" value={option} checked={choice === option} onChange={() => setChoice(option)} className="accent-[var(--accent)]" />
                  {label}
                </label>
              ))}
            </div>
            {errors.whatsapp && <p id="whatsapp-erro" className="mt-1 font-mono text-xs text-[var(--accent-text)]">[erro] {errors.whatsapp}</p>}
            {choice === 'other' && (
              <div className="mt-3 max-w-xs">
                <Input
                  label="Número do WhatsApp"
                  name="whatsappNumero"
                  type="tel"
                  defaultValue={value('whatsappNumero', whatsappNumber(conta.whatsapp))}
                  error={errors.whatsappNumero}
                  hint="com DDD, ex.: 81 99999-0000"
                  autoComplete="tel"
                />
              </div>
            )}
          </fieldset>

          <div className="space-y-3 sm:col-span-2">
            <FormFeedback result={result} intent="save-account" />
            <Button type="submit" variant="solid" disabled={busy}>{busy ? 'salvando…' : 'salvar dados'}</Button>
          </div>
        </Form>
      </Panel>

      <Panel title="dados que você não edita aqui">
        <dl className="grid gap-4 font-mono text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">CPF</dt>
            <dd className="mt-1">{conta.cpfMascarado}</dd>
            <dd className="mt-1 text-xs text-[var(--color-muted)]">
              O CPF não pode ser alterado por aqui.{' '}
              <a href={correction} className="text-[var(--accent-text)] underline">solicitar correção ao suporte</a>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">Data de nascimento</dt>
            <dd className="mt-1">{formatDate(conta.nascimento)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">E-mail</dt>
            <dd className="mt-1 break-all">{conta.email}</dd>
            <dd className="mt-1 text-xs text-[var(--color-muted)]">
              Troque na página <Link to="/painel/seguranca" className="text-[var(--accent-text)] underline">Segurança</Link>.
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-[var(--color-muted)]">Celular confirmado</dt>
            <dd className="mt-1">{formatPhone(conta.celular)}</dd>
            <dd className="mt-1 text-xs text-[var(--color-muted)]">Para trocar o número, fale com o suporte.</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="minhas atuações" actions={<LinkButton to="/painel/dados/nova-atuacao" size="sm" variant="outline">+ nova atuação</LinkButton>}>
        {perfis.length === 0 ? (
          <p className="font-mono text-sm text-[var(--color-muted)]">Nenhuma atuação cadastrada.</p>
        ) : (
          <ul className="space-y-2">
            {perfis.map((perfil) => (
              <li key={perfil.id} className="flex flex-wrap items-center justify-between gap-2 border border-[var(--color-line)] p-3">
                <span className="flex flex-wrap items-center gap-3">
                  <Badge tone="accent">{TIPO_LABEL[perfil.tipo]}</Badge>
                  <span className="font-mono text-sm">{perfil.nome}</span>
                  {perfil.tipo === 'artista' && (
                    <span className="font-mono text-xs text-[var(--color-muted)]">{perfil.publicado ? 'perfil público' : 'não publicado'}</span>
                  )}
                </span>
                <LinkButton to={`/painel/perfil/${perfil.id}`} size="sm" variant="ghost">editar perfil</LinkButton>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">
          Você pode ter várias atuações — inclusive múltiplos perfis de artista para projetos diferentes.
        </p>
      </Panel>
    </div>
  )
}
