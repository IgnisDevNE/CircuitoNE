# Entrega, TDD e documentação

## Autoridades separadas

O responsável escolheu **um GitHub App para os agentes**, em vez de outra conta pessoal. `magalz` permanece como responsável humano. Em 22/09/2026 foi conectado o App `ignisdevne` (5028495), instalação 163660443. Não compartilhar token de administrador com a execução cotidiana.

| Papel | Pode | Não pode |
|---|---|---|
| Responsável humano (`magalz`) | Aprovar contrato/testes, PRs e releases; gerir GitHub e ambientes | Delegar suas credenciais administrativas a implementadores e ainda afirmar que há isolamento |
| GitHub App implementador | Ler projeto, criar branch, fazer commits e abrir PRs; rodar testes locais | Administrar repositório, aprovar o próprio PR, alterar secrets/ambientes/regras, acessar produção |
| Responsável por testes de aceite | Definir oráculo/testes independentes e aprovar suas mudanças | Ajustar expectativa somente porque a implementação falhou |
| Verificador confiável | Executar suíte aprovada contra SHA/artefato candidato e emitir evidência | Executar código do PR no mesmo contexto de segredos de produção ou da chave de assinatura do resultado |

`CODEOWNERS` foi preparado para testes, workflows, contratos e dependências. Ele só exige aprovação quando combinado com proteção da branch. Não impede editar um arquivo localmente, não esconde testes e não protege contra alguém com suas credenciais de administrador.

