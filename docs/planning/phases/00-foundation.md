# Fase 0 — Preparar a base para desenvolver

**Estado:** em execução; fundação do PR #2 integrada e checkpoint de testes/toolchain preparado em 22/09/2026. A fase não está concluída; [evidências e bloqueios](../../reviews/phase-0.md). Esta fase reúne infraestrutura, testes, adaptação à stack e correções do protótipo necessárias antes das funcionalidades reais. [Índice e regras comuns](../implementation-plan.md).

**Entrada:** arquitetura aprovada; inventário de 27 rotas e [achados UI-01–18](../../reviews/prototype-audit.md). **Saída:** aplicação executável em React Router Framework/Node/Caddy, testes e homologação operacionais, contratos sob autoridade independente e nenhum P0/P1 aberto no caminho que receberá dados reais.

## Ordem de trabalho

Com F0-T1/T3 integradas, abrir primeiro F0-T14 (dependências) e F0-T15 (decisões/pré-requisitos), em paralelo ao trabalho independente de F0-T2 e F0-T6. Corrigir F0-T7–T10; migrar F0-T11/T12; concluir F0-T4/T5 e o review de fase. Estabilizar a toolchain de F0-T14 antes do aceite final dos testes/SSR. F0-T13 pode avançar quando houver cobertura real, mas a dependência externa do Codecov não bloqueia a fase. Dependências específicas abaixo prevalecem sobre essa sequência resumida.

Por orientação do responsável em 22/09/2026, abrir PR ao final da fase ou em checkpoints necessários, mantendo cada tarefa com review normal independente. PRs intermediários seguem a ordem das dependências para aprovação crescente. O planejamento atual não autoriza marcar a base como pronta nem começar regras reais sem o isolamento de F0-T2. Preparação com dados fictícios pode avançar nas partes independentes. A [auditoria atual do Supabase](../../reviews/supabase-environments-2026-09-22.md) distingue o que foi verificado das configurações ainda pendentes.

## F0-T1 — Consolidar GitHub, toolchain e CI

**Bloqueios por issue:** Nenhum novo; fundação integrada. Upgrades restantes pertencem a F0-T14.

**Issues tratadas:** Nenhuma pendência própria nova.

**Estado:** integrado pelo PR #2, com CI verde; isolamento forte e homologação integrada continuam nas tarefas seguintes. **Dependência:** nenhuma. **Risco:** médio, cadeia de entrega.

- Entrega: baseline, lockfile, versões Node/pnpm, `main` protegida, CODEOWNERS, App implementador e CI sem secrets para PRs.
- Verificação: instalação limpa, testes existentes, TypeScript, build, auditoria e container. Confirmar identidade do App e origem dos checks; não enfraquecer proteção para facilitar merge.
- Aceite: PR revisado independentemente; branch concluída limpa, `main` atualizada, próxima tarefa em branch nova. Arquivos locais de outros trabalhos ficam preservados.
- Documentação: guia de ambiente e evidências de fundação; registrar limitações reais de permissões do App.

## F0-T2 — Isolar contratos, testes e credenciais

**Bloqueios por issue:** Nenhum pré-requisito de issue para iniciar o isolamento.

**Issues tratadas:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); sua conclusão libera os trabalhos que exigem autoridade independente.

**Estado:** parcial; aceite canônico obrigatório e promoção pós-merge operacionais, isolamento forte pendente na #31. A retomada após aprovação dos testes ainda é manual ([#58](https://github.com/IgnisDevNE/CircuitoNE/issues/58)). **Dependência:** F0-T1. **Risco:** alto.

