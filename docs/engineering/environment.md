# Ambiente e operação

Atualizado em 06/10/2026.

## Ambientes

| Ambiente | Endereço | Supabase | Conteúdo |
|---|---|---|---|
| Dev (PoC) | `https://circuitone-dev.magalz.space` (Cloudflare Access) | `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`, São Paulo) | App completo com seeds sintéticos |
| Produção | `https://circuitone.magalz.space` | `CircuitoNE` (`ukyoyrmebwadmuzkswdw`) — sem schema de negócio | Somente página de espera |
| CI | runner descartável | Supabase local (Docker) | Migrações, testes SQL, e2e (preview e com banco) |

Ambos os projetos Supabase estão no plano Free. Um projeto Free pausa após ~7 dias sem atividade; se o dev pausar, retomar pelo painel do Supabase.

## Pod único no PC

Um pod Podman `circuitone` contém o app (`circuitone-app`, Node em `127.0.0.1:3000`) e o proxy (`circuitone-proxy`, Caddy):

- `5186 -> :8080` → app de dev (`circuitone-dev.magalz.space`)
- `5187 -> :8081` → página de espera estática (`circuitone.magalz.space`)

O Cloudflare Tunnel `homelab` aponta os dois hostnames para essas portas da VM `podman-machine-default`. Não alterar as demais rotas do tunnel nem a VM.

**Subir ou atualizar** com o commit atual:

```powershell
Copy-Item deploy/dev.env.example deploy/dev.env   # uma vez; preencher a chave publicável
./deploy/dev.ps1
```

**Reiniciar** (por exemplo, após reboot do PC):

```powershell
podman machine start
podman pod start circuitone
```

`deploy/dev.env` é ignorado pelo Git e contém apenas valores públicos (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN`). `scripts/start-runtime.mjs` recusa qualquer variável com senha, token, segredo ou `service_role`.

## Banco

- Migrações: `supabase/migrations/`. Seeds sintéticos: `supabase/seeds/` (exigem `circuitone.seed_target` e `circuitone.seed_time`, definidos pelo workflow).
- CI (`ci.yml`, job `database`) reconstrói o banco local duas vezes e roda os testes SQL de `tests/database/`.
- Após merge em `main` com mudanças em `supabase/**`, o workflow `db-dev.yml` faz `supabase db push` no `CircuitoNE-dev` e recarrega os seeds (idempotentes). Também pode ser disparado manualmente.
- Secrets usados: environment GitHub `Homologação` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`).

## Desenvolvimento local

```sh
pnpm install --frozen-lockfile
pnpm dev            # protótipo (preview) ou dev real com .env.local
pnpm check          # testes de infra/unidade, typecheck, build
pnpm test:e2e      # suíte preview (protótipo)
```

A suíte `pnpm test:e2e:db` usa Supabase local: `pnpm exec supabase start`, carregar as seeds com `psql` (como no job `e2e` de `ci.yml`) e exportar `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` a partir de `pnpm exec supabase status -o env` (`API_URL`, `PUBLISHABLE_KEY`).

Para o dev real local, criar `.env.local` com `CIRCUITONE_RUNTIME=development`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_ORIGIN`.

## Serviços externos

- **E-mail:** SMTP2GO (`no-reply@magalz.space`) configurado nos dois projetos Supabase; o usuário de dev está em sandbox com cópia para `ignisdev@magalz.space`.
- **SMS:** AWS SNS (sa-east-1), integração planejada na W5.
- **Cobertura:** Codecov próprio em `pipeline.magalz.space`, publicado pelo `codecov-publish.yml` após o CI.
