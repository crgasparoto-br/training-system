# Plano: faxina tecnica do repositorio

## Objetivo

Organizar o `training-system` em uma sequencia de PRs pequenos, seguros e revisaveis, removendo sujeira acumulada sem alterar comportamento funcional do Sistema Acesso.

## Contexto

O PR de harness engineering ja foi mergeado na `develop`, criando `AGENTS.md`, documentacao de arquitetura, scripts de validacao e workflow de PR. Este plano inicia a faxina usando esses trilhos.

A primeira etapa e diagnostica: listar problemas, classificar risco e definir a ordem de PRs. Nenhuma remocao ou refatoracao funcional deve ser feita neste PR.

## Fora de escopo deste PR

- Remover arquivos.
- Reorganizar pastas.
- Alterar codigo de runtime.
- Alterar schema Prisma.
- Alterar permissoes, telas, rotas ou comportamento de usuario.
- Corrigir todos os problemas encontrados de uma vez.

## Resumo da situacao atual

Foram encontrados sinais de sujeira tecnica em quatro grupos principais:

1. Arquivos temporarios ou scripts avulsos de diagnostico.
2. Documentacao antiga, duplicada ou backup local versionado.
3. Scripts operacionais misturados com codigo de aplicacao.
4. Areas funcionais grandes que merecem refatoracao futura, mas nao devem ser tratadas como limpeza segura imediata.

## Problemas encontrados

### 1. Arquivos temporarios e scripts avulsos de banco

Arquivos candidatos a remocao, consolidacao ou movimentacao para `scripts/`:

- `query_db.js`
- `apps/api/query_db.ts`
- `apps/api/query_db_list.ts`
- `apps/api/query_db_gasparoto.ts`
- `apps/api/list_contracts.ts`
- `apps/api/update_user.js`
- `apps/api/check_user_tmp.mjs`

Observacoes:

- Alguns arquivos usam e-mail fixo de usuario real.
- Alguns arquivos instanciam Prisma ou cliente PostgreSQL diretamente.
- Alguns parecem ter sido criados para diagnostico pontual de producao/local.
- Antes de remover, confirmar se nenhum workflow, README ou script oficial referencia esses arquivos.

Classificacao: risco baixo a medio.

Motivo: parecem avulsos, mas podem ter sido usados manualmente para suporte. A remocao e segura apenas apos busca de referencias e validacao local.

### 2. Backup local versionado

Arquivo candidato a revisao:

- `docs/visual-guidelines.local-backup-20260420-165809.md`

Observacoes:

- O nome indica backup local versionado.
- Pode estar duplicando uma versao oficial de diretrizes visuais.
- Deve ser comparado com a documentacao visual atual antes de remover.

Classificacao: risco baixo.

### 3. Documentacao possivelmente sobreposta

Arquivos que podem precisar de consolidacao ou novo indice:

- `docs/ACCESS_CONTROL.md`
- `docs/architecture/auth-and-access-control.md`
- `docs/product/access-control.md`
- `README.md`
- `docs/internal-test-deploy.md`
- `docs/BIBLIOTECA_MELHORIAS.md`
- `docs/CHECKLIST_TESTES_BIBLIOTECA.md`

Observacoes:

- O PR de harness criou uma estrutura nova em `docs/architecture/` e `docs/product/`.
- Documentos antigos podem continuar uteis, mas devem apontar para a nova fonte de verdade ou serem movidos para `docs/archive/`.

Classificacao: risco baixo a medio.

### 4. Scripts operacionais misturados ao runtime

Arquivos em `apps/api/src/scripts/` parecem validos, mas precisam de padrao claro:

- `apps/api/src/scripts/backfill-profile-review-settings.ts`
- `apps/api/src/scripts/backfill-student-contract-links.ts`
- `apps/api/src/scripts/clone-contract-data.ts`
- `apps/api/src/scripts/dispatch-profile-reviews.ts`
- `apps/api/src/scripts/import-exercises.ts`
- `apps/api/src/scripts/normalize-upload-urls.mjs`

Observacoes:

- Esses arquivos provavelmente sao scripts reais, nao sujeira.
- A faxina deve apenas documentar quando usar cada script e quais variaveis exigem.
- Evitar mover sem necessidade para nao quebrar comandos do `apps/api/package.json`.

Classificacao: risco medio.

### 5. TODOs e pendencias em areas funcionais

Arquivos com sinais de TODO ou pendencias futuras:

- `apps/api/prisma/seed.ts`
- `apps/web/src/pages/WorkoutBuilder/index.tsx`
- `apps/api/src/routes/library.routes.ts`
- `apps/api/src/modules/library/library.service.ts`
- `apps/web/src/pages/AlunoDetails.tsx`
- `apps/web/src/pages/WorkoutBuilder2/ResistanceDayTable.tsx`
- `apps/api/prisma/schema_periodization.prisma`

