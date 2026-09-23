# Fase zero — checkpoint de preparação

**Atualização após PRs #45–#49:** CI, banco descartável, artefatos, Codecov Cloud e CodeQL foram validados no GitHub; a verificação protegida de credenciais dev também passou, sem migrar ou implantar aplicação. Após as PRs #56, #57 e #59, o [aceite canônico e a promoção pós-merge](../controls/change-control.md) passaram na esteira; o [controle de acesso](../controls/access-control.md) registra os limites ainda existentes. O texto abaixo preserva o checkpoint original; referências ao “último administrador” foram substituídas no contrato vigente pela propriedade única/transferível da [ADR 0008](../decisions/0008-collective-permission-profiles.md). Estado atual, ampliação dos testes, correções e pendências por issue: [revisão de cobertura/backlog](coverage-backlog-2026-09-22.md). Homologação integrada e saída da fase continuam bloqueadas por #31/#32/#43.

Data: 22/09/2026. **Resultado: preparação parcial revisável; saída da fase bloqueada, sem homologação concluída.** Branch `codex/phase-zero-foundation`, base `44d1632`. Nenhum schema/dado/configuração remota foi alterado. O preview existente foi preservado.

## Entrega e verificação

| Tarefa | Evidência neste checkpoint | Limite restante |
|---|---|---|
| F0-T14 | Node 22.23.2 via pnpm, CI e container; TS 7.0.2; Tailwind/plugin 4.3.3; grupo Dependabot; action pnpm v6.1.0 | Aceite GitHub; inspeção visual limitada |
| F0-T6 | 4 testes unitários do roteador; 27 rotas e 2 jornadas em desktop/mobile, total 58 E2E | Rotas privadas só renderizam com sessão mock; quatro atuações, estados de consulta, troca de ID e teclado ainda não cobertos integralmente |
| F0-T13 | LCOV/HTML/JSON; 4,33% statements, 4,58% linhas, 2,99% branches, 2,92% funções; upload de artefatos no workflow | Unidade somente; E2E não entra nesse percentual. Aceite do CI e upload Codecov pendentes |
| F0-T4 | CLI 2.117.0; adaptador com ordem/bytes/checksums; 2 testes de preparo; Linux com duas reconstruções de migração sintética temporária após o conjunto canônico vazio; job database no workflow | Windows direto falhou; aceite do CI, schema/tipos/seeds reais e homologação compartilhada pendentes |
| F0-T15 | Auditoria dos dois projetos Supabase, inclusive Auth pelo painel autenticado | SMTP, URLs, regiões/recuperação e políticas de Auth não configurados |
| F0-T2 | Limites da autoridade documentados, CODEOWNERS cobre novos arquivos de controle | Credenciais e QA canônico ainda não isolados; bloqueio obrigatório preservado |

Verificações executadas: instalação com lockfile congelado; `pnpm check` (7 infraestrutura, 4 unidade, 1 regressão CSS, tipos e build); 58 E2E; cobertura; `pnpm audit --audit-level=high` sem achados; ensaio de migrações em Linux; imagem Podman e 2 testes HTTP de home/deep link/assets/bloqueio de arquivos internos. Imagem validada `b16c35de5ad2d2a1027cda7efa54155621029b509b99170bbe7c56ef5500786f`, UID 1000, raiz somente leitura, capabilities removidas e `no-new-privileges`. Container do ensaio removido após a verificação.

### TDD e qualidade do oráculo

- TypeScript 7 falhou com `TS5102` (`baseUrl` removido); retirar essa opção preservando `paths` restabeleceu tipos/build.
- O teste de CSS primeiro falhou ao inserir uma classe em documento temporário: os hashes do CSS mudavam. `source('.')` em `src/index.css` restringiu as entradas. O build nativo também reproduziu falta de atributo de importação JSON; `with { type: 'json' }` e `import.meta.dirname` corrigiram a configuração. Teste final executa dois builds e compara hashes.
- O preparo de migrações falhou antes de existir o helper; após implementação, valida bytes/checksums/ordem, duplicatas e argumentos remotos. Nenhum SQL de negócio foi criado.
- O teste de banco aplica uma migração sintética temporária, reconstrói duas vezes e valida Postgres 17, carga única, constraint e RLS das tabelas de `public` que não pertencem a extensões. Provoca perda de RLS e exige a mensagem específica. O teste negativo de grant primeiro falhou por não detectar o acesso concedido; após acrescentar a checagem de privilégios de `anon`/`authenticated` na tabela de ensaio, passou. Não prova as políticas de negócio ainda inexistentes. O Linux local usou acesso ao daemon Podman, sem satisfazer isolamento de QA nem homologação GitHub.
- A caracterização registra comportamento existente; não se atribui um ciclo vermelho fictício a funcionalidades que já funcionavam. Expectativas iniciais de títulos foram alinhadas ao protótipo antes do aceite.
- Arquivo novo e não importado em `src` apareceu na cobertura com 0%. Injeção temporária de falha em `history.pushState` fez o teste exigir `/artistas/ana` e receber `/`, mantendo **4,33%** de statements. Isso confirma um oráculo comportamental nesse caso, sem equiparar cobertura a qualidade geral. Arquivos de ensaio ficaram fora do commit.

