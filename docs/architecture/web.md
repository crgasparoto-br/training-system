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

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm lint`
- `pnpm test`
- `pnpm access:check`
