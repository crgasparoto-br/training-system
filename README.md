# Sistema Acesso Saúde e Performance

Sistema SaaS completo para gestão de treinos de corrida com suporte a educadores e alunos.

## 📋 Visão Geral

- **Educadores**: Criam e gerenciam planos de treino personalizados
- **Alunos**: Visualizam, executam e acompanham treinos
- **Integrações**: Garmin, Strava, Apple Health, Dieta.ia, Spotify
- **Notificações**: Email, SMS, WhatsApp
- **Pagamentos**: Stripe (cartão, PIX, boleto)

## 🏗️ Arquitetura

```
apps/
├── api/          # Backend Node.js + Express
├── web/          # Frontend React (Educador)
└── mobile/       # Frontend React Native (Aluno)

packages/
├── types/        # Types compartilhados
├── utils/        # Utilitários
└── constants/    # Constantes
```

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose

### Setup do Ambiente

```bash
# 1. Clone o repositório
git clone <repo-url>
cd training_system

# 2. Instale dependências
pnpm install

# 3. Configure variáveis de ambiente
cp .env.example .env.local

# 4. Inicie os serviços (PostgreSQL, Redis)
docker-compose up -d

# 5. Execute migrations
cd apps/api
pnpm prisma migrate dev

# 6. Inicie o desenvolvimento
pnpm dev
```

### Acessar Serviços

- **API**: http://localhost:3000
- **Frontend Web**: http://localhost:5173
- **pgAdmin**: http://localhost:5050
- **Redis Commander**: http://localhost:8081

### IntegraÃ§Ã£o Jira

Configure as variÃ¡veis abaixo no arquivo `.env` para habilitar a integraÃ§Ã£o com o Jira Cloud no projeto `SDT`:

```bash
JIRA_BASE_URL="https://sua-organizacao.atlassian.net"
JIRA_USER_EMAIL="seu-email@empresa.com"
JIRA_API_TOKEN="seu-token-atlassian"
JIRA_PROJECT_KEY="SDT"
```

Endpoints disponÃ­veis na API:

- `GET /api/v1/jira/status`: valida conexÃ£o e acesso ao projeto configurado
- `GET /api/v1/jira/metadata`: retorna projeto, tipos de issue e prioridades
- `GET /api/v1/jira/issues/:issueKey`: consulta uma issue especÃ­fica
- `POST /api/v1/jira/issues`: cria issue no Jira

## 📦 Estrutura de Pastas

```
training_system/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── athletes/
│   │   │   │   ├── plans/
│   │   │   │   ├── sessions/
│   │   │   │   ├── executions/
│   │   │   │   ├── integrations/
│   │   │   │   └── nutrition/
│   │   │   ├── common/
│   │   │   ├── middleware/
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── mobile/
│       ├── src/
│       │   ├── screens/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── services/
│       │   └── App.tsx
│       └── package.json
│
├── packages/
│   ├── types/
│   ├── utils/
│   └── constants/
│
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

## 🔧 Desenvolvimento

### Comandos Disponíveis

```bash
# Desenvolvimento
pnpm dev              # Inicia todos os apps em modo dev
pnpm dev:api          # Apenas API
pnpm dev:web          # Apenas Web
pnpm dev:mobile       # Apenas Mobile

# Build
pnpm build            # Build de todos os apps
pnpm build:api        # Build apenas API

# Testes
pnpm test             # Executa testes
pnpm test:watch       # Modo watch

# Linting
pnpm lint             # Verifica linting
pnpm format           # Formata código

# Database
pnpm db:migrate       # Executa migrations
pnpm db:seed          # Popula dados de teste
pnpm db:studio        # Abre Prisma Studio

