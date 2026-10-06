import { defineConfig } from '@playwright/test'

// Suíte e2e contra um Supabase local com as seeds sintéticas (ver job `e2e` em .github/workflows/ci.yml).
// Local: `pnpm exec supabase start`, carregar as seeds e exportar SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY
// (valores de `pnpm exec supabase status -o env`: API_URL e PUBLISHABLE_KEY).
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (chave publicável) do Supabase local.')

const ACCOUNT_SPEC = /account\.spec\.ts$/
const port = '5183'
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e/db',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/db' }]],
  outputDir: 'test-results/db',
  use: {
    baseURL: origin,
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Leituras: rodam em paralelo nos dois tamanhos de tela.
    { name: 'desktop', testIgnore: ACCOUNT_SPEC, use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', testIgnore: ACCOUNT_SPEC, use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    // Escritas na conta (account.spec.ts): só depois de todos os demais specs e uma tela por vez, para não competir
    // com testes que contam perfis publicados ou conferem nomes das fixtures. Cada teste desfaz o que altera.
    {
      name: 'account-desktop',
      testMatch: ACCOUNT_SPEC,
      dependencies: ['desktop', 'mobile'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'account-mobile',
      testMatch: ACCOUNT_SPEC,
      dependencies: ['account-desktop'],
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    env: {
      HOST: '127.0.0.1',
      PORT: port,
      CIRCUITONE_RUNTIME: 'development',
      APP_ORIGIN: origin,
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
    },
    url: origin,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
