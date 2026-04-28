# Controle de acesso por perfil

O controle de acesso usa a funcao cadastrada em `CollaboratorFunctionOption` como perfil. Cada perfil possui linhas em `AccessPermission`, com permissoes de tela (`blockKey` vazio) e de bloco interno (`blockKey` preenchido).

## Onde cadastrar telas e blocos

1. Adicione a tela em `packages/types/access-control.ts`, no `ACCESS_SCREEN_CATALOG`.
2. Inclua o `screenKey` da tela em um grupo de `ACCESS_PERMISSION_GROUPS`, que define a hierarquia exibida no bloco de permissoes.
3. Se a tela tiver abas, blocos ou secoes internas, adicione cada bloco em `ACCESS_BLOCK_CATALOG`, apontando para o `screenKey` da tela.
4. Inclua a tela/bloco nos defaults de `DEFAULT_ACCESS_BY_PROFILE_CODE` quando fizer sentido para novos perfis ou perfis ainda sem matriz no banco.
5. No menu lateral, informe o `screenKey` no item em `apps/web/src/layouts/DashboardLayout.tsx`.
6. Na rota React, envolva o componente com `withAccess('screen.key', <Tela />)` em `apps/web/src/App.tsx`.
7. Em blocos internos, use `canAccessBlock(user, 'screen.block')` para decidir se o trecho deve renderizar.
8. Em endpoints da API que precisam respeitar tela, use `screenAccessMiddleware('screen.key')` ou uma lista de telas permitidas.

## Permissoes iniciais

- Perfil `professor` representa o exemplo de Colaborador: acessa a tela de cadastro de colaboradores e visualiza apenas a aba `Colaborador`.
- Perfil `manager` representa Gestor: acessa a tela de cadastro de colaboradores e visualiza as abas `Colaborador` e `Gestor`.
- Usuarios com `ProfessorRole.master` tem acesso total independentemente das linhas da tabela.

## Gestao no sistema

A tela `Configuracoes > Funcoes de colaboradores` lista as telas e blocos cadastrados no catalogo, organizados pela hierarquia de `ACCESS_PERMISSION_GROUPS`. Os grupos e telas com blocos internos podem ser expandidos ou recolhidos. Ao salvar uma funcao, o sistema grava uma matriz explicita de permissoes para aquele perfil.

Perfis antigos ou recem-criados sem linhas em `AccessPermission` recebem automaticamente a matriz padrao definida no catalogo compartilhado.
