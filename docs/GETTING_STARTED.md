# 🚀 Guia de Início Rápido

## Pré-requisitos

- **Node.js**: 18.0.0 ou superior
- **pnpm**: 8.0.0 ou superior
- **Docker**: Para executar PostgreSQL e Redis localmente
- **Git**: Para versionamento

### Instalação de Pré-requisitos

#### macOS
```bash
# Instalar Homebrew (se não tiver)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar Node.js
brew install node

# Instalar pnpm
npm install -g pnpm

# Instalar Docker
brew install docker
```

#### Ubuntu/Debian
```bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar pnpm
npm install -g pnpm

# Instalar Docker
sudo apt-get install docker.io docker-compose
```

#### Windows
```powershell
# Usando Chocolatey
choco install nodejs pnpm docker-desktop

# Ou baixar manualmente:
# - Node.js: https://nodejs.org
# - Docker Desktop: https://www.docker.com/products/docker-desktop
```

---

## 1️⃣ Setup Inicial

### Clonar o Repositório
```bash
git clone <seu-repositorio>
cd training_system
```

### Instalar Dependências
```bash
pnpm install
```

### Configurar Variáveis de Ambiente
```bash
# Já existe .env.local, mas você pode customizar se necessário
cat .env.local
```

---

## 2️⃣ Iniciar Serviços Docker

### Iniciar PostgreSQL e Redis
```bash
docker-compose up -d
```

### Verificar Status
```bash
docker-compose ps
```

Você deve ver:
- ✅ corrida-postgres (PostgreSQL)
- ✅ corrida-redis (Redis)
- ✅ corrida-pgadmin (pgAdmin)
- ✅ corrida-redis-commander (Redis Commander)

### Acessar Ferramentas de Gerenciamento

| Ferramenta | URL | Credenciais |
|-----------|-----|-------------|
| pgAdmin | http://localhost:5050 | admin@corrida.local / admin |
| Redis Commander | http://localhost:8081 | - |

---

## 3️⃣ Configurar Banco de Dados

### Executar Migrations
```bash
cd apps/api
pnpm prisma migrate dev
```

Isso vai:
1. Criar as tabelas no PostgreSQL
2. Gerar o Prisma Client

### (Opcional) Seed de Dados de Teste
```bash
pnpm db:seed
```

### Abrir Prisma Studio (GUI)
```bash
pnpm db:studio
```

Acesse: http://localhost:5555

---

## 4️⃣ Iniciar o Desenvolvimento

### Terminal 1: Backend API
```bash
cd apps/api
pnpm dev
```

Você verá:
```
╔════════════════════════════════════════════════════════════╗
║   🏃 Training System API                          ║
║   ✅ Servidor iniciado com sucesso                        ║
║   🌐 URL: http://localhost:3000                           ║
║   📝 Health: http://localhost:3000/health                 ║
║   📚 API: http://localhost:3000/api/v1                    ║
╚════════════════════════════════════════════════════════════╝
```

### Testar API
```bash
# Em outro terminal
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2026-01-30T...",
  "environment": "development"
}
```

---

## 5️⃣ Próximos Passos

### Estrutura do Projeto
```
training_system/
├── apps/
│   ├── api/              # Backend (Node.js)
│   ├── web/              # Frontend Web (React)
│   └── mobile/           # Frontend Mobile (React Native)
├── packages/
│   ├── types/            # Types compartilhados
│   ├── utils/            # Utilitários
│   └── constants/        # Constantes
└── docs/                 # Documentação
```

### Comandos Úteis

#### Backend
```bash
cd apps/api

# Desenvolvimento
pnpm dev

# Testes
pnpm test
pnpm test:watch

# Linting
pnpm lint
pnpm format

# Database
pnpm db:migrate       # Executar migrations
pnpm db:seed          # Seed de dados
pnpm db:studio        # Abrir GUI
```

#### Frontend Web
```bash
cd apps/web

# Desenvolvimento
pnpm dev

# Build
pnpm build

# Preview
pnpm preview
```

#### Frontend Mobile
```bash
cd apps/mobile

# Desenvolvimento
pnpm start

# iOS
pnpm ios

# Android
pnpm android
```

---

## 🐛 Troubleshooting

### Erro: "Cannot find module 'express'"
```bash
# Solução: Reinstalar dependências
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Erro: "Connection refused" (PostgreSQL)
```bash
# Verificar se Docker está rodando
docker-compose ps

# Reiniciar serviços
docker-compose down
docker-compose up -d
```

### Erro: "Port 3000 already in use"
```bash
# Matar processo na porta 3000
lsof -ti:3000 | xargs kill -9

# Ou usar outra porta
API_PORT=3001 pnpm dev
```

### Erro: "EACCES: permission denied" (macOS/Linux)
```bash
# Dar permissão ao Docker
sudo usermod -aG docker $USER
newgrp docker
```

---

## 📚 Documentação Adicional

- [API Documentation](./api.md)
- [Database Schema](./database.md)
- [Architecture](./architecture.md)
- [Deployment](./deployment.md)

---

## 💡 Dicas Úteis

### Usar Postman/Insomnia
1. Abra Postman/Insomnia
2. Importe a coleção: `docs/postman-collection.json`
3. Configure a variável `baseUrl` para `http://localhost:3000`
4. Comece a fazer requisições

### Debug com VS Code
1. Instale a extensão "Debugger for Chrome"
2. Crie um arquivo `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch API",
      "program": "${workspaceFolder}/apps/api/src/main.ts",
      "preLaunchTask": "tsc: build",
      "outFiles": ["${workspaceFolder}/apps/api/dist/**/*.js"]
    }
  ]
}
```

### Monitorar Logs
```bash
# Ver logs em tempo real
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f postgres
docker-compose logs -f redis
```

---

## ✅ Checklist de Setup Completo

- [ ] Node.js instalado (18+)
- [ ] pnpm instalado
- [ ] Docker instalado e rodando
- [ ] Repositório clonado
- [ ] `pnpm install` executado
- [ ] `docker-compose up -d` executado
- [ ] Migrations executadas (`pnpm db:migrate`)
- [ ] API iniciada e respondendo em `http://localhost:3000/health`
- [ ] Banco de dados acessível via pgAdmin
- [ ] Redis acessível via Redis Commander

---

## 🎉 Pronto!

Você está pronto para começar a desenvolver! 

**Próximos passos:**
1. Leia [API Documentation](./api.md)
2. Comece a implementar módulos em `apps/api/src/modules`
3. Crie endpoints seguindo o padrão estabelecido
4. Escreva testes para cada módulo

---

**Dúvidas?** Consulte a documentação em `/docs` ou abra uma issue no GitHub.

**Bom desenvolvimento!** 🚀
