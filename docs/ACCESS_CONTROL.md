# Controle de acesso por perfil

> Status: documento complementar/legado.
>
> Fontes de verdade atuais:
> - [`architecture/auth-and-access-control.md`](./architecture/auth-and-access-control.md)
> - [`product/access-control.md`](./product/access-control.md)
>
> Este arquivo preserva detalhes operacionais e exemplos historicos. Ao alterar regras de acesso, atualize primeiro as fontes de verdade acima.

O controle de acesso usa a funcao cadastrada em `CollaboratorFunctionOption` como perfil. Cada perfil possui linhas em `AccessPermission` e quatro camadas:

1. Tela: `screenKey` com `blockKey` vazio define se o usuario pode entrar na tela.
2. Bloco/aba: `blockKey` preenchido define quais blocos internos ficam visiveis.
3. Acao sensivel: `blockKey` de acao define quais operacoes criticas podem ser executadas.
4. Escopo de dados: `dataScope` define quais registros podem ser consultados ou alterados dentro da tela.

## Onde cadastrar telas e blocos

1. Adicione a tela em `packages/types/access-control.ts`, no `ACCESS_SCREEN_CATALOG`.
2. Inclua o `screenKey` da tela em `ACCESS_PERMISSION_GROUPS`.
3. Se a tela tiver abas, blocos, secoes internas ou acoes sensiveis, adicione cada item em `ACCESS_BLOCK_CATALOG`.
4. Inclua a tela/bloco nos defaults de `DEFAULT_ACCESS_BY_PROFILE_CODE` quando fizer sentido.
5. Se a tela precisar limitar registros, inclua o `screenKey` em `ACCESS_DATA_SCOPE_SCREEN_KEYS` e defina fallback em `dataScopes`.
6. No menu lateral, informe o `screenKey` no item em `apps/web/src/navigation/sidebarMenu.ts`.
7. Na rota React, envolva o componente com `withAccess('screen.key', <Tela />)` em `apps/web/src/App.tsx`.
8. Em blocos internos e acoes sensiveis no frontend, use `canAccessBlock(user, 'screen.blockOrAction')`.
9. Em endpoints da API que precisam respeitar tela, use `screenAccessMiddleware('screen.key')`.
10. Em endpoints de mutacao de blocos/acoes sensiveis, use `blockAccessMiddleware('screen.actionKey')`.
11. Para dados de colaboradores, calcule o escopo efetivo no backend antes de consultar ou alterar registros.

## Exemplo pratico: tela de aluno (`students.details`)

- Permissao de tela: `students.details`.
- Permissoes de blocos internos:
  - `students.details.summary`
  - `students.details.financialContract`
  - `students.details.assessments`
- Permissoes de acoes sensiveis:
  - `students.actions.manageAssessments`
  - `students.actions.manageFinancialContract`
  - `students.actions.resetPassword`

Resultado esperado:

- Usuario sem `students.details` nao acessa a tela.
- Usuario com `students.details` e sem bloco da aba nao ve a aba.
- Usuario com bloco da aba, mas sem acao sensivel, pode ter acesso somente de leitura.
- Operacoes criticas sempre sao validadas no backend.

## Escopos de dados

Os escopos iniciais valem para:

- `collaborators.registration`
- `collaborators.consultation`

Escopos disponiveis:

- `self`: acessa somente o proprio cadastro de colaborador, identificado pelo `professorId` do usuario autenticado.
- `managed`: acessa o proprio cadastro e colaboradores com `responsibleManagerId` igual ao `professorId` autenticado.
- `contract`: acessa todos os colaboradores do contrato.
- `null` ou ausencia de permissao de tela: sem escopo efetivo.

Usuarios com `ProfessorRole.master` equivalem a `contract`.

Se `dataScope` estiver vazio em uma linha antiga de `AccessPermission`, o backend usa o fallback definido em `DEFAULT_ACCESS_BY_PROFILE_CODE`.

## Permissoes iniciais

- Perfil `professor`: acessa cadastro de colaboradores, visualiza apenas a aba `Colaborador` e usa escopo `self`.
- Perfil `manager`: acessa cadastro e consulta de colaboradores, visualiza abas `Colaborador` e `Gestor`, e usa escopo `contract` para preservar comportamento historico.
- Usuarios com `ProfessorRole.master` tem acesso total independentemente das linhas da tabela.

## Gestao no sistema

A tela `Configuracoes > Funcoes de colaboradores` lista telas, blocos internos e acoes sensiveis cadastrados no catalogo, organizados por `ACCESS_PERMISSION_GROUPS`. Para telas com escopo de dados, tambem exibe seletor `Escopo dos dados`.

Perfis antigos ou recem-criados sem linhas em `AccessPermission` recebem automaticamente a matriz padrao definida no catalogo compartilhado.
