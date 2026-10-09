import type { ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, Outlet, RouterProvider, useActionData, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONS, PERMISSION_LABELS } from '../../src/lib/collective-access'
import type { ActionResult } from '../../src/lib/action-result'
import { revalidateAfterSubmit } from '../../src/lib/revalidate'
import { Explore, RESTRICTED_NOTICE } from '../../src/pages/app/Explore'
import { EditCollective } from '../../src/pages/collective/EditCollective'
import { EditCollectiveProfile } from '../../src/pages/collective/EditCollectiveProfile'
import { EditMembers } from '../../src/pages/collective/EditMembers'
import CollectiveEditRoute, * as editModule from '../../src/routes/collective-edit'
import CollectiveMembersRoute, * as membersModule from '../../src/routes/collective-members'
import CollectiveProfileEditRoute, * as profileModule from '../../src/routes/collective-profile-edit'
import ExploreRoute, { ErrorBoundary as ExploreError, meta as exploreMeta } from '../../src/routes/explore'
import CollectiveAreaRoute from '../../src/routes/layouts/collective'
import type { CollectiveAreaData } from '../../src/server/mappers/collective-area'
import type { ColetivoEdicao, MembroElenco, PerfilAcesso } from '../../src/server/mappers/collective-manage'
import type { ExploreData, PerfilExplorar } from '../../src/server/mappers/explore'

const C = '05000000-0000-4000-8000-000000000001'
const ROLE_MEMBER = '06000000-0000-4000-8000-000000000001'
const ROLE_OPS = '06000000-0000-4000-8000-000000000100'
const OWNER = '01000000-0000-4000-8000-000000000001'
const MEMBER = '01000000-0000-4000-8000-000000000005'

const coletivo = (extra: Partial<ColetivoEdicao> = {}): ColetivoEdicao => ({
  id: C, versao: 3, situacao: 'approved', motivo: null, tipo: 'coletivo', nome: 'Organização sintética 1', descricao: 'Fixture sem dados reais',
  atuacao: 'Música', cidade: 'Recife', estado: 'PE', cnpj: '', cor: null, social: {}, imagem: null, ...extra,
})
const perfis: PerfilAcesso[] = [
  { id: ROLE_MEMBER, nome: 'Membro', permissoes: [], embutido: true },
  { id: ROLE_OPS, nome: 'Operações sintéticas', permissoes: ['create_events', 'send_messages'], embutido: false },
]
const membros: MembroElenco[] = [
  { userId: OWNER, nome: 'Pessoa sintética ativa', artista: null, cargoId: ROLE_MEMBER, cargo: 'Membro', ultimaAtividade: null, dono: true },
  { userId: MEMBER, nome: 'Membro sintético ativo', artista: { id: '02000000-0000-4000-8000-000000000008', nome: 'Artista sintético do membro' }, cargoId: ROLE_OPS, cargo: 'Operações sintéticas', ultimaAtividade: '2026-10-01T12:00:00.000Z', dono: false },
]

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

// Formulários do React Router (`Form`) exigem um data router.
const inRouter = (ui: React.ReactElement) => render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] })} />)

/** Entrega ao módulo de rota os mesmos `loaderData`/`actionData`/`params` que o framework entrega. */
const withLoader = <P,>(Route: (props: P) => React.ReactNode) =>
  function Wrapped() {
    return Route({ loaderData: useLoaderData(), actionData: useActionData(), params: { id: C } } as unknown as P)
  }

const nameInput = () => document.querySelector<HTMLInputElement>('input[name="name"]')!
const findNameInput = async () => waitFor(() => { const input = nameInput(); expect(input).not.toBeNull(); return input })

