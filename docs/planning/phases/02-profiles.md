# Fase 2 — Atuações, perfis e arquivos

**Estado:** planejada. **Entrada:** identidade/sessão homologadas; D-08/D-10 resolvidas antes das respectivas tarefas. **Riscos:** publicação indevida e upload malicioso. [Índice e gates comuns](../implementation-plan.md).

## F2-T1 — Múltiplas atuações e edição profissional

**Dependência:** F1-T1–T4. **Regras:** RN-02/06/09–12 e D-10.

- Testar primeiro: duas atuações do mesmo usuário, artistas com nomes iguais, edição de ID de outra conta, troca de atuação sem estado antigo, persistência de todos os campos por tipo.
- Entrega: dados de artista/serviços/audiovisual e formulários completos; separar perfil público de dados profissionais e de identidade. Expandir a atuação mínima da fase 1 por migração compatível.
- Aceite: proprietário vem da sessão e não pode ser trocado pelo payload; erro preserva formulário; sucesso só após persistência. Contatos/presskit/cachê são lidos apenas pelo titular nesta fase.
- Documentação: contratos por atuação, regras de publicação, campos editáveis e matriz de acesso.

## F2-T2 — Catálogo e perfil públicos com SSR

**Dependência:** F2-T1. **Regras:** projeção pública e privacidade de RN-07.

- Testar primeiro: HTML inicial com título/conteúdo/metadados; perfil inexistente/indisponível; busca e paginação estáveis; nenhuma resposta anônima inclui CPF, nascimento, contato, cachê ou presskit.
- Entrega: listas e detalhes com dados reais em loaders públicos, estados vazio/erro e URLs preservadas. Aplicar a política de publicação também no banco/API.
- Aceite: resultados corretos sem executar JavaScript; mudanças de publicação não mantêm conteúdo privado em cache; imagens quebradas têm fallback acessível. Diretório restrito de N2 só entra em F3-T4.
- Documentação: payload/projeção pública, metadados e política de invalidação de cache.

## F2-T3 — Upload, galeria e substituição

**Dependência:** F2-T1 e D-08 aprovada. Política de publicação definida para distinguir rascunhos e imagens públicas.

- Testar primeiro: extensão enganosa, formato executável, arquivo maior que a cota, caminho de outro usuário, substituição concorrente, upload interrompido e arquivo referenciado por outro registro.
- Entrega: Storage, autorização por proprietário, limites/formato real verificados, galeria ordenada e remoção/substituição com tratamento de órfãos. Storage e Postgres exigem compensação explícita em falha parcial.
- Aceite: rascunhos/documentos privados fora de buckets públicos; URLs privadas expiram e não contornam revogação; arquivos não são salvos no container Node. Confirmar a proposta de JPG/PNG/WebP/5 MB antes de tratá-la como requisito.
- Documentação: buckets/políticas, cotas, ciclo de vida dos objetos e recuperação de upload.

## Revisão e saída

Review normal por tarefa; review completo + OWASP em `docs/reviews/phase-2.md`. Jornadas: criar atuação → editar → publicar → consultar anonimamente → substituir imagem, incluindo duas contas e REST/Storage negativos.

Validar páginas em mobile/teclado, consultas paginadas com volume representativo e arquivos sem execução. Homologar migrations/políticas no SHA final. A leitura profissional por N2 permanece bloqueada até existir vínculo aprovado na fase 3.
