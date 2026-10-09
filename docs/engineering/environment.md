# Ambiente e operação

Atualizado em 06/10/2026.

## Ambientes

| Ambiente | Endereço | Supabase | Conteúdo |
|---|---|---|---|
| Dev (PoC) | `https://circuitone-dev.magalz.space` (Cloudflare Access) | `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`, São Paulo) | App completo com seeds sintéticos |
| Produção | `https://circuitone.magalz.space` | `CircuitoNE` (`ukyoyrmebwadmuzkswdw`) — sem schema de negócio | Somente página de espera |
| CI | runner descartável | Supabase local (Docker) | Migrações, testes SQL, e2e com banco |

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
- Municípios (W14): `public.municipalities` e `src/data/municipios.json` vêm da API de localidades do IBGE (`https://servicodados.ibge.gov.br/api/v1/localidades/municipios`, consultada em 07/10/2026, 5.571 registros). `node scripts/generate-municipios.mjs [arquivo.json]` regenera o JSON e o SQL; migração já aplicada não se reescreve (mudança da lista = nova migração) e `tests/unit/municipios.test.ts` confere que o JSON e a migração têm o mesmo conjunto.
- CI (`ci.yml`, job `database`) reconstrói o banco local duas vezes e roda os testes SQL de `tests/database/`.
- Após merge em `main` com mudanças em `supabase/**`, o workflow `db-dev.yml` faz `supabase db push` no `CircuitoNE-dev` e recarrega os seeds (idempotentes). Também pode ser disparado manualmente.
- Secrets usados: environment GitHub `Homologação` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`).

## Flags do dev (W17)

Para a PoC ser testável no site dev sem painel de administração nem celular com autenticador, duas regras são afrouxadas **só no `CircuitoNE-dev`**. O banco é a autoridade; a UI apenas avisa.

- **Tabela:** `private.environment_flags(name)`, sem políticas e sem acesso para `anon`/`authenticated` (RLS ligada). Nasce vazia em toda parte. `public.get_environment_flags()` devolve os nomes ligados (o app a lê para mostrar o aviso; não é segredo). O app trata qualquer falha dessa leitura como "tudo desligado".
- **Seed:** `supabase/seeds/dev-flags.sql` insere as duas linhas, é idempotente e só roda com `circuitone.seed_target='odphoxozclrshqjgwbqk'` (o projeto dev; `disposable` é recusado). Está no laço de seeds do `db-dev.yml`, depois de `dev-hide-fixtures`.
- **`mfa_optional`:** `private.current_mfa()` passa a aceitar a conta verificada (e-mail e celular confirmados) mesmo em sessão `aal1`. Isso libera, sem segundo fator, o que exige MFA em produção: dados profissionais e PDFs privados para proprietário de coletivo aprovado (`professional_reader`), a transferência de propriedade (e o sucessor deixa de precisar de fator verificado) e as funções de administração do site (que continuam restritas a quem está em `private.site_admins`). A UI mostra "Esta parte vai exigir verificação em duas etapas (MFA) quando a aplicação estiver em produção." onde a MFA seria exigida (segurança, edição da atuação e do documento, explorar, edição do coletivo); ativar a MFA continua possível.
- **`auto_approve_collectives`:** `create_collective` insere o coletivo já `approved` e grava, além de `created`, a ação de auditoria `auto_approved`. Não há UI de administração no dev, então sem isto nenhum coletivo sairia de `pending`.
- **Produção e CI não carregam o seed**, então a tabela fica vazia: o comportamento é o do PoC original (aal2 + fator verificado, coletivo nasce `pending`). Os testes SQL (`tests/database/dev-flags.sql`) cobrem os dois estados inserindo as linhas dentro da transação.
- **Desligar:** apague a linha, por exemplo `delete from private.environment_flags where name = 'mfa_optional';` (ou todas). Enquanto `dev-flags` estiver no `db-dev.yml`, o próximo deploy as reinsere; para desligar de vez, remova-o do laço de seeds.

## Desenvolvimento local

```sh
pnpm install --frozen-lockfile
pnpm dev            # exige .env.local (modelo em .env.example): o app só sobe com o Supabase configurado
pnpm check          # testes de infra/unidade, typecheck, build
pnpm test:e2e:db    # Playwright contra o Supabase local (abaixo): a suíte de ponta a ponta
```

A suíte `pnpm test:e2e:db` usa Supabase local: `pnpm exec supabase start`, carregar as seeds com `psql` (como no job `e2e` de `ci.yml`; `collective-area.sql` só entra aí, não no dev) e exportar `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` a partir de `pnpm exec supabase status -o env` (`API_URL`, `PUBLISHABLE_KEY`).

No Windows com Podman (VM WSL), o `supabase start` precisa de um `docker` no `PATH` (o `podman` remoto serve) e de `DOCKER_HOST=npipe:////./pipe/podman-machine-default`; as portas publicadas pelo Podman podem não chegar a `127.0.0.1` do Windows (o CLI recusa a conexão com o banco em `127.0.0.1:55432`). Nesse caso encaminhe `55432` e `54321` de `127.0.0.1` para o IP da VM (`wsl -d podman-machine-default -- ip -4 addr show eth0`) com qualquer repassador TCP antes de subir o Supabase. O `docker.cmd` do Podman não serve para `supabase db reset` (o CLI falha com "contains a cmd.exe special character" e deixa o banco derrubado; `supabase start` o recupera): ponha no `PATH` um `docker.exe` (o cliente do Podman) antes de resetar. O stack local é um só por máquina (`supabase_*_circuitone-local`, porta do e2e `5183`): não rode `db reset` nem suítes e2e de escrita em duas worktrees ao mesmo tempo. Sem `psql` no Windows, carregue as seeds por `docker exec -i supabase_db_circuitone-local psql ...` com o mesmo conteúdo do job `e2e`.

