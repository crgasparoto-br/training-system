# Guia para agentes

Este arquivo e o mapa inicial para humanos e agentes que trabalham no `training-system`. Mantenha curto. Detalhes devem ficar em `docs/`.

## Antes de alterar codigo

1. Leia `ARCHITECTURE.md` para entender invariantes, fronteiras e fluxo de validacao.
2. Leia `docs/architecture/overview.md` para a visao geral complementar.
3. Para API, leia `docs/architecture/api.md`.
4. Para frontend web, leia `docs/architecture/web.md`.
5. Para banco e Prisma, leia `docs/architecture/database.md`.
6. Para autenticacao, funcoes, telas, blocos e escopo de dados, leia `docs/architecture/auth-and-access-control.md` e `docs/product/access-control.md`.
7. Para fluxo de aluno, prontuario, avaliacao fisica, prescricao, treino de hoje, feedback ou decisao tecnica, leia `docs/product/integrated-prescription-control.md`.
8. Para deploy, leia `docs/architecture/deployment.md`.

## Tarefas grandes

Para mudancas que envolvem mais de um modulo, crie ou atualize um plano em `docs/execution-plans/active/` usando `docs/execution-plans/TEMPLATE.md`.

Ao terminar, mova o plano para `docs/execution-plans/completed/` ou mantenha em `active/` com pendencias claras.

## Validacao obrigatoria

Antes de abrir PR ou concluir uma tarefa, rode:

```bash
pnpm validate
```

Se a mudanca for pequena e algum passo for inviavel no ambiente local, registre no PR quais comandos foram executados e qual foi o bloqueio.

## Regras de seguranca e arquitetura

- Nunca retorne dados fora do `contractId` do usuario autenticado.
- Telas usam `screenKey`.
- Abas, blocos internos e acoes usam `blockKey`.
- Escopo de dados usa `self`, `managed` ou `contract` somente nas telas listadas em `ACCESS_DATA_SCOPE_SCREEN_KEYS`.
- Novas telas e blocos devem ser adicionados ao catalogo compartilhado em `packages/types/access-control.ts`.
- Novas variaveis de ambiente devem aparecer em `.env.example` e na documentacao de deploy.
- Mudancas em schema Prisma devem atualizar documentacao e testes relacionados.
