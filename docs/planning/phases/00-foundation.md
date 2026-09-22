# Fase 0 — Preparar a base para desenvolver

**Estado:** planejada; preparação parcial integrada pelo PR #2 em 22/09/2026. Esta fase reúne infraestrutura, testes, adaptação à stack e correções do protótipo necessárias antes das funcionalidades reais. [Índice e regras comuns](../implementation-plan.md).

**Entrada:** arquitetura aprovada; inventário de 27 rotas e [achados UI-01–18](../../reviews/prototype-audit.md). **Saída:** aplicação executável em React Router Framework/Node/Caddy, testes e homologação operacionais, contratos sob autoridade independente e nenhum P0/P1 aberto no caminho que receberá dados reais.

## Ordem de trabalho

Com F0-T1/T3 integradas, preparar F0-T2 e F0-T6; corrigir F0-T7–T10; migrar F0-T11/T12; concluir F0-T4/T5 e o review de fase. F0-T13 pode avançar quando houver cobertura real, mas a dependência externa do Codecov não bloqueia a fase. Dependências específicas abaixo prevalecem sobre essa sequência resumida.

Uma tarefa corresponde a um PR revisável; dividir em subtarefas com sufixos se a revisão exigir. O planejamento atual não autoriza marcar a base como pronta nem começar regras reais sem o isolamento de F0-T2. Preparação com dados fictícios pode avançar nas partes independentes.

## F0-T1 — Consolidar GitHub, toolchain e CI

**Estado:** integrado pelo PR #2, com CI verde; isolamento forte e homologação integrada continuam nas tarefas seguintes. **Dependência:** nenhuma. **Risco:** médio, cadeia de entrega.

- Entrega: baseline, lockfile, versões Node/pnpm, `main` protegida, CODEOWNERS, App implementador e CI sem secrets para PRs.
- Verificação: instalação limpa, testes existentes, TypeScript, build, auditoria e container. Confirmar identidade do App e origem dos checks; não enfraquecer proteção para facilitar merge.
- Aceite: PR revisado independentemente; branch concluída limpa, `main` atualizada, próxima tarefa em branch nova. Arquivos locais de outros trabalhos ficam preservados.
- Documentação: guia de ambiente e evidências de fundação; registrar limitações reais de permissões do App.

## F0-T2 — Isolar contratos, testes e credenciais

**Estado:** parcial; App conectado, isolamento forte pendente. **Dependência:** F0-T1. **Risco:** alto.

- Entrega: emissor da chave do App fora do implementador; ambiente sem credencial humana/admin, inclusive acessos temporários de manutenção de SSH/Codecov; QA canônico fora das instalações desse App; verificador com comando, dependências e identidade próprios.
- Testar primeiro: a identidade implementadora não escreve QA, não altera sua versão aprovada, settings/secrets, aprovações ou promoção. Usar recursos de teste controlados para provas negativas, sem mutações destrutivas em produção.
- Aceite: fixar SHA dos testes antes de implementar; verificador testa SHA/artefato final em ambiente descartável. PR que altera runner/comando/fixtures ou falsifica resultado não consegue substituir o aceite. Não executar código candidato junto da chave que atesta o resultado.
- Documentação: matriz de autoridades, ameaças, procedimento de mudança de teste, evidências de negação e recuperação/rotação de credenciais. O Codecov não é esse verificador.

## F0-T3 — Manter o preview do protótipo

**Estado:** container estático validado no Windows; entrega provisória. **Dependência:** F0-T1. **Risco:** baixo.

- Aceite: home, bundle, link profundo, 404 de asset e bloqueio de caminhos internos; root filesystem protegido e execução sem privilégios. Preservar os demais containers do host.
- Documentação: URL/porta e comandos verificados. O preview atual só é substituído depois do aceite de F0-T12; não confundir preview com homologação integrada.

## F0-T4 — Preparar Supabase e migrações reproduzíveis

**Dependência:** F0-T2; pode ser preparada em banco descartável antes do runtime SSR. **Risco:** alto.

- Entrega: CLI fixado, configuração por ambiente, adaptador simples de `docs/migrations/` para a árvore de execução do CLI, tipos gerados e dados sintéticos determinísticos.
- Testar primeiro: ordem/checksum de migrações, reconstrução limpa, destino incorreto rejeitado e ausência de cópias editáveis concorrentes. Um `reset` de teste nunca alcança homologação compartilhada ou produção.
- Aceite: validar compatibilidade do Supabase local com Podman/WSL; se não for suportada no host, usar banco descartável em runner Linux isolado, documentando a alternativa. Nenhuma promessa de compatibilidade apenas por ambos usarem containers.
- Documentação: [convenção de migrações](../../migrations/README.md), ambiente, preparação de seeds e política de concorrência. Migração de ensaio fica no banco descartável; schema real entra nas fases de produto.

## F0-T5 — Homologar e promover pelo GitHub

**Dependência:** F0-T2/T4/T12. **Risco:** alto.

