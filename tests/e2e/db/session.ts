import { expect, type Page } from '@playwright/test'

// Senha de teste das contas sintéticas: o job `e2e` do CI a aplica com supabase/seeds/passwords.sql no Supabase local.
export const fixturePassword = process.env.E2E_FIXTURE_PASSWORD ?? ''

export const accounts = {
  active: { email: 'fixture-active@example.invalid', name: 'Pessoa sintética ativa' },
  suspended: { email: 'fixture-suspended@example.invalid', name: 'Pessoa sintética suspensa' },
  deletion: { email: 'fixture-deletion@example.invalid', name: 'Pessoa sintética em exclusão' },
  unconfirmed: { email: 'fixture-unconfirmed@example.invalid', name: '' },
  member: { email: 'fixture-member@example.invalid', name: 'Membro sintético ativo' },
} as const

export async function submitLogin(page: Page, email: string, password = fixturePassword) {
  if (!fixturePassword) throw new Error('Defina E2E_FIXTURE_PASSWORD (a senha aplicada por supabase/seeds/passwords.sql).')
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

/** Entra com a conta e espera chegar ao painel (conta ativa) ou ao aviso restrito. */
export async function login(page: Page, email: string) {
  await submitLogin(page, email)
  await expect(page).toHaveURL(/\/painel$/)
}

/** No celular o menu lateral do painel fica recolhido até o botão ser acionado. */
export async function openPanelMenu(page: Page) {
  const toggle = page.getByRole('button', { name: 'Menu do painel' })
  if (await toggle.isVisible()) await toggle.click()
}

export const panelNav = (page: Page) => page.getByRole('navigation', { name: 'Painel' })

/** No celular a navegação pública fica recolhida atrás do botão do cabeçalho. */
export async function openPublicMenu(page: Page) {
  const toggle = page.getByRole('button', { name: 'Abrir menu' })
  if (await toggle.isVisible()) await toggle.click()
}

export const publicNav = (page: Page) => page.getByRole('navigation', { name: /Principal/ })
