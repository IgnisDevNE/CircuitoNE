# ADR 0013 — Crédito histórico e consistência dos eventos

Data: 26/09/2026. Escopo: preparo do schema #118 na fase zero; interfaces na fase 4. Decisão de produto: RN-25/34, confirmada pelo responsável para exclusão da atuação e da conta inteira.

O lineup guarda o nome creditado independentemente do perfil artístico. A FK opcional usa `ON DELETE SET NULL`: excluir a atuação/conta mantém somente esse nome não clicável, sem duplicar o UUID da conta no crédito. Evento e demais participantes permanecem. Uma nova conta ou atuação não recupera participações por nome ou CPF. O nome pode ser dado pessoal; os procedimentos/textos de privacidade devem tratar a exceção antes do beta. Mensagens continuam sem identificação do remetente após exclusão.

Eventos usam mutações específicas, sem escrita direta pelo cliente. Cada mutação trava primeiro o coletivo, reaproveitando a serialização da ADR 0008, e depois o evento; confere permissões atuais, aprovação e versão. Edição pública exige editar e publicar; cancelamento tem permissão própria. Reagendamento mantém ID/URL e registra a data anterior e o aviso. Não há retorno de cancelado para rascunho nem publicação automática.

A leitura pública separa agenda de detalhe: cancelados saem da lista, mas o detalhe previamente publicado mantém o aviso enquanto o coletivo estiver aprovado. Gestão autorizada pode listar rascunhos/cancelados. Suspensão do coletivo oculta tudo isso. Instantes são finitos, com offset explícito na entrada e exibição em `America/Fortaleza`; evento sem fim permanece sem fim persistido, sendo classificado como passado após o dia local do início. Cursores por início/ID dão desempate estável e páginas limitadas.

Aplicação apenas em banco descartável nesta fatia. #31/#43 são pré-requisitos da homologação #32. Testes SQL, disputas reais, tipos gerados e seeds com referência temporal explícita verificam o contrato; não constituem integração da UI nem homologação remota.
