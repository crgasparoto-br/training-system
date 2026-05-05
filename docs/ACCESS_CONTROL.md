# Controle de acesso por perfil

O controle de acesso usa a funcao cadastrada em `CollaboratorFunctionOption` como perfil. Cada perfil possui linhas em `AccessPermission` e agora possui tres camadas:

1. Tela: `screenKey` com `blockKey` vazio define se o usuario pode entrar na tela.
2. Bloco/aba: `blockKey` preenchido define quais blocos internos ficam visiveis.
3. Escopo de dados: `dataScope` define quais registros podem ser consultados ou alterados dentro da tela.

## Onde cadastrar telas e blocos

1. Adicione a tela em `packages/types/access-control.ts`, no `ACCESS_SCREEN_CATALOG`.
2. Inclua o `screenKey` da tela em um grupo de `ACCESS_PERMISSION_GROUPS`, que define a hierarquia exibida no bloco de permissoes.
3. Se a tela tiver abas, blocos ou secoes internas, adicione cada bloco em `ACCESS_BLOCK_CATALOG`, apontando para o `screenKey` da tela.
4. Inclua a tela/bloco nos defaults de `DEFAULT_ACCESS_BY_PROFILE_CODE` quando fizer sentido para novos perfis ou perfis ainda sem matriz no banco.
5. Se a tela precisar limitar registros, inclua o `screenKey` em `ACCESS_DATA_SCOPE_SCREEN_KEYS` e defina o fallback em `dataScopes`.
6. No menu lateral, informe o `screenKey` no item em `apps/web/src/layouts/DashboardLayout.tsx`.
7. Na rota React, envolva o componente com `withAccess('screen.key', <Tela />)` em `apps/web/src/App.tsx`.
8. Em blocos internos, use `canAccessBlock(user, 'screen.block')` para decidir se o trecho deve renderizar.
9. Em endpoints da API que precisam respeitar tela, use `screenAccessMiddleware('screen.key')` ou uma lista de telas permitidas.
10. Para dados de colaboradores, calcule o escopo efetivo no backend antes de consultar ou alterar registros.

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

Se `dataScope` estiver vazio em uma linha antiga de `AccessPermission`, o backend usa o fallback definido em `DEFAULT_ACCESS_BY_PROFILE_CODE`. Isso mantem compatibilidade com perfis antigos que tinham apenas `canView`.

## Permissoes iniciais

- Perfil `professor` representa o exemplo de Colaborador: acessa a tela de cadastro de colaboradores, visualiza apenas a aba `Colaborador` e usa escopo `self` para dados de colaboradores.
- Perfil `manager` representa Gestor: acessa cadastro e consulta de colaboradores, visualiza as abas `Colaborador` e `Gestor`, e usa escopo `contract` para preservar o comportamento historico de acesso ao contrato.
- Usuarios com `ProfessorRole.master` tem acesso total independentemente das linhas da tabela.

## Exemplo pratico

Uma funcao Professor pode ter acesso a tela `Consultar Colaboradores` e ainda assim usar `dataScope: self`. Nesse caso, `GET /api/v1/professores` retorna somente o proprio cadastro. Se tentar atualizar, resetar senha, desativar ou validar dados de outro colaborador, a API retorna `403` com mensagem de acesso negado por escopo.

Gestores e masters podem ter escopo mais amplo. Com `contract`, a listagem segue retornando todos os colaboradores do contrato.

## Gestao no sistema

A tela `Configuracoes > Funcoes de colaboradores` lista as telas e blocos cadastrados no catalogo, organizados pela hierarquia de `ACCESS_PERMISSION_GROUPS`. Os grupos e telas com blocos internos podem ser expandidos ou recolhidos. Para telas com escopo de dados, a tela exibe tambem o seletor `Escopo dos dados`. Ao salvar uma funcao, o sistema grava uma matriz explicita de permissoes para aquele perfil.

Perfis antigos ou recem-criados sem linhas em `AccessPermission` recebem automaticamente a matriz padrao definida no catalogo compartilhado.
