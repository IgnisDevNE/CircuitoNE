# Fase 0 — Preparar a base para desenvolver

**Estado em 30/09/2026 UTC:** em execução; SSR/Node 24/TypeScript 7 concluídos (#35/#36), pods dev/produção publicados, schema completo integrado e [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) concluída. A [homologação protegida 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488) aplicou migrações e seeds sintéticos em `CircuitoNE-dev` no SHA `8eaaa48821428be21d85ae8a56e1b0ee740b5222` e passou SQL/REST/Auth/MFA. A [restauração protegida 36666380554](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36666380554) recuperou banco e Storage privados em destino descartável; [negativas da esteira](../../reviews/phase-zero-operation-proofs-20260927.md) também foram registradas. Faltam a homologação protegida no SHA final de `main` da [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) e o reboot/login real da [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43). [Revisão de saída](../../reviews/phase-0.md) e [índice](../implementation-plan.md).

**Entrada:** arquitetura aprovada; inventário de 27 rotas e [achados UI-01–18](../../reviews/prototype-audit.md). **Saída:** aplicação executável em React Router Framework/Node/Caddy, testes e homologação operacionais, contratos sob autoridade independente e nenhum P0/P1 aberto no caminho que receberá dados reais.

## Ordem de trabalho

**Plano aprovado em 26/09/2026 (prevalece sobre a ordem histórica abaixo):** consolidar evidências → preparar quatro fatias de schema em bancos descartáveis e mudanças da esteira → concluir negativas do QA e preparar container Linux do agente → retirar autoridade temporária e fechar #31 → aplicar/homologar no CircuitoNE-dev e concluir recuperação #32/#43 → revisão completa/OWASP. Aproveitar o acesso de manutenção durante o bootstrap; não ativar migração remota antes do isolamento.

**Checkpoint de 27/09/2026:** quatro fatias de schema integradas e suíte SQL/concurrency sob aceite canônico v2; PR #126 integrada em `f99736f`, promoção QA `dd2fa1d`. A negativa descartável #127 comprovou falha SQL independente apesar de comandos falsos no CI, e cancelamento publicado no SHA antigo com nova avaliação do SHA novo, sem alterar `accepted`. Preparação de homologação/backup/receipt/Storage integrada na #128/#137; CI Linux, promoção/rollback de imagem, Access permitido/negado e rotação do PAT demonstrados. #30 encerrada pelo caso genuíno #130. A revisão posterior concluiu a #31; homologação e recuperação completa de dev passaram em 30/09. O reboot real da #43 permanece. [Evidências da negativa](https://github.com/IgnisDevNE/CircuitoNE/issues/31#issuecomment-5852322951).

O agente de implementação executará integralmente em container Linux no Podman, sem perfil/discos Windows, chaves, sessões humanas ou socket do engine. Receberá apenas token temporário do App emitido pelo mantenedor fora desse ambiente. Esta sessão Windows é de manutenção. A #30 foi encerrada com a atualização genuína #130 e evidências vinculadas; não fabricar upgrades como prova. A #104 é o último gate técnico pré-release e não bloqueia a fase zero; produção permanece em espera, com cadastros e backup legível desativados.

| Fatia F0-T4 concluída | Issue encerrada | Entrega homologada em `CircuitoNE-dev` |
|---|---|---|
| 1 Identidade e atuações | [#116](https://github.com/IgnisDevNE/CircuitoNE/issues/116) | Conta privada, perfis, taxonomia, materiais, RLS e seeds |
| 2 Coletivos | [#117](https://github.com/IgnisDevNE/CircuitoNE/issues/117) | Proprietário, aprovação, perfis/permissões e vínculos atômicos |
| 3 Eventos | [#118](https://github.com/IgnisDevNE/CircuitoNE/issues/118) | Eventos/lineup, publicação, cancelamento e agenda |
| 4 Mensagens e ciclo de vida | [#119](https://github.com/IgnisDevNE/CircuitoNE/issues/119) | Schema/RPCs, testes e seeds integrados; migrações e seeds sintéticos homologados no dev no SHA `8eaaa48`. Executor Auth/Storage da interface é #23/#21 nas fases de produto |

Cada fatia inclui migrações, constraints/índices/grants/RLS, RPCs atômicas, tipos e seeds determinísticos, com TDD SQL e revisão Sol/low. A aplicação remota em dev passou no SHA `8eaaa48` após o gate da #31; backup e restauração completa de banco/Storage passaram, com RPO de 4714 s e RTO de 52 s. UI, jornadas Auth e operação de moderação continuam nas fases de produto. Nenhuma issue exige seu próprio encerramento antes de começar a correção.

**Plano histórico de 23/09/2026:** o responsável pediu para executar primeiro as correções e preparações da fase 0 que não dependiam de isolamento. O gate da #31 foi concluído antes da homologação protegida; as restrições abaixo descrevem a sequência de implementação, não bloqueios atuais.

Com F0-T1/T3 integradas, abrir primeiro F0-T14 (dependências) e F0-T15 (decisões/pré-requisitos), em paralelo ao trabalho independente de F0-T2 e F0-T6. Corrigir F0-T7–T10; migrar F0-T11/T12; concluir F0-T4/T5 e o review de fase. Estabilizar a toolchain de F0-T14 antes do aceite final dos testes/SSR. F0-T13 pode avançar quando houver cobertura real, mas a dependência externa do Codecov não bloqueia a fase. Dependências específicas abaixo prevalecem sobre essa sequência resumida.

Por orientação do responsável em 22/09/2026, abrir PR ao final da fase ou em checkpoints necessários, mantendo cada tarefa com review normal independente. PRs intermediários seguem a ordem das dependências para aprovação crescente. O planejamento atual não autoriza marcar a base como pronta nem aplicar regras em ambiente compartilhado sem o isolamento de F0-T2. A decisão de 26/09 autoriza preparar e testar schema/RLS/RPCs em banco descartável com dados sintéticos antes desse gate. A [auditoria atual do Supabase](../../reviews/supabase-environments-2026-09-22.md) distingue o que foi verificado das configurações ainda pendentes.

## F0-T1 — Consolidar GitHub, toolchain e CI

**Bloqueios por issue:** Nenhum novo; fundação integrada. Upgrades restantes pertencem a F0-T14.

**Issues tratadas:** Nenhuma pendência própria nova.

**Estado:** integrado pelo PR #2, com CI verde; isolamento e homologação protegida foram concluídos depois nas tarefas F0-T2/F0-T4. **Dependência:** nenhuma. **Risco:** médio, cadeia de entrega.

- Entrega: baseline, lockfile, versões Node/pnpm, `main` protegida, CODEOWNERS, App implementador e CI sem secrets para PRs.
- Verificação: instalação limpa, testes existentes, TypeScript, build, auditoria e container. Confirmar identidade do App e origem dos checks; não enfraquecer proteção para facilitar merge.
- Aceite: PR revisado independentemente; branch concluída limpa, `main` atualizada, próxima tarefa em branch nova. Arquivos locais de outros trabalhos ficam preservados.
- Documentação: guia de ambiente e evidências de fundação; registrar limitações reais de permissões do App.

## F0-T2 — Isolar contratos, testes e credenciais

**Bloqueios por issue:** Nenhum pré-requisito de issue para iniciar o isolamento.

**Issues tratadas:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); sua conclusão libera os trabalhos que exigem autoridade independente.

**Estado:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) concluída após revisão independente e de segurança, CI pós-merge e promoção QA; [registro](../../reviews/agent-authority-closure-20260927.md). Aceite canônico, retomada, promoção e fechamento pós-merge validados na #58. **Dependência:** F0-T1. **Risco:** alto.

- Entrega: emissor da chave do App fora do implementador; ambiente sem credencial humana/admin, inclusive acessos temporários de manutenção de SSH/Codecov; QA canônico fora das instalações desse App; verificador com comando, dependências e identidade próprios.
- Testar primeiro: a identidade implementadora não escreve QA, não altera sua versão aprovada, settings/secrets, aprovações ou promoção. Usar recursos de teste controlados para provas negativas, sem mutações destrutivas em produção.
- Aceite: fixar SHA dos testes antes de implementar; verificador testa SHA/artefato final em ambiente descartável. PR que altera runner/comando/fixtures ou falsifica resultado não consegue substituir o aceite. Não executar código candidato junto da chave que atesta o resultado.
- Documentação: matriz de autoridades, ameaças, procedimento de mudança de teste, evidências de negação e recuperação/rotação de credenciais. O Codecov não é esse verificador.

**Execução escolhida em 22/09/2026:** concentrar integridade, aceite canônico e promoção da suíte no CI, sem VM local obrigatória ([spec](../../specs/canonical-ci-suite.md), [ADR 0006](../../decisions/0006-canonical-ci-suite.md)). Ordem: disponibilizar autoridade QA externa → fixar suíte/workflow → conectar integridade e execução ao PR → promover novos testes revisados após merge/validação → ensaiar concorrência e recuperação. Cada entrega tem pré-requisito e evidência na spec. A #31 acompanha o trabalho; não exigir seu fechamento para começar a própria correção. Configuração do recurso QA/origem confiável pelo mantenedor é pré-requisito da ativação externa, e os requisitos de credenciais não são dispensados pela decisão de usar CI.

## F0-T3 — Manter o preview do protótipo

**Bloqueios por issue:** Nenhum novo para manter o preview estático com dados fictícios.

**Issues tratadas:** Nenhuma pendência própria nova; a troca de runtime fica em F0-T12.

**Estado:** container estático validado no Windows como entrega provisória, depois substituído pelo runtime SSR de F0-T12. **Dependência:** F0-T1. **Risco:** baixo.

- Aceite: home, bundle, link profundo, 404 de asset e bloqueio de caminhos internos; root filesystem protegido e execução sem privilégios. Preservar os demais containers do host.
- Documentação: URL/porta e comandos verificados; o preview estático foi substituído após o aceite de F0-T12.

## F0-T4 — Preparar Supabase e migrações reproduzíveis

**Bloqueios por issue:** gates de isolamento da [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) e região/destino da [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) satisfeitos antes da homologação protegida. A recuperação restante da #43 não bloqueou a aplicação de migrações sintéticas.

**Manutenção pontual autorizada em 22/09/2026:** validar somente as credenciais dev por job manual em `main`, após review/merge e aprovação do environment, sem aplicação, migração ou dados reais. Essa verificação está preparada no PR #45 e delimitada na ADR 0003; não encerra #31 nem libera as demais operações bloqueadas. Registrar o resultado remoto em #32 antes de afirmar que token/senha funcionam.

**Issues tratadas:** [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32), preparação de migrações e banco descartável; a parte de promoção continua em F0-T5.

**Dependência:** F0-T2; pode ser preparada em banco descartável antes do runtime SSR. **Risco:** alto.

- Entrega: CLI fixado, configuração por ambiente, adaptador simples de `docs/migrations/` para a árvore de execução do CLI, tipos gerados e dados sintéticos determinísticos.
- Testar primeiro: ordem/checksum de migrações, reconstrução limpa, destino incorreto rejeitado e ausência de cópias editáveis concorrentes. Um `reset` de teste nunca alcança homologação compartilhada ou produção.
- Aceite: validar compatibilidade do Supabase local com Podman/WSL; se não for suportada no host, usar banco descartável em runner Linux isolado, documentando a alternativa. Nenhuma promessa de compatibilidade apenas por ambos usarem containers.
- Documentação: [convenção de migrações](../../migrations/README.md), ambiente, seeds e política de concorrência. Migração de ensaio fica no banco descartável; schema completo do MVP entra agora nas quatro fatias #116–#119, sem antecipar interfaces de produto.

## F0-T5 — Homologar e promover pelo GitHub

**Bloqueios por issue:** isolamento da [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31), migrações da [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) e destino/domínio da [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) satisfeitos para a primeira homologação. A #32 continua aberta para conferir negativas e promoção/rollback no SHA final; a #43 para reboot/login real.

**Issues tratadas:** [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32), homologação e promoção de teste.

**Dependência:** F0-T2/T4/T12. **Risco:** alto.

- Entrega: fluxo de homologação no `CircuitoNE-dev`, registro de SHA/checksum/artefato, smoke test e promoção protegida do artefato homologado. Mudanças de workflow passam por PR, revisão independente e proteção de branch; a concessão temporária de Workflows write foi retirada em 27/09. Alterações futuras de workflow exigem manutenção humana separada e PR revisada, sem ampliar o token cotidiano do implementador.
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

**Bloqueios por issue na implementação original:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes de conectar dados reais; o controle foi encerrado depois. A correção isolada do renderizador do protótipo foi integrada na [PR #82](https://github.com/IgnisDevNE/CircuitoNE/pull/82) com aceite canônico.

**Issues tratadas:** [#11](https://github.com/IgnisDevNE/CircuitoNE/issues/11) integralmente, incluindo renderização segura no servidor/navegador.

**Dependência:** F0-T2/T6. **Risco:** alto; UI-01.

- Testar primeiro: aspas, atributos/eventos, HTML, esquemas perigosos, links malformados e texto escapado, tanto no servidor quanto no navegador.
- Entrega: renderização segura com formatação necessária preservada. Preferir biblioteca mantida se o conjunto de recursos exigir parser/sanitização; não construir outro parser por substituições inseguras.
- Aceite: nenhum conteúdo de usuário cria código executável; o editor atual é texto simples, e qualquer prévia renderizada futura usa a mesma política da página pública. Links externos recebem tratamento coerente.
- Documentação: formatos permitidos, exemplos de ataque bloqueados e tradeoffs registrados no PR/spec pertinente.

**Evidência de F0-T7:** [spec](../../specs/event-description-markdown.md), [CI de `main`](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35923075988) e [promoção QA](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35923261808) verdes após o merge da #82. Isso resolve o caminho Markdown do protótipo; não libera conteúdo real antes dos gates de identidade, autorização e dados.

## F0-T8 — Separar validação, dinheiro e datas do JSX

**Bloqueios por issue:** [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31); integrar registros revisados de [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38) para idade/CPF/recuperação e de RN-36 na [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) para contato WhatsApp; [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41) até integrar o contrato temporal RN-24 revisado. Dinheiro e validações já decididas podem avançar independentemente.

**Issues tratadas:** [#17](https://github.com/IgnisDevNE/CircuitoNE/issues/17) e partes de [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18)/[#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19); manter aberto o que ainda depender de integração/validação definitiva no servidor.

**Dependência:** F0-T2/T6. **Risco:** alto no cadastro; UI-07/08/09.

- Testar primeiro: CPF normalizado e dígitos, nascimento inválido, CNPJ numérico/alfanumérico, URL/e-mail, valor `R$ 1.500,00` reformatado, centavos, fim anterior ao início e conversão de fuso. Máscara não equivale a validação.
- Entrega: funções pequenas e schemas Zod nas fronteiras. Extrair validação por etapa de `Register` e dados de evento, preservando os dois modos de cadastro/nova atuação; não reescrever o wizard inteiro.
- Aceite: testes por tipo de atuação e etapa, erros associados aos campos. Aplicar as decisões de RN-31–34: 18 anos completos, celular obrigatório/único/confirmado e CPF corrigido pelo suporte. Cadastro aceita todas as 27 UFs e gênero vazio ou “não informar” (RN-04); informa se o celular é WhatsApp e permite número adicional opcional se diferente (RN-36). Recuperação/exclusão reais permanecem na fase 1. Evento aceita fim vazio sem copiá-lo do início, rejeita fim não posterior e preserva o instante de `America/Fortaleza` entre navegadores (RN-24/#41).
- Documentação: contratos de entrada e decisões pendentes relacionadas. Adaptar apenas os consumidores alcançados pela mudança.

## F0-T9 — Conter o mock e corrigir escopos de interface

**Bloqueios por issue:** gate da [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) concluído; as invariantes da [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40) foram incorporadas ao schema/RLS/RPCs e aos testes SQL das #116–#119. Integração da autorização nas interfaces e jornadas permanece nas fases de produto.

**Issues tratadas:** [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12)/[#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13)/[#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) na contenção do mock e troca de contexto. Autorização real e persistência não são encerradas por uma correção de UI.

**Dependência:** F0-T2/T6. **Risco:** alto; UI-02/03/04/12/18.

- Testar primeiro: visitante não vira membro; usuário/coletivo A não herda conversa, perfil de permissões ou formulário de B; troca de identidade limpa estado; datas de seed não variam com o relógio real.
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

**Issues tratadas:** o runtime contribuiu para [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32); a homologação integrada passou, mas a issue ainda requer conferir negativas e promoção/rollback no SHA final.

**Dependência:** F0-T11; F0-T3 é a referência do preview anterior. **Risco:** médio.

- Testar primeiro: rota pública SSR, assets, erro/404, configuração obrigatória ausente, saúde, reinício e encerramento de requisições em andamento.
- Entrega: imagens/runtime Node e proxy Caddy, rede/portas mínimas, filesystem protegido, usuário sem privilégios e limites de recursos compatíveis com SSR medidos em homologação.
- Aceite: construir do zero, rodar no Podman local e no CI, manter uploads fora do container. Validar restauração do preview anterior antes de trocar a URL usada pelo responsável.
- Documentação: comandos atuais, variáveis públicas versus segredos, health checks e rollback. O guia estático passa a ser histórico quando a migração for entregue.

## F0-T13 — Cobertura local e integração Codecov

**Bloqueios por issue:** O acesso à organização da instância própria foi verificado e [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29) encerrada. A PR genuína compatível [#130](https://github.com/IgnisDevNE/CircuitoNE/pull/130) comprovou o caso Dependabot; [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) encerrada após integração do registro e da política de forks na #128. O token do publicador já está isolado; isso não fecha o isolamento completo [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31). Ver [ADR 0007](../../decisions/0007-codecov-self-hosted-target.md); [ADR 0004](../../decisions/0004-codecov-cloud.md) registra a escolha anterior.

**Issues tratadas:** [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) e colaboração operacional em [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29); não fechar upload sem relatório real.

**Estado:** cobertura e artefatos entregues pelo PR #45. O [primeiro relatório próprio de `main`](https://pipeline.magalz.space/github/IgnisDevNE/CircuitoNE/commit/e74153ef47e388959477e2c3410f9dfffe02503f) foi processado no SHA `e74153e`, com 43,13% de cobertura; PR e comentário numérico foram comprovados nas #105/#110. Em 27/09, a #130 publicou 53,34% no SHA `2d6fbc6`, com checks, comentário numérico e LCOV do mesmo CI: [registro](../../reviews/evidence/codecov-dependabot-20260927.json). O publicador usa segredo protegido; o candidato não o recebe. A política aprovada mantém forks somente com testes/LCOV, sem upload. A [ampliação de cobertura](../../reviews/coverage-backlog-2026-09-22.md) registra testes de interação e correções do roteador; não satisfaz aceite canônico. **Dependência:** F0-T6 para gerar LCOV. **Risco:** médio.

- Entrega: relatório LCOV/HTML reproduzível, conjunto de arquivos incluídos explícito, baseline aprovado e política de cobertura de código alterado. Não impor porcentagem arbitrária nem excluir caminhos para esconder ausência de testes.
- Testar primeiro: código não executado aparece descoberto e arquivo novo entra no relatório; uma regressão controlada na regra exercitada faz o teste falhar mesmo se a cobertura continuar igual. Falha de teste impede tratar relatório como evidência aprovada; cobertura de linhas não prova qualidade do oráculo.
- Aceite externo: validar upload de PR e comentário efetivo na instância própria, associados ao repo/commit/branch corretos. O publicador permanece separado, sem executar o app nem consumir screenshots. Dependabot exige execução genuína compatível; forks conservam testes/LCOV em artefatos sem token de upload. Aceite demonstrado na #30; o teste da política de forks não é uma execução real de PR de fork.
- Se o upload falhar: preservar cobertura como artefato do CI, registrar pendência e continuar. Só tornar check remoto obrigatório depois de validar o caminho completo; não remover os gates locais de teste/review.
- Documentação: [diagnóstico Codecov](../../reviews/codecov-diagnosis.md), exclusões justificadas, baseline e instrução de upload. Não usar o mesmo agente/verificador para escrever testes canônicos e atestar sua imutabilidade.

## F0-T14 — Resolver upgrades e estabilizar a toolchain

**Bloqueios por issue:** Nenhum para iniciar revisão/correção de dependências em CI sem secrets. Escrita de workflows requer atuação do mantenedor, registrada em [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34). Para publicar o CI do PR #45, ele autorizou explicitamente sua credencial em 22/09/2026; as proteções de revisão permanecem.

**Issues tratadas:** [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34)/[#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35)/[#36](https://github.com/IgnisDevNE/CircuitoNE/issues/36)/[#37](https://github.com/IgnisDevNE/CircuitoNE/issues/37); cada incremento tem seu próprio review e evidência.

**Dependência:** F0-T1. **Risco:** médio/alto; [revisão dos oito PRs](../../reviews/dependabot-2026-09-22.md). Executar em incrementos revisáveis, sem misturar a migração do compilador com a do framework.

**Estado em 27/09/2026:** Node 24.21.0, TypeScript 7 e SSR React Router Framework foram validados; #35 e #36 estão encerradas. A PR #93 registra o alinhamento inicial, e as #97/#99 registram o runtime SSR e compilador/editor. A [revisão Dependabot atual](../../reviews/dependabot-2026-09-27.md) mantém atualizações compatíveis separadas da migração já concluída. Os itens abaixo preservam as decisões e critérios usados na seleção da toolchain, sem tratar upgrades antigos como novas tarefas.

- Actions/Caddy: as propostas elegíveis e a versão mantida de pnpm/action-setup com runtime Node 24 foram tratadas nos checkpoints anteriores. Não mudar pnpm 10.34.3 incidentalmente. Workflows são aplicados pelo mantenedor.
- Node: a divergência do PR #7 foi resolvida pela migração validada para Node 24 LTS. Engines, mise, tipos, CI e imagens ficam alinhados por digest; Node 26 Current não entra apenas por ser mais novo.
- TypeScript: reproduzir TS5102 do PR #8, adaptar configuração/aliases e verificar compilador/editor/tooling nas plataformas usadas. Não enfraquecer typecheck; conferir compatibilidade com React Router Framework ao executar F0-T11.
- Tailwind: atualizar core/plugin juntos, revisar transitivas, instalação limpa e aparência em páginas públicas, cadastro e dashboard, desktop/mobile. Agrupar futuras atualizações compatíveis de Tailwind no Dependabot; manter majors sob revisão própria.
- Aceite: testes existentes, typecheck, build, auditoria e container passam na combinação final; registrar evidência visual do CSS. Toda falha encontrada ganha teste de regressão antes da correção. Atualização sem novo comportamento usa os testes existentes; não fabricar vermelho. Resolver destino dos PRs substituídos sem declarar uma versão aprovada só pelo número ou pelo CI.
- Documentação: versões escolhidas, motivo, SHAs dos PRs, resultados, limites e rollback. Revisão humana continua obrigatória.

## F0-T15 — Antecipar decisões e pré-requisitos que bloqueiam produto

**Bloqueios por issue:** Nenhum para preparar decisões; [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) antes da preparação que use credenciais de ambiente.

**Issues tratadas:** [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38)/[#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39)/[#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40)/[#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41)/[#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42)/[#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43)/[#66](https://github.com/IgnisDevNE/CircuitoNE/issues/66); decisão só encerra após aprovação, pré-requisito operacional após verificação.

**Dependência:** regras/propostas já inventariadas; decisões de produto podem avançar sem código. **Responsáveis:** produto e mantenedor. A preparação com credenciais depende do isolamento de F0-T2.

- Resolver na fase zero: idade/CPF/recuperação/retenção, arquivos e dados sociais, verificação/suspensão e invariantes de coletivos, catálogo de perfis e permissões (#66), tempo/publicação/agenda de eventos, iniciação/moderação de mensagens. Propostas continuam propostas até aprovação; não inventar resposta para encerrar issue.
- Estado inicial em 26/09/2026: ambos os projetos estão em São Paulo; produção `ukyoyrmebwadmuzkswdw` validada por conexão de leitura. Guard de ambiente, SMTP2GO separado, dev em sandbox com auditoria em `ignisdev@magalz.space`, domínios/HTTPS e pods estão implantados. Ensaio SMTP sintético passou; novos cadastros de produção estão desativados e redirects continuam vazios até callback Auth revisado. O acesso permitido/negado no Access e a rotação do PAT passaram em 27/09. Depois, o [backup dev 36660527063](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36660527063) passou com recibo independente; a [restauração completa 36660875225](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36660875225) falhou sem perder a cópia válida. Faltam corrigir e repetir a restauração, medir RPO/RTO e ensaiar reboot real. #104 é o último gate técnico pré-release, sem dados reais antes dele.
- Atualização de 30/09/2026: a [reexecução 36666380554](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36666380554) recuperou banco e Storage sintéticos com RPO 4714 s e RTO 52 s. O item operacional restante da #43 é o reboot/login real do Windows, com retomada dos pods e HTTPS.
- Aceite: cada decisão tem responsável, registro aprovado e exemplos de aceite/negação nos contratos afetados; SMTP de dev é validado com cópia somente à caixa de auditoria controlada, e o de produção com destino de teste controlado antes de reativar cadastros. Marcar evidências por pré-requisito e remover apenas o bloqueio correspondente.
- Documentação: atualizar regras canônicas, ambiente/spec pertinente e issues; implementação persistente, deploy final e ensaio completo de restauração continuam nas fases correspondentes. Sem testes artificiais para decisões documentais.

## Meta de redução do backlog na fase zero

| Grupo | Meta na fase 0 | Condição para permanecer aberto |
|---|---|---|
| Defeitos autônomos de Markdown, dinheiro, estado de rota e semântica (#11/#17/#22/#27) | Corrigir e encerrar com evidência de todos os critérios aplicáveis ao protótipo | Critério ainda não demonstrado, explicitamente atribuído a uma tarefa; não fechar só porque o exemplo deixou de falhar |
| Dependências (#34–#37), decisões e pré-requisitos (#38–#43/#66) | Resolver antes de estabilizar a base e antes das tarefas dependentes | Incompatibilidade externa demonstrada ou decisão humana pendente, com responsável e impacto exato |
| Infraestrutura (#29–#32) | Concluir caso Dependabot, isolamento e homologação | #29/#30/#31 encerradas; Codecov próprio, Dependabot, isolamento e homologação protegida comprovados. Conferir critérios remanescentes da #32 antes de encerrá-la |
| Achados que incluem persistência/autorizações e funcionalidades ainda inexistentes | Antecipar schema, invariantes, RLS/RPCs, seeds e testes SQL completos na F0 | Interfaces e jornadas integradas continuam nas fases 1–5; manter suas issues abertas até aceite integral, sem backend provisório |
| SEO e qualidade integrada (#26/#28 e validação final) | Corrigir metadados estáticos, SSR com fixtures, determinismo e estados já testáveis | Consultas/paginação/dados reais e validação do produto final permanecem nas tarefas de domínio e F6-T3 |

O relatório de saída deve listar **cada issue ainda aberta**, o que já foi resolvido, motivo concreto do restante, tarefa de destino e efeito no gate. Ausência de issue nova não prova ausência de dívida; uma issue parcialmente atendida não é encerrada como resolvida.

## Escopo da limpeza e evidências

Memtrace consultado em 22/09/2026: `Register` tem complexidade 79 e depende de validação, store, formulário e roteador. `RouterProvider` acessa `window` na inicialização e participa da composição de `App`; a migração exige revisar seus consumidores. O grafo classificou o impacto de ambos como crítico; essas contagens são transitivas e incluem relações de tipos/campos, não quantidade garantida de telas quebradas.

Não há evidência para uma reescrita geral. Corrigir Markdown e contratos antes de refatorações cosméticas; cadastro é extraído por etapa/caso de uso. As consultas por branch mostraram cobertura desigual entre baseline e mudanças; a busca de código morto de alta confiança na branch não trouxe candidatos suficientes para justificar exclusões. O histórico disponível é curto e inclui ingestão/saves, portanto não sustenta estimativa de churn de produção. Cortex ficou indisponível; decisões explícitas e a spec aprovada continuam sendo a referência. Revalidar impacto antes de cada edição.

Arquivos locais não versionados, inclusive ferramentas de QA já presentes, não pertencem automaticamente à limpeza. Sua adoção exige revisão separada.

## Revisão de saída

Review completo de rotas/componentes, contratos, runtime, cadeia de entrega e preparação Supabase, mais as dez categorias OWASP em `docs/reviews/phase-0.md`. Demonstrar especialmente XSS, isolamento SSR, ausência de segredos, destino de migração e autoridade do aceite. Revisão normal ocorre em cada tarefa; este review não a substitui.

Pendências de Codecov podem permanecer com relatório local disponível. Falhas de isolamento de credenciais/QA, homologação ou P0/P1 impedem declarar a fase concluída para iniciar integração real.
