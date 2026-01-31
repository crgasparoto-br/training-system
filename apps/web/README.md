# 🌐 Frontend Web - Corrida Training System

Frontend web para educadores físicos gerenciarem atletas e planos de treino.

## 🚀 Tecnologias

- **React 18** - Biblioteca UI
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **React Router** - Navegação
- **Zustand** - State management
- **Axios** - HTTP client
- **React Hook Form** - Formulários
- **Zod** - Validação

## 📦 Instalação

```bash
# Na raiz do projeto
pnpm install

# Ou apenas no web
cd apps/web
pnpm install
```

## 🔧 Configuração

1. Copie o arquivo `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```

2. Configure a URL da API:
```env
VITE_API_URL=http://localhost:3000
```

## 🏃 Executar

```bash
# Modo desenvolvimento
pnpm dev

# Build para produção
pnpm build

# Preview do build
pnpm preview
```

## 📁 Estrutura

```
src/
├── components/       # Componentes reutilizáveis
│   └── ui/          # Componentes de UI
├── pages/           # Páginas da aplicação
├── layouts/         # Layouts (Dashboard, Auth)
├── hooks/           # Custom hooks
├── services/        # API client e serviços
├── stores/          # Zustand stores
├── types/           # Types TypeScript
├── utils/           # Utilitários
├── App.tsx          # Componente principal
└── main.tsx         # Entry point
```

## 🔐 Autenticação

O sistema usa JWT para autenticação. O token é armazenado no `localStorage` e enviado automaticamente em todas as requisições via interceptor do Axios.

## 🎨 Componentes UI

- `Button` - Botões com variantes
- `Input` - Inputs com label e erro
- `Card` - Cards para conteúdo
- Mais componentes serão adicionados...

## 📱 Responsividade

O layout é totalmente responsivo e funciona em:
- 📱 Mobile (< 768px)
- 💻 Tablet (768px - 1024px)
- 🖥️ Desktop (> 1024px)

## 🔗 Rotas

- `/login` - Login
- `/register` - Registro
- `/dashboard` - Dashboard principal
- `/athletes` - Gestão de atletas
- `/plans` - Planos de treino
- `/executions` - Execuções de treinos
- `/reports` - Relatórios
- `/settings` - Configurações

## 🚧 Em Desenvolvimento

Este é um trabalho em progresso. Funcionalidades futuras:
- [ ] CRUD de atletas
- [ ] Criação de planos de treino
- [ ] Registro de execuções
- [ ] Relatórios e analytics
- [ ] Integrações externas
- [ ] Notificações
- [ ] Dark mode toggle

## 📝 Scripts

```bash
pnpm dev          # Iniciar dev server
pnpm build        # Build para produção
pnpm preview      # Preview do build
pnpm lint         # Lint do código
pnpm type-check   # Verificar tipos
```

## 🌐 Acesso

Após iniciar o servidor de desenvolvimento:
- **URL**: http://localhost:5173
- **API**: http://localhost:3000 (via proxy)

## 🔧 Desenvolvimento

1. Certifique-se que a API está rodando
2. Execute `pnpm dev`
3. Abra http://localhost:5173
4. Faça login ou registre-se

## 📚 Documentação

Para mais informações, consulte:
- [Documentação da API](../../docs/API.md)
- [Guia de Testes](../../docs/TESTING_GUIDE.md)
- [Getting Started](../../docs/GETTING_STARTED.md)
