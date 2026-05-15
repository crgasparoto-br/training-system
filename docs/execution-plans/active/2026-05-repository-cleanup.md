# Plano: faxina tecnica do repositorio

## Objetivo

Organizar o `training-system` em uma sequencia de PRs pequenos, seguros e revisaveis, removendo sujeira acumulada sem alterar comportamento funcional do Sistema Acesso.

## Contexto

O PR de harness engineering foi mergeado na `develop`, criando `AGENTS.md`, documentacao de arquitetura, scripts de validacao e workflow de PR. A faxina passa a usar esses trilhos.

## Fora de escopo deste plano

- Alterar codigo de runtime sem necessidade.
- Alterar schema Prisma.
- Alterar permissoes, telas, rotas ou comportamento de usuario.
- Corrigir todos os problemas encontrados de uma vez.

## Resumo da situacao atual

Foram encontrados sinais de sujeira tecnica em quatro grupos principais:

1. Arquivos temporarios ou scripts avulsos de diagnostico.
2. Documentacao antiga, duplicada ou backup local versionado.
3. Scripts operacionais misturados com codigo de aplicacao.
4. Areas funcionais grandes que merecem refatoracao futura, mas nao devem ser tratadas como limpeza segura imediata.

## Progresso

### PR 1 - Diagnostico da faxina

Status: concluido.

Resultado:

- Criado o plano de limpeza em `docs/execution-plans/active/2026-05-repository-cleanup.md`.

### PR 2 - Limpeza segura de arquivos temporarios

Status: concluido.

Arquivos removidos:

- `query_db.js`
- `apps/api/query_db.ts`
- `apps/api/query_db_list.ts`
- `apps/api/query_db_gasparoto.ts`
- `apps/api/list_contracts.ts`
- `apps/api/update_user.js`
- `apps/api/check_user_tmp.mjs`

Tambem foi atualizado o `.gitignore` para evitar novos arquivos temporarios semelhantes.

### PR 3 - Consolidacao de documentacao

Status: em andamento/concluido nesta branch.

Ajustes feitos:

- Criado `docs/README.md` como indice da documentacao.
- Atualizado `README.md` para apontar para as fontes de verdade atuais.
- Marcado `docs/ACCESS_CONTROL.md` como documento legado/complementar.
- Preservado backup visual em `docs/archive/visual-guidelines.local-backup-20260420-165809.md`.
- Removido backup local versionado da raiz de `docs/`.

## Problemas restantes

### 1. Documentacao complementar ainda a revisar

Arquivos que podem precisar de consolidacao futura:

- `docs/internal-test-deploy.md`
- `docs/BIBLIOTECA_MELHORIAS.md`
- `docs/CHECKLIST_TESTES_BIBLIOTECA.md`

Classificacao: risco baixo a medio.

### 2. Scripts operacionais misturados ao runtime

Arquivos em `apps/api/src/scripts/` parecem validos, mas precisam de padrao claro:

- `apps/api/src/scripts/backfill-profile-review-settings.ts`
- `apps/api/src/scripts/backfill-student-contract-links.ts`
- `apps/api/src/scripts/clone-contract-data.ts`
- `apps/api/src/scripts/dispatch-profile-reviews.ts`
- `apps/api/src/scripts/import-exercises.ts`
- `apps/api/src/scripts/normalize-upload-urls.mjs`

Classificacao: risco medio.

### 3. TODOs e pendencias em areas funcionais

Arquivos com sinais de TODO ou pendencias futuras:

- `apps/api/prisma/seed.ts`
- `apps/web/src/pages/WorkoutBuilder/index.tsx`
- `apps/api/src/routes/library.routes.ts`
- `apps/api/src/modules/library/library.service.ts`
- `apps/web/src/pages/AlunoDetails.tsx`
- `apps/web/src/pages/WorkoutBuilder2/ResistanceDayTable.tsx`
- `apps/api/prisma/schema_periodization.prisma`

Classificacao: risco medio a alto.

## Proximos PRs recomendados

### PR 4 - Padronizacao de scripts operacionais

Escopo:

- Documentar scripts reais de operacao.
- Garantir que cada script tenha finalidade, pre-requisitos e comando oficial.
- Evitar scripts destrutivos sem protecao.

Criterios de aceite:

- Scripts oficiais documentados.
- Scripts perigosos exigem confirmacao ou ambiente explicito.
- `pnpm validate` passa.

### PR 5 - Divida tecnica funcional por modulo

Escopo:

- Tratar TODOs e componentes grandes por modulo, sem misturar dominios.
- Criar planos especificos para `WorkoutBuilder`, `AlunoDetails`, biblioteca e periodizacao.

Criterios de aceite:

- Cada modulo tem plano proprio.
- Nao ha refatoracao estrutural sem testes.
- Alteracoes de UI incluem validacao manual.

## Validacao geral recomendada

Antes de mergear qualquer PR de limpeza:

```bash
pnpm install --frozen-lockfile
pnpm validate
```

Quando mexer em API local:

```bash
pnpm harness:reset-db
pnpm harness:smoke-api
```

Quando mexer em deploy ou variaveis:

```bash
pnpm harness:validate-env
```

## Decisoes

- A faxina sera feita em PRs pequenos contra `develop`.
- A `main` so recebe a faxina depois de estabilizada em `develop`.
- Remocoes de arquivos com acesso a banco foram feitas somente apos busca de referencias.
- Scripts operacionais oficiais ficam para PR proprio de documentacao/padronizacao.
- Documentos antigos com valor historico devem ir para `docs/archive/` ou ser marcados como complementares/legados.
