# Revisão dos PRs do Dependabot

Inspeção em 22/09/2026, base `1fb81f5`. **Não aceitar todos apenas porque o CI passou.** Parecer favorável para #4/#5/#6 no escopo inspecionado; resolver #3/#7/#8/#9/#10 no início da fase zero, em F0-T14. Este relatório não é aprovação formal no GitHub nem homologação de produção. Nenhum PR do Dependabot foi alterado ou integrado nesta revisão.

## Resultado por PR

| PR / head inspecionado | CI | Parecer e condição |
|---|---|---|
| [#3 — pnpm/action-setup](https://github.com/IgnisDevNE/CircuitoNE/pull/3) / `b8771e3` | Verde | **Substituir na F0-T14.** O novo SHA da action ainda declara `runs.using: node20`; o log informa execução forçada em Node 24. Preferir versão mantida com runtime Node 24 explícito, por exemplo v6.1.0 após revisão dos inputs/SHA. Manter o pnpm do projeto em 10.34.3. |
| [#4 — setup-node 7.0.0](https://github.com/IgnisDevNE/CircuitoNE/pull/4) / `60b0482` | Verde | **Favorável para aceitar agora**, após revisão humana e CI atualizado. Troca apenas o SHA da action; continua instalando Node 22 com cache pnpm explícito. Não usa `always-auth`, removido nas versões intermediárias. Runner observado 2.337.0 atende ao mínimo 2.327.1. |
| [#5 — checkout 7.0.1](https://github.com/IgnisDevNE/CircuitoNE/pull/5) / `5bdc209` | Verde | **Favorável para aceitar agora**, com as mesmas condições. Preserva `persist-credentials: false` e `contents: read`; o workflow usa `pull_request`, não os eventos privilegiados afetados pelo bloqueio novo. Não habilitar `allow-unsafe-pr-checkout`. |
| [#6 — digest Caddy](https://github.com/IgnisDevNE/CircuitoNE/pull/6) / `7407d32` | Verde | **Favorável para aceitar agora**, mantendo revisão humana/CI. Os dois digests declaram Caddy v2.11.4; muda a imagem, não a versão principal. Build e testes HTTP do container passaram no candidato; Dockerfile mantém remoção de capability do binário e usuário 1000. Promoção continua exigindo validação do artefato no ambiente alvo. |
| [#7 — Node 22 → 26](https://github.com/IgnisDevNE/CircuitoNE/pull/7) / `af496dc` | Verde | **Não aceitar como está.** Só Dockerfile muda; `engines`, mise, tipos e testes continuam em 22. O build registra `Unsupported engine` com Node 26.9.0 e apenas compila o frontend. Definir linha LTS e alinhar toda a toolchain em F0-T14; avaliar 24 LTS, sem presumir que o CI testou a aplicação em 26. |
| [#8 — TypeScript 5.9.3 → 7.0.2](https://github.com/IgnisDevNE/CircuitoNE/pull/8) / `b1d37ff` | Vermelho | **Corrigir na F0-T14.** Erro confirmado `TS5102: Option 'baseUrl' has been removed` em `tsconfig.json(9,5)`. Adaptar a configuração e testar aliases, compilador nativo, editor e ferramentas que dependam da API TypeScript. Não desligar checagem para passar. |
| [#9 — @tailwindcss/vite 4.3.3](https://github.com/IgnisDevNE/CircuitoNE/pull/9) / `3216d53` | Verde | **Atualizar junto com #10 na F0-T14.** Plugin/compilador sobem para 4.3.3, mas CSS direto continua em 4.2.2. Há atualização de transitivas, incluindo jiti/enhanced-resolve. Validar lockfile e aparência na combinação final. |
| [#10 — tailwindcss 4.3.3](https://github.com/IgnisDevNE/CircuitoNE/pull/10) / `b254dfa` | Verde | **Atualizar junto com #9 na F0-T14.** O inverso também deixa duas versões: CSS 4.3.3 e plugin/compilador 4.2.2. CI verde não comprova regressão visual ausente. Agrupar futuras atualizações do conjunto. |

Cada aceite é relativo ao head acima. Depois de atualizar a base, resolver conflito ou combinar PRs, exigir CI do novo SHA. Atualizações de workflow passam pelo mantenedor: o App implementador não tem permissão de escrita em Workflows. Não contornar essa restrição com credenciais humanas.

Acompanhamento na F0-T14: [pnpm/action-setup #34](https://github.com/IgnisDevNE/CircuitoNE/issues/34), [Node #35](https://github.com/IgnisDevNE/CircuitoNE/issues/35), [TypeScript #36](https://github.com/IgnisDevNE/CircuitoNE/issues/36) e [Tailwind #37](https://github.com/IgnisDevNE/CircuitoNE/issues/37).

## Evidência, limites e prioridades

O CI atual executa cinco testes de infraestrutura, typecheck, build, auditoria de dependências, build do container e dois testes HTTP. Não inclui jornadas de negócio, comparação visual, SSR real, RLS ou homologação integrada. Seus resultados dão evidência útil para Actions/Caddy, mas não validam automaticamente uma migração de stack.

Logs consultados: [pnpm](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35685645553), [Caddy](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35685657351), [Node](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35685664313) e [TypeScript](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35685680518). Os checks dos demais heads foram consultados pela API do GitHub. Metadados dos dois digests Caddy foram lidos no Podman. Uma execução direta do binário das imagens oficiais com todas as capabilities removidas foi recusada em ambas; ela não reproduz a imagem final, cujo Dockerfile remove a capability de arquivo. O teste de execução considerado é o do container final no CI.

Priorizar Actions mantidas, alinhar Node, adaptar TypeScript e atualizar Tailwind em conjunto antes de estabilizar testes e SSR. Node 22 ainda tem suporte; em 22/09/2026, Node 24 é LTS e Node 26 só tem entrada em LTS prevista para 28/10. Escolher a versão apropriada não significa perseguir toda versão principal nova.

A tentativa de revisão Memtrace do PR #8 com grafo estrito falhou antes da análise: HTTP 404 ao obter token da instalação do App próprio dele. Nenhum achado automático ou comentário foi produzido; para habilitar esse caminho, o mantenedor precisaria instalar **Memtrace Code Reviewer** no repositório. Cortex também ficou indisponível. O parecer acima é revisão manual dos diffs/configurações, logs e fontes oficiais, não resultado do grafo.

## Fontes primárias

- [setup-node 7: requisitos e mudanças](https://github.com/actions/setup-node/blob/v7.0.0/README.md) e [checkout 7: segurança e runtime](https://github.com/actions/checkout/blob/v7.0.1/README.md).
- [pnpm/action-setup no SHA proposto](https://github.com/pnpm/action-setup/blob/b906affcce14559ad1aafd4ab0e942779e9f58b1/action.yml), [v6.1.0](https://github.com/pnpm/action-setup/blob/v6.1.0/action.yml) e [retirada do runtime Node 20 em 23/09/2026](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/). A data não prova que toda action antiga falhará: o runner já a executa em Node 24.
- [Calendário de suporte Node](https://github.com/nodejs/Release/blob/main/schedule.json).
- [TypeScript 7 e ausência temporária da API programática](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) e [resolução de módulos/paths](https://www.typescriptlang.org/docs/handbook/modules/reference.html).
- [Tailwind 4.3.3 e alterações de CSS/Preflight](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/CHANGELOG.md).
