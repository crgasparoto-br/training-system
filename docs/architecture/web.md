# Arquitetura do frontend web

O frontend web fica em `apps/web`.

## Responsabilidades

- Renderizar telas do Sistema Acesso.
- Consumir a API autenticada.
- Ocultar menus, telas, abas e acoes conforme permissao recebida da API.
- Nunca confiar apenas no frontend para seguranca; a API deve revalidar permissoes.

## Regras para novas telas

- Nova tela deve possuir `screenKey` no catalogo compartilhado quando precisar de permissao.
- Nova aba, bloco ou acao sensivel deve possuir `blockKey` no catalogo compartilhado.
- Menu lateral deve ocultar itens sem permissao.
- Telas longas devem agrupar secoes relacionadas em componentes colapsaveis quando isso melhorar a usabilidade.

## Contrato com a API

O frontend pode usar permissoes para experiencia de usuario, mas a API continua sendo a fonte de seguranca. Nunca exponha dados sensiveis assumindo que ocultar componente e suficiente.

## Fluxo web do aluno: revisao cadastral

A implementacao web responsiva e a experiencia canonica atual para a revisao cadastral do aluno; um futuro app mobile deve reutilizar o mesmo contrato `/api/v1/student/me`, sem criar regras paralelas.

- `/inicio` sinaliza a revisao pendente a partir do resumo autenticado do aluno.
- `/student/profile-review` carrega `GET /api/v1/student/me/profile-review` e `GET /api/v1/student/me/profile`.
- A conclusao usa `POST /api/v1/student/me/profile-reviews/:id/complete`.
- Quando houver contexto contratual selecionado, os requests `student/me` preservam `x-contract-id`; a API continua responsavel por validar vinculo ativo e isolamento multi-tenant.
- Campos nao sensiveis podem ser aplicados diretamente. Campos sensiveis permanecem em analise e a mensagem de sucesso deve refletir a resposta do backend, nunca inferencia local do frontend.
- Falha de carregamento ou submissao deve manter estado recuperavel e nunca exibir conclusao falsa.
- A tela deve funcionar em mobile e desktop, sem overflow horizontal, e manter as acoes principais acessiveis por teclado.

A matriz de regressao do fluxo esta em `docs/profile-review-e2e-validation.md`. O contrato de payloads e campos permanece em `docs/student-app-data-contract.md`.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm lint`
- `pnpm test`
- `pnpm access:check`
