#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL nao definido. Carregue o .env local antes de executar." >&2
  exit 1
fi

echo "Aplicando migrations Prisma no banco local..."
pnpm --filter @corrida/api db:migrate

echo "Executando seed principal..."
pnpm --filter @corrida/api db:seed

echo "Banco local preparado para validacao."
