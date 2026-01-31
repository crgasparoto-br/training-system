#!/bin/bash

# ============================================================================
# CORRIDA TRAINING SYSTEM - API TEST SCRIPT
# ============================================================================
# Este script executa uma série de testes na API
# Uso: bash test-api.sh
# ============================================================================

set -e

API_URL="http://localhost:3000"
API_V1="$API_URL/api/v1"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

print_header() {
  echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC} $1"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_test() {
  echo -e "${YELLOW}→${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
  ((TESTS_PASSED++))
}

print_error() {
  echo -e "${RED}✗${NC} $1"
  ((TESTS_FAILED++))
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# VERIFICAÇÕES INICIAIS
# ============================================================================

print_header "VERIFICAÇÕES INICIAIS"

# Verificar se API está rodando
print_test "Verificando se API está respondendo..."
if curl -s "$API_URL/health" > /dev/null; then
  print_success "API está respondendo"
else
  print_error "API não está respondendo em $API_URL"
  echo -e "\n${RED}Inicie a API com: cd apps/api && pnpm dev${NC}"
  exit 1
fi

# Verificar se Docker está rodando
print_test "Verificando se Docker está rodando..."
if docker-compose ps | grep -q "postgres"; then
  print_success "PostgreSQL está rodando"
else
  print_error "PostgreSQL não está rodando"
  echo -e "\n${RED}Inicie Docker com: docker-compose up -d${NC}"
  exit 1
fi

# ============================================================================
# TESTES
# ============================================================================

print_header "TESTES DE AUTENTICAÇÃO"

# 1. Health Check
print_test "Health Check"
RESPONSE=$(curl -s "$API_URL/health")
if echo "$RESPONSE" | grep -q "ok"; then
  print_success "Health check passou"
else
  print_error "Health check falhou"
fi

# 2. Registrar Educador
print_test "Registrar Educador"
EDUCATOR_RESPONSE=$(curl -s -X POST "$API_V1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "educador@test.local",
    "password": "SenhaSegura123",
    "name": "João Educador",
    "type": "educator"
  }')

if echo "$EDUCATOR_RESPONSE" | grep -q "token"; then
  print_success "Educador registrado com sucesso"
  EDUCATOR_TOKEN=$(echo "$EDUCATOR_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  EDUCATOR_ID=$(echo "$EDUCATOR_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
  print_info "Token: ${EDUCATOR_TOKEN:0:20}..."
else
  print_error "Falha ao registrar educador"
  echo "$EDUCATOR_RESPONSE"
fi

# 3. Registrar Aluno
print_test "Registrar Aluno"
STUDENT_RESPONSE=$(curl -s -X POST "$API_V1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "aluno@test.local",
    "password": "SenhaSegura123",
    "name": "Maria Aluna",
    "type": "student"
  }')

if echo "$STUDENT_RESPONSE" | grep -q "token"; then
  print_success "Aluno registrado com sucesso"
  STUDENT_TOKEN=$(echo "$STUDENT_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  STUDENT_ID=$(echo "$STUDENT_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
  print_info "Token: ${STUDENT_TOKEN:0:20}..."
else
  print_error "Falha ao registrar aluno"
  echo "$STUDENT_RESPONSE"
fi

# 4. Login Educador
print_test "Login Educador"
LOGIN_RESPONSE=$(curl -s -X POST "$API_V1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "educador@test.local",
    "password": "SenhaSegura123"
  }')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
  print_success "Login educador bem-sucedido"
else
  print_error "Falha no login do educador"
fi

# 5. Obter Dados do Usuário
print_test "Obter Dados do Usuário Autenticado"
ME_RESPONSE=$(curl -s -X GET "$API_V1/auth/me" \
  -H "Authorization: Bearer $EDUCATOR_TOKEN")

if echo "$ME_RESPONSE" | grep -q "educador@test.local"; then
  print_success "Dados do usuário obtidos com sucesso"
else
  print_error "Falha ao obter dados do usuário"
fi

# 6. Logout
print_test "Logout"
LOGOUT_RESPONSE=$(curl -s -X POST "$API_V1/auth/logout" \
  -H "Authorization: Bearer $EDUCATOR_TOKEN")

if echo "$LOGOUT_RESPONSE" | grep -q "Logout realizado"; then
  print_success "Logout bem-sucedido"
else
  print_error "Falha no logout"
fi

# ============================================================================
# TESTES DE VALIDAÇÃO
# ============================================================================

print_header "TESTES DE VALIDAÇÃO E ERROS"

# 7. Erro: Email Inválido
print_test "Validação: Email Inválido"
INVALID_EMAIL=$(curl -s -X POST "$API_V1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "email-invalido",
    "password": "SenhaSegura123",
    "name": "Test",
    "type": "educator"
  }')

if echo "$INVALID_EMAIL" | grep -q "Email inválido"; then
  print_success "Validação de email funcionando"
else
  print_error "Validação de email não funcionando"
fi

# 8. Erro: Senha Curta
print_test "Validação: Senha Curta"
SHORT_PASSWORD=$(curl -s -X POST "$API_V1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "123",
    "name": "Test",
    "type": "educator"
  }')

if echo "$SHORT_PASSWORD" | grep -q "mínimo"; then
  print_success "Validação de senha funcionando"
else
  print_error "Validação de senha não funcionando"
fi

# 9. Erro: Senha Incorreta
print_test "Validação: Senha Incorreta no Login"
WRONG_PASSWORD=$(curl -s -X POST "$API_V1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "educador@test.local",
    "password": "SenhaErrada"
  }')

if echo "$WRONG_PASSWORD" | grep -q "incorretos"; then
  print_success "Validação de senha no login funcionando"
else
  print_error "Validação de senha no login não funcionando"
fi

# 10. Erro: Acesso Sem Token
print_test "Validação: Acesso Sem Token"
NO_TOKEN=$(curl -s -X GET "$API_V1/auth/me")

if echo "$NO_TOKEN" | grep -q "não fornecido"; then
  print_success "Validação de token funcionando"
else
  print_error "Validação de token não funcionando"
fi

# ============================================================================
# RESUMO
# ============================================================================

print_header "RESUMO DOS TESTES"

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
PERCENTAGE=$((TESTS_PASSED * 100 / TOTAL))

echo -e "Total de testes: ${BLUE}$TOTAL${NC}"
echo -e "Testes passaram: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Testes falharam: ${RED}$TESTS_FAILED${NC}"
echo -e "Taxa de sucesso: ${BLUE}$PERCENTAGE%${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC} 🎉 TODOS OS TESTES PASSARAM! 🎉"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}\n"
  exit 0
else
  echo -e "\n${RED}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║${NC} ❌ ALGUNS TESTES FALHARAM"
  echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}\n"
  exit 1
fi
