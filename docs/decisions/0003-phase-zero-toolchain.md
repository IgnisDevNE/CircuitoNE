# ADR 0003 — Toolchain e testes da preparação

Data: 22/09/2026. Estado: decisão implementada e CI validado pelo PR #45; homologação integrada ainda pendente. Não altera a arquitetura aprovada na [ADR 0002](0002-modular-monolith-ssr.md).

## Contexto e decisão

O host usa Node 26, enquanto CI e container usam Node 22. Manter **Node 22.23.2** nesta etapa e fixá-lo também para os comandos locais do pnpm (`useNodeVersion`). Preservar pnpm 10.34.3. Isso permite validar a mesma linha de runtime sem mudar o Node global do Windows. A action de instalação do pnpm usa seu próprio runtime: sua atualização para Node 24 não obriga a aplicação a usar Node 24.

Não aceitar a atualização isolada do container para Node 26 Current. A seleção coordenada de Node 24 LTS pertence a F0-T14, antes da entrada no runtime SSR de F0-T11/T12; esses consumidores completam a evidência de compatibilidade. Atualizar comandos locais, CI, imagem e testes em conjunto ([#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35), responsável: implementação/mantenedor). A manutenção de Node 22 aqui é temporária, não promessa de suporte indefinido.

Adotar TypeScript 7.0.2 removendo `baseUrl`, incompatibilidade reproduzida antes da correção; preservar aliases e checagem estrita. Atualizar Tailwind e seu plugin juntos para 4.3.3, agrupando futuras atualizações minor/patch no Dependabot. Restringir a descoberta de classes à pasta `src`; documentos locais estavam alterando o CSS do build.

Reutilizar `node:test` para infraestrutura; Vitest/Testing Library para unidades e Playwright/Chromium para navegação desktop/mobile. Versões das novas ferramentas fixadas no manifesto e lockfile. Cobertura inclui todos os arquivos TypeScript de `src`, mesmo sem importação nos testes. Não impor percentual arbitrário nem apresentar testes de renderização do mock como prova de autorização.

## Limites

As suítes deste repositório são mutáveis pelo implementador e não substituem o QA canônico independente ([#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31)). O [workflow](../../.github/workflows/ci.yml) sem secrets inclui E2E, cobertura/artefatos e banco descartável ([#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34)). Sua publicação com credencial humana foi explicitamente autorizada pelo responsável em 22/09/2026, somente para essa operação; as permissões do App e as proteções de revisão permanecem. Evidência e aceite no [PR #45](https://github.com/IgnisDevNE/CircuitoNE/pull/45).

Supabase CLI 2.117.0 prepara cópias descartáveis dos SQL canônicos com checksum. O helper não executa comandos de banco, não lê credenciais e não fornece proteção contra um agente com acesso administrativo ao host. Auth/local completo, tipos gerados e homologação integrada serão acrescentados quando houver schema e os pré-requisitos correspondentes.

## Validação pontual de credenciais de homologação

Em 22/09/2026, o responsável autorizou preparar/disparar essa validação pelo bot e informou permissão temporária de Actions. Reutilizar o workflow CI com opção manual, desativada por padrão, restrita a `main` e ao environment `Homologação` com aprovação humana. O YAML precisa entrar por PR revisado antes da execução. Não usar código da aplicação, checkout, instalação de pacotes do projeto ou artefatos no job privilegiado.

Usar Node nativo e o `psql` do runner, com secrets em etapas distintas: token apenas na leitura da configuração do projeto dev; senha apenas na conexão TLS com identidade do servidor verificada e transação de leitura. O host do pooler é obtido da API oficial e validado; não inventar seu índice. Porta 5432 em modo sessão permite a consulta a partir do runner IPv4. Não usar esse ensaio para aprovar migrações, concessões, RLS, login de usuário, escopo mínimo do token ou QA independente.

Essa manutenção autorizada comprova somente as credenciais configuradas para `CircuitoNE-dev`. O bloqueio de #31 permanece para o fluxo de entrega integrado e implementação das regras. Nenhuma opção permite selecionar produção, ref de projeto, SQL ou comando arbitrário. `Actions: write` permite disparar; publicação de YAML exige separadamente `Workflows: write`. Não usar a credencial humana como fallback nesta operação pedida ao bot.

O responsável concedeu Workflows temporariamente após a primeira recusa do GitHub. O helper também restringia os tokens às permissões antigas: adotar opt-in separado por comando (`GITHUB_APP_ACTIONS_WRITE=1` e `GITHUB_APP_WORKFLOWS_WRITE=1`), preservando o padrão e o escopo de repositório. O teste primeiro recebeu `actions: read` onde a operação autorizada exigia `write`; depois passou, incluindo retorno ao padrão, flags inválidos e ausência de outras permissões. Essa seleção local não é uma fronteira de isolamento contra quem possui a chave do App.

### CA do Supabase

A execução protegida [35715059622](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35715059622), após aprovação humana, aceitou configuração pública e token, mas falhou na conexão PostgreSQL. Uma reprodução sem senha confirmou que a CA do Supabase não está no conjunto padrão do sistema. Com a CA indicada no painel do projeto, OpenSSL validou TLS 1.3 e o hostname do pooler.

Baixar o certificado público em etapa sem secrets, por URL HTTPS fixa e com SHA-256 fixado no workflow; usar somente esse arquivo em `sslrootcert`, preservando `verify-full`. Alteração do certificado interrompe o job até atualização revisada do hash e nova validação de origem/validade. Não instalar a CA globalmente nem reduzir a verificação TLS. Referências: [psql](https://supabase.com/docs/guides/database/psql) e [SSL](https://supabase.com/docs/guides/platform/ssl-enforcement). O teste de conexão sem senha não valida a credencial; a repetição protegida após merge continua necessária em [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32).
