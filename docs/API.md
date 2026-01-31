# 📚 Documentação da API

## Base URL

```
http://localhost:3000/api/v1
```

## Autenticação

Todas as rotas protegidas requerem um token JWT no header:

```
Authorization: Bearer <token>
```

---

## 🔐 Autenticação (Auth)

### 1. Registrar Novo Usuário

**POST** `/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "João Silva",
  "type": "educator"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "name": "João Silva",
      "type": "educator"
    }
  },
  "message": "Usuário registrado com sucesso",
  "timestamp": "2026-01-30T..."
}
```

**Validações:**
- Email deve ser válido
- Senha deve ter no mínimo 8 caracteres
- Nome deve ter no mínimo 3 caracteres
- Type deve ser `educator` ou `student`

---

### 2. Fazer Login

**POST** `/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "name": "João Silva",
      "type": "educator"
    }
  },
  "message": "Login realizado com sucesso",
  "timestamp": "2026-01-30T..."
}
```

**Erros:**
- `400`: Email ou senha incorretos
- `400`: Validação falhou

---

### 3. Obter Dados do Usuário Autenticado

**GET** `/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "João Silva",
    "type": "educator",
    "profile": {
      "id": "profile-id",
      "name": "João Silva",
      "avatar": null,
      "phone": null
    },
    "educator": {
      "id": "educator-id",
      "userId": "user-id"
    },
    "athlete": null
  },
  "timestamp": "2026-01-30T..."
}
```

**Erros:**
- `401`: Não autenticado
- `404`: Usuário não encontrado

---

### 4. Fazer Logout

**POST** `/auth/logout`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Logout realizado com sucesso",
  "timestamp": "2026-01-30T..."
}
```

---

## 📊 Estrutura de Resposta

### Sucesso

```json
{
  "success": true,
  "data": { /* dados */ },
  "message": "Mensagem de sucesso",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

### Erro

```json
{
  "success": false,
  "error": "Mensagem de erro",
  "timestamp": "2026-01-30T10:30:00.000Z"
}
```

---

## 🔄 Fluxo de Autenticação

```
1. Usuário faz POST /auth/register ou /auth/login
   ↓
2. API retorna token JWT
   ↓
3. Cliente armazena token (localStorage, sessionStorage, etc)
   ↓
4. Cliente envia token em Authorization header para rotas protegidas
   ↓
5. API valida token com middleware authMiddleware
   ↓
6. Se válido, continua. Se inválido, retorna 401
```

---

## 🧪 Testando com cURL

### Registrar
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securePassword123",
    "name": "Test User",
    "type": "educator"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securePassword123"
  }'
```

### Obter Dados do Usuário
```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <seu-token-aqui>"
```

---

## 🔐 Códigos de Status HTTP

| Código | Significado |
|--------|-------------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado com sucesso |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado ou token inválido |
| 403 | Forbidden - Acesso negado |
| 404 | Not Found - Recurso não encontrado |
| 500 | Internal Server Error - Erro do servidor |

---

## 📝 Próximas Rotas a Implementar

- [ ] GET `/athletes` - Listar atletas
- [ ] POST `/athletes` - Criar atleta
- [ ] GET `/athletes/:id` - Obter atleta
- [ ] PUT `/athletes/:id` - Atualizar atleta
- [ ] DELETE `/athletes/:id` - Deletar atleta
- [ ] GET `/plans` - Listar planos
- [ ] POST `/plans` - Criar plano
- [ ] GET `/plans/:id` - Obter plano
- [ ] PUT `/plans/:id` - Atualizar plano
- [ ] DELETE `/plans/:id` - Deletar plano

---

## 💡 Dicas

1. **Armazenar Token**: Salve o token retornado e envie em todas as requisições protegidas
2. **Expiração**: O token expira em 7 dias (configurável em `.env`)
3. **Refresh**: Implemente refresh token para renovar sessão
4. **HTTPS**: Use HTTPS em produção
5. **CORS**: Configurado para localhost:5173 (web) e localhost:8081 (mobile)

---

**Última atualização**: 30 de Janeiro de 2026
