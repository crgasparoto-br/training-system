# Scripts operacionais da API

Este documento lista os scripts oficiais de manutencao/operacao da API.

Regra geral: scripts que leem ou escrevem no banco devem ser executados com ambiente explicito, preferencialmente primeiro em `--dry-run` quando o script suportar.

## Como executar

A partir da raiz do repositorio:

```bash
pnpm --filter @corrida/api <script>
```

Ou, dentro de `apps/api`:

```bash
pnpm <script>
```

## Cuidados obrigatorios

Antes de executar scripts que alteram dados:

1. Confirme `DATABASE_URL` e ambiente alvo.
2. Prefira ambiente local ou staging antes de producao.
3. Gere backup do banco quando o impacto for amplo.
4. Use `--dry-run` quando disponivel.
5. Registre resultado, data, ambiente e operador no PR, issue ou changelog operacional.

## Scripts oficiais em `apps/api/package.json`

| Script | Arquivo | Risco | Dry-run | Finalidade |
|---|---|---:|---:|---|
| `db:clone-contract-data` | `src/scripts/clone-contract-data.ts` | Medio | Nao | Clona parametros e/ou exercicios de um contrato fonte para contratos destino. |
| `job:backfill-student-contract-links` | `src/scripts/backfill-student-contract-links.ts` | Alto | Sim | Migra dados financeiros/contratuais legados para vinculos `StudentContract`. |
| `job:dispatch-profile-reviews` | `src/scripts/dispatch-profile-reviews.ts` | Medio | Sim | Dispara rotina de revisao cadastral pendente/vencida. |
| `job:backfill-profile-review-settings` | `src/scripts/backfill-profile-review-settings.ts` | Medio | Sim | Cria politicas/configuracoes padrao de revisao cadastral quando ausentes. |
| `import-exercises` | `src/scripts/import-exercises.ts` | Medio | Sim | Importa exercicios a partir de JSON. |
| `job:normalize-upload-urls` | `src/scripts/normalize-upload-urls.mjs` | Medio | Sim | Normaliza URLs de upload em `CompanyContract.logoUrl` e `Profile.avatar`. |

## `db:clone-contract-data`

Comando:

```bash
pnpm --filter @corrida/api db:clone-contract-data
```

Variaveis suportadas:

- `SOURCE_CONTRACT_ID`: contrato fonte. Se ausente, usa o primeiro contrato criado.
- `TARGET_CONTRACT_ID`: contrato destino. Se ausente, usa todos os contratos exceto o fonte.
- `COPY_PARAMETERS`: `true`/`false`; padrao `true`.
- `COPY_EXERCISES`: `true`/`false`; padrao `true`.

Exemplo seguro:

```bash
SOURCE_CONTRACT_ID=<id-fonte> TARGET_CONTRACT_ID=<id-destino> COPY_PARAMETERS=true COPY_EXERCISES=false pnpm --filter @corrida/api db:clone-contract-data
```

Risco:

- Pode criar dados em multiplos contratos se `TARGET_CONTRACT_ID` nao for informado.
- Nao possui `--dry-run` atualmente.

Recomendacao:

- Sempre informar `SOURCE_CONTRACT_ID` e `TARGET_CONTRACT_ID`.
- Adicionar `--dry-run` em PR futuro antes de usar em producao.

## `job:backfill-student-contract-links`

Comando:

```bash
pnpm --filter @corrida/api job:backfill-student-contract-links -- --dry-run
```

Flags suportadas:

- `--dry-run`: simula sem gravar.
- `--output=<arquivo>`: define caminho do relatorio JSON.

Exemplo:

```bash
pnpm --filter @corrida/api job:backfill-student-contract-links -- --dry-run --output=reports/student-contract-backfill-dry-run.json
```

Risco:

- Alto. Cria registros `StudentContract` e pode atualizar `currentStudentContractId`.

Recomendacao:

- Executar `--dry-run` e revisar o relatorio antes de executar sem dry-run.
- Guardar relatorio fora do Git.

## `job:dispatch-profile-reviews`

Comando:

```bash
pnpm --filter @corrida/api job:dispatch-profile-reviews -- --dry-run
```

Variaveis suportadas:

- `PROFILE_REVIEW_UPCOMING_WINDOW_DAYS`
- `PROFILE_REVIEW_CREATE_OVERDUE_REMINDER`

Flags suportadas:

- `--dry-run`: simula sem gravar.

Risco:

- Medio. Pode criar revisoes/lembretes quando executado sem `--dry-run`.

## `job:backfill-profile-review-settings`

Comando:

```bash
pnpm --filter @corrida/api job:backfill-profile-review-settings -- --dry-run
```

Variaveis suportadas:

- `PROFILE_REVIEW_DEFAULT_PERIOD_MONTHS`: padrao 4.

Flags suportadas:

- `--dry-run`: simula sem gravar.

Risco:

- Medio. Pode criar politicas de revisao por contrato e configuracoes por aluno.

## `import-exercises`

Comando:

```bash
pnpm --filter @corrida/api import-exercises -- caminho/do/arquivo.json
```

Flags suportadas:

- `--dry-run`: simula a importacao sem gravar no banco.

Exemplo seguro:

```bash
CONTRACT_ID=<id-contrato> pnpm --filter @corrida/api import-exercises -- --dry-run caminho/do/arquivo.json
```

Formato esperado:

```json
[
  {
    "name": "agachamento livre",
    "videoUrl": "https://youtube.com/watch?v=...",
    "loadType": "C",
    "movementType": "O",
    "countingType": "R",
    "muscleGroup": "Quadriceps",
    "notes": "Exercicio basico"
  }
]
```

Variaveis suportadas:

- `CONTRACT_ID`: contrato onde os exercicios serao importados. Se ausente, usa o primeiro contrato criado.

Risco:

- Medio. Cria exercicios em biblioteca do contrato quando executado sem `--dry-run`.

Recomendacao:

- Sempre informar `CONTRACT_ID`.
- Executar primeiro com `--dry-run` e revisar o resumo retornado.
- Validar o JSON em ambiente local/staging.

## `job:normalize-upload-urls`

Comando seguro:

```bash
pnpm --filter @corrida/api job:normalize-upload-urls -- --dry-run
```

Comando com gravacao:

```bash
pnpm --filter @corrida/api job:normalize-upload-urls
```

Finalidade:

- Normaliza URLs de upload em `CompanyContract.logoUrl` e `Profile.avatar`.

Flags suportadas:

- `--dry-run`: simula as atualizacoes sem gravar no banco.

Risco:

- Medio. Atualiza registros no banco quando executado sem `--dry-run`.

Recomendacao:

- Confirmar `DATABASE_URL` e ambiente alvo antes da execucao.
- Executar primeiro com `--dry-run`.
- Registrar quantos registros seriam ajustados/foram ajustados e em qual ambiente.

## Saidas geradas

Relatorios gerados por scripts devem ficar em `reports/`, que deve ser tratado como artefato local e nao versionado.

## Padrao para novos scripts

Novos scripts operacionais devem:

1. Importar `../bootstrap-env.js` quando dependerem de `.env`.
2. Ter comando oficial em `apps/api/package.json`.
3. Documentar variaveis, flags e risco neste arquivo.
4. Suportar `--dry-run` quando escreverem no banco.
5. Evitar valores hardcoded de usuario, contrato, e-mail ou URL.
6. Escrever relatorios em `reports/` quando houver impacto em lote.
7. Encerrar conexoes Prisma explicitamente quando instanciarem `PrismaClient`.
