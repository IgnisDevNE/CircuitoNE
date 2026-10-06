# CircuitoNE

Hub da cena eletrônica do Nordeste. React Router 8 (Framework, SSR) + React 19 + Vite 8 + Tailwind CSS v4, com Supabase (Postgres, Auth, RLS, RPCs). A aplicação fica em `src/`.

**Fase atual: PoC.** O ambiente dev (`circuitone-dev.magalz.space` → Supabase `CircuitoNE-dev`) roda com dados sintéticos e deve ter todas as telas ligadas ao banco. Produção serve só a página de espera. O plano e o status das tarefas estão em [`docs/plan.md`](docs/plan.md).

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
pnpm test:e2e          # Playwright
pnpm test:database     # Supabase local via Docker (roda no CI)
./deploy/dev.ps1       # rebuild e recria o pod dev no PC (Podman)
```

## Estrutura

- `src/root.tsx` — documento, loader raiz, error boundary, CSS global
- `src/routes.ts` — rotas do framework; `src/routes/*` — módulos de rota
- `src/routes/identity.tsx` + `src/routes/legacy.tsx` — adaptador temporário que ainda renderiza o protótipo (`src/App.tsx`, `src/router.tsx`, `src/data/mock.ts`, `src/context/StoreContext.tsx`) para rotas não ligadas ao banco
- `src/server/auth.server.ts` — cliente Supabase SSR por requisição, login/logout
- `src/pages/**`, `src/components/**` — telas e componentes
- `src/types/database.generated.ts` — tipos gerados do schema
- `supabase/migrations/`, `supabase/seeds/`, `supabase/config.toml` — banco
- `tests/unit`, `tests/e2e`, `tests/database`, `tests/assets`, `tests/*.test.mjs`
- `scripts/start-runtime.mjs` — validação de ambiente e start do servidor
- `deploy/` — Caddy, página de espera, script do pod
- `docs/` — regras de negócio (`business-rules/mvp.md`), arquitetura, ADRs, ambiente, plano

## Ambiente

Ver [`docs/engineering/environment.md`](docs/engineering/environment.md). Variáveis do app: `CIRCUITONE_RUNTIME` (`preview` = protótipo com mocks, `development` = Supabase real), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN`.

## Estilo

Tailwind v4 via `@tailwindcss/vite`; `src/index.css` importa Tailwind com `@import 'tailwindcss' source('.');`. CSS global e tema em `src/index.css`. Formatação com oxfmt.
