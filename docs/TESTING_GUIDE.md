# 🧪 Guia de Teste da API

Este guia mostra como testar a API funcionando localmente.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de que:

- [x] Node.js 18+ instalado

- [x] pnpm instalado

- [ ] Docker instalado e rodando

- [x] Repositório clonado

- [x] Dependências instaladas (`pnpm install`)

---

## 🚀 Passo 1: Iniciar Serviços Docker

Abra um **terminal** e execute:

```bash
cd /home/ubuntu/corrida-training-system
docker-compose up -d
```

Verifique se está rodando:

```bash
docker-compose ps
```

Você deve ver:

```
NAME                COMMAND                  SERVICE             STATUS
corrida-postgres    "docker-entrypoint.s…"   postgres            Up 2 seconds
corrida-redis       "redis-server"           redis               Up 2 seconds
corrida-pgadmin     "/entrypoint.sh"         pgadmin             Up 2 seconds
corrida-redis-commander  "redis-commander"  redis-commander     Up 2 seconds
```

---

## 🗄️ Passo 2: Executar Migrations do Banco de Dados

Abra um **novo terminal** e execute:

```bash
cd /home/ubuntu/corrida-training-system/apps/api
pnpm prisma migrate dev
```

Você verá:

```
✔ Generated Prisma Client (5.7.0) to ./node_modules/@prisma/client in 1.23s

Enter a name for the new migration, or press enter to skip: 
```

Pressione **Enter** para pular (ou digite um nome, ex: "init").

Isso vai:

- ✅ Criar todas as tabelas no PostgreSQL

- ✅ Gerar o Prisma Client

---

## 🏃 Passo 3: Iniciar o Servidor API

No **mesmo terminal** (ou novo), execute:

```bash
cd /home/ubuntu/corrida-training-system/apps/api
pnpm dev
```

Você verá:

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🏃 Corrida Training System API                          ║
║   ✅ Servidor iniciado com sucesso                        ║
║                                                            ║
║   🌐 URL: http://localhost:3000                           ║
║   📝 Health: http://localhost:3000/health                 ║
║   📚 API: http://localhost:3000/api/v1                    ║
║   🔐 Auth: http://localhost:3000/api/v1/auth              ║
║                                                            ║
║   🔧 Environment: development                             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

✅ **API está rodando!**

---

## 🧪 Passo 4: Testar a API

Abra um **novo terminal** (deixe o anterior rodando ) e teste os endpoints.

### 4.1 Verificar Health Check

```bash
curl http://localhost:3000/health
```

**Resposta esperada:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-30T10:30:00.000Z",
  "environment": "development"
}
```

✅ **API está respondendo!**

---

### 4.2 Registrar Novo Usuário (Educador )

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "educador@example.com",
    "password": "SenhaSegura123",
    "name": "João Educador",
    "type": "educator"
  }'
```

**Resposta esperada (201 ):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbHJzOXdyZjAwMDAwMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImVkdWNhZG9yQGV4YW1wbGUuY29tIiwidHlwZSI6ImVkdWNhdG9yIiwiaWF0IjoxNjc0OTk5OTk5LCJleHAiOjE2NzU2MDQ3OTl9.XXXX...",
    "user": {
      "id": "clrs9wrf0000000000000001",
      "email": "educador@example.com",
      "name": "João Educador",
      "type": "educator"
    }
  },
  "message": "Usuário registrado com sucesso",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

✅ **Usuário criado com sucesso!**

**Salve o token** para os próximos testes. Vamos chamar de `$TOKEN_EDUCADOR`.

---

### 4.3 Registrar Novo Usuário (Aluno)

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "aluno@example.com",
    "password": "SenhaSegura123",
    "name": "Maria Aluna",
    "type": "student"
  }'
```

**Resposta esperada (201 ):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "clrs9wrf0000000000000002",
      "email": "aluno@example.com",
      "name": "Maria Aluna",
      "type": "student"
    }
  },
  "message": "Usuário registrado com sucesso",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

✅ **Aluno criado com sucesso!**

**Salve o token** para os próximos testes. Vamos chamar de `$TOKEN_ALUNO`.

---

### 4.4 Fazer Login (Educador)

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "educador@example.com",
    "password": "SenhaSegura123"
  }'
```

**Resposta esperada (200 ):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "clrs9wrf0000000000000001",
      "email": "educador@example.com",
      "name": "João Educador",
      "type": "educator"
    }
  },
  "message": "Login realizado com sucesso",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

✅ **Login bem-sucedido!**

---

### 4.5 Obter Dados do Usuário Autenticado

```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Substitua** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` pelo token retornado acima.

**Resposta esperada (200 ):**

