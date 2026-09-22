# Ambiente e operação

## Escolha de hospedagem

O responsável escolheu usar **Podman neste Windows por enquanto**, com possibilidade de levar a aplicação ao Debian próprio. O preview atual é estático: build Node/Vite e execução com Caddy. A [arquitetura aprovada em 22/09/2026](../specs/architecture-mvp.md) prevê React Router Framework com SSR, runtime Node e Caddy como proxy HTTPS. Essa migração está planejada na fase 0; os comandos abaixo ainda descrevem o protótipo estático. Supabase gerenciado continua responsável pelo banco, Auth e Storage.

O container local é preview do protótipo. Não equivale à homologação integrada com banco e não oferece disponibilidade de produção: depende deste computador e da VM ligada.

## Executar neste host

Podman 6.0.2 e máquina WSL já estavam instalados. Outros serviços ocupavam 8443, entre outras portas; eles não foram alterados. Container atual: `circuitone-preview`, imagem `localhost/circuitone:foundation`, porta 5178 → 8080.

```powershell
podman build --format docker -t localhost/circuitone:foundation .
podman run -d --name circuitone-preview --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --cpus 1 -p 5178:8080 localhost/circuitone:foundation
```

O comando de criação é para ambiente novo, não para repetir com o nome ocupado. Para o container existente:

```powershell
podman start circuitone-preview
podman logs --tail 30 circuitone-preview
podman inspect circuitone-preview --format '{{.State.Status}} health={{.State.Health.Status}}'
podman stop circuitone-preview
```

Nesta máquina, o encaminhamento WSL para `localhost` não funcionou. O acesso validado em 21/09/2026 foi **http://172.23.250.196:5178**. O IP pode mudar ao reiniciar a VM; consultar `podman machine ssh ip -4 -brief address` e usar o endereço de `eth0`. A publicação da porta vale para as interfaces da VM; não foi configurado túnel público nem DNS. Não alteramos a rede ou reiniciamos a VM que já atende outros serviços.

```powershell
$env:HOSTING_URL = 'http://172.23.250.196:5178'
pnpm test:hosting
```

O teste verifica home, acesso direto a rota React, bundle JavaScript, bloqueio de caminhos internos e 404 de asset ausente. `--format docker` preserva o HEALTHCHECK na imagem construída pelo Podman. Processo usa UID 1000, raiz somente leitura, capabilities removidas e proibição de novos privilégios. Diretórios de runtime do Caddy são graváveis; arquivos da aplicação não são. O Caddy perde a capability gravada no binário durante o build, pois escuta em 8080 e não precisa dela.

Imagens base são fixadas por digest; Dependabot propõe atualizações revisáveis. `.dockerignore` permite somente entradas necessárias ao build. Nenhum `.env`, histórico Git ou arquivo de credenciais entra no contexto. O frontend ainda não usa Supabase. No build estático, variável em runtime não altera JavaScript já compilado. Na migração SSR, definir configuração por ambiente no servidor e expor ao cliente somente URL e chave **publicável**, com teste de seleção do projeto. Nunca incluir chave secreta no bundle.

## Ferramentas e CI

Node **22.23.2**, pnpm **10.34.3**. `pnpm-workspace.yaml` seleciona esse Node para os comandos do projeto sem substituir o Node global do Windows. `.mise.toml` documenta as mesmas versões. O container usa Node 22.23.2 por digest; CI e pnpm também fixam esse patch. [Decisão e limites](../decisions/0003-phase-zero-toolchain.md).

