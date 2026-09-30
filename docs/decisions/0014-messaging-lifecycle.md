# ADR 0014 — Identidades de mensagens e exclusão em etapas

Data: 27/09/2026. Escopo: schema #119; interfaces e executor externo nas fases de produto. Decisões aprovadas pelo responsável: RN-28/29/34.

A pessoa envia pela atuação escolhida; a conta só autoriza a operação. Coletivos têm identidade própria. Um par ordenado de identidades tem uma conversa única. Excluir uma atuação encerra envios e preserva histórico autorizado com “Atuação excluída”; excluir a conta remove seus vínculos e mostra “Conta excluída”. Não copiar o nome cadastral. O crédito de lineup é uma exceção distinta (ADR 0013).

Envios travam contas em ordem de UUID, depois atuações, coletivos e conversa. As quotas são 10 envios em janela móvel de 60 segundos e 20 novos pares no dia de America/Fortaleza, tanto por conta quanto por coletivo representado. Retry usa chave da conta e fingerprint do conteúdo. Leitura é individual; ler e enviar em nome do coletivo são permissões diferentes. Bloqueio de qualquer lado impede os dois sentidos; apenas o lado que criou cada bloqueio o remove.

Denúncia copia a mensagem e até duas vizinhas de cada lado. Apenas administração com MFA pode assumir um caso; só a pessoa designada lê a cópia, sem acesso livre à conversa. Ao encerrar, apagam-se vínculos estruturados da cópia; o conteúdo é expurgado em até 90 dias. Texto livre pode conter dados pessoais: remover FKs não torna o texto automaticamente anônimo.

Pedido de exclusão bloqueia a conta. Caso aberto permite reter identidade até o encerramento ou o limite imutável de 30 dias. No limite, remover identidade **sem encerrar o caso**. A cópia remanescente só inicia seu prazo de 90 dias quando o caso encerrar. Proprietário transfere ou solicita encerramento antes de excluir a conta; transferência trava ambas as contas antes do coletivo.

Denúncia e saneamento usam uma trava transacional comum, operações raras; não serializam o envio normal. A preparação chamada pelo titular processa somente sua conta, evitando inversão com a ordem das travas de envio. Varredura administrativa começa sem trava prévia de conta.

O banco prepara a eliminação e guarda fila privada de prefixos de arquivos e identidade Auth estritamente para retry. O executor usa Storage API e Auth Admin hard delete, depois elimina a tarefa. Não remover apenas metadados de Storage. Falha externa conserva o bloqueio e nunca declara exclusão concluída. A integração, agendamento, alerta e prova do prazo integral estão na #23, com #21/#43 para arquivos/restauração; não existem ainda e bloqueiam dados reais. A rotina SQL não é prova de eliminação do Auth. #104 continua como último gate técnico pré-release.

Nenhuma fila, tabela de mensagens ou cópia de denúncia recebe grants diretos para anon/authenticated/service_role. RPCs autorizam a identidade atual. Após o gate concluído da #31 e o aceite SQL independente do QA, a [homologação hospedada 36659781488](https://github.com/IgnisDevNE/CircuitoNE/actions/runs/36659781488) aplicou o schema no `CircuitoNE-dev` e passou o smoke. A recuperação isolada completa continua na #43.
