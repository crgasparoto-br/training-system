# Plano: faxina tecnica do repositorio

## Objetivo

Organizar o `training-system` em uma sequencia de PRs pequenos, seguros e revisaveis, removendo sujeira acumulada sem alterar comportamento funcional do Sistema Acesso.

## Contexto

O PR de harness engineering foi mergeado na `develop`, criando `AGENTS.md`, documentacao de arquitetura, scripts de validacao e workflow de PR. A faxina passou a usar esses trilhos.

## Fora de escopo deste plano

- Alterar codigo de runtime sem necessidade.
- Alterar schema Prisma sem plano proprio.
- Alterar permissoes, telas, rotas ou comportamento de usuario.
- Corrigir todos os problemas encontrados de uma vez.

## Resumo da situacao atual

A faxina principal de baixo risco foi quase toda executada. O restante do trabalho agora esta concentrado em trilhas separadas de modulo ou de schema, com risco mais alto e necessidade de validacao mais cuidadosa.

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

Status: concluido.

Resultado:

- Criado `docs/execution-plans/active/2026-05-workout-builder-debt.md`.
- Criado `docs/execution-plans/active/2026-05-aluno-details-debt.md`.
- Criado `docs/execution-plans/active/2026-05-library-module-debt.md`.
- Criado `docs/execution-plans/active/2026-05-periodization-schema-debt.md`.

### Desdobramentos ja concluidos apos o plano inicial

Status: concluido.

Resultado:

- Biblioteca PR A, B e C concluidas: encoding/mensagens, tipagem do request autenticado e validacao de entrada.
- Documentacao historica da Biblioteca consolidada em `docs/archive/` com apontadores estaveis.
- Guia historico de deploy interno consolidado em `docs/archive/` com apontador estavel.
- Script `job:normalize-upload-urls` oficializado e com entrypoint corrigido.
- Script `import-exercises` recebeu suporte a `--dry-run`.

## Problemas restantes

### 1. Scripts operacionais ainda com melhoria pendente

Pendencias mais claras neste momento:

- adicionar `--dry-run` em `db:clone-contract-data`;
- decidir se `normalize-upload-urls` deve ganhar `--dry-run` ou confirmacao explicita antes de escrita.

Classificacao: risco medio.

### 2. Biblioteca: permissoes e erros de dominio

Ainda faltam os recortes de maior sensibilidade do plano da Biblioteca:

- revisar `screenKey` e `blockKey` para criacao, edicao e exclusao;
- diferenciar 400, 403, 404 e 500 sem vazar dados de outro contrato.

Classificacao: risco medio a alto.

### 3. WorkoutBuilder e AlunoDetails

As duas trilhas restantes ja se aproximam mais de refatoracao controlada do que de faxina leve:

- `WorkoutBuilder`: remover mock, integrar persistencia e conectar com biblioteca;
- `AlunoDetails`: separar responsabilidades sem relaxar acesso a dados pessoais, financeiros e de saude.

Classificacao: risco alto.

### 4. Periodizacao/schema Prisma

A auditoria inicial desta frente comecou nesta rodada, mas ainda restam passos antes de qualquer integracao real:

- confirmar se `schema_periodization.prisma` ficara apenas como referencia, sera integrado ou sera arquivado;
- corrigir encoding do arquivo auxiliar se ele continuar relevante;
- evitar qualquer migration antes de uma comparacao completa com `schema.prisma` e migrations existentes.

Classificacao: risco medio a alto.

## Proximos PRs recomendados

### PR 6 - Auditoria documental de periodizacao/schema

Escopo sugerido:

- registrar que `schema.prisma` e a fonte ativa;
- marcar `schema_periodization.prisma` como arquivo auxiliar de referencia;
- atualizar o plano da trilha para refletir o status da auditoria.

### PR 7 - Script operacional de menor risco restante

Opcao recomendada:

- adicionar `--dry-run` em `db:clone-contract-data` ou definir confirmacao explicita antes de operacoes destrutivas.

### PR 8 - Biblioteca PR D

Escopo sugerido:

- revisar `screenKey` e `blockKey` do modulo `library`;
- proteger mutacoes e manter frontend coerente com as permissoes.

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
- `apps/api/prisma/schema.prisma` segue como fonte de verdade ativa do Prisma ate nova decisao explicita.
