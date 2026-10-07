Quero criar um hub cultural da cena eletrônica do nordeste. O objetivo é ter as seguintes funcionalidades:

Public Facing (publico geral, sem cadastro no site):
- Hub de artistas: lista de artistas cadastrados na plataforma com foto, bio, soundcloud, instagram, próximos eventos
- Perfil Individual do Artista: Vê o perfil com os dados que são mantidos pelo artista + midias sociais.
- Hub de Coletivos/Produtoras: lista das produtoras de eventos cadastradas na plataforma.
- Perfil Individual do Coletivo/Produtora: Vê o perfil com os dados que são mantidos pelo coletivo/produtora + midias sociais + próximos eventos + membros (membros só são clicáveis se tiverem perfis de artistas atrelados)
- Eventos Programados: lista de eventos cadastrados na plataforma que ainda irão acontecer

User Facing (os usuários da plataforma que estão cadastrados. se ele tiver mais de uma atuação, os menus somam):
- Página de Cadastro por etapas:
-- Etapa 1 é Dados Gerais: nome, e-mail, gênero, data de nascimento, CPF, Cidade, Estado, tipo de cadastro (Artista, Serviços, Audiovisual, Integrante de Coletivo. Aqui só pode escolher 1. se quiser adicionar mais atuações, adiciona depois no próprio perfil)
-- Etapa 2 é Medias Sociais Pessoais: instagram, bandicamp, soundcloud, facebook, site, youtube
-- Etapa 3 é Dados específicos (só visiveis para usuários cadastrados na plataforma) e é diferente pra cada cadastro:
--- Artistas: E-Mail para booking, e-mail de contato, presskit, média de cachê, CNPJ (facultativo)
--- Serviços: Tipo de Serviço (estrutura, som, luzes, performances, outros), contato, portifólio.
--- Audiovisual: Tipo de Serviço (Fotografia, vídeo, audiovisual completo, som), contato, portifólio.
--- Integrante de Coletivo/Produtora: Selecionar Coletivo/Produtora Existente (enviar solicitação de acesso), Criar Coletivo/Produtora.
---- Criar Coletivo/Produtora: Nome, estado, cidade, atuação (Eventos Musicais, Eventos Culturais, Serviços, Artistas), Tipo (coletivo ou produtora), Bio, Imagem de Perfil e CNPJ. Se for coletivo, o CNPJ é opcional, se for produtora, é obrigatório.
-- Etapa 4 é perfil público e é diferente pra cada cadastro:
--- Artistas: Foto de apresentação, fotos gerais, bio, estilos musicais, cor predominante.
--- Serviços: Não tem perfil público.
--- Audiovisual: Não tem perfil público.
--- Integrante de Coletivo/Produtora: Não tem perfil público.

- Artista (Logado):
-- Dashboard: Próximos eventos, Ultimas Mensagens.
-- Editar Perfil de Artista (Nome): permite editar tudo do perfil de artista especifico.
-- Editar Dados: permite editar os dados gerais. aqui pode-se incluir novas atuações.
--- Adicionar nova atuação: Se clicar em adicionar nova atuação, ele abre uma tela igual ao de cadastro, mas parte de escolher um novo tipo (artista, serviços, audiovisual ou integrante de coletivo, e segue o mesmo fluxo de cadastro). Um usuário pode ter vários perfis de artista por poder ter vários projetos diferentes.
-- Segurança: permite mudar e-mail e senha.
-- Central de Mensagens: histórico de todas as mensagens enviadas, é um chat interno da plataforma.
- Serviços (Logado):
-- Dashboard: Próximos eventos, Ultimas Mensagens.
-- Editar Perfil: permite editar tudo do perfil
-- Editar Dados: permite editar os dados gerais. aqui pode-se incluir novas atuações.
--- Adicionar nova atuação: Se clicar em adicionar nova atuação, ele abre uma tela igual ao de cadastro, mas parte de escolher um novo tipo (artista, serviços, audiovisual ou integrante de coletivo, e segue o mesmo fluxo de cadastro). Um usuário pode ter vários perfis de artista por poder ter vários projetos diferentes.
-- Segurança: permite mudar e-mail e senha.
-- Central de Mensagens: histórico de todas as mensagens enviadas, é um chat interno da plataforma.
- Audiovisual (Logado):
-- Dashboard: Próximos eventos, Ultimas Mensagens.
-- Editar Perfil: permite editar tudo do perfil
-- Editar Dados: permite editar os dados gerais. aqui pode-se incluir novas atuações.
--- Adicionar nova atuação: Se clicar em adicionar nova atuação, ele abre uma tela igual ao de cadastro, mas parte de escolher um novo tipo (artista, serviços, audiovisual ou integrante de coletivo, e segue o mesmo fluxo de cadastro). Um usuário pode ter vários perfis de artista por poder ter vários projetos diferentes.
-- Segurança: permite mudar e-mail e senha.
-- Central de Mensagens: histórico de todas as mensagens enviadas, é um chat interno da plataforma.
- Integrante de Coletivo/Produtora (Logado):
-- Dashboard: Próximos eventos, Ultimas Mensagens.
-- Editar Perfil: permite editar tudo do perfil
-- Editar Dados: permite editar os dados gerais. aqui pode-se incluir novas atuações.
--- Adicionar nova atuação: Se clicar em adicionar nova atuação, ele abre uma tela igual ao de cadastro, mas parte de escolher um novo tipo (artista, serviços, audiovisual ou integrante de coletivo, e segue o mesmo fluxo de cadastro). Um usuário pode ter vários perfis de artista por poder ter vários projetos diferentes.
-- Segurança: permite mudar e-mail e senha.
-- Central de Mensagens: histórico de todas as mensagens enviadas, é um chat interno da plataforma.
-- Coletivos/Produtoras: Lista de Coletivos/Produtoras que o usuário faz parte. Aqui ele pode escolher também solicitar acesso a outro coletivo/produtora ou criar novo coletivo/produtora. Um usuário pode estar em vários coletivos ao mesmo tempo.
- Dashboard de Coletivo/Produtora (aberto ao clicar em um coletivo/produtora): Lista de eventos por ordem de proximidade (eventos passados ficam por ultimo em ordem cronológica), lista de Membros com o Cargo e last seen, mensagens não lidas (pra quem pode ver).
-- Mensagens: chat da plataforma (pra quem tem acesso)
-- Editar Membros: um administrador do coletivo/produtora pode editar o cargo do membro ou removê-lo.
-- Editar Coletivo/produtora: Pode editar todas as informações, criar cargos customizados que podem ter privilégios como administrador (nivel 2, pode editar tudo inclusive criar eventos),  Comunicação (nivel 1, pode acessar a aba de mensagens e ver/responder mensagens) e membro (nivel 0, não pode criar eventos, ver mensagens ou gerenciar).
-- Editar Perfil: edita os dados publicos do perfil.
-- Criar Evento: criar evento com nome do evento, tipo (festa, festival, evento cultural, feira, encontro, capacitação, outros - onde digita manualmente), descrição (markdown com botões de estilo), data e hora de inicio, data e hora do final, estado, cidade, local, artistas (selecionados da pool do hub ou só digitado o nome), link de venda do ingresso OU selecionar "gratuito", imagem de capa (fica em cima na página de apresentação publica do evento), 

Design:
Fundo é preto denso, bordas neon vermelhas. as páginas individuais mostram a cor da borda de acordo com a que o usuário escolheu enquanto editava. O estilo é tecnologico/terminal. Fontes monoespaçadas. Animações também tecnologicas como quem estivesse mexendo em vários terminais.