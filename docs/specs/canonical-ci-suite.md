# Aceite canônico e atualização da suíte no CI

Data: 22/09/2026. **Estado:** direção aprovada; infraestrutura inicial em implantação, gate ainda não obrigatório. Vinculada à [ADR 0006](../decisions/0006-canonical-ci-suite.md) e à [#31 / F0-T2](https://github.com/IgnisDevNE/CircuitoNE/issues/31).

## Objetivo e autoridade

Executar o aceite na esteira, poupando recursos do PC, e impedir que alterações nos testes ou no comando do PR substituam os critérios aprovados. Após aprovação, merge e validação, a própria esteira promove os novos testes para a referência dos próximos PRs. CI verde, isoladamente, não aprova uma mudança de contrato.

A suíte, suas propostas, o workflow de aceite e a referência ativa ficam sob autoridade externa à implementação. O repositório [IgnisDevNE/CircuitoNE-QA](https://github.com/IgnisDevNE/CircuitoNE-QA) foi criado na mesma organização e o mantenedor retirou-o da instalação do App `ignisdevne`. Não ampliar essa instalação para dar escrita no QA. O `main` do QA contém a primeira suíte de caracterização e o verificador; o CI próprio passou no commit `ff9bf46`. A proteção de `main` exige o check `scripts` e uma aprovação independente.

O processamento pesado usa runners descartáveis hospedados pelo GitHub. Não exige uma VM de desenvolvimento local nem um middleware próprio. O desenho pressupõe que a identidade implementadora não tenha autoridade administrativa sobre o QA, o aprovador ou o publicador; não protege contra uso de credenciais humanas disponíveis por outra ferramenta. Essa limitação de credenciais permanece na #31, sem alegar isolamento do PC ou dispensar os gates existentes.

O QA ainda precisa de uma identidade publicadora própria com apenas `Checks:write` no CircuitoNE. A política da organização rejeitou habilitar criação de PRs pelo `GITHUB_TOKEN` padrão do QA (HTTP 409); não alterá-la. O workflow prepara a branch da proposta, e o responsável abre e aprova o PR no QA antes do aceite. O gatilho do repositório principal precisa de token restrito ao QA com `Actions:write`, guardado somente no environment `QA Dispatch`. O environment `QA Publisher` já foi restringido a branches protegidas, mas ainda não contém as credenciais do App QA. A branch `accepted`, seu estado inicial, o check exigido com origem fixada no App QA e os ensaios de aceitação/negação devem ser concluídos antes de ativar `CANONICAL_QA_ENABLED` ou encerrar a #31.

## Versões e arquivos protegidos

- **S:** commit imutável da suíte ativa, aprovado sob a autoridade de QA.
- **Q:** commit imutável de uma proposta revisada de evolução da suíte; ainda não é a referência global.
- **C:** commit exato da aplicação em análise. **M:** commit efetivamente integrado em `main`, que pode diferir de C após merge/squash.
- **W:** commit do workflow/verificador confiável, incluindo comando, runner, configuração, seleção de testes e dependências de QA fixadas.

Um manifesto controlado pelo QA define o conjunto protegido: testes canônicos, fixtures, snapshots, utilitários de asserção e configuração/dependências do executor. Ele não é escolhido pelo PR. Testes locais adicionais podem existir, mas não contam como aceite sem entrar nesse conjunto por revisão.

A integridade compara objetos/árvores Git da versão candidata com a referência esperada: conteúdo, caminhos, tipos/modos e inventário. Adições, remoções, renomes e mudanças para links simbólicos não passam despercebidas. Não usar um arquivo de hashes editável no próprio PR como autoridade. Links/submódulos que escapem do conjunto aprovado são rejeitados. A origem aprovada dos comandos é W; comparar hashes dos testes e repetir `pnpm test` do PR não basta.

## Etapas da esteira

| Etapa | Entrada e resultado obrigatório |
|---|---|
| `resolve-acceptance` | Confirma origem do evento, repositório, PR e C pela API; resolve S, W e eventual Q a partir de registros de QA. Dados do PR não escolhem sozinhos a referência nem o workflow. |
| `verify-test-integrity` | Compara o conjunto protegido com S ou com Q explicitamente aprovado para essa tarefa. Divergência sem aprovação falha antes de executar código candidato. |
| `canonical-acceptance` | Executa a suíte obtida do QA contra C usando W. Registra inventário executado, resultados, S/Q, C, W e identificação da execução; falhas, testes esperados ausentes ou skips não autorizados rejeitam o aceite. |
| `publish-acceptance` | Publica somente a evidência validada, vinculada a C, S, Q/W quando aplicáveis e à base de integração. A identidade implementadora não possui essa autoridade. Commit novo ou avanço da suíte/base invalida o aceite anterior antes do merge. |
| `promote-suite` | Após aprovação específica da mudança dos testes, merge e sucesso dos gates exigidos, revalida M contra Q com W e promove exatamente Q a suíte ativa. Sem mudança de suíte, registra no-op. |

As etapas são responsabilidades lógicas, não obrigação de criar cinco workflows ou um framework. Usar as primitivas de Actions e Git já existentes; nomes acima ainda não correspondem a jobs instalados.

O workflow de aceite e o publicador não são executados a partir do YAML alterável pelo PR. O gatilho automático e a origem obrigatória do check precisam ser configurados e demonstrados pelo mantenedor. Um check com o mesmo nome criado pelo candidato não libera merge. Até conectar esse bloqueio, o aceite é revisão humana da execução externa e dos SHAs; não declarar automação obrigatória instalada.

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

Serializar promoções e verificar que a referência ativa ainda é a S usada na validação. Se outro PR promoveu uma suíte, recompor Q sobre a nova referência, preservar os testes integrados, renovar a revisão das diferenças e repetir os gates afetados. Não resolver concorrência sobrescrevendo a suíte mais nova nem apenas com a ordem de término dos jobs.

A atualização da referência é atômica e condicionada ao valor anterior esperado; uma repetição com o mesmo Q/M/evidência não cria outra versão. Não promover `latest`, uma branch móvel ou um arquivo anexado pelo agente sem validação de origem e hash. Preservar S, Q, M, W, aprovação e execução no histórico.

Se a promoção falhar, S permanece ativa; registrar a falha e sua issue, bloquear aceite dependente da suíte nova e impedir promoção do produto enquanto a atualização obrigatória estiver pendente. Retentar sem alterar o conteúdo aprovado. Rollback é outra operação auditável, autorizada pelo mantenedor e compatível com a versão da aplicação; não apagar história nem restaurar critérios antigos silenciosamente.

## Implementação e critérios de aceite

Todos os itens tratam a **#31**, responsável mantenedor + QA, alvo F0-T2. A issue aberta não bloqueia iniciar sua própria correção. A documentação não implementa nenhum gate.

| Entrega | Pré-requisito para iniciar a parte dependente | Evidência de conclusão |
|---|---|---|
| Confirmar/provisionar QA e autoridade de publicação | Repositório QA e proteção inicial de `main` criados; App QA e credenciais restritas ainda pendentes | App implementador não escreve QA, não troca a referência e não imita a identidade do aceite; controles independentes dos arquivos do PR |
| Fixar primeira suíte e W | Autoridade externa disponível | Manifesto, commits e aprovação; testes existentes caracterizados, nenhuma falha inventada |
| Integridade e execução obrigatória em PR | S/W aprovados e gatilho confiável | Erro conhecido rejeitado; correção aceita; alteração de teste, comando, fixture, skip, workflow e resultado não falsifica o aceite |
| Promoção pós-merge | Aceite anterior e autoridade de promoção operacionais | Novo teste revisado passa em M e entra na próxima suíte; conteúdo não aprovado, SHA errado, origem falsa e merge não validado não promovem |
| Concorrência e recuperação | Gates pré-merge e promotor implementados | Dois PRs validados contra S: após A promover, B perde o aceite e só integra após testar a suíte/base atual; exercitar avanço entre última checagem e tentativa de merge. Não perder testes; falha mantém S; retentativa idempotente; rollback auditado |

Cada entrega tem revisão independente Sol/low; o autor corrige os achados. Concluir F0-T2 mantém o review de segurança e demais pré-requisitos da #31. Não habilitar um job meramente nominal como check obrigatório nem encerrar a issue com base só nesta spec.

## Referências

- [GitHub — uso seguro de Actions](https://docs.github.com/en/actions/reference/security/secure-use): privilégios, runners descartáveis e risco de executar candidato em contexto privilegiado.
- [GitHub — eventos de workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): gatilho não transforma artefatos de origem não confiável em evidência de aceite.
- [Contrato de entrega e TDD](../engineering/delivery.md).
