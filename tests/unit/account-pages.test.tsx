import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, RouterProvider, useActionData, useLoaderData } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../src/lib/account-forms'
import { EditData, formatDate, formatPhone } from '../../src/pages/app/EditData'
import { EditProfile } from '../../src/pages/app/EditProfile'
import { Security } from '../../src/pages/app/Security'
import AppRoute from '../../src/routes/layouts/app'
import AccountDataRoute, { meta as accountMeta } from '../../src/routes/account-data'
import ProfileEditRoute, { ErrorBoundary as ProfileBoundary, meta as profileMeta } from '../../src/routes/profile-edit'
import SecurityRoute, { meta as securityMeta } from '../../src/routes/security'
import type { AppLayoutData } from '../../src/server/account.server'
import type { MeuPerfil } from '../../src/server/mappers/account'
import { mapAccountDetails, mapMyProfile, type SegurancaDados, type Taxonomia } from '../../src/server/mappers/account-settings'

const ID = '02000000-0000-4000-8000-000000000001'
const FACTOR = '0b4f2d1c-aaaa-4bbb-8ccc-123456789012'

const conta = (extra = {}) =>
  mapAccountDetails({
    name: 'Pessoa A sintética', cpf_masked: '***.982.247-**', birth_date: '1990-01-31', gender: null, city: 'Recife', state_code: 'PE',
    email: 'fixture-active@example.invalid', phone: '+5581999000001', phone_is_whatsapp: true, whatsapp_number: null, ...extra,
  })!
const perfil = (extra = {}) =>
  mapMyProfile({
    id: ID, kind: 'artist', name: 'Artista sintético público', description: 'Bio **sintética**', city: 'Recife', state_code: 'PE',
    social_links: { instagram: 'https://instagram.com/x' }, color: '#00ff88', published: true, is_default: false,
    styles: [{ style: 'techno', substyle: null }, { style: 'house', substyle: 'acid house' }],
    professional: { booking_email: 'b@example.invalid', contact_email: null, contact_phone: null, fee_cents: 150000, cnpj: null, service_type: null, service_other: null, audiovisual_type: null, presskit_url: null, portfolio_url: null },
    ...extra,
  })!
const taxonomia: Taxonomia = [
  { estilo: 'house', subestilos: ['acid house', 'deep house'] },
  { estilo: 'techno', subestilos: ['acid techno'] },
]
const meus = (extra: Partial<MeuPerfil> = {}): MeuPerfil => ({
  id: ID, tipo: 'artista', nome: 'Artista sintético público', cidade: 'Recife', estado: 'PE', publicado: true, padrao: false, ...extra,
})
const seguranca = (extra: Partial<SegurancaDados> = {}): SegurancaDados => ({
  email: 'fixture-active@example.invalid', emailPendente: null, fatores: [], precisaConfirmar: false, ...extra,
})
const fail = (intent: ActionResult['intent'], errors: Record<string, string>, extra: Partial<Extract<ActionResult, { ok: false }>> = {}): ActionResult => ({
  ok: false, intent, message: null, errors, ...extra,
})
const success = (intent: Exclude<ActionResult['intent'], null>, message: string): ActionResult => ({ ok: true, intent, message })

// `Form` exige um roteador de dados (como no servidor e no navegador).
const inRouter = (ui: React.ReactNode) => render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }])} />)

describe('formatação', () => {
  it('data e celular brasileiros', () => {
    expect(formatDate('1990-01-31')).toBe('31/01/1990')
    expect(formatPhone('+5581999000001')).toBe('+55 (81) 99900-0001')
    expect(formatPhone('+558133334444')).toBe('+55 (81) 3333-4444')
    expect(formatPhone('+351912345678')).toBe('+351912345678')
  })
})

