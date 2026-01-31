#!/bin/bash

# ============================================================================
# CORRIDA TRAINING SYSTEM - API TEST SCRIPT
# ============================================================================
# Este script executa uma sÃ©rie de testes na API
# Uso: bash test-api.sh
# ============================================================================

set -e

API_URL="${API_URL:-http://localhost:3000}"
API_V1="$API_URL/api/v1"

RUN_ID=$(date +%s)
EDUCATOR_EMAIL="educador+${RUN_ID}@test.local"
STUDENT_EMAIL="aluno+${RUN_ID}@test.local"

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
# FUNÃ‡Ã•ES AUXILIARES
# ============================================================================

print_header() {
  echo -e "\n${BLUE}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${NC}"
  echo -e "${BLUE}â•‘${NC} $1"
  echo -e "${BLUE}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}\n"
}

print_test() {
  echo -e "${YELLOW}â†’${NC} $1"
}

print_success() {
  echo -e "${GREEN}âœ“${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_error() {
  echo -e "${RED}âœ—${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_info() {
  echo -e "${BLUE}â„¹${NC} $1"
}

# Prefer docker-compose.exe in WSL/Windows environments
DOCKER_COMPOSE_CMD="docker-compose"
if command -v docker-compose.exe >/dev/null 2>&1; then
  if grep -qi microsoft /proc/version 2>/dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose.exe"
  fi
fi
if ! command -v "$DOCKER_COMPOSE_CMD" >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
  elif command -v docker-compose.exe >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose.exe"
  fi
fi

# ============================================================================
# VERIFICAÃ‡Ã•ES INICIAIS
# ============================================================================

print_header "VERIFICAÃ‡Ã•ES INICIAIS"

# Verificar se API estÃ¡ rodando
print_test "Verificando se API estÃ¡ respondendo..."
if curl -s "$API_URL/health" > /dev/null; then
  print_success "API estÃ¡ respondendo"
else
  print_error "API nÃ£o estÃ¡ respondendo em $API_URL"
  echo -e "\n${RED}Inicie a API com: cd apps/api && pnpm dev${NC}"
  exit 1
fi

# Verificar se Docker estÃ¡ rodando
print_test "Verificando se Docker estÃ¡ rodando..."
if $DOCKER_COMPOSE_CMD ps | grep -q "postgres"; then
  print_success "PostgreSQL estÃ¡ rodando"
else
  print_error "PostgreSQL nÃ£o estÃ¡ rodando"
  echo -e "\n${RED}Inicie Docker com: docker-compose up -d${NC}"
  exit 1
fi

# ============================================================================
# TESTES
# ============================================================================

print_header "TESTES DE AUTENTICAÃ‡ÃƒO"

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
  -d "{\"email\":\"$EDUCATOR_EMAIL\",\"password\":\"SenhaSegura123\",\"name\":\"João Educador\",\"type\":\"educator\"}")

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
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"SenhaSegura123\",\"name\":\"Maria Aluna\",\"type\":\"student\"}")

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
  -d "{\"email\":\"$EDUCATOR_EMAIL\",\"password\":\"SenhaSegura123\"}")

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
  print_success "Login educador bem-sucedido"
else
  print_error "Falha no login do educador"
fi

# 5. Obter Dados do UsuÃ¡rio
print_test "Obter Dados do UsuÃ¡rio Autenticado"
ME_RESPONSE=$(curl -s -X GET "$API_V1/auth/me" \
  -H "Authorization: Bearer $EDUCATOR_TOKEN")

if echo "$ME_RESPONSE" | grep -q "$EDUCATOR_EMAIL"; then
  print_success "Dados do usuÃ¡rio obtidos com sucesso"
else
  print_error "Falha ao obter dados do usuÃ¡rio"
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
# TESTES DE VALIDAÃ‡ÃƒO
# ============================================================================

print_header "TESTES DE VALIDAÃ‡ÃƒO E ERROS"

# 7. Erro: Email InvÃ¡lido
print_test "ValidaÃ§Ã£o: Email InvÃ¡lido"
INVALID_EMAIL=$(curl -s -X POST "$API_V1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "email-invalido",
    "password": "SenhaSegura123",
    "name": "Test",
    "type": "educator"
  }')

if echo "$INVALID_EMAIL" | grep -q '"success":false'; then
  print_success "ValidaÃ§Ã£o de email funcionando"
else
  print_error "ValidaÃ§Ã£o de email nÃ£o funcionando"
fi

# 8. Erro: Senha Curta
print_test "ValidaÃ§Ã£o: Senha Curta"
SHORT_PASSWORD=$(curl -s -X POST "$API_V1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "123",
    "name": "Test",
    "type": "educator"
  }')

if echo "$SHORT_PASSWORD" | grep -q '"success":false'; then
  print_success "ValidaÃ§Ã£o de senha funcionando"
else
  print_error "ValidaÃ§Ã£o de senha nÃ£o funcionando"
fi

# 9. Erro: Senha Incorreta
print_test "ValidaÃ§Ã£o: Senha Incorreta no Login"
WRONG_PASSWORD=$(curl -s -X POST "$API_V1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EDUCATOR_EMAIL\",\"password\":\"SenhaErrada\"}")

if echo "$WRONG_PASSWORD" | grep -q "incorretos"; then
  print_success "ValidaÃ§Ã£o de senha no login funcionando"
else
  print_error "ValidaÃ§Ã£o de senha no login nÃ£o funcionando"
fi

# 10. Erro: Acesso Sem Token
print_test "ValidaÃ§Ã£o: Acesso Sem Token"
NO_TOKEN=$(curl -s -X GET "$API_V1/auth/me")

if echo "$NO_TOKEN" | grep -q '"success":false'; then
  print_success "ValidaÃ§Ã£o de token funcionando"
else
  print_error "ValidaÃ§Ã£o de token nÃ£o funcionando"
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
  echo -e "\n${GREEN}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${NC}"
  echo -e "${GREEN}â•‘${NC} ðŸŽ‰ TODOS OS TESTES PASSARAM! ðŸŽ‰"
  echo -e "${GREEN}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}\n"
  exit 0
else
  echo -e "\n${RED}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${NC}"
  echo -e "${RED}â•‘${NC} âŒ ALGUNS TESTES FALHARAM"
  echo -e "${RED}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}\n"
  exit 1
fi