describe('EditCollective', () => {
  const page = (props: Partial<ComponentProps<typeof EditCollective>> = {}) =>
    inRouter(<EditCollective coletivo={coletivo()} aprovado perfis={perfis} sucessores={[membros[1]]} mfa="confirmada" {...props} />)

  it('formulário de cadastro com os dados atuais, a versão e o tipo fixo', () => {
    page({ coletivo: coletivo({ cor: '#8b5cf6' }) })
    expect(nameInput().value).toBe('Organização sintética 1')
    expect((screen.getByLabelText(/Descrição/) as HTMLTextAreaElement).value).toBe('Fixture sem dados reais')
    expect((screen.getByLabelText(/Área de atuação/) as HTMLInputElement).value).toBe('Música')
    expect((screen.getByLabelText(/Estado/) as HTMLSelectElement).value).toBe('PE')
    expect(screen.getByText('Coletivo', { selector: 'p' })).toBeTruthy()
    expect(screen.getByText('versão 3')).toBeTruthy()
    const form = screen.getByRole('button', { name: 'salvar' }).closest('form')!
    expect((form.querySelector('[name="version"]') as HTMLInputElement).value).toBe('3')
    expect((form.querySelector('[name="kind"]') as HTMLInputElement).value).toBe('collective')
    expect(screen.queryByRole('button', { name: /reenviar/ })).toBeNull()
  })

  it('produtora: CNPJ obrigatório', () => {
    page({ coletivo: coletivo({ tipo: 'produtora', cnpj: '12ABC34501DE35' }) })
    expect((screen.getByLabelText(/CNPJ/) as HTMLInputElement).value).toBe('12ABC34501DE35')
    expect(screen.getByLabelText(/CNPJ/).getAttribute('aria-required')).toBe('true')
    expect(screen.getByText('obrigatório para produtoras')).toBeTruthy()
  })

  it('recusado e ainda não aprovado: oferece reenviar, sem perfis de acesso nem zona de perigo', () => {
    page({ coletivo: coletivo({ situacao: 'rejected', motivo: 'Documentação incompleta' }), aprovado: false, perfis: [], sucessores: [] })
    expect(screen.getByRole('button', { name: 'salvar e reenviar para análise' }).getAttribute('value')).toBe('resubmit')
    expect(screen.getByRole('note').textContent).toMatch(/Corrija os dados e reenvie/)
    expect(screen.queryByText('perfis de acesso')).toBeNull()
    expect(screen.queryByText('zona de perigo')).toBeNull()
  })

  it('perfis de acesso: o inicial é só leitura, os demais têm checklist do catálogo e exclusão; criar mostra as oito permissões', () => {
    page()
    const list = within(screen.getByRole('list', { name: 'Perfis de acesso' }))
    expect(list.getByText('perfil inicial')).toBeTruthy()
    expect(list.getAllByRole('listitem')).toHaveLength(2)
    expect(list.getAllByRole('button', { name: /excluir/i })).toHaveLength(1)
    const edit = list.getByRole('button', { name: 'salvar perfil' }).closest('form')!
    expect((edit.querySelector('[name="role"]') as HTMLInputElement).value).toBe(ROLE_OPS)
    const checked = [...edit.querySelectorAll<HTMLInputElement>('[name="permission"]')].filter((input) => input.checked).map((input) => input.value)
    expect(checked).toEqual(['create_events', 'send_messages'])
    const create = screen.getByRole('button', { name: '+ criar perfil' }).closest('form')!
    const offered = [...create.querySelectorAll<HTMLInputElement>('[name="permission"]')]
    expect(offered.map((input) => input.value)).toEqual([...PERMISSIONS])
    expect(offered.some((input) => input.checked)).toBe(false)
    for (const permission of PERMISSIONS) expect(within(create).getByLabelText(PERMISSION_LABELS[permission])).toBeTruthy()
  })

  it('transferência: com a sessão em aal2 e um sucessor, o formulário aparece e exige confirmação', () => {
    page()
    const transfer = within(screen.getByRole('region', { name: 'Transferir a propriedade' }))
    expect(transfer.getByRole('combobox', { name: /Novo proprietário/ })).toBeTruthy()
    expect(transfer.getByRole('option', { name: 'Membro sintético ativo' })).toBeTruthy()
    expect(transfer.getByRole('checkbox', { name: /deixo de ser a pessoa responsável/ })).toBeTruthy()
    expect(transfer.getByRole('button', { name: 'transferir propriedade' })).toBeTruthy()
    expect(transfer.queryByRole('link', { name: 'ir para Segurança' })).toBeNull()
  })

  it.each([
    ['ativar', /ainda não tem a verificação em duas etapas/],
    ['confirmar', /ainda não foi confirmada com o segundo fator/],
  ] as const)('transferência sem aal2 (%s): explica o requisito e leva a Segurança, sem formulário', (mfa, text) => {
    page({ mfa })
    const transfer = within(screen.getByRole('region', { name: 'Transferir a propriedade' }))
    expect(transfer.getByRole('note').textContent).toMatch(text)
    expect(transfer.getByRole('link', { name: 'ir para Segurança' }).getAttribute('href')).toBe('/painel/seguranca')
    expect(transfer.queryByRole('button', { name: 'transferir propriedade' })).toBeNull()
  })

  it('transferência sem outro membro: explica em vez de oferecer o formulário', () => {
    page({ sucessores: [] })
    expect(within(screen.getByRole('region', { name: 'Transferir a propriedade' })).getByText(/Não há outro membro/)).toBeTruthy()
  })

  it('encerrar: motivo e confirmação digitada, dentro de um bloco recolhido', () => {
    page()
    const close = within(screen.getByRole('region', { name: 'Encerrar o coletivo' }))
    expect(close.getByLabelText(/Motivo do encerramento/)).toBeTruthy()
    expect(close.getByLabelText(/Digite ENCERRAR/)).toBeTruthy()
    expect(close.getByRole('button', { name: 'confirmar encerramento' })).toBeTruthy()
  })

  it('resultado real: sucesso em status, erro em alerta, e o erro de cada campo ao lado dele', () => {
    const ok = page({ feedback: { ok: true, message: 'Alterações salvas.' } })
    expect(screen.getByRole('status').textContent).toBe('Alterações salvas.')
    ok.unmount()
    page({ feedback: { ok: false, error: 'Corrija os campos destacados.', fields: { name: 'Informe o nome.', cnpj: 'Produtora exige CNPJ.' } } })
    expect(screen.getByRole('alert').textContent).toBe('[erro] Corrija os campos destacados.')
    expect(screen.getByText('[erro] Informe o nome.')).toBeTruthy()
    expect(screen.getByText('[erro] Produtora exige CNPJ.')).toBeTruthy()
  })

  it('durante o envio os botões ficam desativados', () => {
    page({ busy: true })
    expect((screen.getByRole('button', { name: 'salvar' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '+ criar perfil' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'transferir propriedade' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('EditCollectiveProfile', () => {
  const page = (props: Partial<ComponentProps<typeof EditCollectiveProfile>> = {}) => inRouter(<EditCollectiveProfile coletivo={coletivo()} {...props} />)

  it('descrição, cor opcional e redes sociais com os valores atuais', () => {
    page({ coletivo: coletivo({ cor: '#8b5cf6', social: { instagram: 'https://instagram.com/x', site: 'https://x.example.invalid' } }) })
    expect((screen.getByLabelText(/Descrição pública/) as HTMLTextAreaElement).value).toBe('Fixture sem dados reais')
    expect((screen.getByLabelText(/Instagram/) as HTMLInputElement).value).toBe('https://instagram.com/x')
    expect((screen.getByLabelText(/Site/) as HTMLInputElement).value).toBe('https://x.example.invalid')
    expect((screen.getByLabelText(/YouTube/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/usar esta cor/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/cor predominante/) as HTMLInputElement).value).toBe('#8b5cf6')
    expect(screen.getByRole('link', { name: 'ver perfil público ↗' }).getAttribute('href')).toBe(`/coletivos/${C}`)
  })

  it('sem imagem: só o envio (multipart, com o campo de arquivo); com imagem: prévia e remoção', () => {
    const { unmount } = page()
    const upload = document.querySelector('input[name="intent"][value="upload-image"]')!.closest('form')!
    expect(upload.getAttribute('enctype')).toBe('multipart/form-data')
    expect(upload.querySelector('input[type="file"]')!.getAttribute('name')).toBe('arquivo')
    expect(upload.querySelector('input[type="file"]')!.getAttribute('accept')).toContain('image/png')
    expect(screen.getByRole('button', { name: 'enviar imagem' })).toBeTruthy()
    expect(document.querySelector('input[value="remove-image"]')).toBeNull()
    unmount()
    page({ coletivo: coletivo({ imagem: '/img/x/y.png' }) })
    expect(screen.getByRole('img', { name: /Imagem atual de Organização sintética 1/ }).getAttribute('src')).toBe('/img/x/y.png')
    expect(screen.getByRole('button', { name: 'substituir imagem' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'remover imagem' })).toBeTruthy()
  })

  it('arquivo recusado pelo servidor aparece no campo; arquivo inválido escolhido no navegador bloqueia o envio', async () => {
    page({ feedback: { ok: false, error: 'A imagem passa de 5 MB. Envie um arquivo menor.', fields: { arquivo: 'A imagem passa de 5 MB. Envie um arquivo menor.' } } })
    expect(screen.getAllByText(/A imagem passa de 5 MB/).length).toBeGreaterThan(0)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(input, new File(['gif'], 'animada.gif', { type: 'image/gif' }))
    expect(await screen.findByText(/Formato não aceito/)).toBeTruthy()
    expect(input.validity.customError).toBe(true)
    await user.upload(input, new File(['png'], 'foto.png', { type: 'image/png' }))
    expect(input.validity.customError).toBe(false)
  })

  it('sem cor escolhida a opção vem desmarcada; erros por campo e feedback aparecem', () => {
    page({ feedback: { ok: false, error: 'Corrija os campos destacados.', fields: { instagram: 'Informe o endereço completo, começando por https://', color: 'Escolha uma cor válida.' } } })
    expect((screen.getByLabelText(/usar esta cor/) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('alert').textContent).toMatch(/Corrija os campos/)
    expect(screen.getByText('[erro] Informe o endereço completo, começando por https://')).toBeTruthy()
    expect(screen.getByText('[erro] Escolha uma cor válida.')).toBeTruthy()
  })
})

describe('EditMembers', () => {
  const page = (props: Partial<ComponentProps<typeof EditMembers>> = {}) =>
    inRouter(<EditMembers coletivo={{ id: C }} membros={membros} perfis={perfis} podeAtribuir {...props} />)

  it('lista nome, perfil de acesso, atuação pública e atividade; o proprietário não tem controles', () => {
    page()
    const rows = within(screen.getByRole('list', { name: 'Membros' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('proprietário')).toBeTruthy()
    expect(within(rows[0]).getByText('sem atividade registrada')).toBeTruthy()
    expect(within(rows[0]).queryByRole('button')).toBeNull()
    expect(within(rows[0]).queryByRole('combobox')).toBeNull()
    expect(within(rows[1]).getByRole('link', { name: 'Artista sintético do membro' }).getAttribute('href')).toBe('/artistas/02000000-0000-4000-8000-000000000008')
    expect(within(rows[1]).getByText(/^visto /)).toBeTruthy()
    expect((within(rows[1]).getByRole('combobox', { name: 'Perfil de acesso de Membro sintético ativo' }) as HTMLSelectElement).value).toBe(ROLE_OPS)
    expect(within(rows[1]).getAllByRole('option').map((option) => option.textContent)).toEqual(['Membro', 'Operações sintéticas'])
  })

  it('atribuir e remover enviam a intenção e o membro; remover pede confirmação', () => {
    page()
    const assign = screen.getByRole('button', { name: 'Atribuir perfil a Membro sintético ativo' }).closest('form')!
    expect((assign.querySelector('[name="intent"]') as HTMLInputElement).value).toBe('assign')
    expect((assign.querySelector('[name="member"]') as HTMLInputElement).value).toBe(MEMBER)
    const remove = screen.getByRole('button', { name: 'Confirmar a remoção de Membro sintético ativo' }).closest('form')!
    expect((remove.querySelector('[name="intent"]') as HTMLInputElement).value).toBe('remove')
    expect((remove.querySelector('[name="member"]') as HTMLInputElement).value).toBe(MEMBER)
    expect(remove.closest('details')).not.toBeNull()
  })

  it('quem só remove membros não atribui perfis (só o proprietário)', () => {
    page({ podeAtribuir: false, perfis: [] })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Atribuir perfil/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Confirmar a remoção/ })).toBeTruthy()
    expect(screen.getByText(/exclusivo do proprietário/)).toBeTruthy()
  })

  it('resultado real: erro do banco em alerta (ex.: tentar tocar no proprietário)', () => {
    page({ feedback: { ok: false, error: 'O proprietário não pode ser removido do coletivo. Transfira a propriedade antes.' } })
    expect(screen.getByRole('alert').textContent).toMatch(/não pode ser removido/)
  })
})

describe('Explore', () => {
  const perfil = (id: string, nome: string, extra: Partial<PerfilExplorar> = {}): PerfilExplorar => ({
    id, nome, descricao: `Descrição de ${nome}`, cidade: 'Recife', estado: 'PE', estilos: [], minha: false, restrito: null, ...extra,
  })
  const artistas = (perfis: PerfilExplorar[], restritoIndisponivel: boolean): ExploreData => ({ kind: 'artistas', perfis, restritoIndisponivel })
  const page = (explore: ExploreData) => inRouter(<Explore data={explore} />)

  it('leitor comum: projeção não restrita, aviso com o link de Segurança e nenhum dado restrito na tela', () => {
    page(artistas([perfil('a1', 'Artista A', { estilos: [{ estilo: 'techno' }] }), perfil('a2', 'Artista B')], true))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/explorar\/artistas/)
    expect(screen.getByRole('note').textContent).toContain(RESTRICTED_NOTICE)
    expect(screen.getByRole('link', { name: /verificação em duas etapas/ }).getAttribute('href')).toBe('/painel/seguranca')
    expect(screen.queryByRole('list', { name: 'Dados restritos' })).toBeNull()
    expect(screen.queryByText(/booking|cachê|presskit/i, { selector: 'dt' })).toBeNull()
    expect(screen.getByRole('link', { name: 'ver perfil público →' }).getAttribute('href')).toBe('/artistas/a1')
    expect(screen.getAllByRole('link', { name: 'Enviar mensagem' }).map((a) => a.getAttribute('href'))).toEqual([
      '/painel/mensagens/nova?para=profile:a1',
      '/painel/mensagens/nova?para=profile:a2',
    ])
  })

  it('proprietário elegível: mostra contatos, cachê, presskit e portfólio; sem aviso', () => {
    page(
      artistas(
        [
          perfil('a1', 'Artista A', {
            restrito: { emailBooking: 'booking@example.invalid', emailContato: 'contato@example.invalid', telefone: '+5581999000001', cache: 'R$ 1.500,00', cnpj: '12ABC34501DE35', presskit: 'https://presskit.example.invalid/a', portfolio: 'https://p.example.invalid' },
          }),
        ],
        false,
      ),
    )
    expect(screen.queryByRole('note')).toBeNull()
    const details = screen.getByText('média de cachê', { selector: 'dt' }).closest('dl')!
    expect(within(details).getByText('R$ 1.500,00')).toBeTruthy()
    expect(within(details).getByText('booking@example.invalid')).toBeTruthy()
    expect(within(details).getByText('+5581999000001')).toBeTruthy()
    const presskit = within(details).getByRole('link', { name: 'abrir presskit ↗' })
    expect(presskit.getAttribute('href')).toBe('https://presskit.example.invalid/a')
    expect(presskit.getAttribute('rel')).toContain('noopener')
    expect(within(details).getByRole('link', { name: /p\.example\.invalid/ })).toBeTruthy()
  })

  it('PDFs privados: links para a rota que valida a sessão e assina o endereço, nunca um endereço do Storage', () => {
    page(artistas([perfil('a1', 'Artista A', { restrito: { presskitPdf: true } })], false))
    const link = screen.getByRole('link', { name: 'abrir PDF do presskit ↗' })
    expect(link.getAttribute('href')).toBe('/painel/documentos/a1/presskit')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.queryByRole('link', { name: /lista em PDF/ })).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/storage\/v1|token=/)
  })

  it('a própria atuação mostra os dados restritos dela, sem mensagem para si mesmo, e atuação sem dados cadastrados avisa', () => {
    page(artistas([perfil('m', 'Minha atuação', { minha: true, restrito: {} }), perfil('a2', 'Artista B', { restrito: {} })], false))
    expect(screen.getByText('sua atuação')).toBeTruthy()
    expect(screen.getAllByText('Sem dados profissionais cadastrados.')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Enviar mensagem' })).toHaveLength(1)
  })

  it('busca por nome ou cidade (sem acento), estado e estilo; contador e estado vazio', async () => {
    const user = userEvent.setup()
    page(
      artistas(
        [
          perfil('a1', 'Zé Ramalho', { cidade: 'São Paulo', estado: 'SP', estilos: [{ estilo: 'techno' }] }),
          perfil('a2', 'Banda Recife', { estilos: [{ estilo: 'house', subestilo: 'deep house' }] }),
          perfil('a3', 'Outra Pessoa'),
        ],
        false,
      ),
    )
    const names = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(names()).toEqual(['Zé Ramalho', 'Banda Recife', 'Outra Pessoa'])
    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'sao paulo')
    expect(names()).toEqual(['Zé Ramalho'])
    expect(screen.getByRole('status').textContent).toBe('1 de 3')
    await user.clear(screen.getByRole('searchbox', { name: /Buscar/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: /Estado/ }), 'PE')
    expect(names()).toEqual(['Banda Recife', 'Outra Pessoa'])
    await user.selectOptions(screen.getByRole('combobox', { name: /Estilo/ }), 'house')
    expect(names()).toEqual(['Banda Recife'])
    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'inexistente')
    expect(screen.getByText('Nenhuma atuação encontrada para os filtros atuais.')).toBeTruthy()
  })

  it('serviços: o filtro de tipo só existe quando o banco devolveu o tipo (dado restrito)', async () => {
    const user = userEvent.setup()
    const servicos = (perfis: PerfilExplorar[]): ExploreData => ({ kind: 'servicos', perfis, restritoIndisponivel: false })
    const view = page(servicos([perfil('s1', 'Som A')]))
    expect(screen.queryByRole('combobox', { name: /Tipo/ })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /Estilo/ })).toBeNull()
    view.unmount()
    page(servicos([perfil('s1', 'Som A', { restrito: { tipo: 'Som', tipoValor: 'sound' } }), perfil('s2', 'Luz B', { restrito: { tipo: 'Luzes', tipoValor: 'lighting' } })]))
    await user.selectOptions(screen.getByRole('combobox', { name: /Tipo/ }), 'lighting')
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Luz B'])
  })

  it('coletivos aprovados: links para a página pública, mensagem e filtros por tipo', async () => {
    const user = userEvent.setup()
    page({
      kind: 'coletivos',
      coletivos: [
        { id: C, nome: 'Organização 1', tipo: 'coletivo', atuacao: ['Música'], bio: 'Bio', imagem: '', cidade: 'Recife', estado: 'PE', corPredominante: '#8b5cf6', social: {} },
        { id: 'c6', nome: 'Produtora 6', tipo: 'produtora', atuacao: [], bio: 'Bio', imagem: '', cidade: 'Olinda', estado: 'PE', corPredominante: '#ff2040', social: {} },
      ],
    })
    expect(screen.getAllByRole('link', { name: 'ver perfil público →' }).map((a) => a.getAttribute('href'))).toEqual([`/coletivos/${C}`, '/coletivos/c6'])
    expect(screen.getAllByRole('link', { name: 'Enviar mensagem' })[0].getAttribute('href')).toBe(`/painel/mensagens/nova?para=collective:${C}`)
    expect(screen.queryByRole('note')).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: /Tipo/ }), 'produtora')
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Produtora 6'])
  })

  it('trocar de tipo pelo menu descarta busca e filtros do tipo anterior (mesma rota, estado não pode sobreviver)', async () => {
    const user = userEvent.setup()
    const byKind: Record<string, ExploreData> = {
      artistas: artistas([perfil('a1', 'Artista A', { estilos: [{ estilo: 'techno' }] })], false),
      servicos: { kind: 'servicos', perfis: [perfil('s1', 'Som A')], restritoIndisponivel: false },
    }
    const Catalog = () => <Explore data={useLoaderData() as ExploreData} />
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: '/painel/explorar/:kind', loader: ({ params }) => byKind[params.kind!], Component: Catalog }],
          { initialEntries: ['/painel/explorar/artistas'] },
        )}
      />,
    )
    const names = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    await user.selectOptions(await screen.findByRole('combobox', { name: /Estilo/ }), 'techno')
    await user.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'Artista')
    await user.click(screen.getByRole('link', { name: 'Serviços' }))
    await waitFor(() => expect(names()).toEqual(['Som A']))
    expect((screen.getByRole('searchbox', { name: /Buscar/ }) as HTMLInputElement).value).toBe('')
    await user.click(screen.getByRole('link', { name: 'Artistas' }))
    await waitFor(() => expect(names()).toEqual(['Artista A']))
    expect((screen.getByRole('combobox', { name: /Estilo/ }) as HTMLSelectElement).value).toBe('')
  })

  it('as quatro páginas do catálogo ficam num menu com a atual marcada', () => {
    page({ kind: 'audiovisual', perfis: [], restritoIndisponivel: false })
    const nav = within(screen.getByRole('navigation', { name: 'Catálogo' }))
    expect(nav.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/painel/explorar/artistas', '/painel/explorar/servicos', '/painel/explorar/audiovisual', '/painel/explorar/coletivos',
    ])
    expect(screen.getByText('Nenhuma atuação cadastrada ainda.')).toBeTruthy()
  })
})

