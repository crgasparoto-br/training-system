# Sistema Acesso Saúde e Performance

Sistema SaaS para gestão de alunos, professores, treinos, agenda, avaliações, contratos, controle financeiro e operação de assessorias/estúdios.

## Visão geral

- Educadores e gestores: criam e gerenciam alunos, colaboradores, treinos, avaliações, agenda e contratos.
- Alunos: visualizam e acompanham informações do seu relacionamento com a empresa.
- Operação: controle de permissões por função, telas, blocos internos e escopo de dados.
- Publicação: frontend web em Vercel e API em Render no cenário atual.

## Arquitetura

```text
apps/
├── api/          # Backend Node.js + Express + Prisma
├── web/          # Frontend React/Vite
└── mobile/       # App mobile, quando aplicável

packages/
├── types/        # Tipos compartilhados
├── utils/        # Utilitários compartilhados
└── constants/    # Constantes compartilhadas

docs/             # Documentação versionada
scripts/          # Validações, harness local e automações
```

## Documentação principal

Use [`docs/README.md`](./docs/README.md) como índice da documentação.

Fontes de verdade atuais:

- [`AGENTS.md`](./AGENTS.md): mapa curto para humanos e agentes.
- [`docs/architecture/overview.md`](./docs/architecture/overview.md): visão geral da arquitetura.
- [`docs/architecture/api.md`](./docs/architecture/api.md): padrões da API.
- [`docs/architecture/web.md`](./docs/architecture/web.md): padrões do frontend web.
- [`docs/architecture/database.md`](./docs/architecture/database.md): banco, Prisma e multi-tenant.
- [`docs/architecture/auth-and-access-control.md`](./docs/architecture/auth-and-access-control.md): autenticação, autorização e escopo de dados.
- [`docs/architecture/deployment.md`](./docs/architecture/deployment.md): deploy, variáveis e ambientes.
- [`docs/product/access-control.md`](./docs/product/access-control.md): regras de produto para controle de acesso.
- [`docs/visual-guidelines.md`](./docs/visual-guidelines.md): diretrizes visuais.
- [`docs/quality/validation.md`](./docs/quality/validation.md): comandos de validação.

## Quick start

### Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker e Docker Compose

### Setup local

```bash
pnpm install
pnpm dev:up
```

Alternativa manual:

```bash
cp .env.example .env.local
docker-compose up -d
cd apps/api
pnpm db:migrate
pnpm db:seed
cd ../..
pnpm dev:local
```

### Acessos locais

- API: `http://localhost:3000` ou porta definida no `.env`.
- Frontend web: `http://localhost:5173`.
- pgAdmin: `http://localhost:5050`, quando habilitado pelo Docker Compose.
- Redis Commander: `http://localhost:8081`, quando habilitado pelo Docker Compose.

## Comandos principais

```bash
# Desenvolvimento
pnpm dev
pnpm dev:api
pnpm dev:web
pnpm dev:local
pnpm dev:up
pnpm dev:down

# Qualidade
pnpm validate
pnpm type-check
pnpm lint
pnpm test
pnpm arch:check
pnpm access:check
pnpm docs:check

# Harness local
pnpm harness:reset-db
pnpm harness:seed-demo
pnpm harness:smoke-api
pnpm harness:validate-env

# Build
pnpm build
```

## Banco de dados

Comandos da API:

```bash
cd apps/api
pnpm db:migrate
pnpm db:migrate:prod
pnpm db:seed
pnpm db:studio
```

## Controle de acesso

O controle de acesso usa três camadas principais:

- `screenKey`: acesso a telas ou capacidades principais.
- `blockKey`: acesso a abas, blocos internos e ações sensíveis.
- `dataScope`: escopo de dados (`self`, `managed`, `contract`).

Documentação:

- [`docs/architecture/auth-and-access-control.md`](./docs/architecture/auth-and-access-control.md)
- [`docs/product/access-control.md`](./docs/product/access-control.md)

## Deploy atual

Cenário atual recomendado:

- Frontend: Vercel.
- API: Render.
- Banco: PostgreSQL acessado pela API via Prisma.

Variáveis principais:

- Frontend Vercel: `VITE_API_URL=https://sistema-acesso-api.onrender.com`
- Render API: `DATABASE_URL`
- Render API: `NODE_ENV=production`
- Render API: `FRONTEND_URL=https://sistema-acesso.solveritconsultoria.com.br`
- Render API: `CORS_ORIGINS=https://sistema-acesso.solveritconsultoria.com.br`
- Render API: `JWT_SECRET`

Mais detalhes em [`docs/architecture/deployment.md`](./docs/architecture/deployment.md).

## Rotina automática de revisão cadastral

A API pode habilitar o scheduler leve de revisão cadastral via variáveis de ambiente:

```bash
PROFILE_REVIEW_SCHEDULER_ENABLED=true
PROFILE_REVIEW_SCHEDULER_INTERVAL_MINUTES=60
PROFILE_REVIEW_UPCOMING_WINDOW_DAYS=7
PROFILE_REVIEW_CREATE_OVERDUE_REMINDER=true
```

A rotina cria `StudentProfileReview` com status `pending` para alunos elegíveis, sem duplicar revisão quando já existe pendência aberta.

## Integração Jira

Configure as variáveis abaixo no `.env` para habilitar integração com Jira Cloud:

```bash
JIRA_BASE_URL="https://sua-organizacao.atlassian.net"
JIRA_USER_EMAIL="seu-email@empresa.com"
JIRA_API_TOKEN="seu-token-atlassian"
JIRA_PROJECT_KEY="SDT"
```

Endpoints principais:

- `GET /api/v1/jira/status`
- `GET /api/v1/jira/metadata`
- `GET /api/v1/jira/issues/:issueKey`
- `POST /api/v1/jira/issues`

## Fluxo de branch recomendado

1. Desenvolvimento em branches a partir de `develop`.
2. PRs pequenos para `develop`.
3. Validação com `pnpm validate` e GitHub Actions.
4. Depois de estabilizado, PR de `develop` para `main`.
5. Publicação de produção a partir da `main`.

## Suporte e manutenção

- Issues: GitHub Issues.
- Documentação: [`docs/README.md`](./docs/README.md).
- Planos ativos: [`docs/execution-plans/active/`](./docs/execution-plans/active/).

## Licença

Proprietary - Todos os direitos reservados.
