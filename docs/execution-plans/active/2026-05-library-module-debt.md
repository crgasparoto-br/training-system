# Plano: divida tecnica do modulo Biblioteca

## Objetivo

Melhorar o modulo de biblioteca de exercicios com foco em seguranca, tipagem, encoding, validacao de entrada e controle de acesso.

## Contexto

Arquivos principais:

- `apps/api/src/routes/library.routes.ts`
- `apps/api/src/modules/library/library.service.ts`

Sinais encontrados:

- Textos com encoding quebrado em comentarios e mensagens (`exercÃ­cios`).
- Uso de `(req as any).user` nas rotas.
- Uso de `any` em filtros (`const where: any`).
- Rotas usam `authMiddleware` e `professorMiddleware`, mas nao validam `screenKey`/`blockKey` especificos.
- Mutacoes de biblioteca podem precisar de permissao propria.
- Erros de dominio (`nao encontrado`) sao convertidos em 500 em alguns endpoints.

## Fora de escopo

- Redesenhar a biblioteca inteira.
- Alterar schema Prisma sem plano proprio.
- Alterar UX do frontend sem PR separado.

## Arquivos e modulos principais

- `apps/api/src/routes/library.routes.ts`
- `apps/api/src/modules/library/library.service.ts`
- `apps/api/src/modules/access-control/*`
- `packages/types/access-control.ts`
- `apps/web/src/components/ExerciseSelectorModal.tsx`

## Riscos

- Relaxar permissao de biblioteca.
- Expor exercicios de outro contrato.
- Quebrar importacao/uso de exercicios em montagem de treino.
- Remover progresso de aluno sem validar contrato.

## Sequencia recomendada de PRs

### PR A - Corrigir encoding e mensagens

- Corrigir textos quebrados em comentarios/mensagens.
- Nao alterar logica.
- Garantir que testes continuam passando.

### PR B - Tipar request autenticado

- Criar tipo local ou compartilhado para request com `user.contractId`.
- Remover `(req as any)` das rotas.
- Padronizar leitura de `contractId`.

### PR C - Validar entrada

- Adicionar schema Zod/validador para filtros e payloads.
- Retornar 400 para payload invalido.
- Evitar casts soltos em query params.

### PR D - Permissoes por tela/bloco

- Definir se biblioteca usa apenas `library` ou blocos/acoes adicionais.
- Adicionar `blockKey` se houver criacao/edicao/exclusao de exercicio.
- Aplicar middleware de acesso no backend.
- Atualizar frontend para ocultar acoes sem permissao.

### PR E - Erros de dominio

- Diferenciar 404, 403, 400 e 500.
- Garantir que exercicio inexistente no contrato nao vaze informacao de outro contrato.

## Criterios de aceite

- Sem `any` desnecessario nas rotas principais.
- Entradas validadas.
- Mutacoes protegidas por permissao adequada.
- Mensagens em pt-BR legiveis.
- `contractId` preservado em todas as consultas.
- `pnpm validate` passa.

## Validacao manual

- Listar exercicios.
- Criar exercicio com perfil autorizado.
- Bloquear criacao com perfil sem permissao.
- Editar/excluir exercicio do mesmo contrato.
- Tentar acessar exercicio de outro contrato e receber bloqueio/404.
- Validar seletor de exercicios no frontend.