describe('EditData', () => {
  it('mostra os dados editáveis e deixa fixos CPF, nascimento, e-mail e celular', () => {
    inRouter(<EditData conta={conta()} perfis={[meus()]} />)
    expect((screen.getByRole('textbox', { name: /Nome completo/ }) as HTMLInputElement).value).toBe('Pessoa A sintética')
    expect((screen.getByRole('textbox', { name: /Cidade/ }) as HTMLInputElement).value).toBe('Recife')
    expect((screen.getByRole('combobox', { name: /Estado/ }) as HTMLSelectElement).value).toBe('PE')
    expect(screen.getByText('***.982.247-**')).toBeTruthy()
    expect(screen.getByText('31/01/1990')).toBeTruthy()
    expect(screen.getByText('fixture-active@example.invalid')).toBeTruthy()
    expect(screen.getByText('+55 (81) 99900-0001')).toBeTruthy()
    // Nada de campo editável para CPF, nascimento, e-mail ou celular.
    for (const name of [/CPF/, /nascimento/i, /E-mail/, /Celular/]) expect(screen.queryByRole('textbox', { name })).toBeNull()
    expect(screen.getByRole('link', { name: 'solicitar correção ao suporte' }).getAttribute('href')).toBe('mailto:ignisdev@magalz.space?subject=Corre%C3%A7%C3%A3o%20de%20CPF')
    expect(screen.getByRole('link', { name: 'Segurança' }).getAttribute('href')).toBe('/painel/seguranca')
  })

  it('RN-36: escolha de WhatsApp reflete o banco e o número só aparece em "outro número"', async () => {
    const user = userEvent.setup()
    const { unmount } = inRouter(<EditData conta={conta()} perfis={[]} />)
    expect((screen.getByRole('radio', { name: /celular também é WhatsApp/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole('textbox', { name: /Número do WhatsApp/ })).toBeNull()
    await user.click(screen.getByRole('radio', { name: /é outro número/ }))
    expect(screen.getByLabelText(/Número do WhatsApp/)).toBeTruthy()
    unmount()
    inRouter(<EditData conta={conta({ phone_is_whatsapp: false, whatsapp_number: '+5581988887777' })} perfis={[]} />)
    expect((screen.getByRole('radio', { name: /é outro número/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/Número do WhatsApp/) as HTMLInputElement).value).toBe('+5581988887777')
  })

  it('lista as atuações com link de edição para cada uma (inclusive não artistas)', () => {
    inRouter(
      <EditData
        conta={conta()}
        perfis={[meus(), meus({ id: 'b', tipo: 'servicos', nome: 'Serviços sintéticos', publicado: false }), meus({ id: 'c', nome: 'Projeto interno', publicado: false })]}
      />,
    )
    const list = within(screen.getByRole('list'))
    expect(list.getAllByRole('listitem')).toHaveLength(3)
    expect(list.getAllByRole('link', { name: 'editar perfil' }).map((a) => a.getAttribute('href'))).toEqual([`/painel/perfil/${ID}`, '/painel/perfil/b', '/painel/perfil/c'])
    expect(list.getByText('perfil público')).toBeTruthy()
    expect(list.getAllByText('não publicado')).toHaveLength(1)
    expect(screen.getByRole('link', { name: '+ nova atuação' }).getAttribute('href')).toBe('/painel/dados/nova-atuacao')
  })

  it('erros ficam junto dos campos e o que foi digitado é preservado; sem mensagem de sucesso', () => {
    inRouter(
      <EditData
        conta={conta()}
        perfis={[]}
        result={fail('save-account', { nome: 'Informe seu nome completo.', cidade: 'Informe a cidade.' }, { values: { nome: '', cidade: '', estado: 'CE', genero: 'Outro', whatsapp: 'none', whatsappNumero: '' } })}
      />,
    )
    const nome = screen.getByRole('textbox', { name: /Nome completo/ })
    expect(nome.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(nome.getAttribute('aria-describedby')!)?.textContent).toContain('Informe seu nome completo.')
    expect(screen.getByText('[erro] Informe a cidade.')).toBeTruthy()
    expect((screen.getByRole('combobox', { name: /Estado/ }) as HTMLSelectElement).value).toBe('CE')
    expect((screen.getByRole('textbox', { name: /Gênero/ }) as HTMLInputElement).value).toBe('Outro')
    expect((screen.getByRole('radio', { name: /Não uso WhatsApp/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('sucesso só aparece quando o servidor confirmou; erro geral do banco aparece como alerta', () => {
    const { unmount } = inRouter(<EditData conta={conta()} perfis={[]} result={success('save-account', 'Dados atualizados.')} />)
    expect(screen.getByRole('status').textContent).toBe('Dados atualizados.')
    unmount()
    inRouter(<EditData conta={conta()} perfis={[]} result={fail('save-account', {}, { message: 'Dados da conta inválidos' })} />)
    expect(screen.getByRole('alert').textContent).toBe('Dados da conta inválidos')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('falhas gerais (origem recusada, serviço fora) aparecem no topo; botão fica desabilitado enquanto salva', () => {
    const { unmount } = inRouter(<EditData conta={conta()} perfis={[]} result={fail(null, {}, { message: 'Origem recusada.' })} />)
    expect(screen.getByRole('alert').textContent).toBe('Origem recusada.')
    unmount()
    inRouter(<EditData conta={conta()} perfis={[]} busy />)
    expect((screen.getByRole('button', { name: 'salvando…' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('EditProfile', () => {
  it('artista: dados públicos, redes, cor, publicação e estilos marcados conforme o banco', () => {
    inRouter(<EditProfile perfil={perfil()} taxonomia={taxonomia} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Artista sintético público')
    expect((screen.getByRole('textbox', { name: /Nome artístico/ }) as HTMLInputElement).value).toBe('Artista sintético público')
    expect((screen.getByRole('textbox', { name: /Bio/ }) as HTMLTextAreaElement).value).toBe('Bio **sintética**')
    expect((screen.getByLabelText(/Instagram/) as HTMLInputElement).value).toBe('https://instagram.com/x')
    expect((screen.getByLabelText(/Site/) as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('checkbox', { name: /Perfil público/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /cor personalizada/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/cor predominante/) as HTMLInputElement).value).toBe('#00ff88')
    const checked = (name: string) => (screen.getByRole('checkbox', { name }) as HTMLInputElement).checked
    expect(checked('techno')).toBe(true)
    expect(checked('house')).toBe(false)
    expect(checked('acid house')).toBe(true)
    expect(checked('deep house')).toBe(false)
    expect(screen.getByRole('link', { name: /ver perfil público/ }).getAttribute('href')).toBe(`/artistas/${ID}`)
  })

  it('perfil não publicado não oferece o link público; sem cor mantém o padrão desmarcado', () => {
    inRouter(<EditProfile perfil={perfil({ published: false, color: null })} taxonomia={taxonomia} />)
    expect(screen.queryByRole('link', { name: /ver perfil público/ })).toBeNull()
    expect((screen.getByRole('checkbox', { name: /Perfil público/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /cor personalizada/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('dados profissionais de artista: booking, cachê formatado em reais e presskit', () => {
    inRouter(<EditProfile perfil={perfil()} taxonomia={taxonomia} />)
    expect((screen.getByLabelText(/E-mail de booking/) as HTMLInputElement).value).toBe('b@example.invalid')
    expect((screen.getByLabelText(/Média de cachê/) as HTMLInputElement).value).toBe('R$ 1.500,00')
    expect(screen.getByLabelText(/Presskit/)).toBeTruthy()
    expect(screen.queryByLabelText(/Portfólio/)).toBeNull()
  })

  it('serviços e audiovisual: campos do tipo; sem estilos nem publicação', () => {
    const base = { styles: [], published: false }
    const { unmount } = inRouter(<EditProfile perfil={perfil({ ...base, kind: 'services', name: 'Serviços sintéticos' })} taxonomia={[]} />)
    expect(screen.getByLabelText(/Tipo de serviço/)).toBeTruthy()
    expect(screen.getByLabelText(/Qual serviço/)).toBeTruthy()
    expect(screen.queryByLabelText(/booking/i)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Perfil público/ })).toBeNull()
    expect(screen.queryByText('Estilos musicais')).toBeNull()
    unmount()
    inRouter(<EditProfile perfil={perfil({ ...base, kind: 'audiovisual', name: 'Estúdio sintético' })} taxonomia={[]} />)
    expect(screen.getByLabelText(/Portfólio/)).toBeTruthy()
    expect(screen.queryByLabelText(/Presskit/)).toBeNull()
  })

  it('integrante: perfil básico, sem painel de dados profissionais', () => {
    inRouter(<EditProfile perfil={perfil({ kind: 'member', professional: null, styles: [], published: false })} taxonomia={[]} />)
    expect(screen.queryByText('dados profissionais')).toBeNull()
    expect(screen.getByRole('button', { name: 'excluir atuação' })).toBeTruthy()
  })

  it('erro de validação devolve o que foi digitado, inclusive estilos e caixas', () => {
    inRouter(
      <EditProfile
        perfil={perfil()}
        taxonomia={taxonomia}
        result={fail('save-profile', { nome: 'Informe o nome da atuação.', instagram: 'Informe o endereço completo, começando por https://', estilo: 'Escolha ao menos um estilo.' }, {
          values: { nome: '', cidade: 'Olinda', estado: 'PE', descricao: 'rascunho', instagram: '@x', usarCor: '', publicado: '', estilo: ['house|deep house'] },
        })}
      />,
    )
    expect(screen.getByText('[erro] Informe o nome da atuação.')).toBeTruthy()
    expect(screen.getByText('[erro] Informe o endereço completo, começando por https://')).toBeTruthy()
    expect(screen.getByText('[erro] Escolha ao menos um estilo.')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: /Bio/ }) as HTMLTextAreaElement).value).toBe('rascunho')
    expect((screen.getByLabelText(/Instagram/) as HTMLInputElement).value).toBe('@x')
    expect((screen.getByRole('checkbox', { name: /Perfil público/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /cor personalizada/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: 'deep house' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'techno' }) as HTMLInputElement).checked).toBe(false)
  })

  it('cada formulário mostra só o próprio resultado', () => {
    const { unmount } = inRouter(<EditProfile perfil={perfil()} taxonomia={taxonomia} result={success('save-professional', 'Dados profissionais atualizados.')} />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(within(screen.getByRole('heading', { name: 'dados profissionais' }).closest('section')!).getByRole('status').textContent).toBe('Dados profissionais atualizados.')
    unmount()
    inRouter(<EditProfile perfil={perfil()} taxonomia={taxonomia} result={fail('delete-profile', { confirmacao: 'Digite EXCLUIR para confirmar.' })} />)
    expect(screen.getByText('[erro] Digite EXCLUIR para confirmar.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('Security', () => {
  const enrollment = { factorId: FACTOR, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/CircuitoNE:a?secret=JBSWY3DPEHPK3PXP', qr: 'data:image/svg+xml;utf-8,<svg/>' }

  it('e-mail atual e troca por confirmação; e-mail pendente é avisado', () => {
    inRouter(<Security seguranca={seguranca({ emailPendente: 'novo@example.invalid' })} />)
    expect(screen.getByText('fixture-active@example.invalid')).toBeTruthy()
    expect(screen.getByText(/Aguardando confirmação do novo e-mail \(novo@example.invalid\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'enviar confirmação' })).toBeTruthy()
  })

  it('senha: campos com autocomplete correto e erros junto dos campos, sem devolver valores', () => {
    inRouter(<Security seguranca={seguranca()} result={fail('change-password', { atual: 'Senha atual incorreta.', conf: 'As senhas não coincidem.' })} />)
    expect(screen.getByLabelText(/Senha atual/).getAttribute('autocomplete')).toBe('current-password')
    expect(screen.getByLabelText(/^\$ Nova senha/).getAttribute('autocomplete')).toBe('new-password')
    expect(screen.getByText('[erro] Senha atual incorreta.')).toBeTruthy()
    expect(screen.getByText('[erro] As senhas não coincidem.')).toBeTruthy()
    for (const field of screen.getAllByLabelText(/senha/i)) expect((field as HTMLInputElement).value).toBe('')
  })

  it('e-mail: confirmação enviada só aparece com sucesso do servidor', () => {
    const { unmount } = inRouter(<Security seguranca={seguranca()} />)
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    inRouter(<Security seguranca={seguranca()} result={success('change-email', 'Enviamos um link de confirmação para novo@example.invalid.')} />)
    expect(screen.getByRole('status').textContent).toContain('Enviamos um link de confirmação')
  })

  it('MFA desligada: oferece configurar; nada de QR nem segredo', () => {
    inRouter(<Security seguranca={seguranca()} />)
    expect(screen.getByText('Desativada.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'configurar aplicativo autenticador' })).toBeTruthy()
    expect(screen.queryByTestId('mfa-secret')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('cadastro em andamento: mostra o QR e a chave e devolve os dados no formulário de confirmação', () => {
    inRouter(<Security seguranca={seguranca()} result={{ ok: true, intent: 'mfa-enroll', message: 'Cadastre o código…', enrollment }} />)
    expect(screen.getByTestId('mfa-secret').textContent).toBe('JBSWY3DPEHPK3PXP')
    expect(screen.getByRole('img', { name: /QR code/ }).getAttribute('src')).toBe(enrollment.qr)
    const form = screen.getByRole('button', { name: 'ativar' }).closest('form')!
    const hidden = (name: string) => (form.querySelector(`input[name="${name}"]`) as HTMLInputElement).value
    expect([hidden('factorId'), hidden('segredo'), hidden('uri')]).toEqual([FACTOR, enrollment.secret, enrollment.uri])
    // O QR (SVG grande) não volta pelo formulário.
    expect(form.querySelector('input[name="qr"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'cancelar' }).getAttribute('value')).toBe('mfa-cancel')
    expect(screen.getByRole('button', { name: 'ativar' }).getAttribute('value')).toBe('mfa-verify')
  })

  it('código errado: erro no campo e o QR continua na tela', () => {
    inRouter(<Security seguranca={seguranca()} result={fail('mfa-verify', { codigo: 'Código inválido ou expirado.' }, { enrollment })} />)
    expect(screen.getByText('[erro] Código inválido ou expirado.')).toBeTruthy()
    expect(screen.getByTestId('mfa-secret')).toBeTruthy()
  })

  it('código errado: a resposta não traz o QR, mas a página mantém o que já recebeu', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [result, setResult] = useState<ActionResult>({ ok: true, intent: 'mfa-enroll', message: 'Cadastre o código…', enrollment })
      return (
        <>
          <button onClick={() => setResult(fail('mfa-verify', { codigo: 'Código inválido ou expirado.' }, { enrollment: { ...enrollment, qr: '' } }))}>falhar</button>
          <Security seguranca={seguranca()} result={result} />
        </>
      )
    }
    inRouter(<Harness />)
    expect(screen.getByRole('img', { name: /QR code/ }).getAttribute('src')).toBe(enrollment.qr)
    await user.click(screen.getByRole('button', { name: 'falhar' }))
    expect(screen.getByText('[erro] Código inválido ou expirado.')).toBeTruthy()
    expect(screen.getByRole('img', { name: /QR code/ }).getAttribute('src')).toBe(enrollment.qr)
  })

  it('sem JavaScript (QR perdido) a chave continua disponível', () => {
    inRouter(<Security seguranca={seguranca()} result={fail('mfa-verify', { codigo: 'Código inválido ou expirado.' }, { enrollment: { ...enrollment, qr: '' } })} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByTestId('mfa-secret').textContent).toBe('JBSWY3DPEHPK3PXP')
  })

  it('MFA ativa: mostra os fatores, pede o código para remover e, se preciso, para confirmar a sessão', () => {
    const fatores = [{ id: FACTOR, nome: 'App autenticador ab12', criadoEm: '2026-10-01T00:00:00Z' }]
    const { unmount } = inRouter(<Security seguranca={seguranca({ fatores })} />)
    expect(screen.getByText('Ativada.')).toBeTruthy()
    expect(screen.getByText('App autenticador ab12')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'remover autenticação em dois fatores' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'confirmar sessão' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'configurar aplicativo autenticador' })).toBeNull()
    unmount()
    inRouter(<Security seguranca={seguranca({ fatores, precisaConfirmar: true })} />)
    expect(screen.getByRole('button', { name: 'confirmar sessão' })).toBeTruthy()
  })

  it('exclusão de conta: confirmação digitada, erro de proprietário e nada de sucesso falso', () => {
    inRouter(
      <Security
        seguranca={seguranca()}
        result={fail('request-deletion', {}, { message: 'Transfira a propriedade ou solicite encerramento ao suporte' })}
      />,
    )
    expect(screen.getByLabelText(/Digite EXCLUIR MINHA CONTA/)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Transfira a propriedade ou solicite encerramento ao suporte')
    expect(screen.getByRole('button', { name: 'solicitar exclusão da conta' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('módulos de rota', () => {
  const active: AppLayoutData = { status: 'active', nome: 'Pessoa A sintética', perfis: [meus()], coletivos: [], naoLidas: 0 }
  const restricted: AppLayoutData = { status: 'restricted', nome: 'Pessoa A sintética', situacao: 'suspended', motivo: 'Revisão sintética' }

  // Em produção o framework injeta `loaderData`/`actionData`; no teste vêm do roteador em memória.
  const withData = (Route: unknown) => () => {
    const Component = Route as (props: { loaderData: unknown; actionData: unknown }) => React.ReactNode
    return <Component loaderData={useLoaderData()} actionData={useActionData()} />
  }
  const mount = (
    path: string,
    layout: AppLayoutData,
    child: { path: string; Route: unknown; loader: () => unknown; action?: (args: { request: Request }) => unknown; ErrorBoundary?: () => React.ReactNode },
  ) =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{
            id: 'routes/layouts/app', Component: withData(AppRoute), loader: () => layout,
            children: [{ path: child.path, Component: withData(child.Route), loader: child.loader, action: child.action, ErrorBoundary: child.ErrorBoundary }],
          }],
          { initialEntries: [path] },
        )}
      />,
    )

  it('/painel/dados: carrega a conta, envia o formulário e mostra o sucesso devolvido pela ação', async () => {
    const action = vi.fn(async ({ request }: { request: Request }) => {
      const body = await request.formData()
      return data<ActionResult>(success('save-account', `Salvo para ${body.get('nome')}`))
    })
    mount('/painel/dados', active, { path: 'painel/dados', Route: AccountDataRoute, loader: () => ({ conta: conta() }), action })
    const nome = await screen.findByRole('textbox', { name: /Nome completo/ })
    const user = userEvent.setup()
    await user.clear(nome)
    await user.type(nome, 'Pessoa Nova')
    await user.click(screen.getByRole('button', { name: 'salvar dados' }))
    expect((await screen.findByRole('status')).textContent).toBe('Salvo para Pessoa Nova')
    const sent = await action.mock.results[0].value
    expect(sent.data.intent).toBe('save-account')
    expect(action).toHaveBeenCalledTimes(1)
    // O menu do painel vem do layout.
    expect(screen.getByRole('navigation', { name: 'Painel' })).toBeTruthy()
  })

  it('/painel/dados: erro de validação da ação aparece no campo, sem sucesso', async () => {
    mount('/painel/dados', active, {
      path: 'painel/dados', Route: AccountDataRoute, loader: () => ({ conta: conta() }),
      action: () => data<ActionResult>(fail('save-account', { cidade: 'Informe a cidade.' }, { values: { cidade: '' } }), { status: 400 }),
    })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'salvar dados' }))
    expect(await screen.findByText('[erro] Informe a cidade.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('conta restrita: só o aviso do layout, nenhuma página de edição', async () => {
    mount('/painel/dados', restricted, { path: 'painel/dados', Route: AccountDataRoute, loader: () => ({ conta: null }) })
    expect(await screen.findByText('Revisão sintética')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('/painel/perfil/:id: edita a atuação; trocar de atuação descarta o rascunho', async () => {
    const router = createMemoryRouter(
      [{
        id: 'routes/layouts/app', Component: withData(AppRoute), loader: () => active,
        children: [{
          path: 'painel/perfil/:atuacaoId', Component: withData(ProfileEditRoute),
          loader: ({ params }) => ({ perfil: perfil({ id: params.atuacaoId, name: params.atuacaoId === 'b' ? 'Outro projeto' : 'Artista sintético público' }), taxonomia }),
        }],
      }],
      { initialEntries: ['/painel/perfil/a'] },
    )
    render(<RouterProvider router={router} />)
    const nome = await screen.findByRole('textbox', { name: /Nome artístico/ })
    const user = userEvent.setup()
    await user.clear(nome)
    await user.type(nome, 'Rascunho de A')
    await router.navigate('/painel/perfil/b')
    expect(((await screen.findByDisplayValue('Outro projeto')) as HTMLInputElement).value).toBe('Outro projeto')
    await router.navigate('/painel/perfil/a')
    expect(await screen.findByDisplayValue('Artista sintético público')).toBeTruthy()
  })

  it('/painel/perfil/:id de outra conta: 404 dentro do painel, sem formulário', async () => {
    const loader = () => {
      throw data({ message: 'Atuação não encontrada.' }, { status: 404 })
    }
    mount('/painel/perfil/outra', active, { path: 'painel/perfil/:atuacaoId', Route: ProfileEditRoute, loader, ErrorBoundary: ProfileBoundary })
    expect(await screen.findByText(/Atuação não encontrada\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'voltar aos dados' }).getAttribute('href')).toBe('/painel/dados')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('/painel/seguranca: mostra o estado de segurança e o resultado da ação', async () => {
    mount('/painel/seguranca', active, {
      path: 'painel/seguranca', Route: SecurityRoute, loader: () => ({ seguranca: seguranca() }),
      action: () => data<ActionResult>(fail('change-password', { atual: 'Senha atual incorreta.' }), { status: 400 }),
    })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/Senha atual/), 'x')
    await user.click(screen.getByRole('button', { name: 'alterar senha' }))
    expect(await screen.findByText('[erro] Senha atual incorreta.')).toBeTruthy()
  })

  it('títulos das rotas', () => {
    expect(accountMeta()[0]).toEqual({ title: 'Editar Dados · CIRCUITO NE' })
    expect(securityMeta()[0]).toEqual({ title: 'Segurança · CIRCUITO NE' })
    const meta = profileMeta as (args: { loaderData?: { perfil: ReturnType<typeof perfil> | null } }) => { title: string }[]
    expect(meta({ loaderData: { perfil: perfil() } })[0]).toEqual({ title: 'Editar Artista sintético público · CIRCUITO NE' })
    expect(meta({})[0]).toEqual({ title: 'Editar Perfil · CIRCUITO NE' })
  })
})
