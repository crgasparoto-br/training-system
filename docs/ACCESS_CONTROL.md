# Controle de acesso por perfil

O controle de acesso usa a função cadastrada em `CollaboratorFunctionOption` como perfil. Cada perfil possui linhas em `AccessPermission`, com permissões de tela (`blockKey` vazio) e de bloco interno (`blockKey` preenchido).

## Onde cadastrar telas e blocos

1. Adicione a tela em `packages/types/access-control.ts`, no `ACCESS_SCREEN_CATALOG`.
2. Se a tela tiver abas, blocos ou seções internas, adicione cada bloco em `ACCESS_BLOCK_CATALOG`, apontando para o `screenKey` da tela.
3. Inclua a tela/bloco nos defaults de `DEFAULT_ACCESS_BY_PROFILE_CODE` quando fizer sentido para novos perfis ou perfis ainda sem matriz no banco.
4. No menu lateral, informe o `screenKey` no item em `apps/web/src/layouts/DashboardLayout.tsx`.
5. Na rota React, envolva o componente com `withAccess('screen.key', <Tela />)` em `apps/web/src/App.tsx`.
6. Em blocos internos, use `canAccessBlock(user, 'screen.block')` para decidir se o trecho deve renderizar.
7. Em endpoints da API que precisam respeitar tela, use `screenAccessMiddleware('screen.key')` ou uma lista de telas permitidas.

## Permissões iniciais

- Perfil `professor` representa o exemplo de Colaborador: acessa a tela de cadastro de colaboradores e visualiza apenas a aba `Colaborador`.
- Perfil `manager` representa Gestor: acessa a tela de cadastro de colaboradores e visualiza as abas `Colaborador` e `Gestor`.
- Usuários com `ProfessorRole.master` têm acesso total independentemente das linhas da tabela.

## Gestão no sistema

A tela `Configurações > Funções de colaboradores` lista as telas e blocos cadastrados no catálogo. Ao salvar uma função, o sistema grava uma matriz explícita de permissões para aquele perfil.

Perfis antigos ou recém-criados sem linhas em `AccessPermission` recebem automaticamente a matriz padrão definida no catálogo compartilhado.