Observacoes:

- Estes pontos nao devem ser limpos no primeiro PR funcional.
- Alguns indicam divida tecnica real ou features incompletas.
- Devem virar planos especificos ou issues, nao remocao automatica.

Classificacao: risco medio a alto.

### 6. Uso de logs em arquivos diversos

A busca por `console.log` retornou scripts, testes, main e componentes. Logs em scripts podem ser aceitaveis; logs em runtime ou componentes devem ser avaliados.

Classificacao: risco baixo a medio.

## O que pode ser limpo sem alterar comportamento

Candidatos para PR seguro apos validacao:

1. Remover ou arquivar arquivos explicitamente temporarios:
   - `apps/api/check_user_tmp.mjs`
   - scripts de query avulsos sem referencia externa.

2. Remover backup local versionado se houver documento oficial equivalente:
   - `docs/visual-guidelines.local-backup-20260420-165809.md`

3. Criar `docs/archive/` para documentos antigos que ainda possam ter valor historico.

4. Atualizar README ou docs antigas para apontar para as novas fontes:
   - `docs/architecture/*`
   - `docs/product/*`
   - `docs/quality/validation.md`

## O que exige cuidado ou testes adicionais

1. Qualquer arquivo que altere banco ou usuarios:
   - `apps/api/update_user.js`
   - `query_db.js`
   - `apps/api/query_db*.ts`
   - `apps/api/list_contracts.ts`

2. Scripts em `apps/api/src/scripts/` chamados por `apps/api/package.json`.

3. Refatoracao de telas grandes como:
   - `apps/web/src/pages/AlunoDetails.tsx`
   - `apps/web/src/pages/WorkoutBuilder/index.tsx`
   - `apps/web/src/pages/WorkoutBuilder2/ResistanceDayTable.tsx`

4. Qualquer ajuste em permissoes, `screenKey`, `blockKey` ou `dataScope`.

## Ordem recomendada de PRs pequenos

### PR 1 - Diagnostico da faxina

Escopo:

- Criar este plano.
- Nao alterar comportamento.

Criterios de aceite:

- Plano versionado em `docs/execution-plans/active/`.
- Proximos PRs descritos com risco e validacao.

Validacao:

```bash
pnpm docs:check
```

### PR 2 - Limpeza segura de arquivos temporarios

Escopo:

- Buscar referencias aos arquivos candidatos.
- Remover arquivos temporarios sem uso confirmado.
- Se algum script ainda for util, mover para `scripts/manual/` ou documentar em `docs/quality/validation.md`.

Candidatos iniciais:

- `apps/api/check_user_tmp.mjs`
- `query_db.js`
- `apps/api/query_db.ts`
- `apps/api/query_db_list.ts`
- `apps/api/query_db_gasparoto.ts`
- `apps/api/list_contracts.ts`
- `apps/api/update_user.js`

Criterios de aceite:

- Nenhum script oficial quebra.
- Nenhuma referencia pendente aos arquivos removidos.
- `pnpm validate` passa.

### PR 3 - Consolidacao de documentacao

Escopo:

- Comparar docs antigas com a nova estrutura.
- Mover documentos historicos para `docs/archive/` ou atualizar links.
- Definir fonte de verdade para acesso, deploy, biblioteca e visual.

Candidatos iniciais:

- `docs/ACCESS_CONTROL.md`
- `docs/internal-test-deploy.md`
- `docs/BIBLIOTECA_MELHORIAS.md`
- `docs/CHECKLIST_TESTES_BIBLIOTECA.md`
- `docs/visual-guidelines.local-backup-20260420-165809.md`

Criterios de aceite:

- README aponta para a documentacao nova.
- Docs antigas relevantes nao somem sem substituto.
- `pnpm docs:check` passa.

### PR 4 - Padronizacao de scripts operacionais

Escopo:

- Documentar scripts reais de operacao.
- Garantir que cada script tenha finalidade, pre-requisitos e comando oficial.
- Evitar scripts destrutivos sem protecao.

Candidatos iniciais:

- `apps/api/src/scripts/backfill-profile-review-settings.ts`
- `apps/api/src/scripts/backfill-student-contract-links.ts`
- `apps/api/src/scripts/clone-contract-data.ts`
- `apps/api/src/scripts/dispatch-profile-reviews.ts`
- `apps/api/src/scripts/import-exercises.ts`
- `apps/api/src/scripts/normalize-upload-urls.mjs`

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
- O primeiro PR e apenas diagnostico e planejamento.
- Remocoes de arquivos com acesso a banco devem ser feitas somente apos busca de referencias.

## Pendencias para o proximo PR

- Confirmar referencias aos arquivos temporarios.
- Remover ou arquivar os arquivos sem uso.
- Atualizar `.gitignore` caso existam padroes de backup/tmp que nao deveriam ser versionados.
