# 📚 Guia de Importação dos Exercícios

## ✅ Status Atual

- **Total de exercícios da referência histórica:** 197
- **Com grupo muscular:** 197 (100%)
- **Pronto para importação:** ✅ Sim

> A importação atual é **incremental e não destrutiva**. O script não limpa a biblioteca antes de importar: exercícios já existentes no mesmo contrato, identificados pelo nome normalizado, são preservados e contabilizados como `Pulados`.

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
git clone https://github.com/crgasparoto-br/training-system.git
cd training-system

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
cd apps/api
npx prisma migrate dev
```

### 4. Validar sem gravar (recomendado)

O script exige o caminho do arquivo JSON. Use `--dry-run` para validar a leitura e a normalização sem criar registros.

```bash
cd apps/api
npx ts-node src/scripts/import-exercises.ts --dry-run /caminho/para/exercises-data.json
```

### 5. Importar os Exercícios

```bash
cd apps/api
npx ts-node src/scripts/import-exercises.ts /caminho/para/exercises-data.json
```

Se houver mais de um contrato no banco, defina explicitamente `CONTRACT_ID`. Sem a variável, o script usa o primeiro contrato encontrado por `createdAt`.

```bash
CONTRACT_ID=<id-do-contrato> npx ts-node src/scripts/import-exercises.ts /caminho/para/exercises-data.json
```

### Comportamento esperado

Durante a execução o script:

1. lê o arquivo JSON e informa a quantidade de exercícios;
2. resolve o contrato alvo;
3. normaliza o nome e os campos suportados;
4. procura um exercício com o mesmo nome normalizado no mesmo contrato;
5. **preserva o registro existente** e o contabiliza como `Pulado`;
6. cria somente exercícios que ainda não existem;
7. exibe o resumo com `Importados`, `Pulados`, `Erros` e `Total`.

Exemplo resumido:

```text
🚀 Iniciando importação de exercícios...
📄 Arquivo lido: 197 exercícios encontrados
🏢 Contrato alvo: <contract-id>

✅ Importado: "Exercício Novo"
⏭️  Pulando "Exercício Existente" (já existe)

📊 Resumo da Importação:
   ✅ Importados: 1
   ⏭️  Pulados: 196
   ❌ Erros: 0
   📄 Total: 197

✅ Importação concluída com sucesso!
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
cd apps/api
pnpm dev

# Em outro terminal
curl http://localhost:3000/api/v1/library/exercises
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

### Exercício existente foi pulado

Esse é o comportamento esperado e não destrutivo. O importador procura `name + contractId` antes de criar e mantém o registro já existente sem sobrescrevê-lo.

Se a intenção for alterar um exercício existente, faça a edição pelo fluxo próprio da aplicação/API; **não remova a proteção do importador e não apague a biblioteca como etapa da importação**.

### Código de movimento não suportado

`movementType` deriva do enum Prisma. Os valores suportados atualmente são:

- `U` — Unilateral
- `A` — Alternado
- `I` — Isolado
- `O` — Outros (Bilateral)

Códigos como `B` e `-` não são convertidos implicitamente para outro movimento; eles são importados sem `movementType`.

## 📝 Estrutura do Arquivo JSON

Cada exercício pode possuir os seguintes campos:

```json
{
  "name": "Nome do Exercício",
  "videoUrl": "https://youtube.com/watch?v=...",
  "loadType": "H | C | E | A | P | O",
  "movementType": "U | A | I | O",
  "countingType": "I | T | R",
  "notes": "Observações opcionais",
  "muscleGroup": "Grupo muscular principal"
}
```

A `category` é determinada pelo importador a partir do nome do exercício.

### Tipos de Carga (LoadType)

- **H** - Halter
- **C** - Corporal
- **E** - Elástico
- **A** - Anilha
- **P** - Polia
- **O** - Outros

### Tipos de Movimento (MovementType)

- **U** - Unilateral
- **A** - Alternado
- **I** - Isolado
- **O** - Outros (Bilateral)

### Tipos de Contagem (CountingType)

- **I** - Intervalo/Isometria
- **T** - Tempo
- **R** - Repetições

## 🎯 Verificações após a importação

1. Testar a tela de Biblioteca no frontend.
2. Verificar filtros por grupo muscular e movimento.
3. Testar busca por nome.
4. Confirmar que registros preexistentes/customizados permaneceram inalterados.

---

**Última atualização:** 12/09/2026  
**Comportamento documentado:** importador incremental, idempotente por nome + contrato e não destrutivo.
