# Aceite canônico e atualização da suíte no CI

Data: 22/09/2026; atualização: 30/09/2026. **Estado:** gate canônico, rulesets, promoção pós-merge, isolamento do agente e ensaios negativos concluídos; [#31 / F0-T2](https://github.com/IgnisDevNE/CircuitoNE/issues/31) encerrada. Vinculada às [ADRs 0006](../decisions/0006-canonical-ci-suite.md) e [0009](../decisions/0009-public-qa-protected-branches.md). A homologação protegida do schema passou no [run 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488); a restauração isolada ainda é pendência da #43.

## Objetivo e autoridade

Executar o aceite na esteira, poupando recursos do PC, e impedir que alterações nos testes ou no comando do PR substituam os critérios aprovados. Após aprovação, merge e validação, a própria esteira promove os novos testes para a referência dos próximos PRs. CI verde, isoladamente, não aprova uma mudança de contrato.

A suíte, suas propostas, o workflow de aceite e a referência ativa ficam sob autoridade externa à implementação. [IgnisDevNE/CircuitoNE-QA](https://github.com/IgnisDevNE/CircuitoNE-QA) é público desde 24/09/2026, depois de auditoria de histórico e logs; quatro execuções não tinham logs completos, conforme a #31. O App `ignisdevne` permanece fora da instalação do QA: pedido de token para ele recebeu HTTP 422. Não ampliar essa instalação. Os rulesets [main 23916588](https://github.com/IgnisDevNE/CircuitoNE-QA/rules/23916588) e [accepted 23916592](https://github.com/IgnisDevNE/CircuitoNE-QA/rules/23916592) impõem PR/revisão/check no primeiro e reservam bypass do segundo apenas ao App Promoter. A branch `accepted` registra a árvore Git dos testes; esse registro, sozinho, não substitui proteção nativa contra alteração dos testes e do manifesto juntos.

O processamento pesado usa runners descartáveis hospedados pelo GitHub. Não exige uma VM de desenvolvimento local nem um middleware próprio. O implementador executa em container Linux isolado, sem credenciais humanas ou autoridade administrativa sobre QA, aprovador e publicador; o Windows do mantenedor permanece um contexto separado e não é declarado isolado. As provas e limites constam no [registro final da #31](../reviews/agent-authority-closure-20260927.md).

O App `CircuitoNE QA Publisher` está instalado nos dois repositórios com `Checks:write`, `Pull requests:write` e `Contents:read`, sem escrita na suíte. Cada execução limita seu token ao repositório e às permissões necessárias: publicação do check no CircuitoNE ou proposta de testes no QA. O App `CircuitoNE QA Promoter` (5055320) tem `Contents:write` apenas no QA e não pode publicar checks. As chaves ficam nos environments `QA Publisher` e `QA Promotion`, ambos limitados à branch `main`; as cópias locais de bootstrap foram removidas. O job de promoção em [QA PR #20](https://github.com/IgnisDevNE/CircuitoNE-QA/pull/20) passou em [CI](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35951712724) antes da ativação dos rulesets; a promoção real após os rulesets passou nas PRs [#99](https://github.com/IgnisDevNE/CircuitoNE/pull/99), [execução 35953491763](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35953491763), e [#110](https://github.com/IgnisDevNE/CircuitoNE/pull/110), [execução 36266942956](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/36266942956). A política da organização rejeitou criação de PRs pelo `GITHUB_TOKEN` padrão do QA (HTTP 409); o workflow usa esse token para preparar a branch e o Publisher para abrir a PR revisada pelo responsável. `QA Dispatch` mantém token restrito a `Actions:write` no QA. `CANONICAL_QA_ENABLED=true` e o check obrigatório está fixado no App Publisher; os ensaios e revogações da #31 estão concluídos.

## Versões e arquivos protegidos

- **S:** commit imutável da suíte ativa, aprovado sob a autoridade de QA.
- **Q:** commit imutável de uma proposta revisada de evolução da suíte; ainda não é a referência global.
- **C:** commit exato da aplicação em análise. **M:** commit efetivamente integrado em `main`, que pode diferir de C após merge/squash.
- **W:** commit do workflow/verificador confiável, incluindo comando, runner, configuração, seleção de testes e dependências de QA fixadas.

Um manifesto controlado pelo QA define o conjunto protegido: testes canônicos, fixtures, snapshots, utilitários de asserção e configuração/dependências do executor. Ele não é escolhido pelo PR. Testes locais adicionais podem existir, mas não contam como aceite sem entrar nesse conjunto por revisão.

A integridade compara objetos/árvores Git da versão candidata com a referência esperada: conteúdo, caminhos, tipos/modos e inventário. Adições, remoções, renomes e mudanças para links simbólicos não passam despercebidas. Não usar um arquivo de hashes editável no próprio PR como autoridade. Links/submódulos que escapem do conjunto aprovado são rejeitados. A origem aprovada dos comandos é W; comparar hashes dos testes e repetir `pnpm test` do PR não basta.

## Etapas da esteira

### Extensão SQL — runner integrado em 27/09/2026

**Primeira promoção concluída:** a [QA PR #24](https://github.com/IgnisDevNE/CircuitoNE-QA/pull/24) integrou o runner em `f9d03bd54b7b15a17520277ce76c833728b6a645`. A proposta SQL [QA #25](https://github.com/IgnisDevNE/CircuitoNE-QA/pull/25) foi aprovada no SHA `73e9c73849ddd22593d713c24fe9cdcbed2cc278`; o [aceite independente 36288372520](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/36288372520) e a [promoção 36289277886](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/36289277886) passaram. `accepted=dd2fa1d12c15269fd16ec318a6fd2a10930f94b5` registra aquele checkpoint v2 e origem `f99736f36f63ce5c0b8126ed7e04edc1056d0d41` da PR #126. A QA #25 foi fechada após a promoção, sem merge. Depois, a #31 foi encerrada e o banco hospedado foi homologado no [run 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488).

O inventário canônico passa a abranger `tests/e2e/` e os arquivos `.sql`/`*-concurrency.mjs` de `tests/database/`. O harness local `migrations.test.mjs` fica fora: comandos, bootstrap, dependências e seleção de etapas pertencem a W. Migrações e seeds de C entram apenas como blobs SQL regulares do commit exato; nenhum helper, pacote ou script candidato é executado pelo verificador de banco.

O banco descartável usa PostgreSQL 17 e migrações oficiais do Auth fixados por digest. Antes do SQL candidato, o bootstrap termina; banco e executor separado não têm rede externa, mounts de host, socket do engine ou secrets. Compartilham somente a rede local do banco. Ambos usam raiz somente leitura, usuários sem privilégios, capacidades removidas e limites de recursos. O driver envia SQL pelo protocolo e não interpreta metacomandos de shell. Dois ciclos completos verificam RLS/grants, invariantes, concorrência e seeds sintéticos. A comparação da taxonomia normativa e dos tipos gerados continua no CI da aplicação; REST/Storage e homologação compartilhada foram demonstrados separadamente no dev pelo [run 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488).

O publicador exige sucesso dos jobs de navegador **e** banco, vinculando `scope=2` à evidência. Ausência, cancelamento ou falha de qualquer um impede sucesso. A promoção exige essa evidência e grava `schema_version: 2`, `test_tree` e `database_tree` após copiar exatamente os arquivos aprovados.

O estado anterior somente E2E continua válido como predecessor, não como aceite SQL nem como execução já promovida. A primeira PR após integrar W propõe toda a suíte SQL, exige revisão de Q e passa nos dois jobs antes do merge. Depois, a promoção reexecuta o commit integrado e avança para v2. Não editar `accepted` para inicializar a suíte. Novas asserções SQL e módulos de concorrência entram pela proposta usual; mudanças nas etapas de fixtures/seeds exigem revisão de W.

| Etapa | Entrada e resultado obrigatório |
|---|---|
| `resolve-acceptance` | Confirma origem do evento, repositório, PR e C pela API; resolve S, W e eventual Q a partir de registros de QA. Dados do PR não escolhem sozinhos a referência nem o workflow. |
| `verify-test-integrity` | Compara o conjunto protegido com S ou com Q explicitamente aprovado para essa tarefa. Divergência sem aprovação falha antes de executar código candidato. |
| `canonical-acceptance` | Executa a suíte obtida do QA contra C usando W. Registra inventário executado, resultados, S/Q, C, W e identificação da execução; falhas, testes esperados ausentes ou skips não autorizados rejeitam o aceite. |
| `publish-acceptance` | Publica somente a evidência validada, vinculada a C, S, Q/W quando aplicáveis e à base de integração. A identidade implementadora não possui essa autoridade. Commit novo ou avanço da suíte/base invalida o aceite anterior antes do merge. |
| `promote-suite` | Após aprovação específica da mudança dos testes, merge e sucesso dos gates exigidos, revalida M contra Q com W e promove exatamente Q a suíte ativa. Sem mudança de suíte, registra no-op. |

As etapas são responsabilidades lógicas, não obrigação de criar cinco workflows ou um framework. Usar as primitivas de Actions e Git já existentes; nomes acima ainda não correspondem a jobs instalados.

O workflow de aceite e o publicador não são executados a partir do YAML alterável pelo PR. O gatilho automático roda após o CI da origem confiável e o check obrigatório exige o App QA. Um check com o mesmo nome criado pelo candidato não libera merge. A promoção pós-merge passou nos ensaios das PRs #56 e #57; as negativas e o isolamento restantes foram concluídos na #31.

Build e aplicação candidata rodam em ambiente descartável sem credenciais privilegiadas, socket de containers do host, escrita na suíte ou acesso ao processo/resultados do verificador. O verificador mantém dependências próprias e, quando viável, testa a aplicação externamente por interface/API. Testes que importam código candidato no mesmo processo não são uma fronteira contra adulteração do runner; sua cobertura local continua útil, mas não deve receber essa garantia. Dados, serviços e credenciais de teste são fictícios e descartáveis. A fase de execução restringe acesso à rede ao necessário para o ensaio; downloads de dependências não ampliam o acesso ao QA/publicador.

O publicador/promotor roda em contexto separado. Ele nunca executa scripts, hooks ou pacotes do candidato e não aceita como prova um JSON de sucesso produzido pelo PR. Confirma repositório, workflow aprovado, run, tentativa, SHAs, aprovação e resultado pela origem confiável. Artefatos são tratados como entrada não confiável; código candidato não compartilha caches ou diretórios com processos privilegiados.

## Novos testes sem perder TDD

1. O responsável por aceite revisa os testes antes da implementação e fixa Q para a tarefa. Os arquivos podem ser propostos no PR, mas a autorização exata do conteúdo vem do QA, não de uma label aplicada pelo bot.
2. Os critérios novos têm evidência de falha esperada contra a base e sucesso contra C. Caracterização já verde é identificada como tal. Uma alteração posterior de expectativa, fixture, comando ou seleção exige nova revisão/versionamento.
3. PR sem mudança de contrato usa S. PR que evolui testes usa Q, que herda o conjunto de S com apenas as alterações aprovadas. Assim, o guard não bloqueia para sempre a inclusão legítima de testes.
4. Inclusões entram como novos casos. Remoções, mudanças de expectativa, skips e substituições de contrato exigem motivo e aprovação explícita; não se rebaixa a cobertura para acomodar falha. Regressões não modificadas permanecem em Q. Quando uma regra muda legitimamente, registrar quais casos de S foram substituídos, sem afirmar que a versão antiga passou.
5. Q valida a tarefa, mas só vira referência global depois dos gates e do merge. A revisão prévia dos testes e a promoção posterior têm finalidades diferentes.

## Promoção automática e recuperação

A aprovação específica deve identificar Q e suas alterações; pode ocorrer na revisão prévia dos testes, sem um novo clique se conteúdo e condições aprovadas permanecerem idênticos. `promote-suite` automatiza a publicação dessa aprovação, não decide se testes mais fracos são aceitáveis.

**Antes do merge**, o gate precisa confirmar que S ainda é a referência ativa e que a base de integração é a validada. Avanço de S/base invalida o aceite dos PRs pendentes e exige recomposição e nova execução antes de integrá-los. Exemplo: A e B partiram de S; depois de A integrar e promover seu teste, B não pode usar seu antigo verde para entrar sem esse teste.

A coordenação abrange validação final, merge e promoção: o próximo merge com aceite canônico aguarda a conclusão da promoção anterior. Usar um caminho de integração controlado, sem bypass pelo implementador, com fila/proteções suportadas pelo GitHub e verificação da referência; a implementação deve demonstrar que a referência não pode avançar entre o último gate e o merge autorizado. Uma consulta isolada à API, uma atualização assíncrona do check ou apenas `concurrency` no job de promoção não fecham essa janela. Enquanto esse bloqueio não estiver conectado, manter integração sequencial pelo mantenedor, conferir as referências e registrar a limitação do gate manual; não anunciar garantia automática contra essa corrida.

Antes de promover, confirmar pela API que o PR foi aprovado e integrado, que o conjunto protegido em M corresponde a Q e que os checks/reviews e a homologação exigidos para a mudança foram satisfeitos. Executar o aceite contra M; resultado de C não cobre automaticamente um merge diferente e essa validação posterior não substitui o gate pré-merge. Evidência registra também o artefato testado quando houver build. Se o conteúdo dos testes mudou, a aprovação antiga não serve.

O token restrito do QA recebe o PR associado a M sem `merge_commit_sha`. Por isso, a promoção exige associação única entre M e um PR integrado em `main`, igualdade entre a árvore Git de M e a árvore do head desse PR, além da aprovação e do check do App QA vinculados ao SHA exato do head. Divergência de conteúdo falha sem ampliar as permissões do token.

Serializar promoções e verificar que a referência ativa ainda é a S usada na validação. Se outro PR promoveu uma suíte, recompor Q sobre a nova referência, preservar os testes integrados, renovar a revisão das diferenças e repetir os gates afetados. Não resolver concorrência sobrescrevendo a suíte mais nova nem apenas com a ordem de término dos jobs.

A atualização da referência é atômica e condicionada ao valor anterior esperado; uma repetição com o mesmo Q/M/evidência não cria outra versão. Não promover `latest`, uma branch móvel ou um arquivo anexado pelo agente sem validação de origem e hash. Preservar S, Q, M, W, aprovação e execução no histórico.

Se a promoção falhar, S permanece ativa; registrar a falha e sua issue, bloquear aceite dependente da suíte nova e impedir promoção do produto enquanto a atualização obrigatória estiver pendente. Retentar sem alterar o conteúdo aprovado. Rollback é outra operação auditável, autorizada pelo mantenedor e compatível com a versão da aplicação; não apagar história nem restaurar critérios antigos silenciosamente.

## Implementação e critérios de aceite

Os itens abaixo registram os critérios de aceite da **#31**, concluída sob responsabilidade do mantenedor e do QA. A documentação, por si só, não implementa o gate; as evidências estão no [registro de encerramento](../reviews/agent-authority-closure-20260927.md).

| Entrega | Pré-requisito para iniciar a parte dependente | Evidência de conclusão |
|---|---|---|
| Confirmar/provisionar QA e autoridade de publicação | QA público com rulesets ativos; Publisher e Promoter separados; revogação das credenciais locais concluída | App implementador não escreve QA, não troca a referência e não imita a identidade do aceite; promoção real após os rulesets passa, e alteração direta humana é rejeitada |
| Fixar primeira suíte e W | Autoridade externa disponível | Manifesto, commits e aprovação; testes existentes caracterizados, nenhuma falha inventada |
| Integridade e execução obrigatória em PR | S/W aprovados e gatilho confiável | Erro conhecido rejeitado; correção aceita; alteração de teste, comando, fixture, skip, workflow e resultado não falsifica o aceite |
| Promoção pós-merge | Aceite anterior e autoridade de promoção operacionais | Novo teste revisado passa em M e entra na próxima suíte; conteúdo não aprovado, SHA errado, origem falsa e merge não validado não promovem |
| Concorrência e recuperação | Gates pré-merge e promotor implementados | Dois PRs validados contra S: após A promover, B perde o aceite e só integra após testar a suíte/base atual; exercitar avanço entre última checagem e tentativa de merge. Não perder testes; falha mantém S; retentativa idempotente; rollback auditado |

Cada entrega teve revisão independente Sol/low; o autor corrigiu os achados. O encerramento de F0-T2/#31 usou provas operacionais e revisão de segurança, além desta spec. Não habilitar um job meramente nominal como check obrigatório.

## Referências

- [GitHub — uso seguro de Actions](https://docs.github.com/en/actions/reference/security/secure-use): privilégios, runners descartáveis e risco de executar candidato em contexto privilegiado.
- [GitHub — eventos de workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): gatilho não transforma artefatos de origem não confiável em evidência de aceite.
- [Contrato de entrega e TDD](../engineering/delivery.md).
