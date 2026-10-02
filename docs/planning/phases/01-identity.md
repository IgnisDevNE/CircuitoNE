# Fase 1 — Identidade, conta e autenticação

**Estado em 02/10/2026:** planejada; o schema de identidade já foi entregue/homologado na fase zero. **Entrada:** aceite final da F0 após reboot/login da #43; decisões de identidade #38/#40 aprovadas. **Risco principal:** exposição de identidade e sessões. [Índice e gates comuns](../implementation-plan.md).

## Primeira fatia após o gate da fase zero

**F1-T1a — sessão SSR, login e logout com duas contas Auth sintéticas de teste**, sem abrir cadastro. Antes do ensaio, conferir ou preparar as identidades pelo procedimento protegido de homologação; as credenciais ficam somente no contexto de teste, sem senhas fixas no repositório. Reutilizar o schema, as RPCs, tipos e políticas entregues em #116–#119. Responsáveis: implementação no container isolado, revisão Sol/low e mantenedor nos gates protegidos. Escopo nas [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23), sem encerrar suas partes de cadastro, recuperação e manutenção ainda ausentes.

1. Fixar critérios e testes canônicos: visitante sem sessão, senha incorreta, login válido, recarga SSR, logout e duas sessões distintas; conta suspensa só vê motivo/suporte. Erro não cria sucesso local nem revela outra conta.
2. Implementar cliente Supabase por requisição e validação de identidade no servidor, usando a sessão do usuário e sem `service_role`. Cookies seguros, respostas privadas sem cache compartilhado e proteção CSRF no caminho mutante. Não substituir o mock inteiro de uma vez nem criar autorização nominal para teste.
3. Validar no dev com contas sintéticas existentes, testes REST negativos e navegador, revisão Sol/low e homologação no SHA da PR; produção continua em espera. Migração somente se os testes demonstrarem lacuna no contrato homologado.

