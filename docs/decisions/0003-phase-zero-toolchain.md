# ADR 0003 — Toolchain e testes da preparação

Data: 22/09/2026. Estado: decisão técnica implementada no checkpoint da fase zero; aceite de CI/homologação ainda pendente. Não altera a arquitetura aprovada na [ADR 0002](0002-modular-monolith-ssr.md).

## Contexto e decisão

O host usa Node 26, enquanto CI e container usam Node 22. Manter **Node 22.23.2** nesta etapa e fixá-lo também para os comandos locais do pnpm (`useNodeVersion`). Preservar pnpm 10.34.3. Isso permite validar a mesma linha de runtime sem mudar o Node global do Windows. A action de instalação do pnpm usa seu próprio runtime: sua atualização para Node 24 não obriga a aplicação a usar Node 24.

Não aceitar a atualização isolada do container para Node 26 Current. Reavaliar Node 24 LTS junto do runtime SSR em F0-T11/T12, atualizando host, CI, imagem e testes em conjunto ([#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35)). A manutenção de Node 22 aqui é temporária, não promessa de suporte indefinido.

Adotar TypeScript 7.0.2 removendo `baseUrl`, incompatibilidade reproduzida antes da correção; preservar aliases e checagem estrita. Atualizar Tailwind e seu plugin juntos para 4.3.3, agrupando futuras atualizações minor/patch no Dependabot. Restringir a descoberta de classes à pasta `src`; documentos locais estavam alterando o CSS do build.

Reutilizar `node:test` para infraestrutura; Vitest/Testing Library para unidades e Playwright/Chromium para navegação desktop/mobile. Versões das novas ferramentas fixadas no manifesto e lockfile. Cobertura inclui todos os arquivos TypeScript de `src`, mesmo sem importação nos testes. Não impor percentual arbitrário nem apresentar testes de renderização do mock como prova de autorização.

## Limites

As suítes deste repositório são mutáveis pelo implementador e não substituem o QA canônico independente ([#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31)). O [workflow](../../.github/workflows/ci.yml) sem secrets inclui E2E, cobertura/artefatos e banco descartável ([#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34)). Sua publicação com credencial humana foi explicitamente autorizada pelo responsável em 22/09/2026, somente para essa operação; as permissões do App e as proteções de revisão permanecem. Evidência e aceite no [PR #45](https://github.com/IgnisDevNE/CircuitoNE/pull/45).

Supabase CLI 2.117.0 prepara cópias descartáveis dos SQL canônicos com checksum. O helper não executa comandos de banco, não lê credenciais e não fornece proteção contra um agente com acesso administrativo ao host. Auth/local completo, tipos gerados e homologação integrada serão acrescentados quando houver schema e os pré-requisitos correspondentes.
