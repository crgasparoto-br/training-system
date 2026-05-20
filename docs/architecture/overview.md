# Visao geral da arquitetura

O `training-system` e um monorepo pnpm para o Sistema Acesso.

## Estrutura principal

- `apps/api`: backend Node.js/Express com Prisma.
- `apps/web`: frontend web.
- `apps/mobile`: aplicativo mobile quando aplicavel.
- `packages/types`: tipos e contratos compartilhados.
- `packages/utils`: utilitarios compartilhados.
- `packages/constants`: constantes compartilhadas.
- `docs`: documentacao versionada para produto, arquitetura, planos e qualidade.
- `scripts`: automacoes locais, validacoes estruturais e harness.

## Principios para desenvolvimento agent-first

1. O repositorio deve explicar como mudar o sistema sem depender de conversas antigas.
2. Regras importantes devem virar scripts, testes ou CI.
3. Toda mudanca grande deve possuir plano em `docs/execution-plans/active/`.
4. A documentacao deve ser curta, navegavel e proxima do codigo.
5. O Codex deve conseguir executar validacoes mecanicas antes de abrir PR.

## Fluxo recomendado

1. Criar branch a partir de `develop` ou `main`, conforme o fluxo do projeto.
2. Criar plano de execucao quando a tarefa envolver mais de um modulo.
3. Implementar em passos pequenos.
4. Atualizar docs e testes no mesmo PR.
5. Rodar `pnpm validate`.
6. Abrir PR com resumo, comandos executados e riscos conhecidos.

## Documentos relacionados

- `AGENTS.md`
- `docs/architecture/api.md`
- `docs/architecture/web.md`
- `docs/architecture/database.md`
- `docs/architecture/auth-and-access-control.md`
- `docs/architecture/deployment.md`
- `docs/product/access-control.md`
- `docs/quality/validation.md`