Essa fatia antecipa somente a base de sessão/login/logout de F1-T3; o restante de F1-T3 continua após onboarding. Não depende de envio de código: o estado confirmado das contas sintéticas é preparado no ensaio protegido, nunca por um endpoint público de bypass ou exceção de autorização da aplicação. **F1-T2 depende da [#147](https://github.com/IgnisDevNE/CircuitoNE/issues/147)** para canal/provedor de confirmação do celular, limites/custo e prova de entrega restrita. SMTP2GO é e-mail. Configurar callbacks exatos somente quando houver handler revisado; allowlist permanece vazia até lá. Não liberar cadastro incompleto para contornar essa dependência.

## F1-T1 — Integrar o contrato de identidade existente

**Bloqueios por issue:** #31/#32 e decisões #38/#40 concluídas; região/destino/SMTP dev da #43 satisfeitos. Falta apenas reboot/login da #43 para o gate geral F0. A #147 bloqueia confirmação de celular/cadastro, não a fatia F1-T1a.

**Issues tratadas:** #14/#23 na sessão inicial e #19 nas fronteiras de entrada; demais critérios permanecem abertos.

**Dependência:** F0-T2/T4/T5 e gate F0. **Regras:** RN-01/03/04/31–34/36/37. Não recriar as migrações, grants/RLS e tipos da fase zero (#116–#119), já homologados em `CircuitoNE-dev` no SHA `1f0eed7`.

- Testar primeiro as fronteiras novas de servidor/UI; reutilizar os contratos SQL existentes de unicidade, idade, privacidade e concorrência. Mudança comprovadamente necessária no banco recebe teste SQL vermelho antes de migração nova.
- Entrega: mapear os tipos/RPCs existentes no runtime por identidade de requisição, sem senha duplicada no banco de aplicação, sessão global ou respostas privadas públicas. O cadastro transacional e recuperável entra em F1-T2.
- Aceite: identidade A não lê/muda B; erros não revelam dados de outro titular; CPF único não é verificação de identidade. Sessões e dados pessoais não aparecem em logs/artefatos de CI.
- Documentação: contrato de sessão/entrada, evidência de TDD e homologação na PR; atualizar dicionário/modelo somente se houver mudança real.

## F1-T2 — Cadastro, confirmação e onboarding recuperável

**Bloqueios por issue:** [#147](https://github.com/IgnisDevNE/CircuitoNE/issues/147) para confirmar celular e limitar envios. #38/#40 encerradas e SMTP dev da #43 comprovado; callback/allowlist de Auth será implementado e validado nesta jornada, não está pronto só porque o SMTP funciona. Herda o gate de F1-T1.

**Issues tratadas:** [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19)/[#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) na identidade/cadastro real; partes de coletivo e mensagens seguem abertas.

**Dependência:** F1-T1 e SMTP operacional. **Escopo:** substituir o cadastro/login demo por persistência real.

- Testar primeiro: e-mail/CPF/celular duplicados, senha inválida, celular ausente/não confirmado, código incorreto/expirado/reutilizado, reenvio limitado, falha após criação no Auth, retry e retorno a cadastro incompleto; escolha de WhatsApp igual ao celular, diferente sem número adicional e diferente com número válido/inválido; contato adicional não substitui confirmação do celular nem permite recuperação automática.
- Entrega: formulário com senha/confirmar, celular obrigatório confirmado por código (RN-32), escolha/contato privado de WhatsApp (RN-36), Auth e operação transacional dos dados de aplicação + primeira atuação mínima. Auth e Postgres não formam uma transação distribuída: registrar estado incompleto e retomar com idempotência, sem sucesso falso ou perfil público órfão. Canal/provedor de código e limites operacionais são pré-requisitos da #147 para este caminho.
- Aceite: recarregar mantém o progresso já persistido; telas explicam o estado real. Ramos que criam coletivo/solicitam entrada só ficam disponíveis após F3-T1/T3/T5; não simular conclusão desses ramos nesta fase.
- Documentação: sequência de cadastro, transições, expiração/limpeza de onboarding abandonado e responsabilidades de compensação.

## F1-T3 — Sessão SSR, login, logout e recuperação

**Bloqueios por issue:** SMTP dev da #43 satisfeito; callback/allowlist exige implementação e prova na #23. Cadastro das #14/#15 entregue em F1-T2 para recuperação/onboarding; sessão/login/logout iniciais antecipados em F1-T1a sem depender de cadastro novo. Não exigir encerramento de partes de outros domínios.

**Issues tratadas:** [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) na sessão, login/logout e recuperação; completar [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) com F1-T4.

**Dependência:** F1-T1 e runtime F0-T11/T12; F1-T2 apenas para recuperação/onboarding restante. A base de sessão/login/logout é antecipada em F1-T1a.

- Testar primeiro: login correto/incorreto, refresh concorrente, sessão expirada, link de recuperação inválido, redirect externo malicioso, CSRF, logout e duas contas em requisições/cache distintos.
- Entrega: integração oficial Supabase SSR, cliente por requisição, validação de identidade no servidor, callbacks restritos e jornadas de recuperação. Celular obrigatório/único/previamente confirmado segue RN-32; sem acesso aos contatos, o suporte aplica conferência documental privada conforme RN-33, sem transferir conta por CPF alegado. Não autorizar apenas com `getSession()` nem manter sessão global no Node.
- Aceite: recarga e navegação funcionam; resposta privada/`Set-Cookie` não é compartilhada em cache; conta suspensa só vê motivo e suporte, sem mensagens, coletivo ou diretório (RN-37). Definir e testar o efeito esperado de revogação de sessão, sem presumir invalidação imediata de todo JWT.
- Documentação: ciclo de sessão, URLs por ambiente, política de cookies/CSRF, limites de abuso e casos de falha.

## F1-T4 — Alterar dados e proteger operações sensíveis

**Bloqueios por issue:** decisões da #38 já aprovadas; [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) na parte de sessão/recuperação validada em F1-T3, sem exigir encerrar a manutenção de conta antes de iniciá-la.

**Issues tratadas:** [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) integralmente nos fluxos de conta; contribuir para [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) e para o ciclo de vida posterior.

**Dependência:** F1-T2/T3 e registro revisado de D-03 integrado pela #38; aprovação de produto não comprova implementação ou homologação.

- Testar primeiro: trocar e-mail pela tabela local não altera identidade; confirmação do novo e-mail/celular, reautenticação, senha anterior incorreta, acesso de outra conta, recusa de alteração direta de CPF e correção somente pelo suporte com conferência de documento; eliminar a cópia ao concluir a análise; após exclusão efetiva, novo cadastro com o mesmo CPF não recupera dados/permissões antigos.
- Testar RN-36 na edição: opção “mesmo número” acompanha a troca confirmada do celular; mudar para WhatsApp diferente não altera o celular verificado nem cria outro caminho de recuperação; número adicional permanece privado.
- Entrega: manutenção dos próprios dados, alteração de senha/e-mail via Auth, solicitação de correção de CPF à administração do site (RN-33) e desenho executável de suspensão/exclusão. RN-34 determina limpeza dos dados e permite novo cadastro; mensagens são preservadas sem identificar o remetente. A única exceção permanente aprovada é o nome creditado no lineup, sem vínculo/link (RN-25), sem preservar avatar ou redes. Compatibilizar backups, conteúdo pessoal dentro das mensagens, dados de coletivos e contas suspensas com #38/#40/#42/#43 antes dos caminhos afetados.
- Aceite: nenhum campo privado fica editável por mass assignment; invariantes sobrevivem a chamada REST direta. Retenção/exclusão não são decisões deixadas para o último deploy; execução completa do ciclo de vida é validada em F6-T2.
- Documentação: contrato de edição, suporte de recuperação, auditoria sem PII e efeitos sobre sessões.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-1.md`. Demonstrar com duas contas sintéticas: cadastro → confirmação → login/recarga → edição → recuperação → logout, incluindo falhas e REST negativo. Revisar especialmente acesso, criptografia, autenticação, logs, abuso e falha parcial.

Migrações reconstruídas em banco descartável e validadas em `CircuitoNE-dev` pelo GitHub no SHA final. Sem dados reais, sem credencial privilegiada no navegador e sem ramo de cadastro que anuncie persistência inexistente.
