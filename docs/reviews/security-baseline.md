# Revisão inicial de segurança e gate por fase

Referência: [OWASP Top 10:2025](https://top10.owasp.org/2025/), verificada em 21/09/2026. Esta é uma análise do protótipo e do plano, não um pentest ou certificação. Backend, Auth e RLS ainda não existem na aplicação; não podem ser declarados seguros por não haver falhas em um scan do frontend.

## Fronteiras e ameaças

Ativos: CPF/nascimento, identidade/sessão, contatos/presskit/cachê, conversas, propriedade/perfis de coletivos, arquivos e cadeia de entrega. Atacantes relevantes: anônimo, cadastrado, membro sem permissão, membro com permissão parcial, proprietário de outro coletivo, conta removida, conteúdo enviado por usuário e código de PR que tenta alterar o próprio oráculo. Os níveis N0/N1/N2 ainda existem no mock, mas foram substituídos como contrato pela [ADR 0008](../decisions/0008-collective-permission-profiles.md).

Fronteiras: navegador não confiável → Node/SSR e API/Auth/Storage → banco; PR não confiável → executor descartável → publicador confiável de resultado; conta implementadora → responsável humano. Testes negativos devem cruzar essas fronteiras diretamente, não apenas procurar menus escondidos.

## Matriz inicial

| Categoria 2025 | Situação e ameaça concreta | Evidência/aceite requerido | Fase |
|---|---|---|---|
| A01 — Controle de acesso | Mock não distingue visitante de membro; conversas globais; edição só protegida por UI. P1 antes de dados reais. | REST com anônimo, titular, terceiro, membro sem permissão, perfis com poderes parciais, proprietário de outro coletivo e removido; RLS/Storage, troca de IDs, perfis e revogação. Nenhum CPF/dado profissional fora do escopo. | 0, 1–5 |
| A02 — Configuração | Sem grants/RLS/SMTP de aplicação ainda. HTTP local é só preview. | Menor privilégio, schemas expostos explícitos, callbacks restritos, TLS em produção, headers/CSP compatíveis testados, nenhum segredo VITE_. | 0, 1, 6 |
| A03 — Cadeia de dependências | Auditoria inicial completa encontrou 9 vulnerabilidades, 6 altas; Vite/transitivas atualizados, nova auditoria limpa. | Lockfile, Node/pnpm fixados, imagens/Actions por digest/SHA, Dependabot e revisão de atualizações. Avaliar também imagem final antes de release. | 0 e todas |
| A04 — Criptografia | CPF/nascimento planejados privados; senha gerenciada por Auth. | TLS, secrets fora do repositório/logs, acesso mínimo a backups; decisão documentada sobre criptografia adicional de identidade e retenção. Não inventar criptografia própria. | 1, 6 |
| A05 — Injeção | O risco do renderizador Markdown do protótipo foi tratado na [PR #82](https://github.com/IgnisDevNE/CircuitoNE/pull/82), com saída React e política restrita; banco/API de produto ainda não existem. | Regressões SSR/navegador e QA canônico passaram para Markdown. Nas fases de dados reais: queries parametrizadas e RPC com validação e `search_path` fixo. | 0–5 |
| A06 — Desenho inseguro | Mock libera o antigo administrador N2 sem aprovação editorial; RN-30 exige aprovação do site antes de funções. CPF único não comprova identidade; a propriedade única/transferível ainda não existe. | Implementar RN-30 e #66, resolver D-03, testar transferência concorrente, abuso e cotas de mídia/mensagens. | 0, 1, 3, 5 |
| A07 — Autenticação | Login/cadastro/alteração de senha são mocks. | Confirmação, recuperação, sessão expirada/revogada, reautenticação, rate limit, respostas que não exponham dados de terceiros. MFA operacional. | 1, 6 |
| A08 — Integridade | App implementador separado por comando, mas QA/verificador e isolamento de credenciais ainda pendentes; mock aceita mutações locais. | QA sob autoridade separada, SHA de teste/candidato, verificador confiável, artefato homologado, idempotência e dados atômicos. | 0, 1–5 |
| A09 — Logs e alertas | Sem trilha real de operações sensíveis ou monitoramento. | Ator/ação/recurso/resultado/correlação para cargos e solicitações; falhas de Auth e abuso monitoradas; excluir CPF, tokens e corpo de mensagem dos logs. Ensaiar alerta. | 1, 3, 5, 6 |
| A10 — Condições excepcionais | Mock mascara timeout, falha parcial, indisponibilidade e conflito; UI mostra sucesso sem persistir. | Timeout/falha de rede, rollback parcial, retry idempotente, upload interrompido, indisponibilidade de Auth/banco, armazenamento cheio e recuperação. Negar acesso em falha. | 0–6 |

## Gates

P0/P1 impedem promoção para ambiente com dados reais. A classificação considera contexto: o protótipo local com seeds pode continuar sendo usado para desenho; ligar dados privados muda a exposição. Não dar aceite global enquanto identidade/testes/autorizações não estiverem implementados e demonstrados.

Esta preparação inclui testes HTTP, regressões de conteúdo malicioso em Markdown e proteção básica de entrega, mas não testa RLS (não há schema), não examina cada tela com ferramenta de acessibilidade e não executa DAST. A suíte de aceite separada está operacional; seu isolamento final de credenciais continua pendente na #31. Isso é registrado como trabalho restante, não como “sem achados”.

## Modelo do relatório por fase

Criar `docs/reviews/phase-N.md` com:

- Escopo, tarefas/RNs, SHA final, revisor independente e ambiente/URL.
- Review completo: jornadas/estados, arquitetura, esquema/RLS, acessibilidade, performance com volume representativo e operação afetada.
- Dez linhas OWASP: aplicável/não aplicável com razão, teste/evidência, achado, severidade, correção/risco residual, responsável e prazo.
- Falhas relevantes e correções revalidadas; migrations/checksums, resultado em homologação e recuperação.
- Resultado explícito: aprovado ou bloqueado; pendências e dependências que impedem a próxima fase/release.

Para tarefa, usar o template de PR e [critérios de entrega](../engineering/delivery.md). Autoavaliação do agente não substitui aprovação independente. Um scanner sem achados não aprova esta matriz sozinho.
