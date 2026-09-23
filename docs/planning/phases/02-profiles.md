# Fase 2 — Atuações, perfis e arquivos

**Estado:** planejada. **Entrada:** identidade/sessão homologadas; integrar o registro revisado de D-08/D-10, aprovadas pelo responsável em 22/09/2026, antes das respectivas tarefas. Aprovação das regras não comprova implementação nem homologação. **Riscos:** publicação indevida e upload malicioso. [Índice e gates comuns](../implementation-plan.md).

## F2-T1 — Múltiplas atuações e edição profissional

**Bloqueios por issue:** [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39) na integração dos registros revisados de D-08/D-10, aprovadas em 22/09/2026 (RN-05/35), incluindo campos por tipo de atuação; não exige concluir o upload de F2-T3. [#23](https://github.com/IgnisDevNE/CircuitoNE/issues/23) nos fluxos de identidade/sessão concluídos.

**Issues tratadas:** [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) e partes de [#15](https://github.com/IgnisDevNE/CircuitoNE/issues/15)/[#19](https://github.com/IgnisDevNE/CircuitoNE/issues/19)/[#22](https://github.com/IgnisDevNE/CircuitoNE/issues/22) na edição por atuação e persistência.

**Dependência:** F1-T1–T4. **Regras:** RN-02/05/06/09–12/20/35 e D-10. A escolha de perfil padrão (RN-20) foi aprovada na #40 em 22/09/2026; integrar esse registro revisado antes do contrato afetado, sem depender das decisões de operação do coletivo para editar atuações.

- Testar primeiro: duas atuações do mesmo usuário, artistas com nomes iguais, edição de ID de outra conta, troca de atuação sem estado antigo, persistência de todos os campos por tipo; links pessoais não copiados ao criar atuação e edição dos links de A sem alterar B. Para estilos artísticos, selecionar mais de um par estilo/subestilo do [catálogo aprovado](../../specs/music-styles.md), subestilo opcional e sempre pertencente ao estilo, inclusive em chamada direta. Aceitar presskit só para artista, portfólio audiovisual só por URL HTTP(S) e lista de serviços/equipamentos opcional em PDF privado só para serviços; recusar campos de outro tipo no servidor e não oferecê-los a integrante, coletivo ou produtora.
- Testar o padrão da conta: escolher/trocar somente perfil artístico próprio; ausência, exclusão ou despublicação não escolhem outro perfil automaticamente nem expõem perfil privado.
- Entrega: dados e formulários por tipo, conforme RN-35, e escolha de perfil artístico padrão nas opções da conta (RN-20); separar perfil público de dados profissionais e de identidade. Expandir a atuação mínima da fase 1 por migração compatível. Arquivos são integrados em F2-T3, sem anunciar upload persistido antes dessa entrega.
- Aceite: proprietário vem da sessão e não pode ser trocado pelo payload; erro preserva formulário; sucesso só após persistência. Contatos, presskit, portfólio audiovisual, cachê e lista de serviços/equipamentos são lidos apenas pelo titular nesta fase. O formulário de serviços não mantém campo de portfólio.
- Documentação: contratos por atuação, regras de publicação, campos editáveis e matriz de acesso.

## F2-T2 — Catálogo e perfil públicos com SSR

**Bloqueios por issue:** [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) para atuações editáveis; [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39) na integração do registro revisado de RN-05/07/09/35 para projeção pública/privada.

**Issues tratadas:** [#26](https://github.com/IgnisDevNE/CircuitoNE/issues/26)/[#28](https://github.com/IgnisDevNE/CircuitoNE/issues/28) nos catálogos SSR e consultas; revisar de novo no produto integrado.

**Dependência:** F2-T1. **Regras:** projeção pública e privacidade de RN-07.

- Testar primeiro: HTML inicial com título/conteúdo/metadados; perfil inexistente/indisponível; busca e paginação estáveis; visitante sem login só obtém página pública de artista, não perfis de audiovisual, serviços ou integrante; conta autenticada encontra as quatro atuações no catálogo interno com nome/descrição/cidade e início de mensagem. Nenhuma projeção anônima ou interna comum inclui CPF, nascimento, contato, cachê, presskit, portfólio audiovisual ou lista de serviços/equipamentos (link externo, caminho do PDF ou URL de acesso); publicar somente links sociais da atuação consultada, sem herdar redes pessoais ou incluir materiais restritos.
- Entrega: página pública de artista e catálogo interno autenticado com dados reais, estados vazio/erro e URLs preservadas. Aplicar ambas as políticas de visibilidade também no banco/API.
- Aceite: páginas públicas retornam conteúdo sem executar JavaScript; respostas internas exigem sessão; mudanças de publicação não mantêm conteúdo privado em cache; imagens quebradas têm fallback acessível. Diretório restrito de proprietário elegível só entra em F3-T4; perfis delegados não ampliam esse acesso (#66).
- Documentação: payload/projeção pública, metadados e política de invalidação de cache.

## F2-T3 — Upload, galeria e substituição

**Bloqueios por issue:** [#39](https://github.com/IgnisDevNE/CircuitoNE/issues/39) na integração do registro revisado de D-08 (RN-09/35), aprovada em 22/09/2026; [#20](https://github.com/IgnisDevNE/CircuitoNE/issues/20) para atuação e propriedade.

**Issues tratadas:** [#21](https://github.com/IgnisDevNE/CircuitoNE/issues/21) integralmente, com Storage e compensação de falhas reais.

**Dependência:** F2-T1 e D-08 aprovada. Política de publicação definida para distinguir rascunhos e imagens públicas.

- Testar primeiro: imagem válida JPG/PNG/WebP de 5.000.000 bytes aceita e de 5.000.001 bytes recusada; foto principal mais 10 imagens permitidas e 11ª imagem da galeria recusada, inclusive em concorrência. Para ambos os PDFs de RN-35: PDF válido de 10.000.000 bytes aceito e de 10.000.001 bytes recusado; múltiplos PDFs ativos no mesmo campo recusados; presskit com link e PDF simultâneos recusado. Recusar upload de portfólio audiovisual e tentativa de usar campo/caminho de outro tipo de atuação, inclusive via Storage. Cobrir extensão/MIME enganosos, formato executável, PDF inválido/malicioso, caminho de outro usuário, substituição concorrente, upload interrompido e arquivo referenciado por outro registro. Testar negação de leitura de ambos os PDFs por anônimo e conta alheia.
- Entrega: Storage, autorização por proprietário, limites/formato real verificados, galeria ordenada e remoção/substituição com tratamento de órfãos. Storage e Postgres exigem compensação explícita em falha parcial.
- Aceite: cumprir RN-09/35; rascunhos e PDFs fora de buckets públicos; URLs privadas expiram e não contornam revogação; arquivos não são salvos no container Node. Materiais de RN-35, incluindo link de portfólio audiovisual, só são acessíveis ao titular nesta fase; acesso por proprietário elegível depende de F3-T4. Links de presskit artístico e portfólio audiovisual limitados a HTTP(S), sem busca automática de conteúdo pelo servidor. Não anunciar privacidade do destino externo nem recolhimento de cópias já baixadas.
- Segurança de ambos os PDFs: validar conteúdo, não apenas extensão/MIME; manter upload indisponível até concluir a validação e tratar falhas sem liberar o objeto. Definir e testar tratamento de conteúdo ativo e arquivos que não podem ser inspecionados antes de habilitar o upload; documentar a solução em F2-T3/#21 conforme a [orientação OWASP para uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Não enviar arquivos privados a serviços públicos de análise.
- Documentação: buckets/políticas, cotas, ciclo de vida dos objetos e recuperação de upload.

## Revisão e saída

Review normal por tarefa; review completo + OWASP em `docs/reviews/phase-2.md`. Jornadas: criar atuação → editar → publicar → consultar anonimamente → substituir imagem, incluindo duas contas e REST/Storage negativos.

Validar páginas em mobile/teclado, consultas paginadas com volume representativo e arquivos sem execução. Homologar migrations/políticas no SHA final. A leitura profissional por proprietário de coletivo permanece bloqueada até existir vínculo aprovado na fase 3.
