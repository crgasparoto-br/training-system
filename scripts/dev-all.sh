#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_INSTALL=false
MIGRATION_MODE="deploy"
for arg in "$@"; do
  if [[ "$arg" == "--skip-install" ]]; then
    SKIP_INSTALL=true
  elif [[ "$arg" == "--migrate-dev" ]]; then
    MIGRATION_MODE="dev"
  fi
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Erro: pnpm nao encontrado. Instale pnpm 8+ e tente novamente." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: docker nao encontrado. Instale Docker e tente novamente." >&2
  exit 1
fi

ensure_port_free() {
  local port="$1"
  local service_name="$2"
  local pid
  local cmd

  if ! command -v ss >/dev/null 2>&1; then
    return 0
  fi

  pid="$(ss -ltnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\([0-9]\+\).*/\1/p" | head -n 1)"

  if [[ -z "$pid" ]]; then
    return 0
  fi

  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"

  if [[ "$cmd" == *"/training-system/"* ]]; then
    echo "Porta ${port} ocupada por processo antigo do projeto (${service_name}). Encerrando PID ${pid}..."
    kill "$pid" || true
    return 0
  fi

  echo "Erro: porta ${port} ja esta em uso por outro processo fora do training-system." >&2
  echo "Processo: ${cmd}" >&2
  echo "Libere a porta ${port} ou altere a configuracao antes de executar o script." >&2
  exit 1
}

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Arquivo .env criado a partir de .env.example"
  else
    echo "Erro: .env e .env.example nao encontrados." >&2
    exit 1
  fi
fi

if [[ "$SKIP_INSTALL" == "true" ]]; then
  echo "[1/5] Pulando instalacao de dependencias (--skip-install)"
else
  echo "[1/5] Instalando dependencias..."
  pnpm install
fi

echo "[2/5] Validando portas da aplicacao..."
API_PORT="$(sed -n 's/^API_PORT=["'\'']\?\([0-9]\+\)["'\'']\?$/\1/p' apps/api/.env | head -n 1)"
API_PORT="${API_PORT:-3000}"
ensure_port_free "$API_PORT" "api"
ensure_port_free 5200 "web"

echo "[3/5] Subindo banco e cache (docker compose)..."
docker compose up -d postgres redis pgadmin redis-commander

echo "[4/5] Preparando schema da API..."
pnpm --filter @corrida/api db:generate
if [[ "$MIGRATION_MODE" == "dev" ]]; then
  echo "Modo de migration: prisma migrate dev (--migrate-dev)"
  pnpm --filter @corrida/api db:migrate
else
  echo "Modo de migration: prisma migrate deploy (padrao seguro)"
  pnpm --filter @corrida/api db:migrate:prod
fi

echo "[5/5] Iniciando API + Web..."
exec pnpm dev:serve
