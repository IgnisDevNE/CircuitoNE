# CircuitoNE

Hub da cena eletrônica do Nordeste: artistas, coletivos, eventos e mensagens.

React Router 8 (SSR) + React 19 + Vite 8 + Tailwind 4 + Supabase. Node 24.21.0 e pnpm 10.34.3 (`.mise.toml`).

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local   # preencher SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e APP_ORIGIN
pnpm dev
pnpm check
```

O app só funciona com um Supabase configurado (o dev hospedado ou o local); não há dados de demonstração dentro do código. A suíte de ponta a ponta é `pnpm test:e2e:db` (ver [ambiente](docs/engineering/environment.md)).

- [Plano do PoC e status](docs/plan.md)
- [Ambiente, pod dev e banco](docs/engineering/environment.md)
- [Arquitetura](docs/specs/architecture-mvp.md) e [modelo de dados](docs/architecture/backend-and-data.md)
- [Regras de negócio](docs/business-rules/mvp.md)
- [Decisões (ADRs)](docs/decisions/)
