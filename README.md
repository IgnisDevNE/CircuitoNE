# CircuitoNE

Hub da cena eletrônica do Nordeste. React 19, Vite 8 e Tailwind 4. A interface atual é um protótipo com dados em memória; login, persistência e autorização reais ainda serão implementados.

## Começar

Use Node 22 (mínimo 22.12) e pnpm 10.34.3, conforme `.mise.toml` e `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev --host 127.0.0.1 --port 5174
```

Na máquina da preparação, a porta 8443 estava ocupada por outro aplicativo. Confira antes de iniciar um servidor. O Node global era 26; a validação também foi executada com Node 22.23.2. `pnpm dlx --package=node@22 -c "pnpm check"` permite validar sem alterar a instalação global.

Copie `.env.example` para `.env.local` quando começar a integração. O protótipo ainda não consome essas variáveis. Chaves secretas e senhas nunca recebem prefixo `VITE_`.

O preview também está preparado em container Podman. Nesta máquina, o endereço validado é [172.23.250.196:5178](http://172.23.250.196:5178), enquanto a VM estiver ligada e mantiver esse IP. Comandos e caminho para o Debian estão em [Ambiente e operação](docs/engineering/environment.md).

## Plano e decisões

- [Plano de execução e tarefas](docs/planning/implementation-plan.md)
- [Revisão do protótipo e lacunas](docs/reviews/prototype-audit.md)
- [Regras de negócio e pendências](docs/business-rules/mvp.md)
- [Backend, autenticação e modelo de dados](docs/architecture/backend-and-data.md)
- [Decisões de arquitetura](docs/decisions/0001-foundation.md)
- [TDD, isolamento, revisões e documentação](docs/engineering/delivery.md)
- [Infraestrutura e operação](docs/engineering/environment.md)
- [Revisão de segurança OWASP](docs/reviews/security-baseline.md)
- [Evidências desta preparação](docs/reviews/foundation-validation.md)

Os documentos distinguem decisões confirmadas, propostas técnicas e questões abertas. A preparação não significa liberação para produção.
