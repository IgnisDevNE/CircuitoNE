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

O responsável confirmou que o App atenderá **todos os repositórios da IgnisDevNE**. A instalação mantém esse alcance; cada execução deve emitir token limitado ao projeto necessário. Permissões verificadas: Contents, Pull requests e Issues com escrita; Metadata, Actions, Checks e Commit statuses somente leitura. Sem Administration, Secrets, Environments ou Workflows. Alterações de workflows passam pelo mantenedor. Para isolamento forte, a chave privada deve ficar em um emissor controlado, fora do ambiente do implementador; fornecer apenas token temporário. Não usar o mesmo App para implementar e atestar o aceite. Referências: [permissões do GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) e [tokens de instalação](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

## Isolamento do TDD

**Camada imediata:** testes de unidade/caracterização no projeto, revisão obrigatória de testes e CI de PR sem secrets. Alterações de contrato/teste têm revisão própria e não são diluídas no diff da implementação. Não usar `chmod`, hash guardado ao lado do teste ou instrução de prompt como barreira de segurança.

**Camada de aceite antes de agentes implementarem regras:** suíte canônica em repositório de QA controlado pelo humano, sem escrita da identidade implementadora. Definir teste e commit imutável antes da implementação; registrar esse SHA na tarefa. O implementador recebe critérios e pode receber cópia local dos testes, mas o verificador usa a versão canônica, não a cópia alterada no PR. Como o App foi destinado a todos os repositórios da organização, o QA deve ficar em **outra conta/organização sem instalação desse App**, por exemplo `magalz/CircuitoNE-qa` (proposta, ainda não criado). Um QA dentro da IgnisDevNE não teria a separação desejada.

O pipeline confiável parte de configuração controlada pelo mantenedor, com dependências e comando de teste próprios. Baixa o SHA exato da aplicação, executa build em ambiente descartável sem segredo e testa externamente comportamento/API/RLS. Restaurar apenas `tests/` do `main` e executar `npm test` do PR seria insuficiente: o PR também pode alterar runner, scripts, loaders, fixtures e build para burlar a verificação.

Para automatizar o bloqueio forte, o resultado de aceite precisa vir de workflow organizacional obrigatório e protegido, se suportado, ou de GitHub App/verificador cuja identidade o agente não possa imitar. Um check pelo nome `acceptance` emitido por qualquer workflow do PR não é uma fronteira forte. Até essa origem confiável existir, o gate é aprovação humana com evidência externa: CI verde sozinho não autoriza merge.

Separar obtenção de credenciais, execução de código não confiável e publicação de resultados. Não usar `pull_request_target` com checkout/execução do PR. Nenhum runner persistente da infraestrutura pessoal recebe código de PR. Não publicar chave de QA dentro do contexto de execução da aplicação. Usar usuários fictícios descartáveis e banco de teste, não dados reais.

### Fluxo TDD de cada tarefa

1. Vincular tarefa a RN e critérios mensuráveis (incluindo negações, falhas e concorrência quando aplicável).
2. Escrever teste primeiro. Responsável por aceite revisa e fixa versão quando for contrato de negócio.
3. Executar contra a base; registrar **falha pela regra ausente**, não por dependência faltando. Registrar SHA, comando, resultado e asserção.
4. Implementador faz o menor ajuste que passa. Não altera oráculo, desabilita teste, marca `skip`, reduz cobertura ou aumenta limite para esconder regressão.
5. Rodar suite, typecheck e build; refatorar mantendo verde. Para SQL, aplicar migrations em banco descartável, testar roles reais/RLS e depois homologação.
6. Rodar aceite canônico contra SHA final. Fazer review normal independente; corrigir e repetir somente o que a mudança invalida.
7. Homologar e anexar evidência. Merge somente após gates. Excluir branch concluída, atualizar `main`, criar nova branch na próxima tarefa.

Para testes de caracterização de código já existente, é honesto registrar que o primeiro resultado foi verde. Não fabricar uma falha nem preservar um bug como contrato. Testes de novo comportamento devem demonstrar vermelho → verde.

### Ferramentas por camada

- Preparação: `node:test` (stdlib) para proteção do repositório, sem adicionar dependências.
- Fase 1: Vitest para TypeScript e React Testing Library para interações; instalar quando os primeiros testes de tela forem escritos. Não criar framework de testes próprio.
- Fluxos completos: Playwright, com testes de aceite fora da autoridade do implementador. Dados sintéticos, relógio controlado, seletores por papéis/rótulos.
- Banco: SQL/pgTAP com Supabase local e testes REST com identidades distintas; transações concorrentes para invariantes. Serviço privilegiado não serve para provar RLS.
- Segurança: análise de dependências e código + revisão manual; DAST somente contra homologação autorizada. Scan não substitui OWASP nem revisão de regras.

## Reviews e gates

**Por tarefa:** review do diff, regra, teste vermelho/verde, validação de entrada, estados de erro, autorização, escopo, acessibilidade afetada e documentação. Autor não é único aprovador. Resultado: aprovado / alterações necessárias, com evidência no SHA final. P0/P1 bloqueiam. P2 relevante fica corrigido ou aceito com responsável e prazo.

**Por fase:** review completo do conjunto (arquitetura, jornadas, regressões, dados, performance, acessibilidade, operação), acompanhado da matriz OWASP Top 10:2025 em `docs/reviews/security-baseline.md`. Cada categoria tem evidência, achado, severidade e tratamento ou justificativa de não aplicabilidade. Não preencher “aprovado” por default. A fase seguinte pode iniciar somente nas partes que não dependem de gate reprovado.

**Antes de produção:** homologação real no CircuitoNE-dev pelo GitHub, SHA e checksums registrados, migrations compatíveis, smoke tests e restauração ensaiada. Produção usa ambiente protegido e aprovação do humano, sem novos commits entre evidência e promoção. Um hotfix continua tendo teste, review e homologação proporcional; urgência não autoriza teste de schema em produção.

## Documentação mínima, sem duplicação

| Frequência | Artefato | Conteúdo mínimo |
|---|---|---|
| Cada tarefa | Issue/PR + `docs/tasks/Fx-Ty.md` se a evidência não couber no PR | Problema, RN, critérios, escopo, teste vermelho/verde, SHA, homologação, review, risco e recuperação |
| Quando regra muda | `docs/business-rules/mvp.md` | Decisão, fonte, data, critério de aceite e divergência resolvida |
| Quando decisão técnica muda | `docs/decisions/NNNN-*.md` | Contexto, decisão, alternativas descartadas relevantes e consequências |
| Quando schema muda | `docs/migrations/*.sql` + nota da migração | Ordem, integridade/RLS, backfill, compatibilidade e rollback/roll-forward |
| Cada fase | `docs/reviews/phase-N.md` | Tarefas concluídas, review completo, matriz OWASP, evidências, pendências com dono e gate final |
| Quando operação muda | `docs/engineering/environment.md` | Comandos operacionais verificados, acessos, backup, restauração e incidentes |
| Release | Nota de release | SHA, regras entregues, migrations, URLs, smoke test e plano de recuperação |

Não gerar ADR para cada função nem repetir todo o modelo em cada tarefa. Para documentos, revisar consistência, links, evidências e decisões; não inventar testes de prosa para cumprir TDD mecanicamente.

## Limitação atual

O GitHub App está autenticado pelo helper descrito em `environment.md`. A API confirmou que o token emitido só enxerga CircuitoNE; consultas às proteções de branch e aos secrets foram negadas com HTTP 403. Não foram tentadas mutações reais em regras/secrets para simular negações.

**Ainda não há isolamento forte:** o QA/verificador externo não estão conectados, a chave do App ainda está em `secrets/` no ambiente local e as credenciais humanas continuam disponíveis nas ferramentas da máquina. O helper separa a identidade de cada comando, mas não impede um processo com esse acesso de usar outra credencial ou emitir token mais amplo. F0-T2 só termina ao separar o emissor e o ambiente implementador, retirar acesso humano/admin e demonstrar os demais testes negativos de QA, aprovação e promoção.
