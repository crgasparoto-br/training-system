# Plano: divida tecnica de periodizacao e schema Prisma

## Objetivo

Regularizar a area de periodizacao, especialmente o arquivo separado `schema_periodization.prisma`, antes de novas implementacoes de montagem de treino e matriz de periodizacao.

## Status atual

PR A de auditoria documental em andamento nesta branch.

Achados iniciais:

- `apps/api/prisma/schema.prisma` segue como fonte de verdade ativa do Prisma.
- `apps/api/prisma/schema_periodization.prisma` descreve modelos de periodizacao, mas ainda sem status explicito no proprio arquivo.
- O arquivo auxiliar referencia `TrainingPlan`, entao qualquer integracao real precisa ser comparada contra o schema principal e migrations existentes antes de mudar banco.
- As fontes de verdade atuais nao tratam `schema_periodization.prisma` como schema ativo.
- O arquivo auxiliar ainda possui comentarios com encoding quebrado, mas essa correcao ampla fica para PR separada se o arquivo continuar relevante.

## Contexto

Arquivo identificado:

- `apps/api/prisma/schema_periodization.prisma`

Sinais encontrados:

- Arquivo Prisma separado do schema principal.
- Comentarios com encoding quebrado.
- Modelos de periodizacao parecem relevantes, mas precisam ser confirmados contra o schema principal e migrations existentes.
- Relacoes como `TrainingPlan` podem depender de modelos definidos em outro schema.

## Fora de escopo

- Copiar modelos para o schema principal sem analise.
- Criar migration sem revisar impacto.
- Alterar WorkoutBuilder no mesmo PR.

## Arquivos e modulos principais

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/schema_periodization.prisma`
- `apps/api/prisma/migrations/*`
- `apps/web/src/pages/WorkoutBuilder/*`
- `apps/web/src/pages/WorkoutBuilder2/*`
- `packages/types/*`

## Riscos

- Divergencia entre schema real e schema auxiliar.
- Migration acidental criando/removendo tabelas incorretas.
- Quebra de build Prisma.
- Perda de clareza para Codex/agentes sobre qual schema e fonte de verdade.

## Sequencia recomendada de PRs

### PR A - Auditoria de schema

Status: concluido nesta branch, pendente de merge.

Resultado desta rodada:

- Registrado no arquivo auxiliar que ele nao faz parte do fluxo ativo de migrations.
- Registrado em `docs/architecture/database.md` que `schema.prisma` e a fonte ativa.
- Mantida a decisao de nao integrar modelos nem gerar migration nesta etapa.

### PR B - Corrigir encoding/documentacao

- Corrigir textos quebrados se o arquivo continuar relevante.
- Adicionar cabecalho explicando se e referencia, rascunho ou fonte ativa.

### PR C - Integracao controlada, se necessaria

- Integrar modelos ao schema principal apenas com migration revisada.
- Rodar `prisma validate`, `prisma generate`, testes e build.
- Atualizar docs de banco.

### PR D - Conectar com WorkoutBuilder

- Somente apos schema estabilizado.
- Definir contrato de dados compartilhado.
- Implementar endpoints e frontend em PRs separados.

## Criterios de aceite

- Existe uma unica fonte de verdade para schema Prisma ativo.
- Arquivos auxiliares possuem status claro: ativo, referencia ou arquivo historico.
- Nenhum modelo de periodizacao fica duplicado ou divergente.
- `pnpm --filter @corrida/api type-check` passa.
- `pnpm validate` passa.

## Validacao manual

- Rodar Prisma validate/generate.
- Conferir migrations geradas, se houver.
- Testar carregamento de planos/periodizacao em ambiente local.
