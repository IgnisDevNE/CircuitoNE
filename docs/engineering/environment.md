# Ambiente e operação

## Hospedagem local SSR

O responsável escolheu Podman neste Windows, com migração futura para Debian. A aplicação já usa React Router Framework com SSR, Node 24 e Caddy; ainda usa fixtures, sem integração de Auth ou banco. Supabase gerenciado continua sendo o destino aprovado para banco, Auth e Storage.

Um pod por ambiente compartilha somente o namespace de rede. Node fica em `127.0.0.1:3000`, acessível apenas dentro do pod; Caddy publica 8080. A [ADR 0011](../decisions/0011-container-loopback-proxy.md) registra o motivo e os limites. A rede padrão `podman` funciona pelo Windows; a rede customizada falhou no encaminhamento WSL deste host.

Para um ensaio novo, sem substituir serviços existentes:

```powershell
podman build --format docker -t localhost/circuitone-app:f0 .
podman build --format docker -f deploy/Caddy.Dockerfile -t localhost/circuitone-proxy:f0 .
podman pod create --name circuitone-hosting-pod --network podman --share net -p 5186:8080
podman run -d --name circuitone-pod-app --pod circuitone-hosting-pod --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 512m -e CIRCUITONE_RUNTIME=preview -e HOST=127.0.0.1 localhost/circuitone-app:f0
podman run -d --name circuitone-pod-proxy --pod circuitone-hosting-pod --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 128m localhost/circuitone-proxy:f0
$env:HOSTING_URL = 'http://172.23.250.196:5186'
pnpm test:hosting
```

Não repetir criação com nomes ocupados. Para o pod existente, usar `podman pod start circuitone-hosting-pod`, `podman pod stop circuitone-hosting-pod` ou `podman pod restart circuitone-hosting-pod`. No Docker do CI, criar Node primeiro e recriar a dupla se a aplicação for substituída: Caddy usa o namespace daquele container específico.

O IP acima é o endereço atual da VM, sujeito a mudança; consultar `podman machine ssh ip -4 -brief address`. As portas publicadas na VM exigem restrição de acesso antes de exposição remota do demo. Cloudflare Access e Tunnel ainda precisam de validação ponta a ponta antes de publicar os domínios; esta configuração não comprova essa proteção. O antigo `circuitone-preview` em 5178 não foi removido, mas estava parado no retorno da sessão em 26/09/2026.

O ensaio passou home, deep link SSR, assets e bloqueio de arquivos internos, inclusive após reiniciar o pod. Um container independente alcançou o proxy pela bridge e teve acesso ao Node negado. O CI verifica rotas e bloqueio do acesso direto ao Node; o reinício foi testado somente no host local. Isso não comprova produção em espera, integração com Supabase ou reinício automático após reboot do Windows, pendentes na [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43).

Imagens são fixadas por digest e `--format docker` preserva HEALTHCHECK. Aplicação e proxy usam usuários sem privilégios, raiz somente leitura, capabilities removidas e proibição de novos privilégios; `/tmp` é volátil. `.dockerignore` exclui secrets e histórico Git. Nenhuma credencial privilegiada deve entrar no container. Este host e sua VM precisam estar ligados; o ensaio não oferece disponibilidade de produção.

## Ferramentas e CI

Node **24.21.0 LTS**, pnpm **10.34.3**. `pnpm-workspace.yaml` seleciona esse Node para os comandos do projeto sem substituir o Node global do Windows. `.mise.toml` documenta as mesmas versões. A imagem de build usa Node 24.21.0 por digest; CI e pnpm fixam esse patch. O teste de toolchain verifica o alinhamento. [Decisão e limites](../decisions/0003-phase-zero-toolchain.md).

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

Em 22/09/2026, o responsável autorizou explicitamente sua credencial para publicar esta alteração de CI. Naquele momento, o App não tinha `Workflows:write`; a permissão foi concedida depois, temporariamente, e ainda consta na instalação ([controle de acesso](../controls/access-control.md)). A proteção `require_last_push_approval` permanece: um push autenticado como `magalz` exige aprovação de outra pessoa. Não retirar a regra nem simular um push do bot para contorná-la. Essa manutenção não resolve o isolamento de [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31).