- Entrega: emissor da chave do App fora do implementador; ambiente sem credencial humana/admin, inclusive acessos temporários de manutenção de SSH/Codecov; QA canônico fora das instalações desse App; verificador com comando, dependências e identidade próprios.
- Testar primeiro: a identidade implementadora não escreve QA, não altera sua versão aprovada, settings/secrets, aprovações ou promoção. Usar recursos de teste controlados para provas negativas, sem mutações destrutivas em produção.
- Aceite: fixar SHA dos testes antes de implementar; verificador testa SHA/artefato final em ambiente descartável. PR que altera runner/comando/fixtures ou falsifica resultado não consegue substituir o aceite. Não executar código candidato junto da chave que atesta o resultado.
- Documentação: matriz de autoridades, ameaças, procedimento de mudança de teste, evidências de negação e recuperação/rotação de credenciais. O Codecov não é esse verificador.

**Execução escolhida em 22/09/2026:** concentrar integridade, aceite canônico e promoção da suíte no CI, sem VM local obrigatória ([spec](../../specs/canonical-ci-suite.md), [ADR 0006](../../decisions/0006-canonical-ci-suite.md)). Ordem: disponibilizar autoridade QA externa → fixar suíte/workflow → conectar integridade e execução ao PR → promover novos testes revisados após merge/validação → ensaiar concorrência e recuperação. Cada entrega tem pré-requisito e evidência na spec. A #31 acompanha o trabalho; não exigir seu fechamento para começar a própria correção. Configuração do recurso QA/origem confiável pelo mantenedor é pré-requisito da ativação externa, e os requisitos de credenciais não são dispensados pela decisão de usar CI.

## F0-T3 — Manter o preview do protótipo

**Bloqueios por issue:** Nenhum novo para manter o preview estático com dados fictícios.

**Issues tratadas:** Nenhuma pendência própria nova; a troca de runtime fica em F0-T12.

**Estado:** container estático validado no Windows; entrega provisória. **Dependência:** F0-T1. **Risco:** baixo.

- Aceite: home, bundle, link profundo, 404 de asset e bloqueio de caminhos internos; root filesystem protegido e execução sem privilégios. Preservar os demais containers do host.
- Documentação: URL/porta e comandos verificados. O preview atual só é substituído depois do aceite de F0-T12; não confundir preview com homologação integrada.

## F0-T4 — Preparar Supabase e migrações reproduzíveis

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes de operações com credenciais; [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) na parte de região/destino antes de conectar ambiente compartilhado.

**Manutenção pontual autorizada em 22/09/2026:** validar somente as credenciais dev por job manual em `main`, após review/merge e aprovação do environment, sem aplicação, migração ou dados reais. Essa verificação está preparada no PR #45 e delimitada na ADR 0003; não encerra #31 nem libera as demais operações bloqueadas. Registrar o resultado remoto em #32 antes de afirmar que token/senha funcionam.

**Issues tratadas:** [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32), preparação de migrações e banco descartável; a parte de promoção continua em F0-T5.

**Dependência:** F0-T2; pode ser preparada em banco descartável antes do runtime SSR. **Risco:** alto.

- Entrega: CLI fixado, configuração por ambiente, adaptador simples de `docs/migrations/` para a árvore de execução do CLI, tipos gerados e dados sintéticos determinísticos.
- Testar primeiro: ordem/checksum de migrações, reconstrução limpa, destino incorreto rejeitado e ausência de cópias editáveis concorrentes. Um `reset` de teste nunca alcança homologação compartilhada ou produção.
- Aceite: validar compatibilidade do Supabase local com Podman/WSL; se não for suportada no host, usar banco descartável em runner Linux isolado, documentando a alternativa. Nenhuma promessa de compatibilidade apenas por ambos usarem containers.
- Documentação: [convenção de migrações](../../migrations/README.md), ambiente, preparação de seeds e política de concorrência. Migração de ensaio fica no banco descartável; schema real entra nas fases de produto.

## F0-T5 — Homologar e promover pelo GitHub

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) na parte de migrações já validada por F0-T4; [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) na parte de destino/domínio de homologação. Registrar esse aceite parcial de [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32), sem exigir fechar a própria issue antes de implementar o pipeline.

**Issues tratadas:** [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32), homologação e promoção de teste.

**Dependência:** F0-T2/T4/T12. **Risco:** alto.