`pnpm check` executa testes de infraestrutura/unidade, TypeScript, regressão de build CSS e build final. `pnpm audit --audit-level=high` inclui dependências de desenvolvimento. CI também constrói a imagem e executa os testes HTTP no container. Actions fixadas por SHA e token somente leitura. O runner é hospedado no GitHub; não instalar runner de PR neste host nem no Debian de produção.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:coverage
```

Playwright usa servidor próprio em `127.0.0.1:5182`, encerrado ao terminar. Não reutiliza o preview do responsável. Testa Chromium em desktop/mobile, relógio fixo e rede externa bloqueada. As imagens/fontes remotas não são validadas nessa suíte. Relatórios ficam em `playwright-report/` e `coverage/` (LCOV/HTML/JSON), ignorados pelo Git. O mapa das 27 rotas está em `tests/e2e/routes.spec.ts`; as rotas privadas usam sessão mock, sem provar autorização.

O [workflow](../../.github/workflows/ci.yml) inclui E2E Chromium, cobertura e publicação de `quality-reports` por sete dias no job `quality`, além do job `database` com banco descartável. A action pnpm v6.1.0 usa runtime Node 24 e preserva o pnpm do projeto. Resultados de execução e aceite ficam no [PR #45](https://github.com/IgnisDevNE/CircuitoNE/pull/45); não encerrar [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34) sem validá-los.

Em 22/09/2026, o responsável autorizou explicitamente sua credencial para publicar esta alteração de CI. A exceção se limita a essa operação; o App continua sem Workflows e segue como identidade padrão. A proteção `require_last_push_approval` permanece: um push autenticado como `magalz` exige aprovação de outra pessoa. Não retirar a regra nem simular um push do bot para contorná-la. Essa manutenção não resolve o isolamento de [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31).

Os jobs automáticos de CI não publicam imagens, não acessam secrets e não migram bancos remotos. A opção manual descrita abaixo verifica somente credenciais de homologação em outro job. A automação de homologação e promoção é F0-T4/T5, depois da separação de identidade e das credenciais apropriadas. Até lá, não promover o protótipo por estar com CI verde.

### Verificar credenciais de homologação

O CI inclui a opção `validate_homologation`, desativada por padrão. Publicar/revisar o workflow e integrá-lo em `main` antes de disparar:

```powershell
$env:GITHUB_APP_ACTIONS_WRITE = '1'
node scripts/github-app.mjs gh workflow run ci.yml --ref main -f validate_homologation=true
Remove-Item Env:GITHUB_APP_ACTIONS_WRITE
```

O bot precisa de `Actions: write` para o disparo (permissão temporária informada pelo responsável em 22/09/2026); publicar alterações no YAML requer `Workflows: write` separadamente. O job `homologation-credentials` só roda em `main`, pede aprovação do environment `Homologação` e usa runner Ubuntu 24.04 descartável, sem checkout/código da aplicação. O mantenedor deve conferir ator, SHA e workflow antes de liberar o environment; `prevent_self_review` permanece habilitado. A permissão de Actions pode ser retirada ao concluir a operação temporária.

O helper também limita as permissões de cada token. Por padrão, continua pedindo Actions somente leitura e nenhum Workflows. Somente na operação autorizada, definir `GITHUB_APP_ACTIONS_WRITE=1` para disparo ou `GITHUB_APP_WORKFLOWS_WRITE=1` para publicar YAML; remover a variável após o comando. Nenhum outro valor ativa esses flags. O token continua limitado ao CircuitoNE e não ganha Administration/Secrets/Environments. A instalação precisa ter concedido a permissão correspondente; os flags locais não substituem essa autorização.

Entradas verificadas: variáveis `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`, cada um em sua própria etapa. O destino é fixo em `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`). Token valida leitura da configuração do projeto; senha valida sessão PostgreSQL pela porta 5432 com TLS `verify-full` e consulta literal em transação de leitura. Nenhum reset, migração, seed ou deploy. Não há opção de produção.

Testes offline em `tests/homologation-workflow.test.mjs` executam os scripts do próprio YAML com respostas/processos simulados: destino errado/credencial ausente, erros HTTP, limite de resposta, host inesperado, isolamento do token, TLS/leitura e falhas sem vazamento. Foram escritos antes do job (seis falhas esperadas), depois passaram. Isso não comprova a validade dos secrets reais: o resultado remoto, SHA, ator e aprovação ficam na [issue #32](https://github.com/IgnisDevNE/CircuitoNE/issues/32). A [ADR 0003](../decisions/0003-phase-zero-toolchain.md) registra escopo e limites; #31 continua aberto.

## GitHub e ambientes

Repositório existente: [IgnisDevNE/CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE), público na inspeção inicial; a visibilidade foi preservada. Baseline importado em `main`; preparação em `codex/project-foundation` e [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2). O estado verificado das proteções e do CI está no [relatório](../reviews/foundation-validation.md).

- `main`: exigir PR, revisão independente, CODEOWNERS nos contratos/testes/infra, CI e resolução de comentários; sem force push ou exclusão. Administradores também sujeitos à proteção de branch. A conta administrativa ainda pode alterar a configuração: por isso deve sair do ambiente do implementador.
- Ambiente **Homologação**: projeto `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`, São Paulo), revisão de `magalz` e prevenção de autoaprovação. Variável `SUPABASE_PROJECT_REF` definida; sem secrets nesta preparação.
- Ambiente **Producao**: projeto `CircuitoNE` (`mwgccjvztzbderlwtheg`, US West), revisão de `magalz`, prevenção de autoaprovação, apenas branches protegidas (atualmente `main`). Variável de referência definida; sem secrets nesta preparação.
- Alertas de dependências/correções automáticas habilitados. Squash é o método de merge; exclusão automática de branch após merge habilitada. Branch atual permanece enquanto PR não for aprovado/concluído.

O App `ignisdevne` foi conectado em 22/09/2026, com identidade `ignisdevne[bot]`. O PR inicial de `magalz` foi encerrado e substituído pelo [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2), aberto pelo App, com o último push revisável também vindo dele. Assim, a revisão pode ser feita pelo humano. Um job disparado por `magalz` não pode ser aprovado por ele mesmo quando a prevenção de autoaprovação está ativa. O mantenedor prepara mudanças de workflows, que o App não pode escrever. Não remover proteção para contornar isso. CODEOWNERS só passa a valer como regra de propriedade após entrar na branch base.

### Autenticação local do App

Use o helper para comandos do agente:

```powershell
node scripts/github-app.mjs gh pr list
node scripts/github-app.mjs gh pr checks
node scripts/github-app.mjs git push
```

O helper usa Node nativo, emite um token temporário limitado ao repositório ID 1380574734 e o fornece somente ao processo `gh`/`git`. Não imprime nem grava o token; não faz login global nem substitui a credencial humana salva. Commits feitos por esse helper usam autor/committer `ignisdevne[bot]`. Para o Git, a cadeia de helpers é substituída somente no comando, sem fallback interativo para a conta humana.

A chave fornecida está em `secrets/ignisdevne.2026-09-21.private-key.pem`; a pasta inteira está ignorada pelo Git e excluída do contexto do container. Nenhum desses arquivos estava versionado na inspeção. Para outro caminho ou rotação, definir `GITHUB_APP_PRIVATE_KEY_FILE`. O arquivo `githubapp-secret.txt` não é usado por esse fluxo de autenticação por instalação.

A instalação 163660443 (App 5028495) cobre todos os repositórios da IgnisDevNE por decisão do responsável. Limitar tokens não reduz o poder da chave privada; por isso a separação definitiva exige emissor controlado fora do ambiente implementador e QA fora dessa instalação. A configuração local atual é uma etapa de bootstrap, não prova de isolamento contra processos que ainda possam acessar credenciais humanas.

## Homologação Supabase

Na inspeção, `CircuitoNE-dev` estava saudável, sem tabelas públicas e sem migrações. Nenhuma migração foi aplicada. A futura integração deve fixar CLI, preparar [migrações canônicas](../migrations/README.md) e usar credenciais de ambiente com escopo mínimo. Não pedir ou registrar secrets em chat; inseri-los no mecanismo de secrets do ambiente.

A [auditoria de 22/09/2026](../reviews/supabase-environments-2026-09-22.md) confirmou os dois projetos saudáveis, mas encontrou Auth ainda com URLs locais padrão, SMTP próprio desligado e concessões automáticas amplas na Data API. Login do painel foi concluído pelo responsável. Variáveis/secrets dos environments não puderam ser revalidados pelo App (403); os valores acima registram a preparação anterior, não uma nova confirmação.

CLI 2.117.0 e `pnpm db:prepare` já estão disponíveis. O comando gera uma pasta `.tmp-supabase-run-*` com configuração de banco descartável, cópias dos SQL e manifesto SHA-256. Não executa SQL nem conecta a serviços. O Supabase local **ainda não funciona diretamente neste Windows**: a CLI recusou o wrapper `docker.cmd` do Podman; um ensaio com executável nativo superou essa etapa, mas falhou na conexão `127.0.0.1:55432` porque o encaminhamento WSL está indisponível.

O caminho alternativo foi validado executando a CLI em um container Linux temporário sobre o Podman, com rede do host e acesso ao socket do Podman: duas reconstruções e verificação SQL passaram. Esse ensaio tem acesso privilegiado ao daemon e **não é o ambiente isolado de QA**, nem deve executar código de PR não confiável neste host. Foram usados apenas arquivos do ensaio, sem montar secrets ou o repositório inteiro. Em Alpine, foi necessário selecionar o binário musl da CLI, pois sua seleção padrão pode escolher glibc quando ambos estão instalados. O CI usa Ubuntu e não precisa desse ajuste.

`pnpm test:database` prepara um projeto local com identificador único, aplica migrações canônicas mais uma migração sintética temporária, reconstrói duas vezes e consulta constraints/RLS. Também provoca perda de proteção e exige a falha específica do verificador. Encerra somente seu projeto, removendo seus volumes; não usa `--all` nem credenciais/destinos remotos. O job `database` está no workflow; após execução bem-sucedida no GitHub, acrescentá-lo aos checks obrigatórios sem retirar `quality`. [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) permanece aberto para schema/contratos reais e homologação compartilhada. Não alteramos a rede/VM nem os demais serviços.

Testes destrutivos e `reset` usam banco descartável local/CI. Homologação compartilhada recebe migrações revisadas, em sequência, com bloqueio de concorrência e registro de SHA/checksum. Preview usa somente dados fictícios. Produção nunca é destino de teste de schema.

As regiões diferentes exigem decisão antes de dados reais. Banco e arquivos têm estratégias próprias de backup; registrar retenção, responsáveis, perda aceitável e tempo de recuperação. Testar restauração de ambos antes do beta; não presumir que backup de Postgres recupera objetos de Storage.

## Codecov

A instância própria em [pipeline.magalz.space](https://pipeline.magalz.space) foi inspecionada em 22/09/2026. `magalz` está ativo e `IgnisDevNE/CircuitoNE` habilitado para cobertura. A associação de organizações pelo login OAuth ainda depende de autorização no GitHub; upload real no CI não foi configurado. Causa, ações e encerramento da pendência em [diagnóstico Codecov](../reviews/codecov-diagnosis.md). F0-T13 prevê cobertura local como artefato enquanto a integração externa estiver deferida.

## Caminho para Debian

1. Confirmar recursos, arquitetura, serviços existentes, acesso administrativo e política de atualização do servidor.
2. Após a migração SSR, executar o runtime Node e o proxy Caddy revisados por digest com Podman rootless; serviço systemd/Quadlet para reinício e logs. Não fazer build de PR no host de produção. O container estático atual não entrega SSR.
3. Configurar proxy HTTPS e DNS para **`circuitone.magalz.space`** (produção) e **`circuitone-dev.magalz.space`** (dev), nomes aprovados pelo responsável. Dev usa exclusivamente `CircuitoNE-dev`, com seeds sintéticos; produção usa `CircuitoNE`. Os domínios ainda não foram implantados nesta preparação. Certificados automáticos dependem de DNS e conectividade corretos. Seguir a [spec de ambientes e dados de teste](../specs/environments-and-test-data.md).
4. Restringir portas, proteger o acesso administrativo, monitorar disponibilidade e espaço, registrar rotação de logs e alertas. Servir a aplicação atrás de HTTPS; HTTP do preview local não é configuração de produção.
5. Promover artefato homologado, testar home/deep link/Auth, e manter digest anterior para rollback. Migrações precisam de plano próprio; voltar o container não desfaz SQL.

Previews de PR serão criados sob demanda no início e removidos ao encerrar o PR. Evitar multiplicar banco/servidor por PR antes de haver necessidade. Na integração, impedir que um preview acesse dados de produção e limitar URLs de callback do Auth por ambiente.

Referências: [Caddy para SPAs](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas), [HTTPS automático](https://caddyserver.com/docs/automatic-https), [Supabase: ambientes](https://supabase.com/docs/guides/deployment/managing-environments).