Auditoria de acessibilidade (W16): `a11y.spec.ts`, `a11y-checks.spec.ts` e `a11y-states.spec.ts` só leem (rodam em `desktop` e `mobile`); `a11y-write.spec.ts` grava (MFA da conta candidata, contas de cadastro, rascunho de evento cancelado, mensagem do chat) e roda por último nos projetos `a11y-write-desktop` e `a11y-write-mobile`. Cada rodada completa consome três dos oito celulares de teste do cadastro (`register.spec.ts` um, os dois projetos `a11y-write-*` um cada); numa base local reaproveitada os celulares usados são pulados e, se acabarem, `supabase db reset` e as seeds repõem. Resultado e método em `docs/reviews/wcag-2.2-aa.md`.

Para o dev local, criar `.env.local` a partir de `.env.example`: `CIRCUITONE_RUNTIME=development`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_ORIGIN`. Não existe modo de demonstração com dados de mentira: sem essas variáveis o app (e `pnpm start`) recusa subir; as telas só mostram o que vem do banco.

## Storage (W11): imagens e documentos

- **Buckets:** criados pela migração `20261009100000_storage_buckets.sql` (`public-images`, público, JPG/PNG/WebP até 5.000.000 bytes; `private-documents`, privado, PDF até 10.000.000 bytes), com as políticas de `storage.objects`. Nada a criar à mão no painel; `db-dev.yml` aplica a migração no `CircuitoNE-dev` como as demais.
- **Painel do Supabase (dev):** conferir em *Storage → Settings* que o limite global de upload é de pelo menos 10 MB (o padrão do plano Free é 50 MB) e que o Storage não está pausado/desativado. O app só usa a chave publicável e a sessão do titular; nenhuma chave de serviço.
- **Local/CI:** `supabase/config.toml` liga o Storage (`[storage] enabled = true`); `supabase start` já o sobe e a migração cria os buckets (o `db start` de `tests/database` também encontra as tabelas do Storage). O e2e `uploads.spec.ts` envia e apaga arquivos de verdade.
- **Fotos de demonstração:** os dados sintéticos não trazem imagens (as páginas mostram as imagens neutras de `public/*-fallback.svg`). Para a demo, entrar com uma conta do dev (por exemplo a dona de um artista ou de um coletivo) e enviar pela interface: foto principal e galeria em `/painel/perfil/:atuacaoId`, imagem do coletivo em `/coletivo/:id/perfil`, capa do evento (ou o link externo) em `/coletivo/:id/eventos/:eventId`. Há também o workflow manual `demo-images.yml` (`scripts/demo-images.mjs`): entra como cada conta `demo-*` com a chave publicável e o secret `FIXTURE_PASSWORD`, gera arte no visual do site (gradiente, waveform, iniciais; sem fotos de terceiros) e anexa foto principal + 2 de galeria aos artistas e uma imagem aos coletivos pelas mesmas RPCs da interface. É idempotente: o que já tem imagem é pulado.
- **Órfãos:** substituir ou remover apaga o objeto antigo na hora. Excluir uma atuação (ou a conta) não apaga os objetos dela: o banco só registra o prefixo em `private.storage_cleanup`, cujo executor ainda não existe no PoC.

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