- Entrega: fluxo de homologação no `CircuitoNE-dev`, registro de SHA/checksum/artefato, smoke test e promoção protegida do artefato homologado. Workflows são preparados/aplicados pelo mantenedor, pois o App não tem permissão de escrita neles.
- Testar primeiro: projeto errado, migração concorrente, falha de smoke, artefato de outro SHA e falta de aprovação impedem promoção. Ensaio de promoção usa destino de teste, sem deploy de produção nesta fase.
- Aceite: secrets somente no contexto necessário; código de PR não roda no host pessoal/produção nem junto de credenciais privilegiadas. Rollback de container demonstrado; migrações têm recuperação própria.
- Documentação: sequência de release, responsáveis, logs/evidências, comportamento para PR só documental e plano de recuperação. CI verde não substitui homologação.

## F0-T6 — Caracterizar jornadas e instalar os testes de aplicação

**Bloqueios por issue:** Nenhum para caracterização com fixtures; [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes de aprovar contratos canônicos usados pelos implementadores.

**Issues tratadas:** [#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) na parte de relógio/seeds e isolamento de testes; complementar consultas reais nas fases de domínio.

**Dependência:** F0-T1; contratos protegidos em F0-T2 antes da implementação de regras. **Risco:** médio.

- Entrega: Vitest/React Testing Library e Playwright, versões compatíveis fixadas, scripts separados para unidade, integração, jornadas e cobertura. Reutilizar os testes `node:test` de infraestrutura.
- Cobrir: 27 rotas, voltar/avançar, parâmetros, links externos/modificadores, 404, troca de ID, teclado, quatro tipos de atuação e estados loading/erro/vazio.
- Aceite: relógio e seeds fixos, testes independentes de execução anterior, seletores por papel/rótulo. Caracterização já correta pode começar verde; bugs conhecidos ganham testes de resultado desejado que falham pelo motivo esperado.
- Documentação: mapa rota → jornada → teste; baseline das lacunas. Separar explicitamente testes de mock e testes que realmente exercitam autorização.

## F0-T7 — Corrigir renderização de Markdown e URLs

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes da implementação do contrato de segurança.

**Issues tratadas:** [#11](https://github.com/IgnisDevNE/CircuitoNE/issues/11) integralmente, incluindo renderização segura no servidor/navegador.

**Dependência:** F0-T2/T6. **Risco:** alto; UI-01.

- Testar primeiro: aspas, atributos/eventos, HTML, esquemas perigosos, links malformados e texto escapado, tanto no servidor quanto no navegador.
- Entrega: renderização segura com formatação necessária preservada. Preferir biblioteca mantida se o conjunto de recursos exigir parser/sanitização; não construir outro parser por substituições inseguras.
- Aceite: nenhum conteúdo de usuário cria código executável; prévia/editor e página pública têm a mesma política. Links externos recebem tratamento coerente.
- Documentação: formatos permitidos, exemplos de ataque bloqueados e tradeoffs registrados no PR/spec pertinente.

## F0-T8 — Separar validação, dinheiro e datas do JSX

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); integrar registros revisados de [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38) para idade/CPF/recuperação e de RN-36 na [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) para contato WhatsApp; [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41) para contrato temporal definitivo. Dinheiro e validações já decididas podem avançar independentemente.

**Issues tratadas:** [#17](https://github.com/IgnisDevNE/CircuitoNE/issues/17) e partes de [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18)/[#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19); manter aberto o que ainda depender de integração/validação definitiva no servidor.

**Dependência:** F0-T2/T6. **Risco:** alto no cadastro; UI-07/08/09.

- Testar primeiro: CPF normalizado e dígitos, nascimento inválido, CNPJ numérico/alfanumérico, URL/e-mail, valor `R$ 1.500,00` reformatado, centavos, fim anterior ao início e conversão de fuso. Máscara não equivale a validação.
- Entrega: funções pequenas e schemas Zod nas fronteiras. Extrair validação por etapa de `Register` e dados de evento, preservando os dois modos de cadastro/nova atuação; não reescrever o wizard inteiro.
- Aceite: testes por tipo de atuação e etapa, erros associados aos campos. Aplicar as decisões de RN-31–34: 18 anos completos, celular obrigatório/único/confirmado e CPF corrigido pelo suporte. Cadastro aceita todas as 27 UFs e gênero vazio ou “não informar” (RN-04); informa se o celular é WhatsApp e permite número adicional opcional se diferente (RN-36). Recuperação/exclusão reais permanecem na fase 1; fim/fuso definitivo continua pendente em #41.
- Documentação: contratos de entrada e decisões pendentes relacionadas. Adaptar apenas os consumidores alcançados pela mudança.

## F0-T9 — Conter o mock e corrigir escopos de interface

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes dos contratos de autorização; [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) na integração do registro revisado das invariantes aprovadas em 22/09/2026. Implementação e validação da autorização real permanecem nas fases correspondentes.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) na contenção do mock e troca de contexto. Autorização real e persistência não são encerradas por uma correção de UI.

**Dependência:** F0-T2/T6. **Risco:** alto; UI-02/03/04/12/18.

- Testar primeiro: visitante não vira N0; usuário/coletivo A não herda conversa ou formulário de B; troca de identidade limpa estado; datas de seed não variam com o relógio real.
- Entrega: separar fixtures e mutações de demonstração do futuro acesso a dados; reduzir o uso de estado global nas áreas já tocadas. Não introduzir repositório genérico ou nova biblioteca global de estado.
- Aceite: mock identificado, dados fictícios apenas, nenhuma sessão mutável compartilhada entre requisições SSR. Build integrado futuro rejeita login demo. A autorização definitiva fica no Supabase nas fases seguintes.
- Documentação: limites do mock e caminho de substituição por domínio, sem manter indefinidamente implementações duplicadas.

## F0-T10 — Corrigir estados e acessibilidade antes da integração

**Bloqueios por issue:** [#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) na parte de reinicialização de contexto exercitada em F0-T9; [#37](https://github.com/IgnisDevNE/CircuitoNE/issues/37) antes do aceite visual definitivo da combinação CSS.

**Issues tratadas:** [#27](https://github.com/IgnisDevNE/CircuitoNE/issues/27) e partes de [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) em estados/semântica; encerrar [#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) somente quando todos os consumidores estiverem cobertos.

**Dependência:** F0-T6/T9. **Risco:** médio; UI-12/17/18.

- Testar primeiro: troca de ID reinicializa estado correto, erro focável, submit pendente impede duplicata, botão/link sem aninhamento inválido e retorno de falha preserva dados digitados.
- Entrega: loading/erro/vazio/403/404/conflito coerentes nos componentes afetados, sem toast de persistência bem-sucedida quando não houve confirmação.
- Aceite: navegação por teclado, viewport de 390 px, zoom, movimento reduzido, rótulos e idioma; não remodelar todas as telas por preferência.
- Documentação: matriz de estados, evidências manuais e lacunas de UX que dependem de novos fluxos de produto.

## F0-T11 — Migrar para React Router Framework e SSR

**Bloqueios por issue:** [#11](https://github.com/IgnisDevNE/CircuitoNE/issues/11)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) antes de propagar renderização/estado ao SSR; [#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35)/[#36](https://github.com/IgnisDevNE/CircuitoNE/issues/36) na seleção e validação da toolchain atual. Registrar esse aceite parcial; a compatibilidade com SSR é demonstrada nesta tarefa, sem exigir sua própria conclusão antecipadamente.

**Issues tratadas:** [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26) e partes de [#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) em SSR, metadata de fixtures e estados HTTP; dados reais ficam nos domínios.

**Dependência:** F0-T6–T10. **Risco:** alto, transversal.

- Testar primeiro: conteúdo público/metadados no HTML sem JavaScript, 404 HTTP, links profundos, navegação/histórico e renderização sem `window`/`document` disponíveis no servidor.
- Entrega: entrada/configuração do framework, rotas/layouts, loaders/actions e limites servidor/cliente; preservar componentes de tela e URLs existentes. A configuração Vite simplificada do protótipo será substituída conforme a migração exigir.
- Aceite: páginas públicas SSR ainda com fixtures, hidratação sem divergência, dois contextos sem vazamento e ausência de segredos no bundle. Migração incremental por grupo de rotas; remover roteador antigo somente quando os consumidores tiverem migrado.
- Documentação: mapa antigo → novo, composição de módulos, política de cache e configuração de build. Metadados reais serão integrados nas fases 2–4.

## F0-T12 — Executar Node e Caddy em containers

**Bloqueios por issue:** [#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35) para linha Node coerente; [#11](https://github.com/IgnisDevNE/CircuitoNE/issues/11) antes de servir conteúdo renderizado no servidor; bloqueios de F0-T11 propagam-se.

**Issues tratadas:** Evidência de runtime contribui para [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32); a issue só encerra após homologação integrada.

**Dependência:** F0-T11; F0-T3 é a referência do preview anterior. **Risco:** médio.

- Testar primeiro: rota pública SSR, assets, erro/404, configuração obrigatória ausente, saúde, reinício e encerramento de requisições em andamento.
- Entrega: imagens/runtime Node e proxy Caddy, rede/portas mínimas, filesystem protegido, usuário sem privilégios e limites de recursos compatíveis com SSR medidos em homologação.
- Aceite: construir do zero, rodar no Podman local e no CI, manter uploads fora do container. Validar restauração do preview anterior antes de trocar a URL usada pelo responsável.
- Documentação: comandos atuais, variáveis públicas versus segredos, health checks e rollback. O guia estático passa a ser histórico quando a migração for entregue.

## F0-T13 — Cobertura local e integração Codecov

**Bloqueios por issue:** Nenhum para manter o upload Cloud já implantado. A migração de volta ao Codecov próprio exige verificar [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29) e isolar credenciais conforme [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31). Ver [ADR 0007](../../decisions/0007-codecov-self-hosted-target.md); o workflow vigente continua descrito na [ADR 0004](../../decisions/0004-codecov-cloud.md).

**Issues tratadas:** [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) e colaboração operacional em [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29); não fechar upload sem relatório real.

**Estado:** cobertura e artefatos entregues pelo PR #45; upload Cloud de PR interno e baseline `main` confirmados após #47. O responsável escolheu retornar à instância própria, cuja configuração de servidor e upload real permanecem em #29/#30. A [ampliação de cobertura](../../reviews/coverage-backlog-2026-09-22.md) registra testes de interação e correções do roteador; não satisfaz aceite canônico. **Dependência:** F0-T6 para gerar LCOV. **Risco:** médio.

- Entrega: relatório LCOV/HTML reproduzível, conjunto de arquivos incluídos explícito, baseline aprovado e política de cobertura de código alterado. Não impor porcentagem arbitrária nem excluir caminhos para esconder ausência de testes.
- Testar primeiro: código não executado aparece descoberto e arquivo novo entra no relatório; uma regressão controlada na regra exercitada faz o teste falhar mesmo se a cobertura continuar igual. Falha de teste impede tratar relatório como evidência aprovada; cobertura de linhas não prova qualidade do oráculo.
- Aceite externo: manter evidência Cloud existente; antes de trocar o destino, verificar a instância própria com upload real associado ao repo/commit/branch corretos. O publicador permanece separado, sem executar o app nem consumir screenshots. Escolher autenticação compatível com o servidor sem entregar credenciais a PRs; Dependabot/forks exigem evidência própria. Pendências em #29/#30, responsável implementação/mantenedor, destino F0-T13.
- Se o upload falhar: preservar cobertura como artefato do CI, registrar pendência e continuar. Só tornar check remoto obrigatório depois de validar o caminho completo; não remover os gates locais de teste/review.
- Documentação: [diagnóstico Codecov](../../reviews/codecov-diagnosis.md), exclusões justificadas, baseline e instrução de upload. Não usar o mesmo agente/verificador para escrever testes canônicos e atestar sua imutabilidade.

## F0-T14 — Resolver upgrades e estabilizar a toolchain

**Bloqueios por issue:** Nenhum para iniciar revisão/correção de dependências em CI sem secrets. Escrita de workflows requer atuação do mantenedor, registrada em [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34). Para publicar o CI do PR #45, ele autorizou explicitamente sua credencial em 22/09/2026; as proteções de revisão permanecem.

**Issues tratadas:** [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34)/[#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35)/[#36](https://github.com/IgnisDevNE/CircuitoNE/issues/36)/[#37](https://github.com/IgnisDevNE/CircuitoNE/issues/37); cada incremento tem seu próprio review e evidência.

**Dependência:** F0-T1. **Risco:** médio/alto; [revisão dos oito PRs](../../reviews/dependabot-2026-09-22.md). Executar em incrementos revisáveis, sem misturar a migração do compilador com a do framework.

- Prioridade imediata: revisar/integrar Actions e Caddy elegíveis (#4/#5/#6), mantendo o CI no SHA atualizado. Substituir o candidato antigo de pnpm/action-setup por versão mantida com runtime Node 24; não mudar pnpm 10.34.3 incidentalmente. Workflows são aplicados pelo mantenedor.
- Node: resolver a divergência do PR #7. Avaliar Node 24 LTS; manter a linha 22 até validar a mudança. Alinhar engines, mise, tipos, CI e imagens por digest; Node 26 Current não entra apenas por ser mais novo.
- TypeScript: reproduzir TS5102 do PR #8, adaptar configuração/aliases e verificar compilador/editor/tooling nas plataformas usadas. Não enfraquecer typecheck; conferir compatibilidade com React Router Framework ao executar F0-T11.
- Tailwind: atualizar core/plugin juntos, revisar transitivas, instalação limpa e aparência em páginas públicas, cadastro e dashboard, desktop/mobile. Agrupar futuras atualizações compatíveis de Tailwind no Dependabot; manter majors sob revisão própria.
- Aceite: testes existentes, typecheck, build, auditoria e container passam na combinação final; registrar evidência visual do CSS. Toda falha encontrada ganha teste de regressão antes da correção. Atualização sem novo comportamento usa os testes existentes; não fabricar vermelho. Resolver destino dos PRs substituídos sem declarar uma versão aprovada só pelo número ou pelo CI.
- Documentação: versões escolhidas, motivo, SHAs dos PRs, resultados, limites e rollback. Revisão humana continua obrigatória.

## F0-T15 — Antecipar decisões e pré-requisitos que bloqueiam produto

**Bloqueios por issue:** Nenhum para preparar decisões; [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes da preparação que use credenciais de ambiente.

**Issues tratadas:** [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38)/[#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39)/[#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40)/[#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41)/[#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42)/[#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43); decisão só encerra após aprovação, pré-requisito operacional após verificação.

**Dependência:** regras/propostas já inventariadas; decisões de produto podem avançar sem código. **Responsáveis:** produto e mantenedor. A preparação com credenciais depende do isolamento de F0-T2.

- Resolver na fase zero: idade/CPF/recuperação/retenção, arquivos e dados sociais, verificação/suspensão e invariantes de coletivos, tempo/publicação/agenda de eventos, iniciação/moderação de mensagens. Propostas continuam propostas até aprovação; não inventar resposta para encerrar issue.
- Preparar: decisão de região/destinos, SMTP de homologação e callbacks, domínio/DNS/TLS planejados, capacidade e responsabilidades, RPO/RTO e escopo de backup. A preparação não autoriza migrar produção nem enviar mensagens a usuários reais.
- Aceite: cada decisão tem responsável, registro aprovado e exemplos de aceite/negação nos contratos afetados; SMTP é validado com destino de teste controlado. Marcar evidências por pré-requisito e remover apenas o bloqueio correspondente.
- Documentação: atualizar regras canônicas, ambiente/spec pertinente e issues; implementação persistente, deploy final e ensaio completo de restauração continuam nas fases correspondentes. Sem testes artificiais para decisões documentais.

## Meta de redução do backlog na fase zero

| Grupo | Meta na fase 0 | Condição para permanecer aberto |
|---|---|---|
| Defeitos autônomos de Markdown, dinheiro, estado de rota e semântica (#11/#17/#22/#27) | Corrigir e encerrar com evidência de todos os critérios aplicáveis ao protótipo | Critério ainda não demonstrado, explicitamente atribuído a uma tarefa; não fechar só porque o exemplo deixou de falhar |
| Dependências (#34–#37), decisões e pré-requisitos (#38–#43) | Resolver antes de estabilizar a base e antes das tarefas dependentes | Incompatibilidade externa demonstrada ou decisão humana pendente, com responsável e impacto exato |
| Infraestrutura (#29–#32) | Manter a cobertura Cloud vigente até verificar e migrar para a instância própria; concluir isolamento e homologação | #29 requer verificar o acesso corrigido; #30, configurar o servidor e comprovar upload no destino próprio. #31/#32 bloqueiam integração real e saída correspondente da fase |
| Achados que incluem persistência/autorizações e funcionalidades ainda inexistentes | Antecipar na F0 validação, testes, contenção do mock, estados de falha e correções independentes | Manter a issue aberta até o aceite integral nas fases 1–5; não inventar backend provisório ou mover todo o produto para F0 só para zerar a lista |
| SEO e qualidade integrada (#26/#28 e validação final) | Corrigir metadados estáticos, SSR com fixtures, determinismo e estados já testáveis | Consultas/paginação/dados reais e validação do produto final permanecem nas tarefas de domínio e F6-T3 |

O relatório de saída deve listar **cada issue ainda aberta**, o que já foi resolvido, motivo concreto do restante, tarefa de destino e efeito no gate. Ausência de issue nova não prova ausência de dívida; uma issue parcialmente atendida não é encerrada como resolvida.

## Escopo da limpeza e evidências

Memtrace consultado em 22/09/2026: `Register` tem complexidade 79 e depende de validação, store, formulário e roteador. `RouterProvider` acessa `window` na inicialização e participa da composição de `App`; a migração exige revisar seus consumidores. O grafo classificou o impacto de ambos como crítico; essas contagens são transitivas e incluem relações de tipos/campos, não quantidade garantida de telas quebradas.

Não há evidência para uma reescrita geral. Corrigir Markdown e contratos antes de refatorações cosméticas; cadastro é extraído por etapa/caso de uso. As consultas por branch mostraram cobertura desigual entre baseline e mudanças; a busca de código morto de alta confiança na branch não trouxe candidatos suficientes para justificar exclusões. O histórico disponível é curto e inclui ingestão/saves, portanto não sustenta estimativa de churn de produção. Cortex ficou indisponível; decisões explícitas e a spec aprovada continuam sendo a referência. Revalidar impacto antes de cada edição.

Arquivos locais não versionados, inclusive ferramentas de QA já presentes, não pertencem automaticamente à limpeza. Sua adoção exige revisão separada.

## Revisão de saída

Review completo de rotas/componentes, contratos, runtime, cadeia de entrega e preparação Supabase, mais as dez categorias OWASP em `docs/reviews/phase-0.md`. Demonstrar especialmente XSS, isolamento SSR, ausência de segredos, destino de migração e autoridade do aceite. Revisão normal ocorre em cada tarefa; este review não a substitui.

Pendências de Codecov podem permanecer com relatório local disponível. Falhas de isolamento de credenciais/QA, homologação ou P0/P1 impedem declarar a fase concluída para iniciar integração real.