Durante a preparação, o mantenedor restringiu a instalação do App a repositórios selecionados, deixando `IgnisDevNE/CircuitoNE-QA` fora dela. Em 22/09, a instalação ainda apresentava permissões temporárias `Actions:write` e `Workflows:write` para configuração inicial; revogá-las antes de agentes implementarem regras. Cada execução deve emitir token limitado ao projeto necessário. Para isolamento forte, a chave privada e as credenciais humanas devem sair do ambiente do implementador, que receberá apenas token temporário com escopo mínimo. Não usar o mesmo App para implementar e atestar o aceite. Referências: [permissões do GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) e [tokens de instalação](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## Isolamento do TDD

**Camada imediata:** testes de unidade/caracterização no projeto, revisão obrigatória de testes e CI de PR sem secrets. Alterações de contrato/teste têm revisão própria e não são diluídas no diff da implementação. Não usar `chmod`, hash guardado ao lado do teste ou instrução de prompt como barreira de segurança.

**Camada de aceite antes de agentes implementarem regras:** suíte canônica em [IgnisDevNE/CircuitoNE-QA](https://github.com/IgnisDevNE/CircuitoNE-QA), repositório público com branches protegidas e excluído da instalação do App implementador ([ADR 0009](../decisions/0009-public-qa-protected-branches.md)). Definir teste e commit imutável antes da implementação; registrar esse SHA na tarefa. O implementador recebe critérios e pode ler os testes, mas o verificador usa a versão canônica, não a cópia alterada no PR. A separação depende da seleção efetiva de repositórios da instalação e da remoção das credenciais humanas do ambiente do agente.

O pipeline confiável parte de configuração controlada pelo mantenedor, com dependências e comando de teste próprios. Baixa o SHA exato da aplicação, executa build em ambiente descartável sem segredo e testa externamente comportamento/API/RLS. Restaurar apenas `tests/` do `main` e executar `npm test` do PR seria insuficiente: o PR também pode alterar runner, scripts, loaders, fixtures e build para burlar a verificação.

O resultado de aceite vem do App QA separado; a proteção de `main` exige o check `canonical-acceptance` emitido por esse App. Um check com o mesmo nome emitido pelo PR não libera merge. A aprovação humana continua necessária: CI verde sozinho não autoriza merge.

Separar obtenção de credenciais, execução de código não confiável e publicação de resultados. Não usar `pull_request_target` com checkout/execução do PR. Nenhum runner persistente da infraestrutura pessoal recebe código de PR. Não publicar chave de QA dentro do contexto de execução da aplicação. Usar usuários fictícios descartáveis e banco de teste, não dados reais.

**Direção aprovada em 22/09/2026:** concentrar o aceite e a atualização da suíte na esteira, poupando recursos locais ([ADR 0006](../decisions/0006-canonical-ci-suite.md), [spec](../specs/canonical-ci-suite.md), [controle de mudanças](../controls/change-control.md), [controle de acesso](../controls/access-control.md)). Comparar o conjunto protegido com a versão aprovada e executar os testes com comando/configuração de origem independente do PR. Novos testes recebem revisão específica e SHA fixado antes da implementação; a proposta revisada pode validar a tarefa, mas só vira referência global depois do merge e da validação do commit integrado. O check obrigatório do App Publisher está ativo; a promoção automática passou nos ensaios das PRs #56 e #57 antes dos rulesets de QA. O ensaio pós-proteção, as negativas restantes e a retirada das credenciais locais continuam na #31. CI verde sozinho não aprova testes novos ou alterados.

### Fluxo TDD de cada tarefa

1. Vincular tarefa a RN e critérios mensuráveis (incluindo negações, falhas e concorrência quando aplicável).
2. Escrever teste primeiro. Responsável por aceite revisa e fixa versão quando for contrato de negócio.
3. Executar contra a base; registrar **falha pela regra ausente**, não por dependência faltando. Registrar SHA, comando, resultado e asserção.
4. Implementador faz o menor ajuste que passa. Não altera oráculo, desabilita teste, marca `skip`, reduz cobertura ou aumenta limite para esconder regressão.
5. Rodar suite, typecheck e build; refatorar mantendo verde. Para SQL, aplicar migrations em banco descartável, testar roles reais/RLS e depois homologação.
6. Rodar aceite canônico contra SHA final. Fazer review normal independente; corrigir e repetir somente o que a mudança invalida.
7. Homologar e anexar evidência. Merge somente após gates. Excluir branch concluída, atualizar `main`, criar nova branch na próxima tarefa.
8. Quando a suíte evoluir, revalidar o commit integrado e promover a versão exata dos testes revisados na esteira confiável. Até a promoção bem-sucedida, manter a referência anterior e bloquear aceite dependente da nova suíte; nunca atualizar a referência durante a validação do PR para esconder divergência.

Para testes de caracterização de código já existente, é honesto registrar que o primeiro resultado foi verde. Não fabricar uma falha nem preservar um bug como contrato. Testes de novo comportamento devem demonstrar vermelho → verde.

### Ferramentas por camada

- Preparação: `node:test` (stdlib) para proteção do repositório, sem adicionar dependências.
- Fase 0: Vitest para TypeScript e React Testing Library para interações; instalar quando os primeiros testes de tela forem escritos. Não criar framework de testes próprio.
- Fluxos completos: Playwright, com testes de aceite fora da autoridade do implementador. Dados sintéticos, relógio controlado, seletores por papéis/rótulos.
- Banco: SQL/pgTAP com Supabase local e testes REST com identidades distintas; transações concorrentes para invariantes. Serviço privilegiado não serve para provar RLS.
- Segurança: análise de dependências e código + revisão manual; DAST somente contra homologação autorizada. Scan não substitui OWASP nem revisão de regras.

O workflow CodeQL analisa JavaScript/TypeScript e GitHub Actions com `security-extended` em PRs, `main` e semanalmente ([ADR 0005](../decisions/0005-codeql-security.md)). Conferir também os alertas em Security → Code scanning: sucesso do job não equivale a ausência de vulnerabilidades. O workflow não configura sozinho proteção de merge por severidade; revisão humana e gates de segurança continuam obrigatórios.

Cada tarefa aponta suas **issues bloqueantes**, a condição de desbloqueio e as **issues que ela resolve**. Não iniciar o trecho dependente antes de registrar a resolução do pré-requisito; não exigir encerramento antecipado da própria correção. Em issues com várias partes, anexar evidência do item atendido e manter o restante aberto. Priorizar na fase zero bloqueios técnicos, decisões de produto e preparação operacional; justificar individualmente qualquer resíduo.

## Reviews e gates

**Por tarefa:** review do diff, regra, teste vermelho/verde, validação de entrada, estados de erro, autorização, escopo, acessibilidade afetada e documentação. Autor não é único aprovador. Resultado: aprovado / alterações necessárias, com evidência no SHA final. P0/P1 bloqueiam. P2 relevante fica corrigido ou aceito com responsável e prazo.

**Por fase:** review completo do conjunto (arquitetura, jornadas, regressões, dados, performance, acessibilidade, operação), acompanhado da matriz OWASP Top 10:2025 em `docs/reviews/security-baseline.md`. Cada categoria tem evidência, achado, severidade e tratamento ou justificativa de não aplicabilidade. Não preencher “aprovado” por default. A fase seguinte pode iniciar somente nas partes que não dependem de gate reprovado.

**Antes de produção:** homologação real no CircuitoNE-dev pelo GitHub, SHA e checksums registrados, migrations compatíveis, smoke tests e restauração ensaiada. Produção usa ambiente protegido e aprovação do humano, sem novos commits entre evidência e promoção. Um hotfix continua tendo teste, review e homologação proporcional; urgência não autoriza teste de schema em produção.

## Documentação mínima, sem duplicação

Todo achado de review deferido, item de dívida técnica ou bug que não possa ser resolvido imediatamente deve ter **issue aberta no GitHub antes de encerrar ou repassar a tarefa**. Reutilizar uma issue aberta correspondente; registrar evidência/impacto, motivo do adiamento, papel responsável e critérios de aceite. Vincular a issue no PR, review ou plano pertinente: documento, comentário ou TODO isolado não substitui a issue. Abrir issue não dispensa gates bloqueantes; planejar a correção não permite encerrar o achado como resolvido. Se a criação estiver bloqueada, informar o impedimento concreto e preservar o rascunho sem declarar a issue criada.

| Frequência | Artefato | Conteúdo mínimo |
|---|---|---|
| Cada tarefa | Issue/PR + `docs/tasks/Fx-Ty.md` se a evidência não couber no PR | Problema, RN, critérios, escopo, teste vermelho/verde, SHA, homologação, review, risco e recuperação |
| Quando regra muda | `docs/business-rules/mvp.md` | Decisão, fonte, data, critério de aceite e divergência resolvida |
| Quando contrato técnico muda | `docs/specs/*.md` | Estado, data, escopo, requisitos, critérios de aceite e pendências; atualizar o índice |
| Quando decisão técnica muda | `docs/decisions/NNNN-*.md` | Contexto, decisão, alternativas descartadas relevantes e consequências |
| Quando schema muda | `docs/migrations/*.sql` + nota da migração | Ordem, integridade/RLS, backfill, compatibilidade e rollback/roll-forward |
| Cada fase | `docs/reviews/phase-N.md` | Tarefas concluídas, review completo, matriz OWASP, evidências, pendências com dono e gate final |
| Quando operação muda | `docs/engineering/environment.md` | Comandos operacionais verificados, acessos, backup, restauração e incidentes |
| Release | Nota de release | SHA, regras entregues, migrations, URLs, smoke test e plano de recuperação |

Specs descrevem o resultado esperado; ADRs registram contexto, alternativas e consequências relevantes. Não gerar ADR para cada função nem repetir a spec ou todo o modelo em cada tarefa. Para documentos, revisar consistência, links, evidências e decisões; não inventar testes de prosa para cumprir TDD mecanicamente.

## Limitação atual

Em 22/09/2026, o responsável informou concessão temporária de `Actions: write` para o bot disparar a validação protegida e somente leitura de credenciais de homologação. Essa manutenção é delimitada na ADR 0003 e em `environment.md`: execução em `main`, após PR revisado e aprovação do environment, sem código da aplicação no job que recebe secrets. Não muda a autoridade sobre QA/aceite nem aprova migrações ou releases. Publicação de workflows requer outra permissão; a concessão de Actions não a implica.

O GitHub App está autenticado pelo helper descrito em `environment.md`. A API confirmou que o token emitido só enxerga CircuitoNE; consultas às proteções de branch e aos secrets foram negadas com HTTP 403. Não foram tentadas mutações reais em regras/secrets para simular negações.

**Ainda não há isolamento forte do ambiente local** ([issue #31](https://github.com/IgnisDevNE/CircuitoNE/issues/31)): o QA/verificador externo e seu check obrigatório estão conectados, mas a chave do App ainda está em `secrets/` e as credenciais humanas continuam disponíveis nas ferramentas da máquina. O helper separa a identidade de cada comando, mas não impede um processo com esse acesso de usar outra credencial ou emitir token mais amplo. F0-T2 só termina ao retirar esse acesso local e demonstrar os demais testes negativos de QA, aprovação e promoção.