- Entrega: fluxo de homologação no `CircuitoNE-dev`, registro de SHA/checksum/artefato, smoke test e promoção protegida do artefato homologado. Workflows são preparados/aplicados pelo mantenedor, pois o App não tem permissão de escrita neles.
- Testar primeiro: projeto errado, migração concorrente, falha de smoke, artefato de outro SHA e falta de aprovação impedem promoção. Ensaio de promoção usa destino de teste, sem deploy de produção nesta fase.
- Aceite: secrets somente no contexto necessário; código de PR não roda no host pessoal/produção nem junto de credenciais privilegiadas. Rollback de container demonstrado; migrações têm recuperação própria.
- Documentação: sequência de release, responsáveis, logs/evidências, comportamento para PR só documental e plano de recuperação. CI verde não substitui homologação.

## F0-T6 — Caracterizar jornadas e instalar os testes de aplicação

**Dependência:** F0-T1; contratos protegidos em F0-T2 antes da implementação de regras. **Risco:** médio.

- Entrega: Vitest/React Testing Library e Playwright, versões compatíveis fixadas, scripts separados para unidade, integração, jornadas e cobertura. Reutilizar os testes `node:test` de infraestrutura.
- Cobrir: 27 rotas, voltar/avançar, parâmetros, links externos/modificadores, 404, troca de ID, teclado, quatro tipos de atuação e estados loading/erro/vazio.
- Aceite: relógio e seeds fixos, testes independentes de execução anterior, seletores por papel/rótulo. Caracterização já correta pode começar verde; bugs conhecidos ganham testes de resultado desejado que falham pelo motivo esperado.
- Documentação: mapa rota → jornada → teste; baseline das lacunas. Separar explicitamente testes de mock e testes que realmente exercitam autorização.

## F0-T7 — Corrigir renderização de Markdown e URLs

**Dependência:** F0-T2/T6. **Risco:** alto; UI-01.

- Testar primeiro: aspas, atributos/eventos, HTML, esquemas perigosos, links malformados e texto escapado, tanto no servidor quanto no navegador.
- Entrega: renderização segura com formatação necessária preservada. Preferir biblioteca mantida se o conjunto de recursos exigir parser/sanitização; não construir outro parser por substituições inseguras.
- Aceite: nenhum conteúdo de usuário cria código executável; prévia/editor e página pública têm a mesma política. Links externos recebem tratamento coerente.
- Documentação: formatos permitidos, exemplos de ataque bloqueados e tradeoffs registrados no PR/spec pertinente.

## F0-T8 — Separar validação, dinheiro e datas do JSX

**Dependência:** F0-T2/T6. **Risco:** alto no cadastro; UI-07/08/09.

- Testar primeiro: CPF normalizado e dígitos, nascimento inválido, CNPJ numérico/alfanumérico, URL/e-mail, valor `R$ 1.500,00` reformatado, centavos, fim anterior ao início e conversão de fuso. Máscara não equivale a validação.
- Entrega: funções pequenas e schemas Zod nas fronteiras. Extrair validação por etapa de `Register` e dados de evento, preservando os dois modos de cadastro/nova atuação; não reescrever o wizard inteiro.
- Aceite: testes por tipo de atuação e etapa, erros associados aos campos. Idade mínima, política de CPF e fim/fuso definitivo continuam pendentes; não inventar requisitos para satisfazer testes.
- Documentação: contratos de entrada e decisões pendentes relacionadas. Adaptar apenas os consumidores alcançados pela mudança.

## F0-T9 — Conter o mock e corrigir escopos de interface

**Dependência:** F0-T2/T6. **Risco:** alto; UI-02/03/04/12/18.

- Testar primeiro: visitante não vira N0; usuário/coletivo A não herda conversa ou formulário de B; troca de identidade limpa estado; datas de seed não variam com o relógio real.
- Entrega: separar fixtures e mutações de demonstração do futuro acesso a dados; reduzir o uso de estado global nas áreas já tocadas. Não introduzir repositório genérico ou nova biblioteca global de estado.
- Aceite: mock identificado, dados fictícios apenas, nenhuma sessão mutável compartilhada entre requisições SSR. Build integrado futuro rejeita login demo. A autorização definitiva fica no Supabase nas fases seguintes.
- Documentação: limites do mock e caminho de substituição por domínio, sem manter indefinidamente implementações duplicadas.

## F0-T10 — Corrigir estados e acessibilidade antes da integração

**Dependência:** F0-T6/T9. **Risco:** médio; UI-12/17/18.

- Testar primeiro: troca de ID reinicializa estado correto, erro focável, submit pendente impede duplicata, botão/link sem aninhamento inválido e retorno de falha preserva dados digitados.
- Entrega: loading/erro/vazio/403/404/conflito coerentes nos componentes afetados, sem toast de persistência bem-sucedida quando não houve confirmação.
- Aceite: navegação por teclado, viewport de 390 px, zoom, movimento reduzido, rótulos e idioma; não remodelar todas as telas por preferência.
- Documentação: matriz de estados, evidências manuais e lacunas de UX que dependem de novos fluxos de produto.

