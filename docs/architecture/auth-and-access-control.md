# Autenticacao, autorizacao e escopo de dados

Este documento descreve a arquitetura de acesso do Sistema Acesso.

## Conceitos

- `screenKey`: permissao para visualizar uma tela ou capacidade principal.
- `blockKey`: permissao para aba, bloco interno ou acao sensivel dentro de uma tela.
- `dataScope`: escopo de dados aplicado em telas sensiveis.

## Escopos de dados

- `self`: usuario acessa somente o proprio cadastro.
- `managed`: usuario acessa o proprio cadastro e colaboradores sob sua gestao.
- `contract`: usuario acessa todos os registros do contrato.

## Catalogos

A fonte da verdade para chaves de permissao fica em `packages/types/access-control.ts`.

Principais exports:

- `ACCESS_SCREEN_CATALOG`
- `ACCESS_PERMISSION_GROUPS`
- `ACCESS_BLOCK_CATALOG`
- `ACCESS_DATA_SCOPE_SCREEN_KEYS`
- `ACCESS_DATA_SCOPE_OPTIONS`
- `DEFAULT_ACCESS_BY_PROFILE_CODE`

## Backend

O modulo principal fica em `apps/api/src/modules/access-control`.

Services importantes:

- `syncAccessPermissionsForFunction`
- `replaceAccessPermissionsForFunction`
- `getEffectiveAccessPermissionsForProfessor`
- `getEffectiveDataScopeForProfessor`
- `getMostPermissiveDataScopeForProfessor`
- `buildProfessorDataScopeWhere`
- `canProfessorAccessScreen`
- `canProfessorAccessBlock`

## Regras obrigatorias

1. Perfil `master` tem acesso total ao contrato.
2. Toda permissao customizada deve ignorar chaves desconhecidas.
3. `blockKey` so deve liberar acesso se a tela pai tambem estiver liberada.
4. `dataScope` so deve existir para telas listadas em `ACCESS_DATA_SCOPE_SCREEN_KEYS`.
5. Rotas que retornam colaboradores/professores devem respeitar `contractId` e escopo efetivo.

## Padrao para novas permissoes

1. Adicionar `screenKey` ou `blockKey` em `packages/types/access-control.ts`.
2. Adicionar a chave ao grupo adequado em `ACCESS_PERMISSION_GROUPS`.
3. Definir defaults em `DEFAULT_ACCESS_BY_PROFILE_CODE`.
4. Usar a chave no frontend para ocultar UI.
5. Usar a chave no backend para bloquear a rota ou acao.
6. Adicionar ou atualizar testes.
7. Rodar `pnpm access:check`.
