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

Resultado:

- Removidos scripts temporarios/avulsos de banco.
- Atualizado `.gitignore` para evitar novos arquivos temporarios semelhantes.

### PR 3 - Consolidacao de documentacao

Status: concluido.

Resultado:

- Criado `docs/README.md` como indice da documentacao.
- Atualizado `README.md` para apontar para as fontes de verdade atuais.
- Marcado `docs/ACCESS_CONTROL.md` como documento legado/complementar.
- Preservado backup visual em `docs/archive/visual-guidelines.local-backup-20260420-165809.md`.
- Removido backup local versionado da raiz de `docs/`.

### PR 4 - Padronizacao de scripts operacionais

Status: concluido.

Resultado:

- Criado `docs/operations/api-scripts.md` com scripts oficiais da API.
- Documentados finalidade, comandos, variaveis, suporte a `--dry-run`, nivel de risco e recomendacoes.
- Adicionado `docs/operations/` ao indice `docs/README.md`.
- Adicionado `reports/` ao `.gitignore` para relatorios gerados localmente por scripts.

### PR 5 - Divida tecnica funcional por modulo

Status: em andamento/concluido nesta branch.

Resultado:

- Criado `docs/execution-plans/active/2026-05-workout-builder-debt.md`.
- Criado `docs/execution-plans/active/2026-05-aluno-details-debt.md`.
- Criado `docs/execution-plans/active/2026-05-library-module-debt.md`.
- Criado `docs/execution-plans/active/2026-05-periodization-schema-debt.md`.

## Problemas restantes

### 1. Documentacao complementar ainda a revisar

Arquivos que podem precisar de consolidacao futura:

- `docs/internal-test-deploy.md`
- `docs/BIBLIOTECA_MELHORIAS.md`
- `docs/CHECKLIST_TESTES_BIBLIOTECA.md`

Classificacao: risco baixo a medio.

### 2. Melhorias futuras em scripts operacionais

Alguns scripts oficiais ainda podem ser melhorados em PRs futuros:

- adicionar `--dry-run` em `db:clone-contract-data`;
- adicionar `--dry-run` em `import-exercises`;
- criar comando oficial para `normalize-upload-urls.mjs` se ele voltar a ser usado;
- exigir confirmacao explicita para scripts destrutivos ou de alto impacto.

Classificacao: risco medio.

### 3. Dividas funcionais planejadas

Planos especificos foram criados para:

- `WorkoutBuilder`: remocao de mocks/TODOs e integracao real.
- `AlunoDetails`: reducao de complexidade e separacao de responsabilidades.
- `library`: tipagem, encoding, validacao e permissoes.
- periodizacao/schema: regularizacao de schema auxiliar e fonte de verdade Prisma.

Classificacao: risco medio a alto.

## Proximos PRs recomendados

### PR 6 - Escolher primeira divida funcional de baixo risco

Opcao recomendada: `library` PR A.

Escopo sugerido:

- Corrigir encoding de comentarios/mensagens em `library.routes.ts` e `library.service.ts`.
- Nao alterar logica.
- Preparar PR seguinte para tipagem e validacao.

### PR 7 - Tipagem/validacao do modulo escolhido

Escopo sugerido:

- Remover `any` desnecessario.
- Adicionar validacao de payload/query.
- Preservar `contractId`.

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
- Scripts operacionais oficiais ficam documentados em `docs/operations/api-scripts.md`.
- Documentos antigos com valor historico devem ir para `docs/archive/` ou ser marcados como complementares/legados.
- Refatoracoes funcionais so devem ocorrer depois de plano especifico por modulo.
