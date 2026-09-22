# Evidências da preparação

Data de referência: 21/09/2026, America/Fortaleza. Base importada: `3d860df`. Branch: `codex/project-foundation`. Relatório de autoavaliação; aprovação independente e homologação integrada continuam pendentes.

## Feito e verificado localmente

| Verificação | Resultado |
|---|---|
| Baseline e ferramentas | Repositório remoto existente conectado; baseline em main; branch nova. Node 22.23.2 e pnpm 10.34.3 usados em validação. |
| TDD de proteção de arquivos | Dois testes inicialmente falharam pela ausência de exclusões de memória/credenciais locais e por `.env.example` estar ignorado. Após ajuste de `.gitignore`, 2/2 passam. |
| TDD de hospedagem | Caddy padrão servindo o build: 1 passou / 1 falhou porque rota profunda retornava 404. Após configuração SPA: 2/2 passam; home, deep link, bundle, caminhos internos e asset ausente verificados. Falha inicial de conexão ao localhost não foi contada como evidência TDD. |
| `pnpm check` com Node 22 | Testes, TypeScript estrito e build passaram. Nenhuma fonte de tela foi alterada nesta preparação. |
| Auditoria de dependências | Auditoria completa inicial: 9 achados (6 altos/3 moderados). Vite 8.0.5 → 8.3.0 e transitivas atualizados; `pnpm audit --audit-level=high`: nenhuma vulnerabilidade conhecida. |
| Container | Podman 6.0.2, imagem construída em dois estágios, Caddy UID 1000, raiz read-only, capabilities removidas, no-new-privileges, limite de memória/CPU; estado healthy. |
| Acesso local | `http://172.23.250.196:5178`, via IP da VM WSL; localhost não encaminhava. Nenhuma alteração global da rede/VM. |
| Navegador | Perfil `/artistas/art-anerie` abriu diretamente no container; home/login/painéis/formulário amostrados anteriormente no build local. Limites da revisão em `prototype-audit.md`. |
| Supabase | Projetos identificados; somente homologação teve schema/migrations consultados, ambos vazios. Nenhuma migração, chave ou dado de produção alterado. |
| Documentação | 30 regras registradas, modelo de dados/RLS/Auth proposto, 8 fases com tarefas/aceites, revisões por tarefa/fase, isolamento e operação. RN-30 veio da decisão do responsável nesta revisão. |

O build emite aviso de compatibilidade futura do carregador da configuração Vite (`__dirname` e atributo de importação JSON); não é erro atual. Corrigir junto à revisão da configuração na fase 1, sem ocultar o aviso.

## GitHub

- Baseline enviado ao repositório indicado; configurações para squash e exclusão de branch após merge, alertas de dependências e atualizações automáticas habilitados.
- CI executado com sucesso no commit `8d24835`: testes, typecheck, build, auditoria completa, build do container e testes HTTP; sem secrets e sem deploy. [Execução 35681269767](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35681269767). Resultados de revisões posteriores ficam no [PR #2](https://github.com/IgnisDevNE/CircuitoNE/pull/2), que substituiu o PR #1 no bootstrap do App.
- Proteção aplicada e confirmada pela API: `quality` da App GitHub Actions (ID 15368), base atualizada, uma aprovação, CODEOWNERS, descartar aprovações antigas, revisão do último push, resolver conversas, sem force push/exclusão, aplicada também a administradores. Os testes de negação com identidade implementadora ainda dependem da instalação do App.
- Ambientes Homologação e Producao configurados com revisão de `magalz` e prevenção de autoaprovação. Produção aceita branches protegidas. Somente variável não secreta de project ref adicionada.

O PR é um rascunho de preparação, não uma liberação. O PR #1 foi aberto com `magalz`; em 22/09/2026 foi substituído pelo PR #2, de autoria do App e com último push do bot, permitindo revisão por `magalz`. Nenhuma exigência de revisão foi removida. CODEOWNERS precisa entrar na base para ser aplicado a PRs seguintes.

Foi tentada revisão Memtrace do PR com grafo local em modo estrito e sem publicação de comentários. A ferramenta não obteve token da instalação do GitHub App (404); a revisão não executou e não produziu contagem válida de achados. Para usar essa revisão, instalar/habilitar Memtrace Code Reviewer neste repositório. Essa integração é opcional; não substitui o revisor humano nem o GitHub App implementador escolhido pelo responsável. Configurações e documentos foram inspecionados localmente, e links internos verificados.

## O que ainda impede o início de implementação autônoma/produção

1. O App foi conectado em 22/09/2026; resta retirar a chave ampla e as credenciais humanas do ambiente implementador e demonstrar todas as permissões negativas. Ver atualização abaixo.
2. Fixar aceite fora da autoridade implementadora e conectar verificador confiável. Os testes locais atuais podem ser editados pela sessão; não existe isolamento forte ainda.
3. Configurar CLI/migrações e secrets de homologação, executar fluxo no CircuitoNE-dev pelo GitHub e registrar evidências. O preview Podman não cumpre sozinho essa exigência.
4. Review independente do plano/PR e decisões de produto restantes (idade, recuperação do CPF, critérios de verificação, entre outras no registro de regras).
5. Implementar backend/jornadas e concluir gates por fase. Sem dados reais no protótipo atual.

Foram preservados os demais containers do host e arquivos locais preexistentes fora da entrega. Containers temporários desta verificação ficaram parados; a remoção foi bloqueada pela revisão automática de aprovação. Não foram feitas tentativas de contornar esse bloqueio.

## Atualização — GitHub App, 22/09/2026

- App `ignisdevne` (5028495), instalação 163660443, bot `ignisdevne[bot]` (332310975). O responsável confirmou instalação em todos os repositórios da organização para reutilização do bot.
- Commit `9f43904` e push feitos pelo bot; CI passou sob o ator `ignisdevne[bot]` ([execução 35682392594](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35682392594)). O PR #2 foi confirmado pela API como autoria `app/ignisdevne`, em rascunho e exigindo revisão.
- Helper local emite token temporário limitado a CircuitoNE. API `/installation/repositories`: exatamente 1 repositório, `IgnisDevNE/CircuitoNE`. Não usa OAuth pessoal, não grava tokens nem modifica o login global.
- Permissões verificadas: contents/pull_requests/issues write; actions/checks/statuses/metadata read. Consultas de proteção de branch e secrets retornaram 403 com o App. Isso documenta negação de leitura privilegiada; nenhuma mutação sensível foi usada como teste.
- TDD: exclusão de `secrets/` demonstrou falha antes da regra e passou depois; nenhum segredo estava versionado. Testes do helper falharam com emissão não implementada e passaram após implementação, verificando assinatura RSA, validade temporal, escopo único, permissões e tratamento de 401 sem revelar resposta. Não usam chaves reais no CI.
- QA proposto foi deslocado para outra conta/organização sem o App, pois qualquer repositório da IgnisDevNE estaria ao alcance da chave dele.
- Limite remanescente: a chave privada e ferramentas com acesso humano continuam na máquina. O helper demonstra identidade e escopo do comando, não um isolamento de sistema operacional. Emissor separado e aceite independente continuam necessários.
