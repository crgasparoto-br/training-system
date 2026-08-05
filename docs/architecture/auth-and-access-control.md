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
6. Um endpoint protegido por um bloco de resumo nao pode incorporar dados pertencentes a outro `blockKey`; detalhes de blocos irmaos devem ser carregados por uma fronteira dedicada que aplique a permissao correspondente.
7. A sanitizacao deve ocorrer no backend antes da serializacao. Ocultar um card no frontend ou tratar `403` no cliente nao substitui o contrato de saida minimo.

## Padrao para novas permissoes

1. Adicionar `screenKey` ou `blockKey` em `packages/types/access-control.ts`.
2. Adicionar a chave ao grupo adequado em `ACCESS_PERMISSION_GROUPS`.
3. Definir defaults em `DEFAULT_ACCESS_BY_PROFILE_CODE`.
4. Usar a chave no frontend para ocultar UI.
5. Usar a chave no backend para bloquear a rota ou acao.
6. Adicionar ou atualizar testes.
7. Rodar `pnpm access:check`.

## Adipometria na Central do Aluno

A integracao ADPT na aba `Avaliação Física` combina permissoes de dominios diferentes sem ampliar nenhuma delas:

- a aba exige `students.details.assessments`;
- a consulta de resumo, historico e comparacao ADPT exige tambem `physicalAssessment.adpt.view`;
- criar ou retomar rascunho exige `physicalAssessment.adpt.actions.manage`;
- corrigir avaliacao concluida continua exigindo `physicalAssessment.adpt.actions.correctCompleted` no fluxo dedicado.

O frontend deve deixar de consultar ADPT quando faltar qualquer permissao de visualizacao necessaria e ocultar apenas as acoes que excedam a capacidade do usuario. A API continua responsavel por `contractId`, aluno acessivel, estado vigente, tipo estruturado, revisao e recursos comparados. A ausencia do bloco ADPT nao pode ocultar nem bloquear outras avaliacoes permitidas na mesma aba.

## Blocos de acoes administrativas de colaboradores

As acoes sensiveis de colaboradores devem usar `blockKey` dedicado no backend e no frontend, por exemplo:

- `collaborators.actions.validateLegalFinancial`
- `collaborators.actions.resetPassword`
- `collaborators.actions.activate`
- `collaborators.actions.deactivate`
- `collaborators.actions.uploadSignedContract`

Esses blocos exigem tambem acesso de tela em `collaborators.registration` e devem permanecer alinhados com defaults em `DEFAULT_ACCESS_BY_PROFILE_CODE`.
