# Fase 1 — Identidade, conta e autenticação

**Estado:** planejada. **Entrada:** gate da fase 0 aprovado, SMTP de homologação e decisões D-02/D-03 resolvidas para os caminhos afetados. **Risco principal:** exposição de identidade e sessões. [Índice e gates comuns](../implementation-plan.md).

## F1-T1 — Identidade privada e unicidade

**Dependência:** F0-T2/T4/T5. **Regras:** RN-01/03/04; confirmar D-02/D-03 antes de fixar contratos.

- Testar primeiro: anônimo e conta B não leem dados de A; CPF ausente/inválido/normalizado duplicado; duas gravações simultâneas; nascimento inválido; esquema privado não exposto por API/view.
- Entrega: migração da conta privada, vínculo com Auth e campos mínimos de atuação necessários ao onboarding; constraints, grants, RLS e tipos gerados. Sem senha duplicada no banco de aplicação.
- Aceite: dados pessoais fora de respostas públicas/logs; duplicação impedida pelo banco; erro recuperável sem revelar a identidade de outro titular. CPF único não é verificação de identidade.
- Documentação: dicionário dos campos, matriz de acesso, política de CPF/nascimento e nota da migração com recuperação.

## F1-T2 — Cadastro, confirmação e onboarding recuperável

**Dependência:** F1-T1 e SMTP operacional. **Escopo:** substituir o cadastro/login demo por persistência real.

- Testar primeiro: e-mail/CPF duplicados, senha inválida, confirmação usada/expirada, reenvio limitado, falha após criação no Auth, retry e retorno a cadastro incompleto.
- Entrega: formulário com senha/confirmar, Auth e operação transacional dos dados de aplicação + primeira atuação mínima. Auth e Postgres não formam uma transação distribuída: registrar estado incompleto e retomar com idempotência, sem sucesso falso ou perfil público órfão.
- Aceite: recarregar mantém o progresso já persistido; telas explicam o estado real. Ramos que criam coletivo/solicitam entrada só ficam disponíveis após F3-T1/T3/T5; não simular conclusão desses ramos nesta fase.
- Documentação: sequência de cadastro, transições, expiração/limpeza de onboarding abandonado e responsabilidades de compensação.

## F1-T3 — Sessão SSR, login, logout e recuperação

**Dependência:** F1-T1/T2 e runtime F0-T11/T12.

- Testar primeiro: login correto/incorreto, refresh concorrente, sessão expirada, link de recuperação inválido, redirect externo malicioso, CSRF, logout e duas contas em requisições/cache distintos.
- Entrega: integração oficial Supabase SSR, cliente por requisição, validação de identidade no servidor, callbacks restritos e jornadas de recuperação. Não autorizar apenas com `getSession()` nem manter sessão global no Node.
- Aceite: recarga e navegação funcionam; resposta privada/`Set-Cookie` não é compartilhada em cache; conta suspensa falha de forma segura. Definir e testar o efeito esperado de revogação de sessão, sem presumir invalidação imediata de todo JWT.
- Documentação: ciclo de sessão, URLs por ambiente, política de cookies/CSRF, limites de abuso e casos de falha.

## F1-T4 — Alterar dados e proteger operações sensíveis

**Dependência:** F1-T2/T3; D-03 aprovada.

- Testar primeiro: trocar e-mail pela tabela local não altera identidade; confirmação do novo e-mail, reautenticação, senha anterior incorreta, acesso de outra conta e tentativas de alterar CPF indevidamente.
- Entrega: manutenção dos próprios dados, alteração de senha/e-mail via Auth, procedimento de recuperação de CPF e desenho executável de suspensão/exclusão.
- Aceite: nenhum campo privado fica editável por mass assignment; invariantes sobrevivem a chamada REST direta. Retenção/exclusão não são decisões deixadas para o último deploy; execução completa do ciclo de vida é validada em F6-T2.
- Documentação: contrato de edição, suporte de recuperação, auditoria sem PII e efeitos sobre sessões.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-1.md`. Demonstrar com duas contas sintéticas: cadastro → confirmação → login/recarga → edição → recuperação → logout, incluindo falhas e REST negativo. Revisar especialmente acesso, criptografia, autenticação, logs, abuso e falha parcial.

Migrações reconstruídas em banco descartável e validadas em `CircuitoNE-dev` pelo GitHub no SHA final. Sem dados reais, sem credencial privilegiada no navegador e sem ramo de cadastro que anuncie persistência inexistente.
