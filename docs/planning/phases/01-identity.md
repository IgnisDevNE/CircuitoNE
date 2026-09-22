# Fase 1 — Identidade, conta e autenticação

**Estado:** planejada. **Entrada:** gate da fase 0 aprovado, SMTP de homologação e decisões D-02/D-03 resolvidas para os caminhos afetados. **Risco principal:** exposição de identidade e sessões. [Índice e gates comuns](../implementation-plan.md).

## F1-T1 — Identidade privada e unicidade

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31)/[#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) concluídas; [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38) para contrato de identidade; [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) na decisão de região/destino. Gate da fase zero permanece obrigatório.

**Issues tratadas:** [#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19) na integridade/validação no banco, complementando F0-T8.

**Dependência:** F0-T2/T4/T5. **Regras:** RN-01/03/04/31–34. D-02/D-03 aprovadas pelo responsável em 22/09/2026; integrar o registro revisado da #38 antes de fixar a versão dos contratos de aceite.

- Testar primeiro: anônimo e conta B não leem dados de A; CPF/celular ausentes, inválidos ou duplicados após normalização; duas gravações simultâneas; nascimento inválido; recusa abaixo de 18 anos e aceitação no aniversário de 18 anos, inclusive por chamada direta; UFs de todas as regiões aceitas; esquema privado não exposto por API/view.
- Entrega: migração da conta privada, vínculo com Auth e campos mínimos de atuação necessários ao onboarding; constraints, grants, RLS e tipos gerados. Sem senha duplicada no banco de aplicação.
- Aceite: dados pessoais fora de respostas públicas/logs; duplicação impedida pelo banco; erro recuperável sem revelar a identidade de outro titular. CPF único não é verificação de identidade.
- Documentação: dicionário dos campos, matriz de acesso, política de CPF/nascimento e nota da migração com recuperação.

## F1-T2 — Cadastro, confirmação e onboarding recuperável

**Bloqueios por issue:** [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38); [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) na parte de SMTP/callbacks validada. Herda os bloqueios de F1-T1.

**Issues tratadas:** [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19)/[#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) na identidade/cadastro real; partes de coletivo e mensagens seguem abertas.

**Dependência:** F1-T1 e SMTP operacional. **Escopo:** substituir o cadastro/login demo por persistência real.

- Testar primeiro: e-mail/CPF/celular duplicados, senha inválida, celular ausente/não confirmado, código incorreto/expirado/reutilizado, reenvio limitado, falha após criação no Auth, retry e retorno a cadastro incompleto.
- Entrega: formulário com senha/confirmar, celular obrigatório confirmado por código (RN-32), Auth e operação transacional dos dados de aplicação + primeira atuação mínima. Auth e Postgres não formam uma transação distribuída: registrar estado incompleto e retomar com idempotência, sem sucesso falso ou perfil público órfão. Canal/provedor de código e limites operacionais são pré-requisitos de #43 para este caminho.
- Aceite: recarregar mantém o progresso já persistido; telas explicam o estado real. Ramos que criam coletivo/solicitam entrada só ficam disponíveis após F3-T1/T3/T5; não simular conclusão desses ramos nesta fase.
- Documentação: sequência de cadastro, transições, expiração/limpeza de onboarding abandonado e responsabilidades de compensação.

## F1-T3 — Sessão SSR, login, logout e recuperação

**Bloqueios por issue:** [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) na parte de SMTP/callbacks; partes de cadastro de [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15) entregues em F1-T2, sem exigir encerramento das partes de outros domínios.

**Issues tratadas:** [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) na sessão, login/logout e recuperação; completar [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) com F1-T4.

**Dependência:** F1-T1/T2 e runtime F0-T11/T12.

- Testar primeiro: login correto/incorreto, refresh concorrente, sessão expirada, link de recuperação inválido, redirect externo malicioso, CSRF, logout e duas contas em requisições/cache distintos.
- Entrega: integração oficial Supabase SSR, cliente por requisição, validação de identidade no servidor, callbacks restritos e jornadas de recuperação. Celular obrigatório/único/previamente confirmado segue RN-32; sem acesso aos contatos, o suporte aplica conferência documental privada conforme RN-33, sem transferir conta por CPF alegado. Não autorizar apenas com `getSession()` nem manter sessão global no Node.
- Aceite: recarga e navegação funcionam; resposta privada/`Set-Cookie` não é compartilhada em cache; conta suspensa falha de forma segura. Definir e testar o efeito esperado de revogação de sessão, sem presumir invalidação imediata de todo JWT.
- Documentação: ciclo de sessão, URLs por ambiente, política de cookies/CSRF, limites de abuso e casos de falha.

## F1-T4 — Alterar dados e proteger operações sensíveis

**Bloqueios por issue:** [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38); [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) na parte de sessão/recuperação validada em F1-T3, sem exigir encerrar a manutenção de conta antes de iniciá-la.

**Issues tratadas:** [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) integralmente nos fluxos de conta; contribuir para [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) e para o ciclo de vida posterior.

**Dependência:** F1-T2/T3 e registro revisado de D-03 integrado pela #38; aprovação de produto não comprova implementação ou homologação.

- Testar primeiro: trocar e-mail pela tabela local não altera identidade; confirmação do novo e-mail/celular, reautenticação, senha anterior incorreta, acesso de outra conta, recusa de alteração direta de CPF e correção somente pelo suporte com conferência de documento; eliminar a cópia ao concluir a análise; após exclusão efetiva, novo cadastro com o mesmo CPF não recupera dados/permissões antigos.
- Entrega: manutenção dos próprios dados, alteração de senha/e-mail via Auth, solicitação de correção de CPF à administração do site (RN-33) e desenho executável de suspensão/exclusão. RN-34 determina limpeza dos dados e permite novo cadastro; mensagens são preservadas sem identificar o remetente. Compatibilizar backups, conteúdo pessoal dentro das mensagens, dados de coletivos e contas suspensas com #38/#40/#42/#43 antes dos caminhos afetados.
- Aceite: nenhum campo privado fica editável por mass assignment; invariantes sobrevivem a chamada REST direta. Retenção/exclusão não são decisões deixadas para o último deploy; execução completa do ciclo de vida é validada em F6-T2.
- Documentação: contrato de edição, suporte de recuperação, auditoria sem PII e efeitos sobre sessões.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-1.md`. Demonstrar com duas contas sintéticas: cadastro → confirmação → login/recarga → edição → recuperação → logout, incluindo falhas e REST negativo. Revisar especialmente acesso, criptografia, autenticação, logs, abuso e falha parcial.

Migrações reconstruídas em banco descartável e validadas em `CircuitoNE-dev` pelo GitHub no SHA final. Sem dados reais, sem credencial privilegiada no navegador e sem ramo de cadastro que anuncie persistência inexistente.