Os jobs automáticos de CI não publicam imagens, não acessam secrets e não migram bancos remotos. Os jobs manuais de credenciais de homologação e produção são separados e apenas de leitura. O workflow manual de migrações em homologação está preparado, mas desativado pela variável `HOMOLOGATION_DB_WRITE_ENABLED` até o isolamento da [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); ele não realiza deploy nem promoção de produção. Até lá, não promover o protótipo por estar com CI verde.

### Verificar credenciais de homologação

O CI inclui a opção `validate_homologation`, desativada por padrão. Publicar/revisar o workflow e integrá-lo em `main` antes de disparar:

```powershell
$env:GITHUB_APP_ACTIONS_WRITE = '1'
node scripts/github-app.mjs gh workflow run ci.yml --ref main -f validate_homologation=true
Remove-Item Env:GITHUB_APP_ACTIONS_WRITE
```

O bot precisa de `Actions: write` para o disparo (permissão temporária informada pelo responsável em 22/09/2026); publicar alterações no YAML requer `Workflows: write` separadamente. O job `homologation-credentials` só roda em `main`, pede aprovação do environment `Homologação` e usa runner Ubuntu 24.04 descartável, sem checkout/código da aplicação. O mantenedor deve conferir ator, SHA e workflow antes de liberar o environment; `prevent_self_review` permanece habilitado. A permissão de Actions pode ser retirada ao concluir a operação temporária.

O helper também limita as permissões de cada token. Por padrão, continua pedindo Actions somente leitura e nenhum Workflows. Somente na operação autorizada, definir `GITHUB_APP_ACTIONS_WRITE=1` para disparo ou `GITHUB_APP_WORKFLOWS_WRITE=1` para publicar YAML; remover a variável após o comando. Nenhum outro valor ativa esses flags. O token continua limitado ao CircuitoNE e não ganha Administration/Secrets/Environments. A instalação precisa ter concedido a permissão correspondente; os flags locais não substituem essa autorização.

Entradas verificadas: variáveis `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`, cada um em sua própria etapa. Neste job, o destino é fixo em `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`). Token valida leitura da configuração do projeto; senha valida sessão PostgreSQL pela porta 5432 com TLS `verify-full` e consulta literal em transação de leitura. Nenhum reset, migração, seed ou deploy. A produção usa outro workflow protegido.

O pooler exige a CA pública do Supabase, ausente no conjunto padrão do sistema. O job baixa a [CA indicada pelo painel](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt) em etapa sem secrets, limita tempo/tamanho e confere SHA-256 antes da conexão. O arquivo fica apenas no diretório temporário do runner. Se o hash mudar, conferir a origem no painel, validade e conexão TLS antes de atualizar o workflow por PR; nunca trocar `verify-full` por um modo mais fraco. A primeira execução protegida passou na configuração/token e falhou no banco; a [reexecução 35716720248](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35716720248) validou a senha e TLS, registrada em [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32).

