# Cobertura e manutenção do backlog — 22/09/2026

Base: `f1359f7`, após merge do PR #49. Escopo F0-T6/F0-T13/F0-T14: testes com fixtures, defeitos de navegação e atualização de evidências. Não há migração, deploy, mudança de política de negócio ou implementação de Auth. A fase zero permanece parcial.

## Evidência já integrada

- [CI de main 35719742116](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35719742116) e [CodeQL 35719742121](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35719742121) passaram no SHA base. Quality inclui tipos/build, auditoria, Playwright, container e cobertura; database reconstrói o banco descartável.
- [Codecov Cloud](https://app.codecov.io/gh/IgnisDevNE/CircuitoNE): PR #47 processado no merge sintético `fe110c5`; baseline main `7c07a61` confirmado. O painel mostra 35 linhas cobertas e 10 parciais de 1141 (3,06% na visão geral). Esse cálculo não é o percentual de linhas do Vitest; comparar cada ferramenta consigo mesma.
- [Execução protegida 35716720248](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35716720248): token e senha dev aceitos, TLS verificado e leitura, com aprovação de magalz. Não comprova schema, RLS de negócio, login real ou homologação da aplicação.

## Cobertura e correções deste incremento

| Métrica Vitest/V8 | Base: 4 testes | Incremento: 32 testes |
|---|---:|---:|
| Linhas | 4,58% (45/981) | 42,06% (416/989) |
| Statements | 4,33% (53/1224) | 38,19% (471/1233) |
| Branches | 2,99% (26/868) | 31,81% (280/880) |
| Funções | 2,92% (14/479) | 35,69% (171/479) |

Todos os arquivos TS/TSX de `src` continuam incluídos; somente declarações `.d.ts` ficam excluídas, como antes. Não foram reduzidos denominadores por configuração, adicionados snapshots vazios ou definidos limites arbitrários. O percentual ainda não indica prontidão do produto: operações de escrita, erros de rede e autorização real seguem descobertos.

Quinze testes de regressão falharam antes da correção da [issue #50](https://github.com/IgnisDevNE/CircuitoNE/issues/50): links externos/mailto, target, download, fragmentos e cliques modificados eram interceptados; callbacks/cancelamento não eram respeitados; query contaminava parâmetros e escape inválido derrubava a página. O roteador agora deixa navegação nativa com o navegador, usa pathname após History API e trata decodificação inválida como rota não encontrada. Links internos e replace continuam funcionando. Não foi criado novo roteador; sua substituição continua em F0-T11.

A revisão apontou `NavLink` comparando pathname com destino bruto. Outro teste RED/GREEN agora cobre link ativo com query, URL absoluta interna e origem externa; a comparação foi normalizada. Playwright distingue o HTTP 404 que o preview já devolve para escape inválido da entrada desse pathname pelo histórico, que também precisa exibir 404 sem derrubar React.

Doze testes de caracterização passaram inicialmente, sem alterar o comportamento observado: busca por nome/bio, combinação de estilo e estado vazio; ordenação/filtro de eventos; ausência de eventos; quatro estados de 404; navegação/saída da sessão demo; campos das quatro atuações sem submeter cadastro. O relógio é fixado **antes** de importar as fixtures e por caso; cada render recebe providers novos. Nenhum mock de autorização é apresentado como segurança validada.

Verificação local: `pnpm check`, cobertura e tipos. Os 62 testes Playwright passaram: regressão de URI inválida e filtro composto em desktop/mobile, além das 58 verificações existentes. Resultados finais, SHA, CI e reviews Sol/low ficam no PR para não alterar o commit após registrar a execução.

## Estado das issues e pré-requisitos

| Issue | Resolvido / evidência | Restante, responsável e entrada |
|---|---|---|
| #50 | Correção de navegação e testes RED/GREEN neste incremento | Revisão/CI e merge desta PR; implementação F0-T6, sem bloqueio de entrada |
| #28 | Relógio/isolamento nos testes, filtros/vazio/404 e quatro atuações caracterizados | Fixtures do produto, troca de contexto, consultas, paginação e estados remotos; implementação F0-T6/T9/T11 e domínios. #31 antes de contratos canônicos; estes testes não encerram a issue |
| #30 | PR interno e main publicados no Cloud | Próximo PR real do Dependabot e reavaliação de forks/bug upstream #1972; mantenedor/implementação F0-T13. Sem secret estático; indisponibilidade não bloqueia cobertura local |
| #29 | Cloud funciona por destino diferente | OAuth 403 da instância própria não corrigido; mantenedor, retomada condicional. Não bloqueia este projeto no Cloud |
| #35 | Node 22.23.2 alinhado e validado pelo PR #45; PR #7 isolada rejeitada | Seleção coordenada de LTS em F0-T14 antes de SSR; implementação/mantenedor. SSR completa o aceite em F0-T11/T12 |
| #36 | TS 7.0.2 adaptado sem relaxar strict, aliases/build/testes Windows e CI Linux; #8 substituída | Editor/consumidores da API e geração de tipos SSR; implementação F0-T14/F0-T11. Não exigir encerramento antes da própria validação SSR |
| #37 | Tailwind/plugin 4.3.3, lockfile, CI, grupo Dependabot e regressão de CSS; #9/#10 substituídas | Inspeção visual completa com foco/formulários/estados em desktop/mobile; implementação/revisor F0-T14 antes do aceite visual F0-T10 |
| #31 | Separação de identidade e proteções existentes | Emissor, ambiente e verificador/QA externos; mantenedor F0-T2. Bloqueia contratos canônicos, correção do contrato Markdown e integração real; não bloqueia caracterização com fixtures |
| #32/#43 | Banco descartável e credenciais dev verificados; destinos documentados | Isolamento #31, decisões de região/SMTP/domínios, schema/seeds e runtime antes de homologação integrada; mantenedor/produto F0-T15, implementação F0-T4/T5/T12 |

#11–#27 continuam nos destinos individuais do plano, com seus bloqueios. Corrigir o roteador não resolve Markdown, dinheiro, identidade/contexto, semântica geral nem funcionalidades inexistentes. Nenhuma issue parcialmente atendida é encerrada só por CI verde. Nenhuma nova regra de negócio foi decidida.
