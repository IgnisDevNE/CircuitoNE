import { defineConfig } from '@playwright/test'

// Suíte e2e contra um Supabase local com as seeds sintéticas (ver job `e2e` em .github/workflows/ci.yml).
// Local: `pnpm exec supabase start`, carregar as seeds e exportar SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY
// (valores de `pnpm exec supabase status -o env`: API_URL e PUBLISHABLE_KEY).
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (chave publicável) do Supabase local.')

const ACCOUNT_SPEC = /account\.spec\.ts$/
const MESSAGES_SPEC = /messages\.spec\.ts/
const CHAT_DOCK_SPEC = /chat-dock\.spec\.ts/
const REGISTER_SPEC = /register\.spec\.ts/
const MANAGE_SPEC = /collective-manage\.spec\.ts/
const EXPLORE_SPEC = /explore\.spec\.ts/
const UPLOADS_SPEC = /uploads\.spec\.ts/
const WRITE_SPECS = [ACCOUNT_SPEC, MESSAGES_SPEC, CHAT_DOCK_SPEC, REGISTER_SPEC, MANAGE_SPEC, EXPLORE_SPEC, UPLOADS_SPEC]
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
    { name: 'desktop', testIgnore: WRITE_SPECS, use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', testIgnore: WRITE_SPECS, use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    // Escritas: depois de todas as leituras e uma suíte por vez, para não competir com testes que contam dados das fixtures.
    // account.spec.ts altera perfis e dados da conta; messages.spec.ts envia, bloqueia e cria conversas; collective-manage.spec.ts edita o
    // coletivo 1, seus perfis de acesso e membros; explore.spec.ts ativa MFA na fixture-active e muda dados profissionais.
    // Cada teste desfaz o que altera. register.spec.ts não altera as fixtures: só cria contas novas.
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
    // chat-dock.spec.ts envia mensagens pelo chat flutuante (conversa nova da fixture-member com o artista público) e restaura as
    // não lidas da fixture-active; roda depois de messages, que cria as conversas que ele reaproveita.
    {
      name: 'chat-dock',
      testMatch: CHAT_DOCK_SPEC,
      dependencies: ['messages'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'collective-manage',
      testMatch: MANAGE_SPEC,
      dependencies: ['chat-dock'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'explore',
      testMatch: EXPLORE_SPEC,
      dependencies: ['collective-manage'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
    // uploads.spec.ts envia e remove arquivos no Storage local (fotos, galeria, PDFs privados, imagem do coletivo e capa de
    // evento) usando a fixture-active e o coletivo 1; cada teste apaga o que enviou. Roda depois de explore, que mexe na MFA
    // da mesma conta, e antes de register.
    {
      name: 'uploads',
      testMatch: UPLOADS_SPEC,
      dependencies: ['explore'],
      use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } },
    },
    // register.spec.ts cria contas novas (e-mail e CPF únicos por execução) e consome os celulares de teste de
    // supabase/config.toml [auth.sms.test_otp]; roda por último e uma tela só.
    {
      name: 'register',
      testMatch: REGISTER_SPEC,
      dependencies: ['uploads'],
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