describe('módulos de rota de gestão', () => {
  const areaRoute = (path: string, area: CollectiveAreaData, children: Parameters<typeof createMemoryRouter>[0]) =>
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ id: 'root', path: '/', Component: Outlet, children: [{ id: 'routes/layouts/collective', path: 'coletivo/:id', loader: () => area, Component: withLoader<ComponentProps<typeof CollectiveAreaRoute>>(CollectiveAreaRoute), children }] }],
          { initialEntries: [path] },
        )}
      />,
    )
  const owner = { id: C, nome: 'Organização sintética 2', tipo: 'coletivo' as const, cidade: 'Recife', estado: 'PE' as const, cargo: 'Membro', dono: true, cor: '#8b5cf6' }

  it('exportam as revalidações e os limites de erro das rotas ligadas', () => {
    for (const module of [editModule, membersModule, profileModule]) {
      expect(module.shouldRevalidate).toBe(revalidateAfterSubmit)
      expect(module.ErrorBoundary).toBeTypeOf('function')
      expect(module.action).toBeTypeOf('function')
      expect(module.loader).toBeTypeOf('function')
    }
  })

  it('editar: conflito de versão aparece como alerta e a página recarrega com a versão mais nova', async () => {
    let current = coletivo({ versao: 3 })
    const base = { aprovado: true, perfis, sucessores: [], mfa: 'confirmada' }
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/',
              loader: () => ({ ...base, coletivo: current }),
              action: () => {
                current = coletivo({ versao: 4, nome: 'Nome de outra pessoa' })
                return data<ActionResult>({ ok: false, error: 'Este coletivo foi alterado por outra pessoa enquanto você editava.' }, { status: 409 })
              },
              shouldRevalidate: editModule.shouldRevalidate,
              Component: withLoader<ComponentProps<typeof CollectiveEditRoute>>(CollectiveEditRoute),
            },
          ],
          { initialEntries: ['/'] },
        )}
      />,
    )
    const user = userEvent.setup()
    expect((await findNameInput()).value).toBe('Organização sintética 1')
    await user.click(screen.getByRole('button', { name: 'salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/alterado por outra pessoa/)
    await waitFor(() => expect(nameInput().value).toBe('Nome de outra pessoa'))
    expect(screen.getByText('versão 4')).toBeTruthy()
  })

  it('perfil público e membros: o resultado do envio só aparece depois da resposta da ação', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const submitted: Record<string, string> = {}
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/',
              loader: () => ({ membros, perfis, podeAtribuir: true }),
              action: async ({ request }: { request: Request }) => {
                for (const [key, value] of await request.formData()) submitted[key] = String(value)
                await gate
                return data<ActionResult>({ ok: true, message: 'Membro removido do coletivo.' })
              },
              Component: withLoader<ComponentProps<typeof CollectiveMembersRoute>>(CollectiveMembersRoute),
            },
          ],
          { initialEntries: ['/'] },
        )}
      />,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByText('remover', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar a remoção de Membro sintético ativo' }))
    expect(submitted).toEqual({ intent: 'remove', member: MEMBER })
    expect(screen.queryByRole('status')).toBeNull()
    release()
    expect((await screen.findByRole('status')).textContent).toBe('Membro removido do coletivo.')
  })

  it('perfil público: a rota entrega o cadastro e o resultado', async () => {
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: '/', loader: () => ({ coletivo: coletivo() }), action: () => data<ActionResult>({ ok: true, message: 'Perfil público atualizado.' }), Component: withLoader<ComponentProps<typeof CollectiveProfileEditRoute>>(CollectiveProfileEditRoute) }],
          { initialEntries: ['/'] },
        )}
      />,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'salvar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Perfil público atualizado.')
  })

  it('403 em página de gestão mostra o motivo dentro do layout, mantendo o menu; 404 não revela nada', async () => {
    const available: CollectiveAreaData = { status: 'available', coletivo: { ...owner, dono: false }, permissoes: [], pendentes: null }
    areaRoute(`/coletivo/${C}/editar`, available, [
      { path: 'editar', loader: () => { throw data({ message: 'Você não tem permissão para editar os dados neste coletivo.' }, { status: 403 }) }, Component: CollectiveEditRoute as never, ErrorBoundary: editModule.ErrorBoundary },
    ])
    expect(await screen.findByText(/não tem permissão para editar os dados/)).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Seções do coletivo' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Dashboard'])
  })

  it('pedido recusado: o proprietário vê o estado com o atalho para corrigir; em /editar o formulário aparece abaixo', async () => {
    const rejected: CollectiveAreaData = { status: 'unavailable', coletivo: owner, situacao: 'rejected', motivo: 'Documentação incompleta' }
    const editChild = {
      path: 'editar',
      loader: () => ({ coletivo: coletivo({ situacao: 'rejected', motivo: 'Documentação incompleta' }), aprovado: false, perfis: [], sucessores: [], mfa: 'ativar' }),
      Component: withLoader<ComponentProps<typeof CollectiveEditRoute>>(CollectiveEditRoute),
    }
    const first = areaRoute(`/coletivo/${C}/painel`, rejected, [{ path: 'painel', Component: () => <p>não deveria aparecer</p> }, editChild])
    expect(await screen.findByText('Motivo informado: Documentação incompleta')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'corrigir os dados e reenviar' }).getAttribute('href')).toBe(`/coletivo/${C}/editar`)
    expect(screen.queryByText('não deveria aparecer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'salvar' })).toBeNull()
    first.unmount()
    areaRoute(`/coletivo/${C}/editar`, rejected, [editChild])
    expect(await screen.findByRole('button', { name: 'salvar e reenviar para análise' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Seções do coletivo' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'corrigir os dados e reenviar' })).toBeNull()
  })

  it('suspenso, ou não proprietário: nenhum atalho de edição; /editar não abre o formulário', async () => {
    areaRoute(`/coletivo/${C}/editar`, { status: 'unavailable', coletivo: owner, situacao: 'suspended', motivo: null }, [
      { path: 'editar', Component: () => <p>não deveria aparecer</p> },
    ])
    expect(await screen.findByText('suspenso')).toBeTruthy()
    expect(screen.queryByText('não deveria aparecer')).toBeNull()
    expect(screen.queryByRole('link', { name: /corrigir os dados/ })).toBeNull()
  })

  it('explorar: título, aviso de restrito vindo do loader e página inexistente em 404', async () => {
    expect(exploreMeta({ params: { kind: 'servicos' } } as never)).toEqual([{ title: 'explorar/serviços · CIRCUITO NE' }])
    expect(exploreMeta({ params: { kind: 'x' } } as never)).toEqual([{ title: 'Explorar · CIRCUITO NE' }])
    const view = render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: '/', loader: () => ({ kind: 'artistas', perfis: [], restritoIndisponivel: false }), Component: withLoader<ComponentProps<typeof ExploreRoute>>(ExploreRoute) }],
          { initialEntries: ['/'] },
        )}
      />,
    )
    expect(await screen.findByRole('navigation', { name: 'Catálogo' })).toBeTruthy()
    view.unmount()
    render(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: '/', loader: () => { throw data({ message: 'Página não encontrada.' }, { status: 404 }) }, Component: ExploreRoute as never, ErrorBoundary: ExploreError }],
          { initialEntries: ['/'] },
        )}
      />,
    )
    expect(await screen.findByText(/Página não encontrada\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'voltar ao catálogo' }).getAttribute('href')).toBe('/painel/explorar/artistas')
  })
})