```json
{
  "success": true,
  "data": {
    "id": "clrs9wrf0000000000000001",
    "email": "educador@example.com",
    "name": "João Educador",
    "type": "educator",
    "profile": {
      "id": "profile-id",
      "name": "João Educador",
      "avatar": null,
      "phone": null
    },
    "educator": {
      "id": "educator-id",
      "userId": "clrs9wrf0000000000000001"
    },
    "athlete": null
  },
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

✅ **Dados do usuário obtidos com sucesso!**

---

### 4.6 Fazer Logout

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Resposta esperada (200 ):**

```json
{
  "success": true,
  "data": null,
  "message": "Logout realizado com sucesso",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

✅ **Logout bem-sucedido!**

---

## 🛠️ Testando com Ferramentas Gráficas

### Opção 1: Postman

1. **Baixar Postman**: [https://www.postman.com/downloads/](https://www.postman.com/downloads/)

1. **Criar Nova Requisição**

1. **Configurar:**

   ```json
   {
     "email": "test@example.com",
     "password": "SenhaSegura123",
     "name": "Test User",
     "type": "educator"
   }
   ```

- Method: `POST`

- URL: `http://localhost:3000/api/v1/auth/register`

- Body (JSON ):

1. **Enviar (Send)**

### Opção 2: Insomnia

1. **Baixar Insomnia**: [https://insomnia.rest/](https://insomnia.rest/)

1. **Criar Nova Requisição**

1. **Mesmo processo do Postman**

### Opção 3: VS Code REST Client

1. **Instalar extensão**: "REST Client" (Huachao Mao )

1. **Criar arquivo** `test.http`:

```
### Health Check
GET http://localhost:3000/health

### Register Educator
POST http://localhost:3000/api/v1/auth/register
Content-Type: application/json

{
  "email": "educador@example.com",
  "password": "SenhaSegura123",
  "name": "João Educador",
  "type": "educator"
}

### Login
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "educador@example.com",
  "password": "SenhaSegura123"
}

### Get Current User
GET http://localhost:3000/api/v1/auth/me
Authorization: Bearer YOUR_TOKEN_HERE
```

1. **Clicar em "Send Request"** acima de cada teste

---

## 🗄️ Visualizar Banco de Dados

### pgAdmin (Web )

1. **Abra**: [http://localhost:5050](http://localhost:5050)

1. **Login**:

- Email: `admin@corrida.local`

- Senha: `admin`

1. **Adicionar Servidor**:

- Name: `Corrida DB`

- Host: `postgres`

- Username: `corrida_user`

- Password: `corrida_password_dev`

1. **Visualizar tabelas** e dados

### Prisma Studio (GUI )

```bash
cd apps/api
pnpm db:studio
```

Abre em: [http://localhost:5555](http://localhost:5555)

---

## 🔍 Verificar Logs

### Logs da API

O terminal onde você rodou `pnpm dev` mostra os logs:

```
[API]: # "GET /health 200 2ms"
[API]: # "POST /api/v1/auth/register 201 150ms"
[API]: # "POST /api/v1/auth/login 200 120ms"
```

### Logs do Docker

```bash
docker-compose logs -f postgres
docker-compose logs -f redis
```

---

## ❌ Troubleshooting

### Erro: "Cannot find module '@prisma/client'"

```bash
cd apps/api
pnpm install
```

### Erro: "Connection refused" (PostgreSQL )

```bash
# Verificar se Docker está rodando
docker-compose ps

# Reiniciar
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

### Erro: "Email já está registrado"

Use um email diferente para cada teste, ou limpe o banco:

```bash
# Resetar banco de dados
cd apps/api
pnpm prisma migrate reset
```

---

## ✅ Checklist de Testes

- [ ] Health check respondendo

- [ ] Registrar educador com sucesso

- [ ] Registrar aluno com sucesso

- [ ] Login com sucesso

- [ ] Obter dados do usuário autenticado

- [ ] Logout com sucesso

- [ ] Erro ao fazer login com senha incorreta

- [ ] Erro ao acessar rota protegida sem token

- [ ] Dados salvos no banco de dados (pgAdmin)

---

## 📊 Resumo de Endpoints Testados

| Método | Endpoint | Status | Teste |
| --- | --- | --- | --- |
| POST | `/auth/register` | ✅ | Criar usuário |
| POST | `/auth/login` | ✅ | Login |
| GET | `/auth/me` | ✅ | Dados do usuário |
| POST | `/auth/logout` | ✅ | Logout |
| GET | `/health` | ✅ | Health check |

---

## 🎉 Próximos Passos

Depois de testar com sucesso:

1. **Fase 1 - Parte 3**: Frontend Web (React)

1. **Fase 1 - Parte 4**: Frontend Mobile (React Native)

1. **Fase 2**: Módulo de Atletas (CRUD)

1. **Fase 3**: Módulo de Planos de Treino

---

## 💡 Dicas

1. **Salve os tokens** em um arquivo temporário para reutilizar

1. **Use Postman/Insomnia** para testes mais complexos

1. **Monitore os logs** para entender o que está acontecendo

1. **Teste com dados inválidos** para verificar validações

---

**Bom teste! 🚀**

Se tiver dúvidas, consulte [API.md](./API.md)