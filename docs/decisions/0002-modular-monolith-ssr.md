# ADR 0002 — Monólito modular com SSR e Supabase

Data: 22/09/2026. Estado: **arquitetura aprovada pelo responsável**, implementação em andamento na fase zero. Substitui as propostas de SPA exclusiva, roteador próprio e runtime estático da [ADR 0001](0001-foundation.md).

## Contexto

O protótipo tem páginas públicas de artistas, coletivos e eventos que precisam de HTML indexável, metadados próprios e respostas HTTP corretas. As áreas privadas exigem isolamento por pessoa/coletivo e autorização verificável no banco. A interface existente será aproveitada.

## Decisão

Adotar React Router Framework sobre React, TypeScript estrito, Vite e Tailwind. Um único runtime Node organiza os módulos de contas, perfis, coletivos, eventos, mensagens e administração. Supabase gerenciado fornece Postgres, Auth, Storage e Realtime. Caddy termina HTTPS e encaminha ao Node; containers rodam no Podman do Windows durante a preparação e podem ser levados ao Debian.

Usar a identidade do usuário e RLS também nos acessos feitos pelo Node. Operações com invariantes transacionais usam funções SQL específicas. Chaves privilegiadas ficam fora dos caminhos comuns da aplicação. Dados públicos, profissionais restritos e pessoais privados têm contratos separados. Estado de sessão e clientes autenticados pertencem à requisição, sem compartilhamento global ou cache público de respostas privadas.

Preservar as URLs e os componentes úteis do protótipo. Migrar com testes de caracterização, depois retirar o roteador antigo. Não adicionar ORM, microserviços, Redis, fila ou abstração genérica de repositório sem necessidade demonstrada.

## Consequências

Há um runtime a operar além do proxy. Ele permite SSR sem duplicar um backend separado. RLS, grants, limites de requisição, sessões e CSRF continuam obrigatórios; SSR não os substitui. O preview estático e os mocks atuais não representam a arquitetura concluída nem autorização real.

O contrato detalhado permanece na [spec aprovada](../specs/architecture-mvp.md); isolamento de testes, promoção e credenciais seguem o [processo de entrega](../engineering/delivery.md). Regiões, SMTP e recuperação pendentes são rastreados na [issue #43](https://github.com/IgnisDevNE/CircuitoNE/issues/43).
