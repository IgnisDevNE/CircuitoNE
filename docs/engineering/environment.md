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

A suíte `pnpm test:e2e:db` usa Supabase local: `pnpm exec supabase start`, carregar as seeds com `psql` (como no job `e2e` de `ci.yml`; `collective-area.sql` só entra aí, não no dev) e exportar `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` a partir de `pnpm exec supabase status -o env` (`API_URL`, `PUBLISHABLE_KEY`).

Para o dev real local, criar `.env.local` com `CIRCUITONE_RUNTIME=development`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_ORIGIN`.

## Serviços externos

- **E-mail:** SMTP2GO (`no-reply@magalz.space`) configurado nos dois projetos Supabase. No dev a confirmação de e-mail fica **ligada** e os e-mails são entregues de verdade; o link volta pelo callback do app, `APP_ORIGIN/auth/confirmar` (ver abaixo).
- **SMS:** AWS SNS (sa-east-1) pelo Send SMS Auth Hook → Edge Function `send-sms` (`supabase/functions/send-sms/`). O IAM do SNS só tem `sns:Publish`; a conta SNS está em sandbox, então só números de destino verificados recebem SMS. A função só envia para destinos `+55` (`SMS_ALLOWED_PREFIXES` altera) e nunca registra código, telefone nem segredos.

## Cadastro (W5): configuração no painel do Supabase (dev)

- **Authentication → URL Configuration:** Site URL `https://circuitone-dev.magalz.space`; Redirect URLs com `https://circuitone-dev.magalz.space/auth/confirmar`.
- **Authentication → Emails → Templates:** o app confirma pelo `token_hash` (funciona em outro navegador, sem o verificador PKCE). Em *Confirm signup* e *Change email address* use o link
  `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` (confirmação de cadastro) e `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change` (troca de e-mail). O `{{ .ConfirmationURL }}` padrão também funciona (volta com `?code=`, PKCE), mas só no mesmo navegador do cadastro.
- **Authentication → Sign In / Providers:** *Confirm email* ligado; *Phone* ligado, com *Enable phone confirmations* (sem provedor SMS próprio: o envio é do hook).
- **Authentication → Hooks → Send SMS:** tipo HTTPS, URL `https://odphoxozclrshqjgwbqk.supabase.co/functions/v1/send-sms`; ao gerar o secret (`v1,whsec_...`) criar o secret da função `SEND_SMS_HOOK_SECRETS` com esse valor.
- **Secrets da função:** `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (e `SEND_SMS_HOOK_SECRETS`). `functions-dev.yml` publica a função em cada mudança em `supabase/functions/**` e confere só os nomes dos secrets.
- **CI/local:** `supabase/config.toml` liga a confirmação de celular com códigos de teste fixos (`[auth.sms.test_otp]`) e deixa a confirmação de e-mail desligada; `tests/e2e/db/register.spec.ts` usa isso.
- **Cobertura:** Codecov próprio em `pipeline.magalz.space`, publicado pelo `codecov-publish.yml` após o CI.
