# 📚 Guia de Importação dos Exercícios

## ✅ Status Atual

- **Total de exercícios:** 197
- **Com grupo muscular:** 197 (100%)
- **Pronto para importação:** ✅ Sim

## 📊 Distribuição por Grupo Muscular

| Grupo Muscular | Quantidade |
|---|---|
| Abdômen | 27 |
| Quadríceps | 27 |
| Peitoral | 27 |
| Costas | 21 |
| Cardio | 16 |
| Mobilidade | 16 |
| Ombros | 12 |
| Posterior de Coxa | 8 |
| Bíceps | 8 |
| Abdutores | 7 |
| Glúteos | 7 |
| Panturrilha | 6 |
| Core | 6 |
| Tríceps | 4 |
| Full Body | 3 |
| Adutores | 2 |

## 🚀 Como Importar

### 1. Preparar o Ambiente

```bash
# Clonar o repositório (se ainda não fez)
git clone https://github.com/crgasparoto-br/corrida-training-system.git
cd corrida-training-system

# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

### 2. Iniciar o Banco de Dados

```bash
# Iniciar PostgreSQL via Docker
docker compose up -d postgres

# Aguardar alguns segundos para o banco inicializar
sleep 5
```

### 3. Executar Migrations

```bash
# Aplicar migrations do Prisma
cd apps/api
npx prisma migrate dev
```

### 4. Importar os Exercícios

```bash
# Executar script de importação
npx ts-node src/scripts/import-exercises.ts
```

### Saída Esperada

```
🚀 Iniciando importação de exercícios...

📊 Total de exercícios no arquivo: 197

🗑️  Limpando exercícios existentes...
✅ Exercícios anteriores removidos

✅ 20 exercícios importados...
✅ 40 exercícios importados...
✅ 60 exercícios importados...
✅ 80 exercícios importados...
✅ 100 exercícios importados...
✅ 120 exercícios importados...
✅ 140 exercícios importados...
✅ 160 exercícios importados...
✅ 180 exercícios importados...

🎉 Importação concluída!
✅ Importados: 197
❌ Erros: 0

📊 Estatísticas por Grupo Muscular:
   Abdômen: 27 exercícios
   Quadríceps: 27 exercícios
   Peitoral: 27 exercícios
   Costas: 21 exercícios
   ...
```

## 🔍 Verificar Importação

### Via Prisma Studio

```bash
cd apps/api
npx prisma studio
```

Acesse `http://localhost:5555` e navegue até a tabela `ExerciseLibrary`.

### Via API

```bash
# Iniciar a API
cd apps/api
pnpm dev

# Em outro terminal, testar endpoint
curl http://localhost:3000/api/library/exercises
```

## ⚠️ Troubleshooting

### Erro: "Cannot connect to database"

Verifique se o PostgreSQL está rodando:

```bash
docker compose ps
```

Se não estiver, inicie:

```bash
docker compose up -d postgres
```

### Erro: "Table does not exist"

Execute as migrations:

```bash
cd apps/api
npx prisma migrate dev
```

### Erro: "Duplicate key value"

O script limpa a tabela antes de importar. Se quiser preservar dados existentes, comente a linha no script:

```typescript
// await prisma.exerciseLibrary.deleteMany({});
```

## 📝 Estrutura do Arquivo JSON

Cada exercício possui os seguintes campos:

```json
{
  "name": "Nome do Exercício",
  "category": "MOBILIDADE | RESISTIDO | CICLICO",
  "loadType": "H | C | E | A | P | O",
  "movementType": "U | I | O",
  "countingType": "I | T | R",
  "notes": "Observações opcionais",
  "muscleGroup": "Grupo muscular principal"
}
```

### Tipos de Carga (LoadType)

- **H** - Halter
- **C** - Corporal
- **E** - Elástico
- **A** - Anilha
- **P** - Polia
- **O** - Outros

### Tipos de Movimento (MovementType)

- **U** - Unilateral
- **I** - Isométrico
- **O** - Outros

### Tipos de Contagem (CountingType)

- **I** - Intervalo (tempo)
- **T** - Tempo
- **R** - Repetições

## 🎯 Próximos Passos

Após importar os exercícios:

1. ✅ Testar a tela de Biblioteca no frontend
2. ✅ Verificar filtros por grupo muscular
3. ✅ Testar busca por nome
4. ✅ Implementar tela de Montagem de Treinos
5. ✅ Integrar com Periodização Macrociclo

## 📞 Suporte

Se encontrar problemas durante a importação, verifique:

1. Logs do Docker: `docker compose logs postgres`
2. Logs da API: verifique o terminal onde rodou o script
3. Schema do Prisma: `apps/api/prisma/schema.prisma`

---

**Última atualização:** 01/02/2026  
**Versão do arquivo:** exercises-data.json (commit a1fdfc5)
