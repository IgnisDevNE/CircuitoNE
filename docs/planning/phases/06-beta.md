# Fase 6 — Beta e operação

**Estado:** planejada. **Entrada:** fases 4 e 5 aprovadas; nenhum P0/P1 aberto; políticas de conta e moderação executáveis. **Riscos:** liberação sem recuperação, exposição de dados reais e indisponibilidade do host único. [Índice e gates comuns](../implementation-plan.md).

## F6-T1 — Debian/Podman, domínio e release

**Dependência:** F0-T5/T12 e gates de produto.

- Verificar primeiro: capacidade/arquitetura/serviços existentes do Debian, portas, DNS, TLS, reinício, configuração ausente e rollback. O servidor Codecov usa Docker e atende outros serviços; não converter ou remover esse ambiente para instalar CircuitoNE.
- Entrega: runtime Node e Caddy isolados, Podman rootless supervisionado, imagens por digest, limites, secrets por ambiente e endpoint de saúde. Definir domínio/subdomínio de homologação antes da configuração.
- Aceite: aplicar artefato homologado sem novo build no host; produção sem runner de PR; logs com rotação; capacidade medida, sem promessa arbitrária de usuários simultâneos. Um host continua sendo ponto único de falha.
- Documentação: inventário do serviço, operação, DNS/TLS, atualização, rollback e responsabilidades.

## F6-T2 — Privacidade, suporte e ciclo de vida da conta

**Dependência:** políticas F1-T4 e F5-T3, decisões de retenção aprovadas.

- Testar primeiro: exportação só do titular, solicitação de exclusão autenticada, conta que é último N2, referência de autoria histórica, retenção vencida e recuperação indevida por CPF alegado.
- Entrega: processos executáveis de suporte, suspensão, exclusão/exportação e retenção, incluindo arquivos e backups. Não prometer apagar imediatamente todo backup se isso não for operacionalmente verdadeiro.
- Aceite: responsável/canal definidos, textos de privacidade coerentes com a operação e sem dados reais em seeds/logs. Não incorporar dados de terceiros na exportação por associação de conversa/coletivo.
- Documentação: política publicada, procedimento interno, prazos e evidência de execução com dados sintéticos.

## F6-T3 — Qualidade pública e desempenho

**Dependência:** fases 2–5 integradas.

- Verificar: 27 rotas originais e novas jornadas de recuperação/aprovação/moderação; teclado, leitor de tela amostrado, contraste, mobile/zoom/movimento reduzido; conteúdo/metadados SSR, canonical, indexação e social cards.
- Entrega: correções demonstradas pela revisão e orçamento de desempenho acordado antes da medição com massa de dados/conexão representativas.
- Aceite: paginação/índices e imagens sustentam o cenário medido; erros e estados vazios funcionam; páginas privadas fora de indexação/cache público; páginas públicas publicadas não herdam `noindex` do protótipo.
- Documentação: cenários, volumes, resultados, limitações e orçamento aprovado. Cache/filas/réplicas só por evidência.

## F6-T4 — Segurança, observabilidade e restauração

**Dependência:** ambiente final e schemas completos.

- Testar primeiro: alerta chega ao responsável, falha de Auth/banco/Storage, disco cheio, perda do container/host e restauração em destino separado. Definir RPO/RTO antes do ensaio, sem fabricar números.
- Entrega: revisão OWASP completa, dependências/imagens, RLS/Storage/Auth/RPC, trilha de operações sensíveis, métricas mínimas e backups de banco e objetos.
- Aceite: restauração recupera dados e arquivos referenciados; credenciais mínimas e logs sem PII; rollback de app não é apresentado como reversão de schema. Revalidar destino/região do Supabase antes de dados reais.
- Documentação: relatório de segurança, runbook de incidentes, retenção de backups, resultados de restauração e riscos residuais aceitos pelo responsável.

## F6-T5 — Piloto e promoção

**Dependência:** F6-T1–T4, homologação do SHA final e aprovação humana.

- Entrega: grupo piloto e critérios de sucesso definidos, smoke das jornadas críticas, liberação controlada e monitoramento com responsável.
- Aceite: mesmo SHA/artefato homologado; migrations compatíveis; nenhum P0/P1 ou pendência de acesso/privacidade/recuperação; plano de retorno disponível. Interromper expansão se critérios de saúde falharem.
- Documentação: nota de release, SHA/checksums, participantes do aceite, evidências, pendências com dono e decisão de promover/adiar.

## Revisão e saída

Review normal por tarefa e review completo + OWASP em `docs/reviews/phase-6.md`. Aprovação desta fase é a decisão de liberar o MVP, não consequência automática de CI/cobertura verdes. Uma pendência externa de Codecov pode permanecer explicitamente deferida se os testes, aceite independente e evidências locais estiverem completos.
