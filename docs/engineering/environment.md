# Ambiente e operação

O ambiente do **implementador** e a sincronização pós-PR do Windows estão no [guia do agente isolado](agent-runtime.md). Os procedimentos abaixo descrevem hospedagem e manutenção; a sessão Windows não deve ser confundida com o container do agente.

## Hospedagem local SSR

O responsável escolheu Podman neste Windows, com migração futura para Debian. A aplicação já usa React Router Framework com SSR, Node 24 e Caddy; a versão publicada ainda usa fixtures. A sessão SSR está implementada no código; sua integração completa em navegador continua na #23 antes da publicação do login. Supabase gerenciado continua sendo o destino aprovado para banco, Auth e Storage.

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

O IP acima é o endereço atual da VM, sujeito a mudança; consultar `podman machine ssh ip -4 -brief address`. Não há portproxy nem listener Windows em 5186/5187; não criar encaminhamento público dessas portas para contornar Access. O antigo `circuitone-preview` em 5178 não foi removido, mas estava parado no retorno da sessão em 26/09/2026.

O ensaio passou home, deep link SSR, assets e bloqueio de arquivos internos, inclusive após reiniciar o pod. Um container independente alcançou o proxy pela bridge e teve acesso ao Node negado. O CI verifica rotas e bloqueio do acesso direto ao Node; o reinício foi testado somente no host local. Schema e recuperação sintética de dev passaram na #32/#43. O reboot real foi seguido por retomada manual em 02/10; diagnóstico automático na [#149](https://github.com/IgnisDevNE/CircuitoNE/issues/149).

### Domínios publicados em 26/09/2026

