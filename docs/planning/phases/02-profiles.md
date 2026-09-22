# Fase 2 — Atuações, perfis e arquivos

**Estado:** planejada. **Entrada:** identidade/sessão homologadas; integrar o registro revisado de D-08/D-10, aprovadas pelo responsável em 22/09/2026, antes das respectivas tarefas. Aprovação das regras não comprova implementação nem homologação. **Riscos:** publicação indevida e upload malicioso. [Índice e gates comuns](../implementation-plan.md).

## F2-T1 — Múltiplas atuações e edição profissional

**Bloqueios por issue:** [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39) na integração do registro revisado de D-10, aprovada em 22/09/2026 (RN-05); não exige concluir o upload de F2-T3. [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) nos fluxos de identidade/sessão concluídos.

**Issues tratadas:** [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) e partes de [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) na edição por atuação e persistência.

**Dependência:** F1-T1–T4. **Regras:** RN-02/05/06/09–12/20/35 e D-10. A escolha de perfil padrão (RN-20) foi aprovada na #40 em 22/09/2026; integrar esse registro revisado antes do contrato afetado, sem depender das decisões de operação do coletivo para editar atuações.

- Testar primeiro: duas atuações do mesmo usuário, artistas com nomes iguais, edição de ID de outra conta, troca de atuação sem estado antigo, persistência de todos os campos por tipo; links pessoais não copiados ao criar atuação e edição dos links de A sem alterar B; presskit independente para artista, serviços, audiovisual e integrante, sem exigir perfil público individual.
- Testar o padrão da conta: escolher/trocar somente perfil artístico próprio; ausência, exclusão ou despublicação não escolhem outro perfil automaticamente nem expõem perfil privado.
- Entrega: dados e formulários de cada tipo de atuação, incluindo presskit comum em RN-35 e escolha de perfil artístico padrão nas opções da conta (RN-20); separar perfil público de dados profissionais e de identidade. Expandir a atuação mínima da fase 1 por migração compatível.
- Aceite: proprietário vem da sessão e não pode ser trocado pelo payload; erro preserva formulário; sucesso só após persistência. Contatos/presskit/cachê são lidos apenas pelo titular nesta fase.
- Documentação: contratos por atuação, regras de publicação, campos editáveis e matriz de acesso.

## F2-T2 — Catálogo e perfil públicos com SSR

**Bloqueios por issue:** [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) para atuações editáveis; [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39) na integração do registro revisado de RN-05/07/09/35 para projeção pública/privada.

**Issues tratadas:** [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) nos catálogos SSR e consultas; revisar de novo no produto integrado.

**Dependência:** F2-T1. **Regras:** projeção pública e privacidade de RN-07.

- Testar primeiro: HTML inicial com título/conteúdo/metadados; perfil inexistente/indisponível; busca e paginação estáveis; nenhuma resposta anônima inclui CPF, nascimento, contato, cachê ou presskit (link externo, caminho do PDF ou URL de acesso); publicar somente links da atuação consultada, sem herdar redes pessoais.
- Entrega: listas e detalhes com dados reais em loaders públicos, estados vazio/erro e URLs preservadas. Aplicar a política de publicação também no banco/API.
- Aceite: resultados corretos sem executar JavaScript; mudanças de publicação não mantêm conteúdo privado em cache; imagens quebradas têm fallback acessível. Diretório restrito de N2 só entra em F3-T4.
- Documentação: payload/projeção pública, metadados e política de invalidação de cache.

## F2-T3 — Upload, galeria e substituição

**Bloqueios por issue:** [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39) na integração do registro revisado de D-08 (RN-09/35), aprovada em 22/09/2026; [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) para atuação e propriedade.

**Issues tratadas:** [#21](https://github.com/IgnisDevNE/CircuitoNE/issues/21) integralmente, com Storage e compensação de falhas reais.

**Dependência:** F2-T1 e D-08 aprovada. Política de publicação definida para distinguir rascunhos e imagens públicas.

- Testar primeiro: imagem válida JPG/PNG/WebP de 5.000.000 bytes aceita e de 5.000.001 bytes recusada; foto principal mais 10 imagens permitidas e 11ª imagem da galeria recusada, inclusive em concorrência; PDF válido de 10.000.000 bytes aceito e de 10.000.001 bytes recusado; múltiplos PDFs ativos ou link e PDF simultâneos recusados. Cobrir extensão/MIME enganosos, formato executável, PDF inválido/malicioso, caminho de outro usuário, substituição concorrente, upload interrompido e arquivo referenciado por outro registro. Testar negação de leitura do presskit por anônimo e conta alheia, inclusive pelo Storage.
- Entrega: Storage, autorização por proprietário, limites/formato real verificados, galeria ordenada e remoção/substituição com tratamento de órfãos. Storage e Postgres exigem compensação explícita em falha parcial.
- Aceite: cumprir RN-09/35; rascunhos e PDFs fora de buckets públicos; URLs privadas expiram e não contornam revogação; arquivos não são salvos no container Node. O presskit só é acessível ao titular nesta fase; acesso por N2 depende de F3-T4. Link externo limitado a HTTP(S), sem busca automática de conteúdo pelo servidor. Não anunciar privacidade do destino externo nem recolhimento de cópias já baixadas.
- Segurança do PDF: validar conteúdo, não apenas extensão/MIME; manter upload indisponível até concluir a validação e tratar falhas sem liberar o objeto. Definir e testar tratamento de conteúdo ativo e arquivos que não podem ser inspecionados antes de habilitar o upload; documentar a solução em F2-T3/#21 conforme a [orientação OWASP para uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Não enviar presskits privados a serviços públicos de análise.
- Documentação: buckets/políticas, cotas, ciclo de vida dos objetos e recuperação de upload.

## Revisão e saída

Review normal por tarefa; review completo + OWASP em `docs/reviews/phase-2.md`. Jornadas: criar atuação → editar → publicar → consultar anonimamente → substituir imagem, incluindo duas contas e REST/Storage negativos.

Validar páginas em mobile/teclado, consultas paginadas com volume representativo e arquivos sem execução. Homologar migrations/políticas no SHA final. A leitura profissional por N2 permanece bloqueada até existir vínculo aprovado na fase 3.