Screenshots de quatro telas nos dois tamanhos foram anexadas ao relatório Playwright. Fontes/imagens externas são bloqueadas, portanto há imagens ausentes por desenho do teste. Não havia baseline anterior ao upgrade para comparação automática; essa inspeção não equivale a revisão visual completa nem fecha a acessibilidade de F0-T10.

## Revisão independente

Revisores: subagentes `review_toolchain` e `review_environment_plan`, modelo Sol, esforço baixo, somente leitura; correções feitas pelo implementador. Achados corrigidos: incluir testes/configs no TypeScript; verificar que Ctrl-click preserva a ação nativa; corrigir o caminho do teste CSS inicialmente ignorado pelo Git; proteger arquivos de controle por CODEOWNERS; remover a pasta do ensaio de banco em cleanup; limitar a conclusão da auditoria Supabase à evidência coletada. O workflow agora inclui E2E/banco/artefatos, antes entregues como patch; o arquivo intermediário foi removido. A revisão do workflow detectou margem insuficiente no timeout do job de banco: elevado de 10 para 20 minutos, preservando o limite interno do teste. Capturas atuais contêm só fixtures; revisar sanitização antes de capturar sessões/dados reais.

A revisão não transforma subagentes no verificador isolado exigido por F0-T2. O App continua sem escrita em workflows; em 22/09/2026 o responsável autorizou explicitamente sua credencial para publicar esta alteração de CI. A exceção não amplia permissões do App nem remove proteções: push de `magalz` requer aprovação de outra pessoa pela regra do último push. Execuções e aceite do SHA final ficam no [PR #45](https://github.com/IgnisDevNE/CircuitoNE/pull/45), vinculados a [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34)/[#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32). Revisão completa de saída será repetida quando F0-T7–T12 e os gates estiverem concluídos.

## Segurança — OWASP Top 10:2025

Revisão do escopo alterado e dos bloqueios conhecidos, conforme a [referência oficial](https://top10.owasp.org/2025/). Não é certificação nem aprovação do produto. Todas as categorias são aplicáveis à preparação e ao destino pretendido; as evidências abaixo explicam o alcance. Severidade indica prioridade antes de dados reais, não existência de incidente. Prazos são gates/tarefas, sem calendário de entrega presumido.

| Categoria / evidência e achado | Severidade | Correção e risco residual | Responsável | Prazo / destino |
|---|---|---|---|---|
| A01 Controle de acesso: mock sem autorização real; renderização não prova RLS | P1 | Implementar contratos após #31; #12/#13/#14/#16 continuam abertos | Mantenedor + implementação | F0-T2/T9 e F3/F5; antes de dados reais |
| A02 Configuração: painel confirmou defaults amplos na Data API, Auth e callbacks | P1 | #23/#32/#43: grants/RLS/URLs explícitos; config local não pode ir ao hospedado | Mantenedor + implementação | F0-T4/T5/T15; antes do primeiro schema real |
| A03 Cadeia de software: lockfile e digests; pnpm audit sem achados; workflow com action Node 24 e jobs E2E/banco | P2 | #34: validar execução no GitHub e obter aceite; verificação local não substitui CI | Mantenedor | F0-T14; antes do aceite do checkpoint |
| A04 Criptografia: nenhum segredo incluído no diff/contexto da imagem; preview HTTP | P1 para dados reais | #31/#43: isolar emissor, HTTPS e recuperação; preview só usa mocks | Mantenedor | F0-T2/T12/T15; antes de expor dados reais |
| A05 Injeção: Markdown inseguro conhecido; sem SQL de negócio novo | P1 | #11: corrigir e provar sanitização/URLs; ensaio estrutural não valida políticas do produto | Implementação + revisor | F0-T7; antes de SSR/conteúdo real |
| A06 Desenho: regras de aprovação/acesso documentadas, políticas ainda propostas | P1 | #38–#42: aprovar contratos; não transformar falha do mock em regra | Produto + implementação | F0-T15; antes da tarefa dependente |
| A07 Autenticação: mínimo 6, callbacks padrão, reautenticação/SMTP pendentes | P1 | #23/#43: Auth e AAL2 reais; login nominal fica apenas em teste/dev | Mantenedor + implementação | F0-T15/F1; antes de contas reais |
| A08 Integridade: checksums verificados; QA/emissor e promoção não isolados | P1 | #31/#32: autoridade externa e homologação por SHA; acesso ao daemon local não é isolamento | Mantenedor | F0-T2/T5; bloqueia saída da fase |
| A09 Logs e alertas: relatórios locais sintéticos; não há observabilidade operacional | P2 | #23/#30/#43: alertas e publicação confiável; sanitizar capturas antes de Auth real (#34) | Mantenedor + implementação | F0-T13 e F1/F6; antes do beta |
| A10 Exceções: helper rejeita entradas; E2E sem pageerror; backend inexistente | P1 para dados reais | #15/#22/#28/#32/#43: falhas, concorrência e recuperação ainda não demonstradas | Implementação + operação | F0-T9/T11 e fases de domínio; antes de release |

## Backlog que permanece aberto

Todos os números abaixo correspondem a issues abertas. Motivo/aceite detalhado está em cada issue e nas tarefas do [plano](../planning/implementation-plan.md). Não encerramos uma issue apenas por criar teste/documento ou abrir este PR.

| Issues | Trabalho restante, responsável e destino |
|---|---|
| [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) | Mantenedor: retirar chaves/admin/SSH do implementador, criar QA fora das instalações do App e verificador independente; F0-T2, bloqueio de entrada para regras reais |
| [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) | Mantenedor + implementação: ensaio sintético Linux validado; falta executar job database no GitHub, contratos de grants/RLS do schema real e homologação/promoção compartilhada; F0-T4/T5, saída da fase bloqueada |
| [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34) | Mantenedor: validar action/E2E/artefatos no CI e obter aprovação independente do último push; F0-T14 |
| [#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35), [#36](https://github.com/IgnisDevNE/CircuitoNE/issues/36), [#37](https://github.com/IgnisDevNE/CircuitoNE/issues/37) | Implementação/revisor: alterações locais prontas; falta aceite do PR/CI, homologação aplicável e revisão visual completa. Node 26 isolado não adotado; F0-T14 |
| [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29), [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) | Mantenedor: autorização OAuth da organização, publicação confiável do relatório e validação repo/SHA/branch. Cobertura local pronta; F0-T13, não bloqueiam outras tarefas independentes |
| [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38), [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39), [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40), [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41), [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) | Produto: aprovar políticas de pessoa/arquivos/coletivos/eventos/mensagens; F0-T15. Propostas e regras confirmadas permanecem distintas |
| [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) | Mantenedor/produto: SMTP/remetente, URLs/DNS/regiões e recuperação; F0-T15 antes das integrações |
| [#11](https://github.com/IgnisDevNE/CircuitoNE/issues/11) | Implementação após #31: contrato e correção Markdown/URLs; F0-T7, bloqueia SSR/conteúdo real |
| [#17](https://github.com/IgnisDevNE/CircuitoNE/issues/17), [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18), [#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19) | Implementação após contratos independentes e decisões aplicáveis: dinheiro/cadastro/tempo; F0-T8, integração definitiva em F1/F4 |
| [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12), [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13), [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14), [#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) | Implementação após #31/#40: isolamento de identidade, mock e formulários; F0-T9 e autorização persistente em F3/F5 |
| [#27](https://github.com/IgnisDevNE/CircuitoNE/issues/27) | Implementação: semântica/teclado após F0-T9; F0-T10. Screenshots não satisfazem esse aceite |
| [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26), [#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) | Implementação: SSR/metadados após F0-T7–T10; relógio de testes pronto, estados/queries/paginação não. F0-T6/T9/T11 e F6-T3 |
| [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15), [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) | Implementação/produto: persistência de cadastro e invariantes do último administrador; F1/F3, sem fingir sucesso real no mock |
| [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20), [#21](https://github.com/IgnisDevNE/CircuitoNE/issues/21) | Implementação/produto: manutenção das atuações e upload real seguro; F2, depende dos contratos e #39 |
| [#24](https://github.com/IgnisDevNE/CircuitoNE/issues/24), [#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) | Implementação/produto: agenda e conversas reais; F4/F5, depende de #41/#42 |

As regras de negócio já confirmadas continuam em [mvp.md](../business-rules/mvp.md), incluindo CPF/nascimento obrigatórios e aprovação de coletivos. Esta preparação não confirmou novas políticas de produto. ADRs 0002/0003 registram arquitetura e toolchain; a spec aprovada continua destino, não implementação concluída.

O responsável confirmou os domínios prod/dev, dev com dados sintéticos no `CircuitoNE-dev` e login nominal temporário de teste, registrados em [ambientes e dados de teste](../specs/environments-and-test-data.md). Isso não autoriza bypass em produção nem elimina o isolamento de QA. Os testes pós-migração e Playwright estão no workflow do PR #45; o resultado do CI deve corresponder ao SHA em revisão.

Próxima entrada: mantenedor resolve #31 e o aceite do CI #34; execução GitHub e destinos operacionais completam os próximos pré-requisitos de #32/#43. Depois, retomar F0-T7–T12 com testes canônicos aprovados e reviews normais, seguido de review completo/OWASP e homologação. Aprovar este checkpoint não dispensa esses gates nem autoriza produção.
