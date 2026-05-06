# Controle de acesso por perfil

O controle de acesso usa a funcao cadastrada em `CollaboratorFunctionOption` como perfil. Cada perfil possui linhas em `AccessPermission` e agora possui tres camadas:

1. Tela: `screenKey` com `blockKey` vazio define se o usuario pode entrar na tela.
2. Bloco/aba: `blockKey` preenchido define quais blocos internos ficam visiveis.
3. Acao sensivel: `blockKey` de acao define quais operacoes criticas podem ser executadas (editar, excluir, resetar senha, etc.).
4. Escopo de dados: `dataScope` define quais registros podem ser consultados ou alterados dentro da tela.

## Conceitos: tela, bloco interno e acao sensivel

### Tela

- Define acesso macro a rota/pagina.
- Exemplo: `students.details` (Detalhes do aluno).
- Sem permissao de tela, o usuario nao entra na pagina.

### Bloco interno

- Define visibilidade de partes internas da tela (abas, secoes, cards).
- Exemplos em `students.details`:
  - `students.details.summary`
  - `students.details.financialContract`
  - `students.details.assessments`
- Normalmente controla renderizacao no frontend via `canAccessBlock`.

### Acao sensivel

- Define se o usuario pode executar mutacoes/operacoes criticas.
- Exemplo: `students.actions.manageAssessments`.
- Diferente de bloco visual: um usuario pode ver a aba e ainda assim nao poder alterar.
- Deve existir validacao no frontend e no backend.

## Onde cadastrar telas e blocos

1. Adicione a tela em `packages/types/access-control.ts`, no `ACCESS_SCREEN_CATALOG`.
2. Inclua o `screenKey` da tela em um grupo de `ACCESS_PERMISSION_GROUPS`, que define a hierarquia exibida no bloco de permissoes.
3. Se a tela tiver abas, blocos, secoes internas ou acoes sensiveis, adicione cada item em `ACCESS_BLOCK_CATALOG`, apontando para o `screenKey` da tela.
4. Inclua a tela/bloco nos defaults de `DEFAULT_ACCESS_BY_PROFILE_CODE` quando fizer sentido para novos perfis ou perfis ainda sem matriz no banco.
5. Se a tela precisar limitar registros, inclua o `screenKey` em `ACCESS_DATA_SCOPE_SCREEN_KEYS` e defina o fallback em `dataScopes`.
6. No menu lateral, informe o `screenKey` no item em `apps/web/src/navigation/sidebarMenu.ts`.
7. Na rota React, envolva o componente com `withAccess('screen.key', <Tela />)` em `apps/web/src/App.tsx`.
8. Em blocos internos e acoes sensiveis no frontend, use `canAccessBlock(user, 'screen.blockOrAction')` para decidir visibilidade/habilitacao.
9. Em endpoints da API que precisam respeitar tela, use `screenAccessMiddleware('screen.key')` ou uma lista de telas permitidas.
10. Em endpoints de mutacao de blocos/acoes sensiveis, use `blockAccessMiddleware('screen.actionKey')`.
11. Para dados de colaboradores, calcule o escopo efetivo no backend antes de consultar ou alterar registros.

## Exemplo pratico: tela de aluno (`students.details`)

Na tela de detalhes de aluno, a separacao recomendada e:

- Permissao de tela:
  - `students.details`
- Permissoes de blocos internos (visibilidade de aba):
  - `students.details.summary`
  - `students.details.financialContract`
  - `students.details.assessments`
- Permissoes de acoes sensiveis (mutacoes):
  - `students.actions.manageAssessments`
  - `students.actions.manageFinancialContract`
  - `students.actions.resetPassword`

Resultado esperado:

- Usuario sem `students.details` nao acessa a tela.
- Usuario com `students.details` e sem bloco da aba nao ve a aba.
- Usuario com bloco da aba, mas sem acao sensivel, pode ter acesso somente de leitura.
- Operacoes criticas sempre validadas no backend.

## Como adicionar nova aba no sistema (checklist)

Use este fluxo para nao esquecer nenhuma etapa de controle de acesso:

1. Criar bloco no catalogo:
	- adicione `novo.screen.novaAba` em `ACCESS_BLOCK_CATALOG` com `screenKey` correto.
2. Adicionar default por perfil:
	- inclua/remova o bloco em `DEFAULT_ACCESS_BY_PROFILE_CODE` conforme politica de cada perfil.
	- para nova acao sensivel, prefira nascer bloqueada para perfis restritos.
3. Aplicar `canAccessBlock` no frontend:
	- controlar renderizacao da aba/bloco.
	- para acao sensivel, ocultar/desabilitar botoes e proteger handlers.
4. Validar endpoint no backend, se necessario:
	- rotas de leitura podem depender da tela/bloco.
	- rotas de mutacao devem validar bloco/acao sensivel via middleware.
5. Sincronizar permissoes existentes:
	- execute a rotina de sincronizacao para criar somente permissoes faltantes em funcoes ja existentes.
	- garanta que o sync seja idempotente e nao sobrescreva customizacoes existentes.

## Melhoria na tela de Funcoes de Colaboradores

A tela de `Configuracoes > Funcoes de colaboradores` deve continuar refletindo a mesma hierarquia do menu lateral e, agora, evidenciar melhor a origem e o contexto da permissao:

- organiza por `ACCESS_PERMISSION_GROUPS`;
- usa telas do `ACCESS_SCREEN_CATALOG`;
- exibe blocos e acoes de `ACCESS_BLOCK_CATALOG`;
- permite identificar origem/menu para reduzir erro de configuracao;
- facilita entender quando uma permissao e de visibilidade (bloco) ou de mutacao (acao sensivel).

Esse alinhamento evita divergencia entre navegacao e matriz de acesso.

## Regras de seguranca

1. Frontend oculta ou desabilita elementos sem permissao.
2. Backend sempre valida novamente as mesmas permissoes.
3. `ProfessorRole.master` tem acesso total.
4. Novas permissoes sensiveis devem nascer bloqueadas para perfis restritos.
5. Nunca depender apenas do frontend para proteger operacoes criticas.

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

A tela `Configuracoes > Funcoes de colaboradores` lista telas, blocos internos e acoes sensiveis cadastrados no catalogo, organizados pela hierarquia de `ACCESS_PERMISSION_GROUPS`. Os grupos e telas com itens internos podem ser expandidos ou recolhidos. Para telas com escopo de dados, a tela exibe tambem o seletor `Escopo dos dados`. Ao salvar uma funcao, o sistema grava uma matriz explicita de permissoes para aquele perfil.

Perfis antigos ou recem-criados sem linhas em `AccessPermission` recebem automaticamente a matriz padrao definida no catalogo compartilhado.