## F0-T11 — Migrar para React Router Framework e SSR

**Dependência:** F0-T6–T10. **Risco:** alto, transversal.

- Testar primeiro: conteúdo público/metadados no HTML sem JavaScript, 404 HTTP, links profundos, navegação/histórico e renderização sem `window`/`document` disponíveis no servidor.
- Entrega: entrada/configuração do framework, rotas/layouts, loaders/actions e limites servidor/cliente; preservar componentes de tela e URLs existentes. Rever o plugin Figma e o aviso de configuração Vite apenas conforme a migração exigir.
- Aceite: páginas públicas SSR ainda com fixtures, hidratação sem divergência, dois contextos sem vazamento e ausência de segredos no bundle. Migração incremental por grupo de rotas; remover roteador antigo somente quando os consumidores tiverem migrado.
- Documentação: mapa antigo → novo, composição de módulos, política de cache e configuração de build. Metadados reais serão integrados nas fases 2–4.

## F0-T12 — Executar Node e Caddy em containers

**Dependência:** F0-T11; F0-T3 é a referência do preview anterior. **Risco:** médio.

- Testar primeiro: rota pública SSR, assets, erro/404, configuração obrigatória ausente, saúde, reinício e encerramento de requisições em andamento.
- Entrega: imagens/runtime Node e proxy Caddy, rede/portas mínimas, filesystem protegido, usuário sem privilégios e limites de recursos compatíveis com SSR medidos em homologação.
- Aceite: construir do zero, rodar no Podman local e no CI, manter uploads fora do container. Validar restauração do preview anterior antes de trocar a URL usada pelo responsável.
- Documentação: comandos atuais, variáveis públicas versus segredos, health checks e rollback. O guia estático passa a ser histórico quando a migração for entregue.

## F0-T13 — Cobertura local e integração Codecov

**Estado:** publicação externa parcialmente deferida por DEF-01; cobertura local planejada. **Dependência:** F0-T6, e F0-T2 para credenciais de CI. **Risco:** médio.

- Entrega: relatório LCOV/HTML reproduzível, conjunto de arquivos incluídos explícito, baseline aprovado e política de cobertura de código alterado. Não impor porcentagem arbitrária nem excluir caminhos para esconder ausência de testes.
- Testar primeiro: código não executado aparece descoberto e arquivo novo entra no relatório; uma regressão controlada na regra exercitada faz o teste falhar mesmo se a cobertura continuar igual. Falha de teste impede tratar relatório como evidência aprovada; cobertura de linhas não prova qualidade do oráculo.
- Aceite externo: após liberar OAuth, upload real ao Codecov da instância própria, associado a repo/commit/branch corretos. Token por repositório, sem impressão em logs e sem exposição a código não confiável de PR. Usar execução confiável separada para publicação de artefatos não confiáveis, validando origem e SHA.
- Se DEF-01 persistir: publicar cobertura como artefato do CI, registrar pendência e continuar. Só tornar check remoto obrigatório depois de validar o caminho completo; não remover os gates locais de teste/review.
- Documentação: [diagnóstico Codecov](../../reviews/codecov-diagnosis.md), exclusões justificadas, baseline e instrução de upload. Não usar o mesmo agente/verificador para escrever testes canônicos e atestar sua imutabilidade.

## Escopo da limpeza e evidências

Memtrace consultado em 22/09/2026: `Register` tem complexidade 79 e depende de validação, store, formulário e roteador. `RouterProvider` acessa `window` na inicialização e participa da composição de `App`; a migração exige revisar seus consumidores. O grafo classificou o impacto de ambos como crítico; essas contagens são transitivas e incluem relações de tipos/campos, não quantidade garantida de telas quebradas.

Não há evidência para uma reescrita geral. Corrigir Markdown e contratos antes de refatorações cosméticas; cadastro é extraído por etapa/caso de uso. As consultas por branch mostraram cobertura desigual entre baseline e mudanças; a busca de código morto de alta confiança na branch não trouxe candidatos suficientes para justificar exclusões. O histórico disponível é curto e inclui ingestão/saves, portanto não sustenta estimativa de churn de produção. Cortex ficou indisponível; decisões explícitas e a spec aprovada continuam sendo a referência. Revalidar impacto antes de cada edição.

Arquivos locais não versionados, inclusive ferramentas de QA já presentes, não pertencem automaticamente à limpeza. Sua adoção exige revisão separada.

## Revisão de saída

Review completo de rotas/componentes, contratos, runtime, cadeia de entrega e preparação Supabase, mais as dez categorias OWASP em `docs/reviews/phase-0.md`. Demonstrar especialmente XSS, isolamento SSR, ausência de segredos, destino de migração e autoridade do aceite. Revisão normal ocorre em cada tarefa; este review não a substitui.

Pendências de Codecov podem permanecer com relatório local disponível. Falhas de isolamento de credenciais/QA, homologação ou P0/P1 impedem declarar a fase concluída para iniciar integração real.