# Jobs (API)
cd apps/api
pnpm job:dispatch-profile-reviews           # Executa rotina de revisão cadastral
pnpm job:dispatch-profile-reviews --dry-run # Simula sem gravar
```

### Rotina automática de revisão cadastral

No serviço da API, é possível habilitar o scheduler leve da revisão cadastral via variáveis de ambiente:

```bash
PROFILE_REVIEW_SCHEDULER_ENABLED=true
PROFILE_REVIEW_SCHEDULER_INTERVAL_MINUTES=60
PROFILE_REVIEW_UPCOMING_WINDOW_DAYS=7
PROFILE_REVIEW_CREATE_OVERDUE_REMINDER=true
```

- A rotina cria `StudentProfileReview` com status `pending` para alunos elegíveis.
- Não duplica revisão quando já existe pendência aberta (incluindo vencida).
- Quando há pendência vencida, pode criar lembrete idempotente diário (opcional).

## 📚 Documentação

- [API Documentation](./docs/api.md)
- [Database Schema](./docs/database.md)
- [Architecture](./docs/architecture.md)
- [Deployment](./docs/deployment.md)

## 🔐 Segurança

- Autenticação JWT
- Validação com Zod
- CORS configurado
- Rate limiting
- Proteção contra SQL injection
- Criptografia de senhas (bcrypt)

## 📊 Stack Tecnológico

### Backend
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- Jest (testes)

### Frontend Web
- React 18
- TypeScript
- TailwindCSS
- shadcn/ui
- React Hook Form
- TanStack Query
- Vite

### Frontend Mobile
- React Native
- Expo
- TypeScript
- NativeWind
- React Navigation

## 🚢 Deploy

### Railway (Recomendado)

```bash
# 1. Criar conta em railway.app
# 2. Conectar repositório Git
# 3. Configurar variáveis de ambiente
# 4. Deploy automático
```

### DigitalOcean (Backup)

```bash
# Documentação em docs/deployment.md
```

### Produção Atual

O frontend publicado no Vercel nao acessa o banco diretamente. O fluxo correto em producao e:

- Vercel (frontend) -> API publica
- API publica -> banco PostgreSQL via Prisma (`DATABASE_URL`)

Variaveis minimas para producao:

- Vercel: `VITE_API_URL=https://sistema-acesso-api.onrender.com`
- API: `DATABASE_URL=<string do PostgreSQL de producao>`
- API: `NODE_ENV=production`
- API: `PORT=<automatico do Render>`
- API: `FRONTEND_URL=https://sistema-acesso.solveritconsultoria.com.br`
- API: `CORS_ORIGINS=https://sistema-acesso.solveritconsultoria.com.br`
- API: `JWT_SECRET=<segredo forte de producao>`

Se `VITE_API_URL` nao estiver configurada no Vercel, o web faz fallback para `/api/v1`, e o frontend passa a tentar chamar a propria URL do Vercel em vez da API publicada.

Configuracao objetiva para o cenario atual:

- Frontend Vercel: `VITE_API_URL=https://sistema-acesso-api.onrender.com`
- Render API: `DATABASE_URL=<PostgreSQL de producao>`
- Render API: `NODE_ENV=production`
- Render API: `FRONTEND_URL=https://sistema-acesso.solveritconsultoria.com.br`
- Render API: `CORS_ORIGINS=https://sistema-acesso.solveritconsultoria.com.br`
- Render API: `JWT_SECRET=<segredo forte de producao>`
- Render API: usa `PORT` automaticamente; o backend agora aceita `PORT` e `API_PORT`
- GitHub Actions secret: `PRODUCTION_DATABASE_URL=<PostgreSQL de producao>`
- GitHub Actions secret: `RENDER_API_DEPLOY_HOOK_URL=<deploy hook do Render>`
- GitHub Actions secrets do Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PRODUCTION_VITE_API_URL`

## 💰 Modelo de Negócio

| Plano | Alunos | Preço |
|-------|--------|-------|
| Free | 3 | Gratuito |
| Pro | 20 | R$ 149/mês |
| Enterprise | Ilimitado | R$ 499/mês |

## 📞 Suporte

- Issues: GitHub Issues
- Documentação: `/docs`
- Email: support@corrida.local

## 📄 Licença

Proprietary - Todos os direitos reservados

## 👨‍💻 Desenvolvimento

Desenvolvido por: Claudinei Rogério Gasparoto
Versão: 0.1.0
Data: Janeiro 2026

---

**Pronto para começar? Veja [GETTING_STARTED.md](./docs/GETTING_STARTED.md)**
