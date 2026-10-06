import { defineConfig } from '@playwright/test'

// Suíte e2e contra um Supabase local com as seeds sintéticas (ver job `e2e` em .github/workflows/ci.yml).
// Local: `pnpm exec supabase start`, carregar as seeds e exportar SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY
// (valores de `pnpm exec supabase status -o env`: API_URL e PUBLISHABLE_KEY).
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (chave publicável) do Supabase local.')

const ACCOUNT_SPEC = /account\.spec\.ts$/
const MESSAGES_SPEC = /messages\.spec\.ts/
const REGISTER_SPEC = /register\.spec\.ts/
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
    { name: 'desktop', testIgnore: [ACCOUNT_SPEC, MESSAGES_SPEC, REGISTER_SPEC], use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', testIgnore: [ACCOUNT_SPEC, MESSAGES_SPEC, REGISTER_SPEC], use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    // Escritas: depois de todas as leituras e uma suíte por vez, para não competir com testes que contam dados das fixtures.
    // account.spec.ts altera perfis e dados da conta; messages.spec.ts envia, bloqueia e cria conversas. Cada teste desfaz o que altera.
    // register.spec.ts não altera as fixtures: só cria contas novas.
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
    {
      name: 'messages',
      testMatch: MESSAGES_SPEC,
      dependencies: ['account-mobile'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
    // register.spec.ts cria contas novas (e-mail e CPF únicos por execução) e consome os celulares de teste de
    // supabase/config.toml [auth.sms.test_otp]; roda por último e uma tela só.
    {
      name: 'register',
      testMatch: REGISTER_SPEC,
      dependencies: ['messages'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
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
