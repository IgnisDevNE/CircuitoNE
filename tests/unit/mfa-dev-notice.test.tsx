import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MFA_DEV_NOTICE, MfaDevNotice } from '../../src/components/ui/MfaDevNotice'
import { EditProfile } from '../../src/pages/app/EditProfile'
import { Explore, RESTRICTED_NOTICE } from '../../src/pages/app/Explore'
import { Security } from '../../src/pages/app/Security'
import { EditCollective } from '../../src/pages/collective/EditCollective'
import type { ColetivoEdicao, MembroElenco } from '../../src/server/mappers/collective-manage'
import type { ExploreData, ExplorePerfisData } from '../../src/server/mappers/explore'
import { mapMyProfile } from '../../src/server/mappers/account-settings'

const NOTICE = 'Esta parte vai exigir verificação em duas etapas (MFA) quando a aplicação estiver em produção.'
const ID = '02000000-0000-4000-8000-000000000001'
const C = '05000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

const inRouter = (ui: React.ReactNode) => render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }])} />)
const notices = () => screen.queryAllByText(NOTICE)

describe('MfaDevNotice', () => {
  it('texto exato, como nota acessível; some quando a flag está desligada', () => {
    expect(MFA_DEV_NOTICE).toBe(NOTICE)
    const { unmount } = render(<MfaDevNotice show />)
    expect(screen.getByRole('note').textContent).toContain(NOTICE)
    unmount()
    const off = render(<MfaDevNotice show={false} />)
    expect(off.container.innerHTML).toBe('')
    off.unmount()
    expect(render(<MfaDevNotice />).container.innerHTML).toBe('')
  })
})

describe('Security', () => {
  const seguranca = { email: 'a@example.invalid', emailPendente: null, fatores: [], precisaConfirmar: false }

  it('dev: aviso na seção de MFA, que continua funcional (ativar é opcional)', () => {
    inRouter(<Security seguranca={seguranca} mfaOpcional />)
    expect(notices()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'configurar aplicativo autenticador' })).toBeTruthy()
  })

  it('sem a flag: nenhum aviso', () => {
    inRouter(<Security seguranca={seguranca} />)
    expect(notices()).toHaveLength(0)
  })
})

describe('EditProfile', () => {
  const perfil = mapMyProfile({
    id: ID, kind: 'artist', name: 'Artista sintético', description: '', city: 'Recife', state_code: 'PE', social_links: {}, color: null, published: true,
    is_default: false, styles: [{ style: 'techno', substyle: null }],
    professional: {
      booking_email: null, contact_email: null, contact_phone: null, fee_cents: null, cnpj: null, service_type: null, service_other: null, audiovisual_type: null,
      presskit_url: null, portfolio_url: null, presskit_path: null, presskit_bytes: null, services_pdf_path: null, services_pdf_bytes: null,
    },
  })!
  const taxonomia = [{ estilo: 'techno', subestilos: [] }]

  it('dev: dados profissionais e presskit deixam de citar a MFA e trazem o aviso', () => {
    inRouter(<EditProfile perfil={perfil} taxonomia={taxonomia} mfaOpcional />)
    expect(notices()).toHaveLength(2)
    expect(screen.getByText('Visíveis só para você e para proprietários de coletivos aprovados.')).toBeTruthy()
    expect(screen.getByText(/só você e proprietários de coletivos aprovados conseguem abri-lo/)).toBeTruthy()
  })

  it('sem a flag: textos de produção, sem aviso', () => {
    inRouter(<EditProfile perfil={perfil} taxonomia={taxonomia} />)
    expect(notices()).toHaveLength(0)
    expect(screen.getByText('Visíveis só para você e para proprietários de coletivos aprovados, com MFA.')).toBeTruthy()
    expect(screen.getByText(/só você e proprietários de coletivos aprovados, com MFA, conseguem abri-lo/)).toBeTruthy()
  })
})

describe('Explore', () => {
  const dados = (extra: Partial<ExplorePerfisData> = {}): ExploreData => ({
    kind: 'artistas',
    perfis: [{ id: 'a1', nome: 'Artista A', descricao: 'Descrição', cidade: 'Recife', estado: 'PE', estilos: [], minha: false, restrito: null }],
    restritoIndisponivel: true,
    ...extra,
  })

  it('dev: o aviso de dados restritos não manda ativar a MFA e traz o aviso de produção', () => {
    inRouter(<Explore data={dados({ mfaOpcional: true })} />)
    expect(notices()).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /verificação em duas etapas/ })).toBeNull()
    expect(document.body.textContent).not.toContain(RESTRICTED_NOTICE)
    expect(document.body.textContent).toContain('Disponível para proprietários de coletivos aprovados.')
  })

  it('sem a flag: aviso e link de Segurança como em produção', () => {
    inRouter(<Explore data={dados()} />)
    expect(notices()).toHaveLength(0)
    expect(document.body.textContent).toContain(RESTRICTED_NOTICE)
    expect(screen.getByRole('link', { name: /verificação em duas etapas/ }).getAttribute('href')).toBe('/painel/seguranca')
  })

  it('dev, mas leitor elegível (sem dados escondidos): nada a avisar', () => {
    inRouter(<Explore data={dados({ mfaOpcional: true, restritoIndisponivel: false })} />)
    expect(notices()).toHaveLength(0)
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('EditCollective', () => {
  const coletivo: ColetivoEdicao = {
    id: C, versao: 3, situacao: 'approved', motivo: null, tipo: 'coletivo', nome: 'Organização sintética', descricao: 'Fixture', atuacao: 'Música',
    cidade: 'Recife', estado: 'PE', cnpj: '', cor: null, social: {}, imagem: null,
  }
  const sucessor: MembroElenco = { userId: '01000000-0000-4000-8000-000000000005', nome: 'Membro sintético', artista: null, cargoId: 'r', cargo: 'Membro', ultimaAtividade: null, dono: false }
  const page = (props: Partial<React.ComponentProps<typeof EditCollective>>) =>
    inRouter(<EditCollective coletivo={coletivo} aprovado perfis={[]} sucessores={[sucessor]} mfa="ativar" {...props} />)

  it('dev: a transferência não pede MFA nem manda ativá-la; aparece o formulário e o aviso', () => {
    page({ mfaOpcional: true })
    expect(notices()).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'ir para Segurança' })).toBeNull()
    expect(screen.getByRole('button', { name: 'transferir propriedade' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('segundo fator (aal2)')
  })

  it('sem a flag e sem MFA: continua pedindo para ativar em Segurança, sem aviso nem formulário', () => {
    page({})
    expect(notices()).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'ir para Segurança' }).getAttribute('href')).toBe('/painel/seguranca')
    expect(screen.queryByRole('button', { name: 'transferir propriedade' })).toBeNull()
    expect(document.body.textContent).toContain('segundo fator (aal2)')
  })
})
