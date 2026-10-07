# CircuitoNE

Hub da cena eletrônica do Nordeste. React Router 8 (Framework, SSR) + React 19 + Vite 8 + Tailwind CSS v4, com Supabase (Postgres, Auth, RLS, RPCs). A aplicação fica em `src/`.

**Fase atual: PoC concluída (W1–W12).** O ambiente dev (`circuitone-dev.magalz.space` → Supabase `CircuitoNE-dev`) roda com dados sintéticos e todas as telas estão ligadas ao banco; não há mais protótipo nem dados de mentira no código. Produção serve só a página de espera. O plano e o status das tarefas estão em [`docs/plan.md`](docs/plan.md).

## Fluxo de trabalho

- Branch a partir de `main` → PR → CI verde → squash merge. Não há proteção de branch nem aprovação obrigatória.
- Escreva ou atualize testes junto com cada mudança (teste primeiro quando for prático).
- Mudança de banco = nova migração em `supabase/migrations/` + teste SQL em `tests/database/`. Nunca editar migração já aplicada. Após o merge, `db-dev.yml` aplica no `CircuitoNE-dev` automaticamente.
- Ao alterar o schema público, regenerar `src/types/database.generated.ts` (o job `database` compara com o schema reconstruído).
- Bugs ou pendências que ficarem para depois viram issue no GitHub.

## Regras

- O app usa somente a chave publicável do Supabase, com a identidade do usuário e RLS. Nunca `service_role`, senha de banco ou outro segredo no app, no bundle, no repo ou em logs.
- Autorização definitiva fica no banco (RLS/RPCs); a UI só melhora a experiência.
- Escritas e dados privados passam pelas RPCs existentes (`security definer`); leia as migrações antes de criar uma nova.
- UI e mensagens em português do Brasil; código, identificadores e commits em inglês.
- Não criar camadas genéricas (repositórios, ORMs, state managers) sem necessidade concreta.

## Comandos

```sh
pnpm install --frozen-lockfile
pnpm dev               # servidor de desenvolvimento (já costuma estar rodando em $PORT)
pnpm check             # testes de infra + unidade, typecheck, build
pnpm test:unit         # Vitest
pnpm test:e2e:db       # Playwright contra Supabase local com seeds: a suíte de ponta a ponta (roda no CI, job e2e)
pnpm test:database     # Supabase local via Docker (roda no CI)
./deploy/dev.ps1       # rebuild e recria o pod dev no PC (Podman)
```

## Estrutura

- `src/root.tsx` — documento (`lang="pt-BR"`, `noindex`), error boundary, `RouteA11y` (foco ao trocar de página e ao falhar a validação de um formulário), CSS global
- `src/routes.ts` — rotas do framework; `src/routes/*` — um módulo de rota fino por página (`login.tsx` e `logout.tsx` são o Auth)
- `src/routes/layouts/` — rotas de layout (`public`, `app`, `collective`)
- `src/server/supabase.server.ts` — cliente Supabase SSR por requisição, `supabaseLoader`/`supabaseRouteHeaders` (padrão de loader); `auth.server.ts` — sessão, login/logout e leitura de corpos; `*.server.ts` — leitura e escrita por domínio; `mappers/` — linhas do banco para tipos de UI
- `src/data/types.ts` — tipos de UI e constantes compartilhadas (UF, rótulos de tipos)
- `src/lib/` — validação de formulários e utilitários puros (sem acesso a rede)
- `src/pages/**`, `src/components/**` — telas e componentes
- `src/types/database.generated.ts` — tipos gerados do schema
- `supabase/migrations/`, `supabase/seeds/`, `supabase/config.toml` — banco
- `tests/unit` (Vitest), `tests/e2e/db` (Playwright com Supabase local), `tests/database` (SQL), `tests/assets` (build SSR), `tests/*.test.mjs`
- `scripts/start-runtime.mjs` — validação de ambiente e start do servidor
- `deploy/` — Caddy, página de espera, script do pod
- `docs/` — regras de negócio (`business-rules/mvp.md`), arquitetura, ADRs, ambiente, plano

## Ambiente

Ver [`docs/engineering/environment.md`](docs/engineering/environment.md). Variáveis do app (todas obrigatórias; sem Supabase o app não sobe): `CIRCUITONE_RUNTIME=development`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (só a chave publicável) e `APP_ORIGIN` (origem pública, conferida nas ações de escrita). Modelo em `.env.example`.

## Estilo

Tailwind v4 via `@tailwindcss/vite`; `src/index.css` importa Tailwind com `@import 'tailwindcss' source('.');`. CSS global e tema em `src/index.css`. Formatação com oxfmt.
