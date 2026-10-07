import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { FlowResult, RegistrationPage } from '../../src/lib/registration-forms'
import { NewProfile } from '../../src/pages/app/NewProfile'
import { RestrictedAccount } from '../../src/pages/app/RestrictedAccount'
import { RegisterFlow } from '../../src/pages/auth/RegisterFlow'
import type { Taxonomia } from '../../src/server/mappers/account-settings'

type Page = RegistrationPage
const taxonomia: Taxonomia = [
  { estilo: 'house', subestilos: ['deep house'] },
  { estilo: 'techno', subestilos: [] },
]
const REQUEST_ID = '0b4f2d1c-aaaa-4bbb-8ccc-123456789012'

// `Form` exige um roteador de dados (como no servidor e no navegador).
const inRouter = (ui: React.ReactNode) => render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }])} />)
const flow = (page: Page, result?: FlowResult) => inRouter(<RegisterFlow page={page} result={result} />)
const fail = (intent: Extract<FlowResult, { ok: false }>['intent'], errors: Record<string, string>, extra: Partial<Extract<FlowResult, { ok: false }>> = {}): FlowResult => ({
  ok: false, intent, message: null, errors, ...extra,
})
const hiddenIntent = (container: HTMLElement) => [...container.querySelectorAll<HTMLInputElement>('input[name="intent"]')].map((input) => input.value)