Testes offline em `tests/homologation-workflow.test.mjs` executam os scripts do próprio YAML com respostas/processos simulados: destino errado/credencial ausente, erros HTTP, limite de resposta, host inesperado, isolamento do token, TLS/leitura e falhas sem vazamento. Foram escritos antes do job (seis falhas esperadas), depois passaram. Isso não comprova a validade dos secrets reais: o resultado remoto, SHA, ator e aprovação ficam na [issue #32](https://github.com/IgnisDevNE/CircuitoNE/issues/32). A [ADR 0003](../decisions/0003-phase-zero-toolchain.md) registra escopo e limites; #31 continua aberto.

## GitHub e ambientes

Repositório existente: [IgnisDevNE/CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE), público na inspeção inicial; a visibilidade foi preservada. Baseline importado em `main`; preparação em `codex/project-foundation` e [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2). O estado verificado das proteções e do CI está no [relatório](../reviews/foundation-validation.md).

- `main`: exigir PR, revisão independente, CODEOWNERS nos contratos/testes/infra, CI e resolução de comentários; sem force push ou exclusão. Administradores também sujeitos à proteção de branch. A conta administrativa ainda pode alterar a configuração: por isso deve sair do ambiente do implementador.
- Ambiente **Homologação**: projeto `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`, São Paulo), revisão de `magalz` e prevenção de autoaprovação. Variável `SUPABASE_PROJECT_REF` definida; sem secrets nesta preparação.
- Ambiente **Producao**: o projeto inicial `mwgccjvztzbderlwtheg` (Oregon) foi removido vazio em 22/09/2026 e substituído por `CircuitoNE` (`ukyoyrmebwadmuzkswdw`, São Paulo). Com autorização expressa para a conta humana, as variáveis `SUPABASE_PROJECT_REF`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` foram atualizadas e conferidas em 23/09/2026 UTC. O responsável cadastrou `SUPABASE_DB_PASSWORD` do novo banco e substituiu o token de gerenciamento antigo por um PAT de 90 dias restrito ao projeto e a `Connection Pooling: Read`, com rotação até 22/12/2026. O App recebeu HTTP 403 ao ler variables/secrets e continua sem esse acesso. O [workflow protegido](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35813985190) comprovou conexão; ver [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) para as demais pendências.

O [workflow manual de produção](../../.github/workflows/validate-production.yml) só executa na `main`, dentro do environment `Producao` protegido. Ele verifica variáveis e token, obtém o destino do pooler pela API de gerenciamento, valida a senha com TLS `verify-full` e consulta literal em transação somente leitura. Não faz checkout, migração, seed ou deploy; exige aprovação do environment a cada execução. A [primeira execução](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35812265787) falhou ao consultar o pooler com o token anterior, antes de testar a senha; o workflow não registrou o código HTTP. Após a substituição do token, a [segunda](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35813985190) passou em todas as etapas. Isso não comprova Auth, callbacks, RLS, SMTP nem deploy da aplicação.
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

A instalação 163660443 (App 5028495) está hoje em `selected repositories`, apenas `IgnisDevNE/CircuitoNE`; o QA permanece excluído. O responsável pretende reutilizar o bot em outros repositórios da organização, que deverão ser selecionados individualmente. Limitar tokens não reduz o poder da chave privada; por isso a separação definitiva exige emissor controlado fora do ambiente implementador. A configuração local atual é uma etapa de bootstrap, não prova de isolamento contra processos que ainda possam acessar credenciais humanas.

## Homologação Supabase

Na inspeção, `CircuitoNE-dev` estava saudável, sem tabelas públicas e sem migrações. Nenhuma migração foi aplicada. A futura integração deve fixar CLI, preparar [migrações canônicas](../migrations/README.md) e usar credenciais de ambiente com escopo mínimo. Não pedir ou registrar secrets em chat; inseri-los no mecanismo de secrets do ambiente.

A [auditoria de 22/09/2026](../reviews/supabase-environments-2026-09-22.md) confirmou os dois projetos saudáveis, mas encontrou Auth ainda com URLs locais padrão, SMTP próprio desligado e concessões automáticas amplas na Data API. Login do painel foi concluído pelo responsável. Variáveis/secrets dos environments não puderam ser revalidados pelo App (403); os valores acima registram a preparação anterior, não uma nova confirmação.

CLI 2.117.0 e `pnpm db:prepare` já estão disponíveis. O comando gera uma pasta `temp/supabase-run-*` com configuração de banco descartável, cópias dos SQL e manifesto SHA-256. Não executa SQL nem conecta a serviços. O Supabase local **ainda não funciona diretamente neste Windows**: a CLI recusou o wrapper `docker.cmd` do Podman; um ensaio com executável nativo superou essa etapa, mas falhou na conexão `127.0.0.1:55432` porque o encaminhamento WSL está indisponível.

O caminho alternativo foi validado executando a CLI em um container Linux temporário sobre o Podman, com rede do host e acesso ao socket do Podman: duas reconstruções e verificação SQL passaram. Esse ensaio tem acesso privilegiado ao daemon e **não é o ambiente isolado de QA**, nem deve executar código de PR não confiável neste host. Foram usados apenas arquivos do ensaio, sem montar secrets ou o repositório inteiro. Em Alpine, foi necessário selecionar o binário musl da CLI, pois sua seleção padrão pode escolher glibc quando ambos estão instalados. O CI usa Ubuntu e não precisa desse ajuste.

`pnpm test:database` prepara um projeto local com identificador único, aplica migrações canônicas mais uma migração sintética temporária, reconstrói duas vezes e consulta constraints/RLS. Também provoca perda de proteção e exige a falha específica do verificador. Encerra somente seu projeto, removendo seus volumes; não usa `--all` nem credenciais/destinos remotos. O job `database` está no workflow; após execução bem-sucedida no GitHub, acrescentá-lo aos checks obrigatórios sem retirar `quality`. [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) permanece aberto para schema/contratos reais e homologação compartilhada. Não alteramos a rede/VM nem os demais serviços.

Testes destrutivos e `reset` usam banco descartável local/CI. Homologação compartilhada recebe migrações revisadas, em sequência, com bloqueio de concorrência e registro de SHA/checksum. Preview usa somente dados fictícios. Produção nunca é destino de teste de schema.

As regiões diferentes exigem decisão antes de dados reais. Banco e arquivos têm estratégias próprias de backup; registrar retenção, responsáveis, perda aceitável e tempo de recuperação. Testar restauração de ambos antes do beta; não presumir que backup de Postgres recupera objetos de Storage.

## Backup

O desenho e o estado dos backups de banco **e** objetos ficam no [runbook de backup](backup.md). A rotina e a restauração permanecem critérios da #43; a criptografia antes de dados reais é o bloqueio separado #104.

## Codecov

O CI preserva `codecov-lcov`. O publicador separado `codecov-publish.yml`, definido em `main`, verifica os jobs `quality` e `database` da execução original, baixa somente seu LCOV e envia à [instância própria](https://pipeline.magalz.space/gh/IgnisDevNE/CircuitoNE). Ele usa o token exclusivo do repositório no environment GitHub `Codecov Upload`, restrito a `main`, sem executar código de PR. O [primeiro relatório de `main`](https://pipeline.magalz.space/github/IgnisDevNE/CircuitoNE/commit/e74153ef47e388959477e2c3410f9dfffe02503f) foi processado com 43,13% de cobertura. `codecov.yml` permite o comentário e mantém status informativos; validar comentário e metadados numa PR real antes de concluir [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30). Ver [ADR 0007](../decisions/0007-codecov-self-hosted-target.md).

Os artefatos `quality-reports` e `codecov-lcov` duram sete dias, mesmo se o serviço externo falhar. O upload não é check obrigatório. PRs de forks mantêm apenas artefatos nesta etapa. [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29) foi encerrada após verificar o acesso pessoal; [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) acompanha comentário e casos Dependabot/forks. O [diagnóstico](../reviews/codecov-diagnosis.md) preserva a evidência operacional.

## Caminho para Debian

1. Confirmar recursos, arquitetura, serviços existentes, acesso administrativo e política de atualização do servidor.
2. Após a migração SSR, executar o runtime Node e o proxy Caddy revisados por digest com Podman rootless; serviço systemd/Quadlet para reinício e logs. Não fazer build de PR no host de produção. O container estático atual não entrega SSR.
3. Configurar proxy HTTPS e DNS para **`circuitone.magalz.space`** (produção) e **`circuitone-dev.magalz.space`** (dev), nomes aprovados pelo responsável. Dev usa exclusivamente `CircuitoNE-dev`, com seeds sintéticos; produção usa `CircuitoNE`. Os domínios ainda não foram implantados nesta preparação. Certificados automáticos dependem de DNS e conectividade corretos. Seguir a [spec de ambientes e dados de teste](../specs/environments-and-test-data.md).
4. Restringir portas, proteger o acesso administrativo, monitorar disponibilidade e espaço, registrar rotação de logs e alertas. Servir a aplicação atrás de HTTPS; HTTP do preview local não é configuração de produção.
5. Promover artefato homologado, testar home/deep link/Auth, e manter digest anterior para rollback. Migrações precisam de plano próprio; voltar o container não desfaz SQL.

Previews de PR serão criados sob demanda no início e removidos ao encerrar o PR. Evitar multiplicar banco/servidor por PR antes de haver necessidade. Na integração, impedir que um preview acesse dados de produção e limitar URLs de callback do Auth por ambiente.

Referências: [Caddy para SPAs](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas), [HTTPS automático](https://caddyserver.com/docs/automatic-https), [Supabase: ambientes](https://supabase.com/docs/guides/deployment/managing-environments).
