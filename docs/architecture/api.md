# Arquitetura da API

A API fica em `apps/api`.

## Responsabilidades

- Expor rotas HTTP para o web e mobile.
- Aplicar autenticacao, autorizacao e escopo de dados antes de acessar dados sensiveis.
- Concentrar regras de negocio em services/modulos.
- Usar Prisma como camada de persistencia.

## Regras para novas rotas

- Rotas privadas devem usar middleware de autenticacao.
- Rotas que representam telas devem validar `screenKey` quando aplicavel.
- Acoes internas, abas e blocos devem validar `blockKey` quando aplicavel.
- Consultas multi-tenant devem filtrar por `contractId`.
- Consultas de colaboradores/professores devem aplicar escopo de dados quando a funcao exigir.

## Padrao de implementacao

1. Definir tipos compartilhados em `packages/types` quando o contrato tambem for usado no frontend.
2. Criar ou atualizar service no modulo correspondente.
3. Aplicar middlewares de seguranca na rota.
4. Criar testes unitarios ou de integracao para regras de permissao e dados.
5. Atualizar docs quando a regra de negocio mudar.

## Montagem Consolidada e integração operacional

O módulo autoritativo continua em `apps/api/src/modules/consolidated-prescriptions` e é montado em `/api/v1/consolidated-prescriptions`.

A integração operacional da issue #319 adiciona somente preparação e rastreabilidade:

- leitura da biblioteca e da projeção exige `plans.consolidatedPrescriptions.view`;
- vínculo técnico, preparação e substituição exigem `plans.consolidatedPrescriptions.manage`;
- todas as rotas aplicam o `dataScope` da tela `plans` e `contractId` da sessão;
- o vínculo `CapacityTechnicalCatalogItem(category=exercise)` -> `ExerciseLibrary` é feito somente por IDs persistidos e revisão concorrente;
- snapshots internos de projeção/substituição são server-owned e preservados nas versões da Montagem Consolidada;
- a API não cria, altera nem libera `WorkoutTemplate`, `WorkoutDay` ou `WorkoutExercise` nesta fase;
- a rota dedicada de capacidade versiona `exerciseTechnicalCatalogItemIds` sem usar nome/código como chave de integração.

O contrato permanente está em `docs/product/consolidated-prescription-operational-integration.md`. A mutação operacional e `released` pertencem à issue #320.

## Adipometria (ADPT)

O módulo autoritativo fica em `apps/api/src/modules/adipometry` e é montado em `/api/v1/adipometry`.

Regras de fronteira:

- todas as rotas exigem autenticação de professor e a tela `physicalAssessment.protocol`;
- leitura exige `physicalAssessment.adpt.view`;
- criação, edição, cálculo e conclusão exigem `physicalAssessment.adpt.actions.manage`;
- correção de avaliação concluída exige `physicalAssessment.adpt.actions.correctCompleted`;
- `contractId`, usuário e professor ator são derivados do token e nunca aceitos no body;
- resultados são calculados novamente na conclusão; campos derivados enviados pelo cliente não fazem parte dos schemas HTTP;
- conclusão usa transação serializável, bloqueio do rascunho e bloqueio da aprovação clínica ativa;
- identificadores de outro contrato recebem o mesmo 404 público de um recurso inexistente;
- falhas inesperadas retornam código estável e `correlationId`, sem mensagem bruta do banco.

A API reutiliza as funções e restrições PostgreSQL implantadas pela fundação da issue #246 para numeração, ator de auditoria, imutabilidade e ciclo de revisões.

## Manual do Professor

O módulo `apps/api/src/modules/professor-manual` é montado em `/api/v1/professor-manual`.

- a listagem exige autenticação e contexto profissional;
- o contrato é derivado da sessão e usado para garantir os itens padrão e filtrar o conteúdo;
- os painéis contextuais da Central do Aluno consomem essa rota, inclusive na área de avaliações físicas;
- a rota deve permanecer registrada no bootstrap da API sempre que os componentes web do Manual do Professor estiverem ativos, evitando que uma capacidade existente seja apresentada como erro 404.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
- `pnpm access:check`