describe('cadastro: etapas', () => {
  it('conta: formulário de e-mail e senha, link para entrar e reenvio do e-mail em seção própria', () => {
    const { container } = flow({ step: 'account', notice: null })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('novo_cadastro')
    expect(screen.getByLabelText(/\$ E-mail/)).toBeTruthy()
    expect(screen.getByLabelText(/\$ Senha/)).toBeTruthy()
    expect(screen.getByLabelText(/\$ Confirmar senha/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'criar conta' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'entrar' }).getAttribute('href')).toBe('/entrar')
    expect(screen.getByText('Já criou a conta e não recebeu o e-mail?')).toBeTruthy()
    expect(hiddenIntent(container)).toEqual(['signup', 'resend-email'])
    expect(screen.getByLabelText(/\$ Senha/).getAttribute('autocomplete')).toBe('new-password')
  })

  it('conta: erros por campo, e-mail devolvido e senha nunca devolvida', () => {
    flow({ step: 'account', notice: null }, fail('signup', { email: 'Este e-mail já tem cadastro. Entre com ele ou use outro.', senha: 'Use ao menos 8 caracteres.' }, { values: { email: 'a@example.invalid' } }))
    expect((screen.getByLabelText(/\$ E-mail/) as HTMLInputElement).value).toBe('a@example.invalid')
    expect((screen.getByLabelText(/\$ Senha/) as HTMLInputElement).value).toBe('')
    expect(screen.getByText(/já tem cadastro/)).toBeTruthy()
    expect(screen.getByText(/Use ao menos 8 caracteres/)).toBeTruthy()
  })

  it('link de confirmação inválido ou vencido: aviso e reenvio do e-mail aberto', () => {
    const { container } = flow({ step: 'account', notice: 'invalida' })
    expect(screen.getByRole('alert').textContent).toContain('inválido, venceu ou já foi usado')
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true)
    expect(screen.getByLabelText(/\$ Reenviar para o e-mail/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'reenviar e-mail' })).toBeTruthy()
  })

  it('depois de pedir o cadastro com confirmação: instrução para abrir o e-mail, sem formulário de conta', () => {
    const { container } = flow({ step: 'account', notice: null }, { ok: true, intent: 'signup', message: 'Enviamos um link de confirmação para a@example.invalid.', email: 'a@example.invalid', cooldown: 60 })
    expect(screen.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeTruthy()
    expect(screen.getByText('a@example.invalid')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'criar conta' })).toBeNull()
    expect((container.querySelector('input[name="email"][type="hidden"]') as HTMLInputElement).value).toBe('a@example.invalid')
    expect(screen.getByRole('link', { name: 'começar de novo' }).getAttribute('href')).toBe('/cadastro')
  })

  it('reenvio do e-mail: o botão espera o intervalo e a confirmação aparece só depois do servidor responder', async () => {
    vi.useFakeTimers()
    flow({ step: 'email', email: 'a@example.invalid', notice: null }, { ok: true, intent: 'resend-email', message: 'Se houver um cadastro pendente para a@example.invalid, enviamos um novo link.', email: 'a@example.invalid', cooldown: 3 })
    expect(screen.getByRole('status').textContent).toContain('enviamos um novo link')
    const button = screen.getByRole('button', { name: /reenviar e-mail/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('reenviar e-mail em 3s')
    for (let second = 0; second < 3; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect((screen.getByRole('button', { name: 'reenviar e-mail' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('celular: pede o número com dica de DDD; o erro (celular já usado) fica no campo', () => {
    const { container } = flow({ step: 'phone', email: 'a@example.invalid' }, fail('send-phone', { telefone: 'Este celular já está em uso por outra conta.' }, { values: { telefone: '81 99999-0001' } }))
    const input = screen.getByLabelText(/\$ Celular/) as HTMLInputElement
    expect(input.value).toBe('81 99999-0001')
    expect(input.getAttribute('type')).toBe('tel')
    expect(screen.getByText(/já está em uso/)).toBeTruthy()
    expect(hiddenIntent(container)).toEqual(['send-phone'])
    expect(screen.getByRole('button', { name: 'enviar código por SMS' })).toBeTruthy()
  })

  it('código: mostra o número, erro do código, reenvio e a troca de número', () => {
    const { container } = flow({ step: 'code', email: 'a@example.invalid', phone: '+5581999990001' }, fail('verify-phone', { codigo: 'Código inválido ou expirado. Confira o código ou peça um novo.' }))
    expect(screen.getByText('+55 (81) 99999-0001')).toBeTruthy()
    const code = screen.getByLabelText(/\$ Código do SMS/) as HTMLInputElement
    expect(code.getAttribute('autocomplete')).toBe('one-time-code')
    expect(code.getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByText(/inválido ou expirado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'confirmar celular' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'reenviar código' })).toBeTruthy()
    expect(screen.getByText('Usar outro número')).toBeTruthy()
    expect(hiddenIntent(container)).toEqual(['verify-phone', 'resend-phone', 'send-phone'])
  })

  it('código: o limite do Auth desativa o reenvio pelo tempo informado', async () => {
    vi.useFakeTimers()
    flow({ step: 'code', email: 'a@example.invalid', phone: '+5581999990001' }, fail('resend-phone', {}, { message: 'Aguarde 2 segundos para pedir de novo.', cooldown: 2 }))
    expect(screen.getByRole('alert').textContent).toBe('Aguarde 2 segundos para pedir de novo.')
    expect((screen.getByRole('button', { name: /reenviar código/ }) as HTMLButtonElement).disabled).toBe(true)
    for (let second = 0; second < 2; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect((screen.getByRole('button', { name: 'reenviar código' }) as HTMLButtonElement).disabled).toBe(false)
  })

  describe('dados', () => {
    const page: Page = { step: 'data', email: 'a@example.invalid', phone: '+5581999990001', requestId: REQUEST_ID, taxonomia }

    it('mostra os contatos confirmados, o identificador do formulário e os campos de RN-01/03/04/31/36', () => {
      const { container } = flow(page)
      expect(screen.getByText('a@example.invalid')).toBeTruthy()
      expect(screen.getByText('+55 (81) 99999-0001')).toBeTruthy()
      expect((container.querySelector('input[name="requestId"]') as HTMLInputElement).value).toBe(REQUEST_ID)
      for (const label of [/\$ Nome completo/, /\$ Gênero \(opcional\)/, /\$ Data de nascimento/, /\$ CPF/, /\$ Cidade/, /\$ Estado/, /\$ Nome da atuação/]) expect(screen.getByLabelText(label)).toBeTruthy()
      expect(screen.getByRole('radio', { name: /celular também é WhatsApp/ })).toHaveProperty('checked', true)
      expect(screen.getByRole('radio', { name: /Artista/ })).toBeTruthy()
      expect(screen.getAllByRole('radio').filter((radio) => radio.getAttribute('name') === 'tipo')).toHaveLength(4)
      expect(screen.queryByText('Estilos musicais')).toBeNull()
      expect(screen.getByRole('button', { name: /concluir cadastro/ })).toBeTruthy()
    })

    it('WhatsApp em outro número e estilos de artista aparecem conforme a escolha', async () => {
      flow(page)
      const user = userEvent.setup()
      expect(screen.queryByLabelText(/\$ Número do WhatsApp/)).toBeNull()
      await user.click(screen.getByRole('radio', { name: /é outro número/ }))
      expect(screen.getByLabelText(/\$ Número do WhatsApp/)).toBeTruthy()
      await user.click(screen.getByRole('radio', { name: /Artista/ }))
      expect(screen.getByText(/Estilos musicais/)).toBeTruthy()
      expect(screen.getByRole('checkbox', { name: 'techno' })).toBeTruthy()
      await user.click(screen.getByRole('radio', { name: /Serviços/ }))
      expect(screen.queryByText(/Estilos musicais/)).toBeNull()
    })

    it('erros devolvem o digitado (inclusive tipo e estilos) e mostram a mensagem do CPF', () => {
      flow(
        page,
        fail('complete', { cpf: 'Não foi possível concluir o cadastro com este CPF.', estilo: 'Escolha ao menos um estilo.' }, {
          message: 'Não foi possível concluir o cadastro com estes dados.',
          values: { nome: 'Pessoa Teste', cpf: '529.982.247-25', nascimento: '1990-05-20', cidade: 'Recife', estado: 'PE', whatsapp: 'none', tipo: 'artista', atuacaoNome: 'DJ Teste', estilo: ['techno'] },
        }),
      )
      expect((screen.getByLabelText(/\$ Nome completo/) as HTMLInputElement).value).toBe('Pessoa Teste')
      expect((screen.getByLabelText(/\$ CPF/) as HTMLInputElement).value).toBe('529.982.247-25')
      expect((screen.getByLabelText(/\$ Data de nascimento/) as HTMLInputElement).value).toBe('1990-05-20')
      expect((screen.getByLabelText(/\$ Estado/) as HTMLSelectElement).value).toBe('PE')
      expect(screen.getByRole('radio', { name: /Não uso WhatsApp/ })).toHaveProperty('checked', true)
      expect(screen.getByRole('radio', { name: /Artista/ })).toHaveProperty('checked', true)
      expect(screen.getByRole('checkbox', { name: 'techno' })).toHaveProperty('checked', true)
      expect(screen.getByText(/concluir o cadastro com este CPF/)).toBeTruthy()
      expect(screen.getByText(/Escolha ao menos um estilo\./)).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toBe('Não foi possível concluir o cadastro com estes dados.')
    })
  })

  it('o progresso mostra a etapa atual e permite sair para continuar depois', () => {
    flow({ step: 'phone', email: 'a@example.invalid' })
    const steps = screen.getByRole('list', { name: 'Progresso do cadastro' })
    expect(within(steps).getByText('(etapa atual)').closest('li')?.textContent).toContain('Celular')
    const logout = screen.getByRole('button', { name: 'sair e continuar depois' })
    expect(logout.closest('form')?.getAttribute('action')).toBe('/sair')
  })
})

describe('nova atuação', () => {
  it('formulário com tipo, nome e estilos de artista; falhas voltam com o digitado', async () => {
    const result = fail('create-profile', { estilo: 'Escolha ao menos um estilo.' }, { values: { tipo: 'artista', atuacaoNome: 'Projeto Novo', estilo: [] } })
    const { container } = inRouter(<NewProfile taxonomia={taxonomia} nome="Pessoa Teste" result={result} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('nova_atuacao')
    expect((screen.getByLabelText(/\$ Nome da atuação/) as HTMLInputElement).value).toBe('Projeto Novo')
    expect(screen.getByRole('radio', { name: /Artista/ })).toHaveProperty('checked', true)
    expect(screen.getByText(/Escolha ao menos um estilo\./)).toBeTruthy()
    expect(container.querySelector('input[name="intent"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'cancelar' }).getAttribute('href')).toBe('/painel/dados')
    expect(screen.getByRole('button', { name: 'criar atuação' })).toBeTruthy()
  })

  it('integrante sugere o nome da própria conta', async () => {
    inRouter(<NewProfile taxonomia={taxonomia} nome="Pessoa Teste" />)
    await userEvent.setup().click(screen.getByRole('radio', { name: /Integrante de coletivo/ }))
    expect(screen.getByText(/deixe em branco para usar "Pessoa Teste"/)).toBeTruthy()
  })
})

describe('conta incompleta', () => {
  it('o aviso da conta restrita leva a continuar o cadastro', () => {
    render(<RestrictedAccount nome={null} situacao="incomplete" motivo={null} />)
    expect(screen.getByRole('link', { name: 'Continuar cadastro' }).getAttribute('href')).toBe('/cadastro')
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy()
  })
  it('conta suspensa não tem esse caminho', () => {
    render(<RestrictedAccount nome="Pessoa" situacao="suspended" motivo="Revisão" />)
    expect(screen.queryByRole('link', { name: 'Continuar cadastro' })).toBeNull()
  })
})

describe('rota /cadastro', () => {
  it('título da página', async () => {
    const { meta } = await import('../../src/routes/registration')
    expect(meta()).toEqual([{ title: 'Cadastro · CIRCUITO NE' }])
  })
})
