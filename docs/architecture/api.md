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

A integração operacional da issue #319 adicionou preparação e rastreabilidade sem escrever no Workout Builder. A issue #320 adiciona o comando definitivo de liberação:

- leitura da biblioteca e da projeção exige `plans.consolidatedPrescriptions.view`;
- vínculo técnico, preparação e substituição exigem `plans.consolidatedPrescriptions.manage`;
- liberação exige `plans.consolidatedPrescriptions.release` e `dataScope` efetivo de `plans`;
- a autorização definitiva, o aluno, o contrato, a versão aprovada, as capacidades e o destino são revalidados dentro da transação serializável;
- o vínculo `CapacityTechnicalCatalogItem(category=exercise)` -> `ExerciseLibrary` continua usando somente IDs persistidos e revisão concorrente;
- snapshots internos de projeção/substituição permanecem server-owned e são revalidados antes da escrita operacional;
- a saída usa os modelos existentes `TrainingPlan`, `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise`;
- `WorkoutTemplate.released` só é marcado depois de conteúdo, nova versão `released` e vínculo relacional de auditoria terem sido persistidos na mesma transação;
- treino iniciado/executado não pode ser sobrescrito, e retry da mesma versão/destino é idempotente;
- flexibilidade/equilíbrio continuam fail-closed enquanto a ponte operacional não definir representação explícita sem perda semântica.

Os contratos permanentes estão em `docs/product/consolidated-prescription-operational-integration.md` e `docs/product/consolidated-prescription-operational-release.md`.

## Rotina semanal e Treino de hoje (#387)

`apps/api/src/modules/workout/training-routine.service.ts` é a única leitura da rotina semanal e do Treino de hoje. Ele é somente leitura e não grava estado de sessão; o lifecycle de execução pertence à #389.

- `GET /api/v1/student/me/training-routine`: aluno autenticado, contexto resolvido pelo `student/me` e `x-contract-id`;
- `GET /api/v1/alunos/:id/training-routine`: professor na Central, exige `students.details.trainingPlans` (tela pai `students.details`), responsabilidade sobre o aluno (master: contrato) e `Aluno.contractId` igual ao do token; fora do escopo responde `404`;
- as consultas começam em `WorkoutTemplate.released = true`, `TrainingPlan.alunoId` e `Aluno.contractId`, mas só publicam sessões cujo template possua `ConsolidatedPrescriptionOperationalRelease` do mesmo aluno/contrato; um template `released=true` sem release consolidado é ignorado por esta projeção;
- a resposta usa o mapeamento público `TrainingRoutineView` (`packages/types/training-routine.ts`); a visão do aluno omite IDs da Montagem e o contexto técnico do professor;
- parâmetros cíclicos preservam tempo, distância, FC, velocidade e pace quando disponíveis; `WorkoutDay.status=planned` é projetado como `not_started`, usando o vocabulário público da #389 sem autorizar transições;
- `execution.available` permanece `false` até existir o contrato canônico da #389.

As regras de produto estão em `docs/product/student-centered-training-experience.md`.

## Check-in pré-treino (#388)

O check-in usa `PreWorkoutCheckIn` como fonte canônica única por `WorkoutDay`. A escrita do aluno ocorre em `PUT /api/v1/student/me/training-sessions/:sessionId/check-in`; aluno, contrato e ator são derivados da sessão autenticada e nunca do body.

- a sessão precisa pertencer ao aluno/contrato autenticado, estar liberada pela Montagem Consolidada e permanecer em `WorkoutDay.status=planned` (projeção pública `not_started`);
- a transação serializável bloqueia a linha de `WorkoutDay` antes da revalidação definitiva, serializando a corrida entre salvar check-in e iniciar a sessão;
- `PreWorkoutCheckInOperation` registra `operationKey` e fingerprint do patch normalizado submetido, independente do estado mutável atual; reutilizar a mesma chave com dados diferentes é conflito;
- o snapshot de regra persiste a versão `pre-workout-check-in-v1`; somente dor/desconforto possui triagem canônica nesta entrega;
- `StudentLifecycleEvent` recebe apenas IDs, ação e versão da regra. Os valores do check-in não são duplicados na timeline;
- a rotina compartilhada projeta linguagem prática ao aluno; para professor, os valores sensíveis e o contexto técnico do check-in só são carregados quando existe concessão explícita do bloco `students.details.preWorkoutCheckIn`, separada de `students.details.trainingPlans`;
- não existe score composto de prontidão, bloqueio clínico nem alteração automática da prescrição ou do treino.

## Adipometria (ADPT)

O módulo `apps/api/src/modules/adipometry` é montado em `/api/v1/adipometry`.

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

## Defaults e cópia de dados do contrato

Os dados padrão são propriedade do produto e ficam versionados no repositório. O fluxo principal da tela `/settings/contract` usa `POST /api/v1/contracts/install-defaults`, autenticado no contexto de professor e restrito a professor master. O contrato alvo é sempre o `contractId` da sessão autenticada; o body não redefine o alvo.

A instalação usa somente as fontes canônicas do produto:

- parâmetros de treino e tipos de avaliação em `apps/api/src/common/product-defaults.ts`;
- biblioteca inicial de exercícios em `apps/api/src/scripts/exercises-data.json`.

`DEFAULT_CONTRACT_ID` não participa da instalação de padrões. O endpoint não seleciona outro tenant como origem, funciona mesmo quando só existe o contrato autenticado e complementa apenas os padrões ausentes, preservando dados personalizados já existentes. Repetir a operação é idempotente e contabiliza itens já presentes como `skipped`.

A cópia entre contratos permanece uma operação separada em `POST /api/v1/contracts/copy-data`. Ela exige `sourceContractId` explícito, mantém o contrato alvo vinculado à sessão autenticada e nunca transforma o contrato de origem em fonte canônica de padrões.

`POST /api/v1/contracts/clone-data` existe somente como alias temporário de compatibilidade. Com `sourceContractId` explícito, executa a cópia manual; sem origem explícita, instala os defaults canônicos do produto. O alias não faz seleção automática de tenant e não usa `DEFAULT_CONTRACT_ID` como fallback.

O contrato detalhado e as fontes canônicas estão registrados em `docs/architecture/contract-defaults.md`.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
- `pnpm access:check`
