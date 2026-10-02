# Fase zero — revisão de saída e checkpoint histórico

## Revisão de saída — atualizada em 02/10/2026

**Estado: condicional somente pelo reboot/login real da #43; a fase zero ainda não está encerrada.** Esta seção prevalece sobre o checkpoint histórico abaixo. SSR/Node 24/TypeScript 7, schema do MVP, suíte canônica isolada, Codecov próprio, pods dev/produção e restauração sintética estão integrados. Nenhum dado real foi admitido; produção mantém a página de espera, novos cadastros desativados e nenhuma migração ou backup legível.

| Área revisada | Evidência e resultado | Limite do aceite |
|---|---|---|
| Rotas, SSR e componentes | React Router Framework/Node/Caddy compilaram e passaram no CI. Recarga direta de rota pública passou no QA canônico. | Telas ainda usam fixtures; jornadas reais permanecem nas [issues #12–#28](https://github.com/IgnisDevNE/CircuitoNE/issues/12) e fases de produto. |
| Banco e políticas | Cinco migrações e quatro seeds sintéticos validados na [homologação final 37072463740](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/37072463740), com SQL, RLS, REST, Auth e MFA no SHA `1f0eed7`. Produção não recebeu migração. | [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) concluída; próximas mudanças executáveis exigem nova homologação do seu SHA. |
| Entrega e autoridade | [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) encerrada após negativas de autoridade. CI, CodeQL, Codecov e QA canônico passaram nos SHAs integrados. [Negativas, concorrência e rollback](phase-zero-operation-proofs-20260927.md) estão registrados. | Toda mudança exige PR, revisão independente, aceite do SHA exato e promoção QA. |
| Ambientes e recuperação | [Backup dev 36660527063](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36660527063) e [restauração isolada 36666380554](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36666380554) recuperaram banco e dois objetos privados, com hashes, grants/RLS e conteúdo sintético; RPO 4.714 s e RTO 52 s no ensaio. Inspeção sem reiniciar confirmou pods, tarefa de retomada, serviço cloudflared, DNS e HTTPS. | Falta **reboot/login real** e verificação dos serviços existentes para fechar [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43). |

Subagentes Sol/low, somente leitura, revisaram rotas/SSR, SQL/RLS, QA/CI, homologação, backup e coerência documental em 30/09. Nenhum novo P0/P1 foi confirmado na fundação implementada. A divergência documental de RPO/RTO foi corrigida. Isso não aprova Auth e fluxos de produto ainda simulados nem substitui uma avaliação do produto antes do lançamento.

### Recibo final de homologação — 02/10/2026

- Origem `main`: `1f0eed78017becf03126a742b3351e9a1462ac74`, PR #146. [CI 36671371086](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36671371086) e CodeQL passaram; QA `accepted=3018e86c578d9efe0f447e30af22ecdc56c0d734` registra o mesmo `source_main_sha`.
- [Execução protegida 37072463740](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/37072463740), aprovação `magalz` no environment Homologação, terminou em sucesso às 22:38:33 UTC. Destino único `odphoxozclrshqjgwbqk` (`CircuitoNE-dev`); nenhum reset, deploy ou mudança de produção.
- [Manifesto 11255620919](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/37072463740/artifacts/11255620919), SHA-256 `b0776bec82e35b3b5f4af543f9b3c63e897c722522dc492a8485087aed532088`. O job conferiu origem/destino/bytes, CA e pooler; migrações, quatro seeds idempotentes e SQL/REST/Auth/MFA passaram sob trava de sessão.
- [Prova de imagem 11077993018](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36671371086/artifacts/11077993018): candidata `1f0eed7` promovida em destino descartável e rollback para `cf9e2df`; `failedHealthDetected=true`. Artefato registra os IDs imutáveis, sem dados ou credenciais.
- [Negativas e concorrência](phase-zero-operation-proofs-20260927.md): CI `36666082735` e cancelamento sem aprovação `36666182023` preservados; não repetir provas satisfeitas apenas para produzir outro recibo. Revisão Sol/low da homologação confirmou os critérios, sem novo bloqueio de banco/esteira.
- O host está sincronizado com esse SHA e o QA. Preflight em 02/10: pods/HTTPS saudáveis, serviço cloudflared ativo, tarefa de retomada instalada; último boot continua em 25/09. **Não é prova de reboot.** O mantenedor adiou a janela para o dia seguinte; a #43 permanece aberta.

Esta atualização é somente documental: referencia o SHA executável homologado acima e não altera migrations, seeds, testes, runtime ou esteira. Sua PR exige CI/QA e revisão; não exige reaplicar o mesmo banco para registrar um recibo. Qualquer mudança executável posterior segue o gate normal de homologação.

### Segurança — OWASP Top 10:2025

Categorias conforme a [lista oficial](https://top10.owasp.org/2025/). A revisão cobre a fundação e os ensaios atuais, não constitui certificação nem pentest.

| Categoria | Evidência e risco residual | Destino |
|---|---|---|
| A01 Broken Access Control | RLS, grants, funções e REST testados com identidades sintéticas; QA separado do implementador. UI mock não prova autorização real. | [#12–#16](https://github.com/IgnisDevNE/CircuitoNE/issues/12), fases 1–5. |
| A02 Security Misconfiguration | Guard de ambiente, produção sem cadastro/callbacks, dev por Cloudflare Access. Recuperação após reboot sem prova. | [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43). |
| A03 Software Supply Chain Failures | Lockfile, Actions fixadas, CodeQL, auditoria, revisão e Dependabot genuíno; PRs #139–#141 passaram CI. Advertência obsoleta do publicador QA não bloqueia hoje. | [#145](https://github.com/IgnisDevNE/CircuitoNE/issues/145). |
| A04 Cryptographic Failures | HTTPS e segredos fora dos commits; backup dev contém somente dados sintéticos. Cifra de banco **e Storage** com restauração cifrada é o último gate técnico pré-release. | [#104](https://github.com/IgnisDevNE/CircuitoNE/issues/104); nenhum dado real até fechá-la. |
| A05 Injection | Markdown sanitizado e funções SQL com `search_path` controlado. O [alerta CodeQL #1](https://github.com/IgnisDevNE/CircuitoNE/security/code-scanning/1), High, em `ImageField` permanece aberto: a revisão Sol/low não demonstrou execução JS no contexto `img`, mas isso não prova falso positivo. A exposição atual é sintética, sem persistência compartilhada. | [Triagem #21](https://github.com/IgnisDevNE/CircuitoNE/issues/21#issuecomment-5962502981): validar URL/MIME/tamanho e cenários maliciosos antes de arquivos reais/F2-T3; não dispensar o alerta por CI verde. |
| A06 Insecure Design | Regras, invariantes e quatro fatias do schema revisadas; concorrência e negativas exercitadas. Auth/moderação de produto pendentes. | [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15), [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23). |
| A07 Authentication Failures | SMTP dev sandbox e MFA sintético; produção sem novos usuários/callbacks. Não há login nominal que autorize acesso real. | Fase 1 antes de contas reais. |
| A08 Software or Data Integrity Failures | Checksums, SHA, suíte QA canônica, aprovação do último push, imagem imutável e rollback negativo. | [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) concluída com recibo acima. |
| A09 Security Logging and Alerting Failures | Auditoria e recibos de execução existem; alerta de disponibilidade de produção não foi provado. | [#144](https://github.com/IgnisDevNE/CircuitoNE/issues/144) antes do lançamento. |
| A10 Mishandling of Exceptional Conditions | Destino/SHA errados, falhas de migração/smoke, concorrência, corrupção, cópia incompleta e rollback foram ensaiados com falha fechada. Falta retomada após reboot. | [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43). |

### Pendências para decisão de saída

- **Bloqueia a fase zero:** somente [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43), reboot/login real, pods, DNS, HTTPS e demais serviços retomados. Mantenedor combina a janela e entra no Windows; implementação confere e registra as provas. A #32 foi concluída após a homologação final; esta atualização não dispensa o reboot.
- **Produto:** as issues abaixo permanecem abertas porque exigem UI, Auth, persistência ou jornada integrada ainda simuladas. As P1 impedem dados reais até correção, mas não a fase seguinte com fixtures. Responsáveis: implementação e revisão de produto.
- **Pré-release/manutenção:** [#104](https://github.com/IgnisDevNE/CircuitoNE/issues/104) é o último gate técnico antes de dados reais; [#144](https://github.com/IgnisDevNE/CircuitoNE/issues/144) decide disponibilidade do Supabase Free; [#145](https://github.com/IgnisDevNE/CircuitoNE/issues/145) elimina entrada obsoleta do publicador QA. Responsável, impacto e aceite estão em cada issue.

| Issues de produto ainda abertas | Motivo / destino |
|---|---|
| [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12), [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13), [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14) | Identidade, membros e autorização reais; fases 1/3/5. |
| [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15), [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) | Cadastro persistente e propriedade única na interface; fases 1/3. |
| [#17](https://github.com/IgnisDevNE/CircuitoNE/issues/17), [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18), [#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19) | Validação de cachê, tempo de evento e cadastro por etapa; fases 1/2/4. |
| [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20), [#21](https://github.com/IgnisDevNE/CircuitoNE/issues/21) | Edição das atuações, upload e galeria reais; fase 2. |
| [#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22), [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) | Estado ao trocar rota e Auth verdadeiro; fases 1–5. |
| [#24](https://github.com/IgnisDevNE/CircuitoNE/issues/24), [#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) | Agenda e conversas integradas; fases 4/5. |
| [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26), [#27](https://github.com/IgnisDevNE/CircuitoNE/issues/27), [#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) | SEO, acessibilidade e estados de consulta do produto; fases 1–6. |

Após integrar esta atualização documental, confirmar CI/QA e promoção. Somente após a prova real de reboot/login da #43, seu recibo e a revisão de qualquer falha nova a fase zero poderá ser declarada encerrada. A próxima fatia é sessão SSR com contas sintéticas; [#147](https://github.com/IgnisDevNE/CircuitoNE/issues/147) trata o provedor de confirmação de celular antes de F1-T2, sem impedir essa fatia. [#104](https://github.com/IgnisDevNE/CircuitoNE/issues/104) permanece fora da fase zero.

---

**Registro histórico de 22–23/09/2026.** O estado vigente está no [plano da fase zero](../planning/phases/00-foundation.md): #31 encerrada, migrações e seeds sintéticos homologados no dev pela [execução 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488), backup dev validado pela [execução 36660527063](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36660527063) e restauração completa aprovada na [reexecução 36666380554](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36666380554). As pendências abaixo descrevem o checkpoint original e não o backlog atual.

**Atualização histórica após PRs #45–#49:** CI, banco descartável, artefatos, Codecov Cloud e CodeQL foram validados no GitHub; a verificação protegida de credenciais dev também passou, sem migrar ou implantar aplicação. Após as PRs #56, #57 e #59, o [aceite canônico e a promoção pós-merge](../controls/change-control.md) passaram na esteira. Naquele momento, a [revisão de cobertura/backlog](coverage-backlog-2026-09-22.md) registrava #31/#32/#43 como bloqueios. A #31 e a primeira homologação dev foram concluídas posteriormente; o estado atual está na revisão de saída acima.

**Atualização histórica da toolchain em 23/09/2026:** a [PR #93](https://github.com/IgnisDevNE/CircuitoNE/pull/93) integrou Node 24.21.0 em `main` (`3c0a94b`). O [CI pós-merge](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/35939124272) passou com typecheck, banco descartável, Playwright, auditoria e container; a [promoção canônica](https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/35939270368) também passou. A tabela abaixo descreve o checkpoint original em Node 22; a [#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35), então aberta para SSR, foi concluída depois.

Data: 22/09/2026. **Resultado: preparação parcial revisável; saída da fase bloqueada, sem homologação concluída.** Branch `codex/phase-zero-foundation`, base `44d1632`. Nenhum schema/dado/configuração remota foi alterado. O preview existente foi preservado.

## Entrega e verificação

| Tarefa | Evidência neste checkpoint | Limite restante |
|---|---|---|
| F0-T14 | Node 22.23.2 via pnpm, CI e container; TS 7.0.2; Tailwind/plugin 4.3.3; grupo Dependabot; action pnpm v6.1.0 | Aceite GitHub; inspeção visual limitada |
| F0-T6 | 4 testes unitários do roteador; 27 rotas e 2 jornadas em desktop/mobile, total 58 E2E | Rotas privadas só renderizam com sessão mock; quatro atuações, estados de consulta, troca de ID e teclado ainda não cobertos integralmente |
| F0-T13 | LCOV/HTML/JSON; 4,33% statements, 4,58% linhas, 2,99% branches, 2,92% funções; upload de artefatos no workflow | Unidade somente; E2E não entra nesse percentual. Aceite do CI e upload Codecov pendentes |
| F0-T4 | CLI 2.117.0; adaptador com ordem/bytes/checksums; 2 testes de preparo; Linux com duas reconstruções de migração sintética temporária após o conjunto canônico vazio; job database no workflow | Windows direto falhou; aceite do CI, schema/tipos/seeds reais e homologação compartilhada pendentes |
| F0-T15 | Auditoria dos dois projetos Supabase, inclusive Auth pelo painel autenticado | SMTP, URLs, regiões/recuperação e políticas de Auth não configurados |
| F0-T2 | Limites da autoridade documentados, CODEOWNERS cobre novos arquivos de controle | Credenciais e QA canônico ainda não isolados; bloqueio obrigatório preservado |

Verificações executadas: instalação com lockfile congelado; `pnpm check` (7 infraestrutura, 4 unidade, 1 regressão CSS, tipos e build); 58 E2E; cobertura; `pnpm audit --audit-level=high` sem achados; ensaio de migrações em Linux; imagem Podman e 2 testes HTTP de home/deep link/assets/bloqueio de arquivos internos. Imagem validada `b16c35de5ad2d2a1027cda7efa54155621029b509b99170bbe7c56ef5500786f`, UID 1000, raiz somente leitura, capabilities removidas e `no-new-privileges`. Container do ensaio removido após a verificação.

### TDD e qualidade do oráculo

- TypeScript 7 falhou com `TS5102` (`baseUrl` removido); retirar essa opção preservando `paths` restabeleceu tipos/build.
- O teste de CSS primeiro falhou ao inserir uma classe em documento temporário: os hashes do CSS mudavam. `source('.')` em `src/index.css` restringiu as entradas. O build nativo também reproduziu falta de atributo de importação JSON; `with { type: 'json' }` e `import.meta.dirname` corrigiram a configuração. Teste final executa dois builds e compara hashes.
- O preparo de migrações falhou antes de existir o helper; após implementação, valida bytes/checksums/ordem, duplicatas e argumentos remotos. Nenhum SQL de negócio foi criado.
- O teste de banco aplica uma migração sintética temporária, reconstrói duas vezes e valida Postgres 17, carga única, constraint e RLS das tabelas de `public` que não pertencem a extensões. Provoca perda de RLS e exige a mensagem específica. O teste negativo de grant primeiro falhou por não detectar o acesso concedido; após acrescentar a checagem de privilégios de `anon`/`authenticated` na tabela de ensaio, passou. Não prova as políticas de negócio ainda inexistentes. O Linux local usou acesso ao daemon Podman, sem satisfazer isolamento de QA nem homologação GitHub.
- A caracterização registra comportamento existente; não se atribui um ciclo vermelho fictício a funcionalidades que já funcionavam. Expectativas iniciais de títulos foram alinhadas ao protótipo antes do aceite.
- Arquivo novo e não importado em `src` apareceu na cobertura com 0%. Injeção temporária de falha em `history.pushState` fez o teste exigir `/artistas/ana` e receber `/`, mantendo **4,33%** de statements. Isso confirma um oráculo comportamental nesse caso, sem equiparar cobertura a qualidade geral. Arquivos de ensaio ficaram fora do commit.

Screenshots de quatro telas nos dois tamanhos foram anexadas ao relatório Playwright. Fontes/imagens externas são bloqueadas, portanto há imagens ausentes por desenho do teste. Não havia baseline anterior ao upgrade para comparação automática; essa inspeção não equivale a revisão visual completa nem fecha a acessibilidade de F0-T10.

## Revisão independente

Revisores: subagentes `review_toolchain` e `review_environment_plan`, modelo Sol, esforço baixo, somente leitura; correções feitas pelo implementador. Achados corrigidos: incluir testes/configs no TypeScript; verificar que Ctrl-click preserva a ação nativa; corrigir o caminho do teste CSS inicialmente ignorado pelo Git; proteger arquivos de controle por CODEOWNERS; remover a pasta do ensaio de banco em cleanup; limitar a conclusão da auditoria Supabase à evidência coletada. O workflow agora inclui E2E/banco/artefatos, antes entregues como patch; o arquivo intermediário foi removido. A revisão do workflow detectou margem insuficiente no timeout do job de banco: elevado de 10 para 20 minutos, preservando o limite interno do teste. Capturas atuais contêm só fixtures; revisar sanitização antes de capturar sessões/dados reais.

A revisão não transforma subagentes no verificador isolado exigido por F0-T2. O App continua sem escrita em workflows; em 22/09/2026 o responsável autorizou explicitamente sua credencial para publicar esta alteração de CI. A exceção não amplia permissões do App nem remove proteções: push de `magalz` requer aprovação de outra pessoa pela regra do último push. Execuções e aceite do SHA final ficam no [PR #45](https://github.com/IgnisDevNE/CircuitoNE/pull/45), vinculados a [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34)/[#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32). Revisão completa de saída será repetida quando F0-T7–T12 e os gates estiverem concluídos.

## Segurança — OWASP Top 10:2025

Revisão do escopo alterado e dos bloqueios conhecidos, conforme a [referência oficial](https://top10.owasp.org/2025/). Não é certificação nem aprovação do produto. Todas as categorias são aplicáveis à preparação e ao destino pretendido; as evidências abaixo explicam o alcance. Severidade indica prioridade antes de dados reais, não existência de incidente. Prazos são gates/tarefas, sem calendário de entrega presumido.

| Categoria / evidência e achado | Severidade | Correção e risco residual | Responsável | Prazo / destino |
|---|---|---|---|---|
| A01 Controle de acesso: mock sem autorização real; renderização não prova RLS | P1 | Implementar contratos após #31; #12/#13/#14/#16 continuam abertos | Mantenedor + implementação | F0-T2/T9 e F3/F5; antes de dados reais |
| A02 Configuração: painel confirmou defaults amplos na Data API, Auth e callbacks | P1 | #23/#32/#43: grants/RLS/URLs explícitos; config local não pode ir ao hospedado | Mantenedor + implementação | F0-T4/T5/T15; antes do primeiro schema real |
| A03 Cadeia de software: lockfile e digests; pnpm audit sem achados; workflow com action Node 24 e jobs E2E/banco | P2 | #34: validar execução no GitHub e obter aceite; verificação local não substitui CI | Mantenedor | F0-T14; antes do aceite do checkpoint |
| A04 Criptografia: nenhum segredo incluído no diff/contexto da imagem; preview HTTP | P1 para dados reais | #31/#43: isolar emissor, HTTPS e recuperação; preview só usa mocks | Mantenedor | F0-T2/T12/T15; antes de expor dados reais |
| A05 Injeção: Markdown inseguro conhecido; sem SQL de negócio novo | P1 | #11: corrigir e provar sanitização/URLs; ensaio estrutural não valida políticas do produto | Implementação + revisor | F0-T7; antes de SSR/conteúdo real |
| A06 Desenho: regras de aprovação/acesso documentadas, políticas ainda propostas | P1 | #38–#42: aprovar contratos; não transformar falha do mock em regra | Produto + implementação | F0-T15; antes da tarefa dependente |
| A07 Autenticação: mínimo 6, callbacks padrão, reautenticação/SMTP pendentes | P1 | #23/#43: Auth e AAL2 reais; login nominal fica apenas em teste/dev | Mantenedor + implementação | F0-T15/F1; antes de contas reais |
| A08 Integridade: checksums verificados; QA/emissor e promoção não isolados | P1 | #31/#32: autoridade externa e homologação por SHA; acesso ao daemon local não é isolamento | Mantenedor | F0-T2/T5; bloqueia saída da fase |
| A09 Logs e alertas: relatórios locais sintéticos; não há observabilidade operacional | P2 | #23/#30/#43: alertas e publicação confiável; sanitizar capturas antes de Auth real (#34) | Mantenedor + implementação | F0-T13 e F1/F6; antes do beta |
| A10 Exceções: helper rejeita entradas; E2E sem pageerror; backend inexistente | P1 para dados reais | #15/#22/#28/#32/#43: falhas, concorrência e recuperação ainda não demonstradas | Implementação + operação | F0-T9/T11 e fases de domínio; antes de release |

## Backlog que permanece aberto

Todos os números abaixo correspondem a issues abertas. Motivo/aceite detalhado está em cada issue e nas tarefas do [plano](../planning/implementation-plan.md). Não encerramos uma issue apenas por criar teste/documento ou abrir este PR.

| Issues | Trabalho restante, responsável e destino |
|---|---|
| [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) | Mantenedor: retirar chaves/admin/SSH do implementador, criar QA fora das instalações do App e verificador independente; F0-T2, bloqueio de entrada para regras reais |
| [#32](https://github.com/IgnisDevNE/CircuitoNE/issues/32) | Mantenedor + implementação: ensaio sintético Linux validado; falta executar job database no GitHub, contratos de grants/RLS do schema real e homologação/promoção compartilhada; F0-T4/T5, saída da fase bloqueada |
| [#34](https://github.com/IgnisDevNE/CircuitoNE/issues/34) | Mantenedor: validar action/E2E/artefatos no CI e obter aprovação independente do último push; F0-T14 |
| [#35](https://github.com/IgnisDevNE/CircuitoNE/issues/35), [#36](https://github.com/IgnisDevNE/CircuitoNE/issues/36), [#37](https://github.com/IgnisDevNE/CircuitoNE/issues/37) | Implementação/revisor: alterações locais prontas; falta aceite do PR/CI, homologação aplicável e revisão visual completa. Node 26 isolado não adotado; F0-T14 |
| [#29](https://github.com/IgnisDevNE/CircuitoNE/issues/29), [#30](https://github.com/IgnisDevNE/CircuitoNE/issues/30) | Mantenedor: autorização OAuth da organização, publicação confiável do relatório e validação repo/SHA/branch. Cobertura local pronta; F0-T13, não bloqueiam outras tarefas independentes |
| [#38](https://github.com/IgnisDevNE/CircuitoNE/issues/38), [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39), [#40](https://github.com/IgnisDevNE/CircuitoNE/issues/40), [#41](https://github.com/IgnisDevNE/CircuitoNE/issues/41), [#42](https://github.com/IgnisDevNE/CircuitoNE/issues/42) | Produto: aprovar políticas de pessoa/arquivos/coletivos/eventos/mensagens; F0-T15. Propostas e regras confirmadas permanecem distintas |
| [#43](https://github.com/IgnisDevNE/CircuitoNE/issues/43) | Mantenedor/produto: SMTP/remetente, URLs/DNS/regiões e recuperação; F0-T15 antes das integrações |
| [#11](https://github.com/IgnisDevNE/CircuitoNE/issues/11) | Implementação após #31: contrato e correção Markdown/URLs; F0-T7, bloqueia SSR/conteúdo real |
| [#17](https://github.com/IgnisDevNE/CircuitoNE/issues/17), [#18](https://github.com/IgnisDevNE/CircuitoNE/issues/18), [#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19) | Implementação após contratos independentes e decisões aplicáveis: dinheiro/cadastro/tempo; F0-T8, integração definitiva em F1/F4 |
| [#12](https://github.com/IgnisDevNE/CircuitoNE/issues/12), [#13](https://github.com/IgnisDevNE/CircuitoNE/issues/13), [#14](https://github.com/IgnisDevNE/CircuitoNE/issues/14), [#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) | Implementação após #31/#40: isolamento de identidade, mock e formulários; F0-T9 e autorização persistente em F3/F5 |
| [#27](https://github.com/IgnisDevNE/CircuitoNE/issues/27) | Implementação: semântica/teclado após F0-T9; F0-T10. Screenshots não satisfazem esse aceite |
| [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26), [#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) | Implementação: SSR/metadados após F0-T7–T10; relógio de testes pronto, estados/queries/paginação não. F0-T6/T9/T11 e F6-T3 |
| [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15), [#16](https://github.com/IgnisDevNE/CircuitoNE/issues/16) | Implementação/produto: persistência de cadastro e invariantes do último administrador; F1/F3, sem fingir sucesso real no mock |
| [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20), [#21](https://github.com/IgnisDevNE/CircuitoNE/issues/21) | Implementação/produto: manutenção das atuações e upload real seguro; F2, depende dos contratos e #39 |
| [#24](https://github.com/IgnisDevNE/CircuitoNE/issues/24), [#25](https://github.com/IgnisDevNE/CircuitoNE/issues/25) | Implementação/produto: agenda e conversas reais; F4/F5, depende de #41/#42 |

As regras de negócio já confirmadas continuam em [mvp.md](../business-rules/mvp.md), incluindo CPF/nascimento obrigatórios e aprovação de coletivos. Esta preparação não confirmou novas políticas de produto. ADRs 0002/0003 registram arquitetura e toolchain; a spec aprovada continua destino, não implementação concluída.

O responsável confirmou os domínios prod/dev, dev com dados sintéticos no `CircuitoNE-dev` e login nominal temporário de teste, registrados em [ambientes e dados de teste](../specs/environments-and-test-data.md). Isso não autoriza bypass em produção nem elimina o isolamento de QA. Os testes pós-migração e Playwright estão no workflow do PR #45; o resultado do CI deve corresponder ao SHA em revisão.

Próxima entrada: mantenedor resolve #31 e o aceite do CI #34; execução GitHub e destinos operacionais completam os próximos pré-requisitos de #32/#43. Depois, retomar F0-T7–T12 com testes canônicos aprovados e reviews normais, seguido de review completo/OWASP e homologação. Aprovar este checkpoint não dispensa esses gates nem autoriza produção.
