import type { ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, data, RouterProvider, useActionData, useLoaderData } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../src/lib/action-result'
import { revalidateAfterSubmit } from '../../src/lib/revalidate'
import { NewCollective } from '../../src/pages/app/NewCollective'
import NewCollectiveRoute, * as newCollectiveModule from '../../src/routes/collective-new'

const REQUEST = '0b000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

// Formulários do React Router (`Form`) exigem um data router.
const inRouter = (ui: React.ReactElement) => render(<RouterProvider router={createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] })} />)

const withLoader = <P,>(Route: (props: P) => React.ReactNode) =>
  function Wrapped() {
    return Route({ loaderData: useLoaderData(), actionData: useActionData() } as unknown as P)
  }

const field = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
const findField = (name: string) => waitFor(() => { const element = field(name); expect(element).not.toBeNull(); return element })

describe('NewCollective', () => {
  const page = (props: Partial<ComponentProps<typeof NewCollective>> = {}) => inRouter(<NewCollective requestId={REQUEST} {...props} />)

  it('título, aviso sobre a análise e os campos de cadastro, redes e cor', async () => {
    page()
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('$ novo_coletivo_produtora')
    expect(screen.getByText(/passa por uma análise/)).toBeTruthy()
    for (const name of ['name', 'state_code', 'city', 'activity', 'description', 'cnpj', 'instagram', 'bandcamp', 'soundcloud', 'facebook', 'site', 'youtube', 'color', 'use_color'])
      expect(field(name), name).toBeTruthy()
    expect(field('name').maxLength).toBe(200)
    expect(field('activity').maxLength).toBe(200)
    expect(field('request').value).toBe(REQUEST)
    expect(field('request').type).toBe('hidden')
    expect(screen.getByRole('link', { name: 'cancelar' }).getAttribute('href')).toBe('/painel/coletivos')
    expect(screen.getByRole('button', { name: 'criar' })).toBeTruthy()
  })

  it('tipo: coletivo e produtora em rádios obrigatórios, nenhum marcado de início', () => {
    page()
    const group = screen.getByRole('group', { name: /Tipo/ })
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => [r.name, r.value, r.checked])).toEqual([['kind', 'collective', false], ['kind', 'producer', false]])
    expect(within(group).getByLabelText(/Coletivo/)).toBeTruthy()
    expect(within(group).getByLabelText(/Produtora/)).toBeTruthy()
  })

  it('CNPJ é opcional para coletivo e obrigatório para produtora', async () => {
    const user = userEvent.setup()
    page()
    const cnpj = await findField('cnpj')
    expect(cnpj.getAttribute('aria-required')).not.toBe('true')
    expect(screen.getByText('opcional')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /Produtora/ }))
    expect(field('cnpj').getAttribute('aria-required')).toBe('true')
    expect(screen.getByText('obrigatório para produtoras')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /Coletivo/ }))
    expect(field('cnpj').getAttribute('aria-required')).not.toBe('true')
  })

  it('UF primeiro e depois a cidade da UF escolhida', async () => {
    const user = userEvent.setup()
    page()
    const city = (await findField('city')) as unknown as HTMLSelectElement
    expect([...city.options].map((o) => o.textContent)).toEqual(['Escolha o estado primeiro'])
    await user.selectOptions(field('state_code'), 'PE')
    expect([...(field('city') as unknown as HTMLSelectElement).options].map((o) => o.textContent)).toContain('Recife')
  })

  it('erros por campo ficam ligados aos campos (aria-invalid) e o aviso do topo é um alerta', async () => {
    const feedback: ActionResult = {
      ok: false,
      error: 'Corrija os campos destacados.',
      fields: { kind: 'Escolha se é um coletivo ou uma produtora.', name: 'Informe o nome.', cnpj: 'Produtora exige CNPJ.', color: 'Escolha uma cor válida.', instagram: 'Informe o endereço completo, começando por https://' },
    }
    page({ feedback })
    expect((await screen.findByRole('alert')).textContent).toBe('[erro] Corrija os campos destacados.')
    expect(screen.getByText('[erro] Escolha se é um coletivo ou uma produtora.')).toBeTruthy()
    expect(field('name').getAttribute('aria-invalid')).toBe('true')
    expect(field('cnpj').getAttribute('aria-invalid')).toBe('true')
    expect(field('instagram').getAttribute('aria-invalid')).toBe('true')
    expect(field('color').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-invalid') === 'true')).toBe(true)
    expect(screen.getByText('[erro] Produtora exige CNPJ.')).toBeTruthy()
    expect(field('description').getAttribute('aria-invalid')).toBe('false')
  })

  it('ocupado: o botão fica desabilitado e mostra o andamento', () => {
    page({ busy: true })
    expect((screen.getByRole('button', { name: 'criando…' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('rota /painel/coletivos/novo', () => {
  const renderRoute = (action: (form: Record<string, string>) => unknown) => {
    const seen: Record<string, string> = {}
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/painel/coletivos/novo',
              loader: () => ({ requestId: REQUEST }),
              action: async ({ request }) => {
                for (const [key, value] of await request.formData()) seen[key] = String(value)
                return action(seen)
              },
              shouldRevalidate: newCollectiveModule.shouldRevalidate,
              Component: withLoader<ComponentProps<typeof NewCollectiveRoute>>(NewCollectiveRoute),
            },
          ],
          { initialEntries: ['/painel/coletivos/novo'] },
        )}
      />,
    )
    return seen
  }

  it('título e revalidação depois de qualquer envio', () => {
    expect(newCollectiveModule.meta()).toEqual([{ title: 'Novo coletivo/produtora · CIRCUITO NE' }])
    expect(newCollectiveModule.shouldRevalidate).toBe(revalidateAfterSubmit)
  })

  it('envia o formulário preenchido, com a solicitação do loader, e mostra a recusa do banco sem perder o que foi digitado', async () => {
    const seen = renderRoute(() => data<ActionResult>({ ok: false, error: 'Este formulário já foi enviado com outros dados. Recarregue a página e tente de novo.' }, { status: 409 }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Produtora/ }))
    await user.type(screen.getByLabelText(/^\$ Nome/), 'Produtora sintética')
    await user.selectOptions(screen.getByLabelText(/Estado/), 'PE')
    await user.selectOptions(screen.getByLabelText(/Cidade/), 'Recife')
    await user.type(screen.getByLabelText(/Área de atuação/), 'Festas')
    await user.type(screen.getByLabelText(/Descrição/), 'Texto')
    await user.type(screen.getByRole('textbox', { name: /CNPJ/ }), '12345678000195')
    await user.click(screen.getByRole('button', { name: 'criar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('[erro] Este formulário já foi enviado')
    expect(seen).toMatchObject({
      request: REQUEST,
      kind: 'producer',
      name: 'Produtora sintética',
      state_code: 'PE',
      city: 'Recife',
      activity: 'Festas',
      description: 'Texto',
      cnpj: '12345678000195',
    })
    expect((screen.getByLabelText(/^\$ Nome/) as HTMLInputElement).value).toBe('Produtora sintética')
  })
})
