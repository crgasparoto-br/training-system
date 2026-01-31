# Corrida Training System

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
cd corrida-training-system

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

## 📦 Estrutura de Pastas

```
corrida-training-system/
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
```

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