A [PR #110](https://github.com/IgnisDevNE/CircuitoNE/pull/110) foi integrada em `9dfb396`; [CI](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36266836015) e [promoção QA](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/36266942956) passaram no commit integrado. Imagens locais: app `fe0751e221ce3580288bf9202344b0d10ebc685a4b8ed06aa720d8f64aba2f0d`; proxy `4d02f9c020aa6881d65299330f15b62214b1ada68b5c17b05290f31b46e89efb`. O build de app é idêntico ao artefato anterior; o proxy contém o destino loopback revisado.

- [Dev](https://circuitone-dev.magalz.space): pod `circuitone-hosting-pod`, porta 5186, runtime `development`, referência dev e `DEMO_MODE=true`. Cloudflare Access cobre todo o domínio, com uma política Allow somente para `ignisdev@magalz.space`. As rotas `/`, `/artistas/art-anerie` e `/assets/missing.js` exigiram login no teste externo sem sessão. O acesso permitido foi confirmado pelo mantenedor após OTP em 27/09; o teste independente sem cookies recebeu 302 para Access, sem alcançar a aplicação. [Evidência](https://github.com/IgnisDevNE/CircuitoNE/issues/43#issuecomment-5853245513).
- [Produção](https://circuitone.magalz.space): pod `circuitone-production-pod`, porta 5187, runtime `production`, referência de produção e `DEMO_MODE=false`. `/` mostra espera e `/healthz` retorna 200; login, perfil de artista, asset ausente e `.env` retornam 404. Nenhum dado real é servido.

Os CNAMEs apontam para o tunnel `homelab`; a configuração local acrescenta apenas os dois hostnames antes do catchall, sem mudar as 29 rotas anteriores. O mantenedor precisou reiniciar o serviço como administrador. O arquivo anterior permanece em `C:\Users\magal\.cloudflared\config.before-circuitone-20260926.yml` para rollback; as novas rotas foram validadas pelo CLI. O serviço está automático e conectado. O resolvedor local ainda guardava NX no teste; DNS público 1.1.1.1 e HTTPS com resolução explícita ao IP publicado passaram, sem ignorar certificados.

### Retomar os pods após login

`deploy/start-host.ps1` inicia somente a máquina existente `podman-machine-default`, caso esteja parada, e os dois pods existentes. Não cria recursos, constrói imagens, troca versões, usa credenciais ou reinicia cloudflared. Máquina desconhecida ou erro nativo interrompe a execução. Pode ser chamado manualmente:

```powershell
powershell.exe -NoProfile -NonInteractive -File deploy/start-host.ps1
```

A [PR #112](https://github.com/IgnisDevNE/CircuitoNE/pull/112) foi integrada em `006bfb45`; [CI](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36269079826) e [promoção QA](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/36269223310) passaram. A tarefa `CircuitoNE host resume` foi instalada em 26/09/2026 com login somente do mantenedor, `RunLevel Limited` e `LogonType Interactive`, sem senha salva. Chama PowerShell 5 em janela oculta e `D:\CircuitoNE-host\start-host.ps1`, cópia revisada fora do checkout, com três retentativas separadas por um minuto e limite de dois minutos. SHA-256 da cópia: `32A53EDD43344A6D3E46B4BB42AC445B1FA6BF421700E7203EB6C1EF99F95AF3`. Não executa branch/PR nem busca código novo no login; atualizar a cópia somente após revisão e promoção.

Teste local: chamada idempotente e execução manual pelo próprio Agendador após parar apenas os dois pods; `LastTaskResult=0`, dois testes HTTP dev passaram e o health de produção retornou 200. O serviço de terceiros permaneceu ligado. A primeira cópia em LocalAppData não era visível ao contexto nativo do Agendador; foi substituída pela cópia D: e removida, sem elevar privilégios ou alterar ACLs. [Evidência e limites](https://github.com/IgnisDevNE/CircuitoNE/issues/43#issuecomment-5849619599). O teste isolado cobre máquina ligada/parada, estado inesperado e falhas nativas sem tocar a VM. Não desligamos a VM que atende outros serviços. Reboot/login real ainda precisa ser comprovado; esse desenho depende de login do mantenedor, sem prometer disponibilidade sem sessão. Uma mudança no IP da VM exige revalidar as rotas do tunnel.

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

Em 22/09/2026, o responsável autorizou explicitamente sua credencial para publicar esta alteração de CI. Naquele momento, o App não tinha `Workflows:write`; a permissão foi concedida temporariamente no bootstrap e revogada ao concluir a [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) ([controle de acesso](../controls/access-control.md)). A proteção `require_last_push_approval` permanece: um push autenticado como `magalz` exige aprovação de outra pessoa. Não retirar a regra nem simular um push do bot para contorná-la.

Os jobs automáticos de CI não publicam imagens, não acessam secrets e não migram bancos remotos. Os jobs manuais de credenciais de homologação e produção são separados e apenas de leitura. Após o fechamento da [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31), `HOMOLOGATION_DB_WRITE_ENABLED` foi habilitada apenas em Homologação; o [workflow protegido 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488) aplicou migrações e seeds sintéticos no `CircuitoNE-dev`, sem deploy nem promoção de produção. CI verde isoladamente não autoriza produção.

### Verificar credenciais de homologação

A opção histórica `validate_homologation` do CI continua sendo uma verificação somente leitura. As permissões temporárias de disparo/publicação do implementador foram retiradas em 27/09. Para operações protegidas, usar o controlador humano `Request protected maintenance`, conforme [guia do agente](agent-runtime.md#disparos-protegidos-após-o-bootstrap); não reativar flags de bootstrap nem fornecer sessão humana ao implementador. Migrações usam `homologate.yml`, revisão do manifesto e aprovação de Homologação após o gate #31.

Entradas verificadas: variáveis `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`, cada um em sua própria etapa. Neste job, o destino é fixo em `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`). Token valida leitura da configuração do projeto; senha valida sessão PostgreSQL pela porta 5432 com TLS `verify-full` e consulta literal em transação de leitura. Nenhum reset, migração, seed ou deploy. A produção usa outro workflow protegido.

O pooler exige a CA pública do Supabase, ausente no conjunto padrão do sistema. O job baixa a [CA indicada pelo painel](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt) em etapa sem secrets, limita tempo/tamanho e confere SHA-256 antes da conexão. O arquivo fica apenas no diretório temporário do runner. Se o hash mudar, conferir a origem no painel, validade e conexão TLS antes de atualizar o workflow por PR; nunca trocar `verify-full` por um modo mais fraco. A primeira execução protegida passou na configuração/token e falhou no banco; a [reexecução 35716720248](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35716720248) validou a senha e TLS, registrada em [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32).

Testes offline em `tests/homologation-workflow.test.mjs` executam os scripts do próprio YAML com respostas/processos simulados: destino errado/credencial ausente, erros HTTP, limite de resposta, host inesperado, isolamento do token, TLS/leitura e falhas sem vazamento. Foram escritos antes do job (seis falhas esperadas), depois passaram. A validade remota foi demonstrada separadamente pela [execução protegida 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488), vinculada ao SHA `8eaaa48821428be21d85ae8a56e1b0ee740b5222`; a [ADR 0003](../decisions/0003-phase-zero-toolchain.md) registra o escopo. A #31 está encerrada.

## GitHub e ambientes

Repositório existente: [IgnisDevNE/CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE), público na inspeção inicial; a visibilidade foi preservada. Baseline importado em `main`; preparação em `codex/project-foundation` e [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2). O estado verificado das proteções e do CI está no [relatório](../reviews/foundation-validation.md).

- `main`: exigir PR, revisão independente, CODEOWNERS nos contratos/testes/infra, CI e resolução de comentários; sem force push ou exclusão. Administradores também sujeitos à proteção de branch. A conta administrativa ainda pode alterar a configuração: por isso deve sair do ambiente do implementador.
- Ambiente **Homologação**: projeto `CircuitoNE-dev` (`odphoxozclrshqjgwbqk`, São Paulo), revisão de `magalz` e prevenção de autoaprovação. Variáveis e secrets foram cadastrados; a conexão protegida de leitura passou, conforme as evidências abaixo.
- Ambiente **Producao**: o projeto inicial `mwgccjvztzbderlwtheg` (Oregon) foi removido vazio em 22/09/2026 e substituído por `CircuitoNE` (`ukyoyrmebwadmuzkswdw`, São Paulo). Com autorização expressa para a conta humana, as variáveis `SUPABASE_PROJECT_REF`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` foram atualizadas e conferidas em 23/09/2026 UTC. O responsável cadastrou `SUPABASE_DB_PASSWORD` do novo banco e substituiu o token de gerenciamento antigo por um PAT de 90 dias restrito ao projeto e a `Connection Pooling: Read`, rotacionado novamente em 27/09, expira em 26/12/2026; próxima rotação até 19/12. O token anterior foi revogado após confirmação; [verificação nova 36301777354](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36301777354) passou. O App recebeu HTTP 403 ao ler variables/secrets e continua sem esse acesso. O [workflow protegido](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35813985190) comprovou conexão; ver [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) para as demais pendências.

O [workflow manual de produção](../../.github/workflows/validate-production.yml) só executa na `main`, dentro do environment `Producao` protegido. Ele verifica variáveis e token, obtém o destino do pooler pela API de gerenciamento, valida a senha com TLS `verify-full` e consulta literal em transação somente leitura. Não faz checkout, migração, seed ou deploy; exige aprovação do environment a cada execução. A [primeira execução](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35812265787) falhou ao consultar o pooler com o token anterior, antes de testar a senha; o workflow não registrou o código HTTP. Após a substituição do token, a [segunda](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35813985190) passou em todas as etapas. Isso não comprova Auth, callbacks, RLS, SMTP nem deploy da aplicação.

Produção está no plano Free. Em 30/09/2026 foi executado `SELECT 1` no SQL Editor de produção, sem mutação; isso gera atividade pontual, não garantia de permanência ativa. A [política de pausa do Supabase](https://supabase.com/docs/guides/platform/free-project-pausing) considera baixa atividade de consultas por cerca de sete dias, e apenas o plano pago elimina a pausa automática por inatividade. A página de espera não consulta o banco. A [#144](https://github.com/IgnisDevNE/CircuitoNE/issues/144) registra a decisão de disponibilidade pré-release; até lá, monitorar avisos e retomar o projeto pelo painel se necessário, sem abrir um caminho não revisado para a senha de produção.

- Alertas de dependências/correções automáticas habilitados. Squash é o método de merge; exclusão automática de branch após merge habilitada. Branch atual permanece enquanto PR não for aprovado/concluído.

O App `ignisdevne` foi conectado em 22/09/2026, com identidade `ignisdevne[bot]`. O PR inicial de `magalz` foi encerrado e substituído pelo [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2), aberto pelo App, com o último push revisável também vindo dele. Assim, a revisão pode ser feita pelo humano. Um job disparado por `magalz` não pode ser aprovado por ele mesmo quando a prevenção de autoaprovação está ativa. Workflows write foi temporário no bootstrap e já foi revogado; a #31 foi encerrada após a revisão das provas. Não remover proteção para contornar isso. CODEOWNERS só passa a valer como regra de propriedade após entrar na branch base.

### Autenticação do implementador e manutenção

O helper consome somente token temporário com validade, sem chave privada ou login humano. O mantenedor emite o token fora do container; commits e operações continuam pelo App. [Comandos, escopo e sincronização Windows](agent-runtime.md#token-temporário-do-implementador). A instalação compartilhada seleciona CircuitoNE e SuiteWard; o emissor deste projeto solicita somente CircuitoNE. QA excluído, Actions somente leitura e nenhum Workflows/Members. As duas cópias QA de bootstrap foram removidas; secrets protegidos preservados. Windows é manutenção, não o ambiente isolado. [Inventário e negativas finais](../reviews/agent-authority-closure-20260927.md).

## Homologação Supabase

Na inspeção inicial, `CircuitoNE-dev` estava saudável, sem tabelas públicas e sem migrações. Em 30/09/2026 UTC, a [execução protegida 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488) aplicou o schema revisado e quatro seeds exclusivamente sintéticos, com smoke SQL/REST/Auth/MFA verde no SHA `8eaaa48821428be21d85ae8a56e1b0ee740b5222`. Produção permaneceu sem migrações. Não pedir ou registrar secrets em chat; inseri-los no mecanismo de secrets do ambiente.

A [auditoria histórica de 22/09/2026](../reviews/supabase-environments-2026-09-22.md) encontrou Auth com URLs locais padrão e SMTP desligado; ambos foram corrigidos posteriormente. SMTP2GO opera em sandbox no dev; o signup de produção permanece desativado. O App implementador continua sem acesso a variables/secrets (403).

CLI 2.118.0 e `pnpm db:prepare` estão disponíveis após a [PR #141](https://github.com/IgnisDevNE/CircuitoNE/pull/141). O comando gera uma pasta `temp/supabase-run-*` com configuração de banco descartável, cópias dos SQL e manifesto SHA-256. Não executa SQL nem conecta a serviços. O Supabase local **ainda não funciona diretamente neste Windows**: a CLI recusou o wrapper `docker.cmd` do Podman; um ensaio com executável nativo superou essa etapa, mas falhou na conexão `127.0.0.1:55432` porque o encaminhamento WSL está indisponível.

O caminho alternativo foi validado executando a CLI em um container Linux temporário sobre o Podman, com rede do host e acesso ao socket do Podman: duas reconstruções e verificação SQL passaram. Esse ensaio tem acesso privilegiado ao daemon e **não é o ambiente isolado de QA**, nem deve executar código de PR não confiável neste host. Foram usados apenas arquivos do ensaio, sem montar secrets ou o repositório inteiro. Em Alpine, foi necessário selecionar o binário musl da CLI, pois sua seleção padrão pode escolher glibc quando ambos estão instalados. O CI usa Ubuntu e não precisa desse ajuste.

`pnpm test:database` prepara um projeto local com identificador único, aplica migrações canônicas mais uma migração sintética temporária, reconstrói duas vezes e consulta constraints/RLS. Também provoca perda de proteção e exige a falha específica do verificador. Encerra somente seu projeto, removendo seus volumes; não usa `--all` nem credenciais/destinos remotos. O job `database` está no workflow; database já é obrigatório em main, junto de quality e canonical-acceptance do App QA. A [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) recebeu evidência da homologação compartilhada; a conclusão depende da revisão dos demais critérios. Não alteramos a rede/VM nem os demais serviços.

Testes destrutivos e `reset` usam banco descartável local/CI. Homologação compartilhada recebe migrações revisadas, em sequência, com bloqueio de concorrência e registro de SHA/checksum. Preview usa somente dados fictícios. Produção nunca é destino de teste de schema.

Os dois projetos ficam em São Paulo; destinos e referências devem ser validados antes de dados reais. Banco e arquivos têm estratégias próprias de backup; registrar retenção, responsáveis, perda aceitável e tempo de recuperação. Testar restauração de ambos antes do beta; não presumir que backup de Postgres recupera objetos de Storage.

A sessão própria da PR #150 foi homologada no backend pelo [workflow 37084567978](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/37084567978), integrado ea76c8a3bb1cd7cb5748a84d07cd4bea8f005c0f, manifesto SHA-256 f17781bdcb91e675fe61ae9e8ef7e171b03470b9e3020ee16a7eb7a56cad499f, artefato 11259687568. RPC, seeds e SQL/REST/Auth/MFA passaram; a imagem publicada não foi substituída. O próximo checkpoint de SSR compilado usa processos com ambiente filtrado e sessões sintéticas em stdin; o worker nunca recebe PG/management/service role. Não guardar cookies, tokens, HTML ou dumps como evidência. Navegador/senha e aceite QA completo continuam #23.

## Backup

O desenho e o estado dos backups de banco **e** objetos ficam no [runbook de backup](backup.md). A rotina e a restauração permanecem critérios da #43; a criptografia antes de dados reais é o bloqueio separado #104.

## Codecov

O CI preserva `codecov-lcov`. O publicador separado `codecov-publish.yml`, definido em `main`, verifica os jobs `quality` e `database` da execução original, baixa somente seu LCOV e envia à [instância própria](https://pipeline.magalz.space/gh/IgnisDevNE/CircuitoNE). Ele usa o token exclusivo do repositório no environment GitHub `Codecov Upload`, restrito a `main`, sem executar código de PR. O [primeiro relatório de `main`](https://pipeline.magalz.space/github/IgnisDevNE/CircuitoNE/commit/e74153ef47e388959477e2c3410f9dfffe02503f) foi processado com 43,13% de cobertura. `codecov.yml` permite o comentário e mantém status informativos; a Dependabot genuína #130 comprovou relatório/checks/comentário numérico no SHA exato, e [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) foi encerrada após a integração do registro. Ver [ADR 0007](../decisions/0007-codecov-self-hosted-target.md).

Os artefatos `quality-reports` e `codecov-lcov` duram sete dias, mesmo se o serviço externo falhar. O upload não é check obrigatório. PRs de forks mantêm apenas artefatos nesta etapa. [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29) foi encerrada após verificar o acesso pessoal; [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) encerrada com o caso Dependabot e teste da política de forks; não foi ensaiado um fork real. O [diagnóstico](../reviews/codecov-diagnosis.md) preserva a evidência operacional.

## Caminho para Debian

1. Confirmar recursos, arquitetura, serviços existentes, acesso administrativo e política de atualização do servidor.
2. Executar o runtime SSR Node e o proxy Caddy revisados por digest com Podman rootless; serviço systemd/Quadlet para reinício e logs. Não fazer build de PR no host de produção. A dupla atual foi validada no Windows, não no futuro Debian.
3. Configurar proxy HTTPS e DNS para **`circuitone.magalz.space`** (produção) e **`circuitone-dev.magalz.space`** (dev), nomes aprovados pelo responsável. Dev usa exclusivamente `CircuitoNE-dev`, com seeds sintéticos; produção usa `CircuitoNE`. Os domínios já apontam ao tunnel deste Windows, conforme a seção de hospedagem; a migração ao Debian permanece futura. Certificados automáticos dependem de DNS e conectividade corretos. Seguir a [spec de ambientes e dados de teste](../specs/environments-and-test-data.md).
4. Restringir portas, proteger o acesso administrativo, monitorar disponibilidade e espaço, registrar rotação de logs e alertas. Servir a aplicação atrás de HTTPS; HTTP do preview local não é configuração de produção.
5. Promover artefato homologado, testar home/deep link/Auth, e manter digest anterior para rollback. Migrações precisam de plano próprio; voltar o container não desfaz SQL.

Previews de PR serão criados sob demanda no início e removidos ao encerrar o PR. Evitar multiplicar banco/servidor por PR antes de haver necessidade. Na integração, impedir que um preview acesse dados de produção e limitar URLs de callback do Auth por ambiente.

Referências: [Caddy para SPAs](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas), [HTTPS automático](https://caddyserver.com/docs/automatic-https), [Supabase: ambientes](https://supabase.com/docs/guides/deployment/managing-environments).

Em 02/10/2026, após o reboot real, a tarefa retornou 1 e os containers estavam parados. A execução manual da cópia revisada em D:\CircuitoNE-host\start-host.ps1 retomou somente os dois pods CircuitoNE. Os quatro containers ficaram saudáveis, produção respondeu 200 e dev 302 para Access, ambos com TLS válido. Até corrigir e provar a [#149](https://github.com/IgnisDevNE/CircuitoNE/issues/149), usar essa retomada manual após login; não afirmar recuperação automática nem alterar serviços de outros projetos.
