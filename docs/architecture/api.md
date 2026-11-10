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

## Coerência entre classificação e execução (#401, A-401022/A-401023)

A confirmação guiada de uma série já marcada como `not_performed` é rejeitada com HTTP 409 e código `WORKOUT_SESSION_EXECUTION_INCOMPATIBLE_OUTCOME` na mesma transação serializável. O aluno deve alterar explicitamente o outcome manual antes de confirmar; uma série `partial` ou `substituted` pode ser confirmada sem reclassificação silenciosa. O replay da chave idempotente preserva o estado após confirmação legítima.

A transição da sessão para `not_performed` exige motivo e ausência total de `sessionValues` e `items` no payload; também recusa um shell persistido que já contenha qualquer registro executado. A rejeição HTTP 400 ocorre antes de qualquer escrita de execução, operação ou evento, e zero explícito não é tratado como ausência. A transição válida sem registros permanece disponível.

A regressão inclui PostgreSQL real para os dois casos, testes HTTP e a jornada Chrome autenticada da #487 ampliada com prova da comparação #401 para aluno e professor a partir das mesmas rotas reais, com evidências em `artifacts/issue-401/`. O professor é exercitado tanto por um harness isolado do componente real quanto pela navegação completa autenticada da Central do Aluno (`/central-do-aluno/:id` → Aluno 360 → Treinos / Planos) em Chromium desktop/mobile, usando os mesmos dados do PostgreSQL e rotas HTTP reais.

**A-401-026 — histórico sem snapshot:** se `WorkoutSessionExecution.plannedSnapshot` estiver ausente ou inválido, a leitura da rotina semanal compara apenas `sessionValues`/`items` persistidos por IDs; não consulta o plano atualmente liberado para calcular quantidades, rótulos ou cobertura daquela execução. `snapshotSource=released_plan` sinaliza o caminho conservador: dados e classificações explícitos de etapa, grupo e série são preservados, sem metas/diferenças inventadas; agregados cuja cobertura não é comprovável usam `historical_unknown` (somente leitura). `partial` e `not_performed` do lifecycle continuam fatos explícitos. A versão, origem de release e isolamento por aluno/contrato não mudam. `captured` permanece com sua comparação exata. Testes de domínio, serviço e HTTP devem discriminar mudanças posteriores no planejamento sem alteração da execução.

**A-401-025 — não realização por unidade:** `not_performed` em etapa cíclica, agrupamento ou série não admite nenhuma medida executada não nula, inclusive `0`, RIR/RPE/cadência, duração, distância, intensidade ou descanso. A API verifica a combinação efetiva com os valores já persistidos dentro da transação; patches que omitem uma medida não a removem. Para mudar uma unidade com medidas anteriores para `not_performed`, o consumidor deve limpá-las explicitamente com `null` no mesmo comando, ou ajustar o outcome para refletir a execução. A persistência PostgreSQL bloqueia desvios por SQL direto em itens e arrays de `sessionValues`; a nova constraint de itens é `NOT VALID` para preservar histórico anterior sem inferir a execução. Zeros permanecem válidos em outcomes de execução reais. Falhas de coerência retornam HTTP 400 sem mutação, versão ou evento parcial.

## Escrita incremental do planejado versus executado (#401, A-401017)

`PUT /api/v1/student/me/training-sessions/:sessionId/execution/values` (e `POST /execution/transition` enquanto aplicável) conserva o controle de sessão/contrato, `operationKey` idempotente e `expectedVersion` da execução canônica. `sessionValues.cyclicStages` é uma lista de **upserts por (`plannedStageId`, `iteration` 1-based, padrão 1)**; `sessionValues.resistanceGroups` faz upsert por `plannedGroupId`. Os arrays **não** substituem o histórico: outra unidade omitida permanece, assim como qualquer medição omitida em uma unidade enviada. `null` limpa explicitamente uma métrica (não a unidade), `0` é medição real e array vazio é lote vazio (não limpa registros).

A exclusão de um registro executado exige a intenção **específica e autenticada** dentro de `sessionValues`:

```json
{
  "operationKey": "execucao-401-remocao-001",
  "expectedVersion": 4,
  "sessionValues": {
    "removeCyclicStages": [{ "plannedStageId": "id-etapa", "iteration": 1 }],
    "removeResistanceGroups": ["id-agrupamento"]
  }
}
```

Identificadores de remoção, IDs de upsert e repetições são validados contra o `WorkoutDay` liberado do mesmo aluno/contrato dentro da transação; chaves duplicadas, operações contraditórias (remover + alterar a mesma unidade) e exclusão de registro inexistente são recusadas com HTTP 400 sem gravar efeitos. Valores e remoções somente ocorrem durante sessão `in_progress`, com versão correta e serialização transacional. A intenção de exclusão fica rastreável no fingerprint e na operação canônica, mas `removeCyclicStages`/`removeResistanceGroups` **não** são gravados como métricas nem aparecem no contrato público de leitura. A comparação histórica segue `plannedSnapshot` imutável. Na projeção da issue #401, a etapa `repeat` é reconciliada com cada subetapa/volta para calcular seu outcome: uma declaração direta `full` sem filhos não comprova execução integral; uma declaração direta `not_performed` sem filhos é uma evidência negativa do agrupador, sem completar artificialmente os filhos. Agregação da sessão considera o resultado consolidado do agrupador apenas uma vez, preservando substituição e ausência como estados distintos.

**Séries estruturadas e substituições (A-401-18/19):** em `items[]`, dois `plannedSetId` distintos do mesmo exercício podem ser enviados no mesmo lote com `setNumber` omitido. O backend resolve o ordinal canônico pelo planejamento liberado antes de validar a identidade duplicada; IDs repetidos, ordinais explícitos incorretos e referências de outra sessão/contrato continuam rejeitados atomicamente. Séries legadas sem `plannedSetId` continuam identificadas pelo `setNumber` executado.

Em atualizações parciais, `outcome` e `substitutionNote` podem ser omitidos independentemente: a situação efetiva e a observação são conciliadas com o registro persistido dentro da mesma transação serializável. `substituted` exige observação não vazia no estado final; uma observação não vazia em unidade não substituída é inválida. Omissão preserva a observação anterior, `null` tenta limpá-la explicitamente (e é recusado enquanto a unidade continua substituída), e alterar para outro outcome limpa a observação. Erros devolvem HTTP 400 sem avançar versão, operação ou valores executados.

## Executor guiado de etapas cíclicas (#489)

A leitura `GET /api/v1/student/me/training-sessions/:sessionId/execution/guided-cyclic` e o comando `POST .../execution/guided-cyclic/step` reutilizam `WorkoutSessionExecution` (#389) e `WorkoutCyclicStage` (#398). O contexto de aluno e `contractId` é resolvido pela sessão autenticada; a transação serializável bloqueia o `WorkoutDay` liberado com vínculo operacional consolidado antes de consultar ou escrever.

O comando inclui `operationKey`, `expectedVersion`, `plannedStageId`, `iteration`, `action = start | complete`; na conclusão informa `outcome` e opcionalmente `values` com duração, distância, FC, zona, velocidade, ritmo, PSE ou descrição de substituição. IDs, ocorrência da repetição e ordem são revalidados sobre o plano liberado antes de atualizar: `sessionValues.cyclicStages` (#401), `sessionValues.guidedCyclic`, versão, operação idempotente e `StudentLifecycleEvent` são atômicos. Versão vencida, etapa fora de ordem, pausa ou sessão terminal retornam HTTP 409 sem avanço; dados inválidos retornam HTTP 400.

O relógio é calculado apenas a partir de timestamps do servidor e das pausas da #389. O navegador só projeta contagem transitória e não pode avançar o treino ao completar a exibição. Ausência de etapas estruturadas retorna `legacy_read_only` sem inventar dados; histórico sem cursor consistente retorna `reconciliation_required` sem sobrescrita. O limite da prescrição é de 80.000 ocorrências da #398; o histórico `cyclicStages` permite até 80.040 registros (essas ocorrências mais até 40 agregados opcionais de pais `repeat` da #401). Nenhum plano válido é recusado apenas por ultrapassar 500 etapas. O plano de validação e os cenários adversariais estão em `docs/execution-plans/active/2026-11-issue-489-guided-cyclic-execution.md`.

**Compatibilidade #401 com blocos `repeat` (A-489-005):** `sessionValues.cyclicStages` pode conter um resultado agregado opcional por pai `repeat` do plano liberado, identificado por `plannedStageId` do pai e `iteration=1` (ou omitida). Esse resultado é preservado para comparação histórica, mas **não conta como ocorrência de trabalho ou recuperação** nem avança o cursor. A projeção guiada e a autorização de conclusão #389 compartilham a mesma validação dos registros: pais inexistentes/de outra sessão, repetição do pai com índice diferente de 1, duplicatas, folhas fora de ordem e etapas não concluídas continuam bloqueados. O agregado válido não impede a retomada ou conclusão da sequência real.

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

## Execução resistida guiada (#487)

As rotas autenticadas `GET /api/v1/student/me/training-sessions/:sessionId/execution/guided` e `POST /api/v1/student/me/training-sessions/:sessionId/execution/guided/complete` exigem aluno do `contractId` contextual, release consolidado e lifecycle/versão da sessão #389. A série seguinte deriva exclusivamente dos IDs planejados #399 e do grafo `WorkoutResistanceGroup` + `WorkoutResistanceGroupMember` da #400 (PR #521). Nenhum texto de `system` estabelece agrupamentos. Um comando confirmado liga o item à sua operação canônica única, ao evento e à versão; conflito retorna 409 e exige revalidação no servidor.

**Erro HTTP da execução guiada/descanso (#488):** `student.routes.ts` usa `sendError` de `@corrida/utils` (`packages/utils/common.ts`), que envia `{ success: false, error: string, details: { code: string }, timestamp }` nos conflitos 409. O frontend consome `response.data.details.code`: `WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION` em `finish` antes do prazo requer GET e retry sem bloqueio permanente da mesma versão; `WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT` exige reconciliação e nova versão antes de escrever. Não confundir com o helper de mesmo nome em `apps/api/src/common/response.ts` (`errors.code`), que **não** é o importado por essas rotas. Testes HTTP reais e da interface devem cobrir esta distinção.

### Validação cruzada de séries planejadas (#487)

O PUT /api/v1/student/me/training-sessions/:sessionId/execution/values usa a mesma ordem canônica por exercício/bloco/série de POST .../execution/guided/complete. Um plannedSetId de número/ordinal errado é rejeitado com 400 sem gravar operação ou progredir a sessão; setNumber legado omitido é resolvido pela posição da série planejada. Atualizações legadas sem ID de série só são permitidas quando o registro existente é inequivocamente identificado. Rascunhos históricos são reposicionados exclusivamente se não estiverem concluídos e o destino estiver livre, preservando repetições e carga. Conflitos requerem reconciliação supervisionada, nunca sobrescrita silenciosa nem avanço fictício.

### Limites e segurança do executor cíclico (#489, remediação)

A validação de sequência usa os IDs históricos da #398 e o cursor da própria execução #389. A transição pública `completed` consulta o plano e o progresso persistido na **mesma transação serializável** que grava o lifecycle/ledger; `invalid_plan`, `reconciliation_required` ou etapas pendentes retornam 409 e preservam o estado. `partial` e o fallback legado continuam pelo #389. O teto de `sessionValues.cyclicStages` é de 80.040 registros: 80.000 folhas autorizadas pela #398 e até 40 agregados opcionais dos pais `repeat` da #401; o limite é compartilhado por Zod HTTP, normalização e merge persistido. O relógio dos estados terminais é projetado pelo `finishedAt`; pausas efetivamente registradas são deduzidas de `pausedDurationMs`.


## Prévia temporal futura da Montagem Consolidada (#403)

As rotas `GET /api/v1/consolidated-prescriptions/alunos/:alunoId/combined-future-bookings`
e `POST /api/v1/consolidated-prescriptions/alunos/:alunoId/combined-future-temporal-preview`
exigem professor autenticado, bloco
`plans.consolidatedPrescriptions.view`, escopo de `plans`
e acesso à tela `agenda`. O GET recebe `start/end` em ISO UTC
canônico. O início não pode preceder o relógio do servidor em mais de 5 minutos
(tolerância apenas para diferenças de relógio) e o término não pode ultrapassar
31 dias corridos a partir do mesmo relógio. Janelas curtas em futuro distante
ou iniciadas no passado fora dessa tolerância são rejeitadas.
O cliente calcula uma janela nova ao solicitar a prévia, mesmo quando o GET
ocorreu mais de cinco minutos antes; o limite de 31 dias continua sendo
reavaliado pelo servidor. A API retorna somente ID, data civil canônica
(`bookingDate: YYYY-MM-DD`) ou `bookingDate: null` para legado não comprovado,
horas civis e revisão `updatedAt` dos agendamentos `scheduled` do mesmo
aluno/contrato, em **páginas de até 80 candidatos** (`page=1..100`,
padrão 1). Todas as páginas de uma consulta reutilizam o mesmo `start/end`;
a paginação ocorre **depois** do descarte de datas comprovadamente passadas,
de modo que registros antigos não consumam as 80 posições. Como o GET não
recebe fuso confirmado, ele só remove um início civil quando está fora do
período futuro sob **todos** os deslocamentos UTC possíveis (envelope
conservador de ±14 horas); datas legadas sem fonte civil continuam não
verificadas, nunca convertidas usando timezone do host. Cada página mantém
isolamento de aluno/contrato e verifica o horizonte de 31 dias. O POST
continua limitado a 80 bookings distintos, exigindo versão da
montagem e `updatedAt` exato das fontes. `bookingDate: null` não autoriza
reconstruir a data a partir do timestamp local antigo.

O POST recebe `expectedCurrentVersion`, janela,
`timeZone` IANA, e `bindings[]` com
`bookingId`, `capacityPrescriptionVersionId` e
`expectedBookingUpdatedAt`. A API rejeita regras clínicas e
severidades no body, IDs desconhecidos, duplicidade, versão stale, fonte
inativa e agendamento cancelado. A origem versionada é consultada novamente.
A resolução de horário possui estados verificado, ambíguo, inexistente e
inconsistente, e nunca usa uma data civil como se fosse timestamp UTC.
A diferença entre o fim de uma sessão e o início da seguinte é apenas
informação cronológica — sem decisão clínica, alteração de estado, escrita
ou efeito sobre a liberação operacional. `coverage=partial`
e `mayConcludeNoConflict=false` são invariantes.

## Biblioteca oficial de exercícios (#394)

`/api/v1/library/exercises` exige autenticação de professor ativo e permissão
`screenKey=plans` **ou** `screenKey=library` para consulta operacional, e retorna somente exercícios `approved` com
`legacyGrandfathered=false` por padrão. Aprovação histórica legada não equivale
a permissão de nova aplicação, mesmo que o status ainda seja `approved`.
Consultas de progresso usadas no Workout Builder aceitam `plans` ou `library`;
com acesso apenas a `plans` também respeitam o `dataScope` da tela para o
aluno solicitado. O detalhe do exercício e a escrita de progresso mantêm
acesso pela tela `library`. Todas as leituras são delimitadas pelo
`contractId` autenticado. `scope=all`, filtros de estado, escrita administrativa,
transições de curadoria e revisões exigem **ambos** `library` e papel `master`.
O backend revalida identidade e contrato independentemente da interface.
Nas mutações de curadoria, inclusive criação, edição, aprovação, reabertura e
desativação, a transação definitiva bloqueia as linhas de `Professor` e `User`
e revalida `master`, situação ativa, contrato e acesso `library`, antes de
gravar; uma revogação posterior ao middleware retorna HTTP 403 sem revisão
nova. A tentativa de criar/renomear exercício com nome canônico já presente
no contrato retorna HTTP 409, inclusive sob concorrência.

`POST /exercises` cria rascunho. `PUT /exercises/:id` exige `expectedVersion`,
retorna a rascunho e responde 409 para concorrência ou item já usado em treino.
`POST /exercises/:id/curation` recebe `{action,expectedVersion}` com `submit`,
`approve`, `request_changes`, `deactivate` ou `reopen`.
`GET /exercises/:id/revisions` devolve versões ao administrador do contrato.
No Workout Builder, `save-week`, `PUT /days/:id/resistance-exercises` e
`POST /exercises` verificam exercícios novos `approved` e curados (não legados) na transação, no mesmo
contrato do aluno. Linhas já vinculadas não são removidas nem exigem nova
aprovação em um replay de identidade estável. Cópia de dia, semana e resistência
faz nova aplicação e rejeita atomicamente referências desativadas/em revisão;
cópia apenas cíclica permanece independente da biblioteca resistida.
`DELETE /exercises/:id` é compatibilidade de desativação lógica com versão,
sem exclusão física. Seleções em Workout Builder, vinculação técnica,
substituição e Montagem Consolidada verificam `approved` e `contractId`.
A busca por aliases e grupos musculares primários/secundários é parcial,
insensível à caixa e parametrizada pelo contrato; o filtro muscular também
considera grupos secundários sem diferenças de caixa. `capacity` na criação
e edição aceita apenas `resisted`, `flexibility`, `cyclic` ou `balance` (HTTP 400
para valores arbitrários); a aprovação também confere o enum canônico.
Registros legados continuam consultáveis na visão administrativa e no histórico
dos treinos, mas são excluídos da seleção, cópia, substituição e liberação
operacional até a aprovação profissional explícita. Vídeos sem origem/licença
comprovadas não são reproduzidos pelas projeções históricas; os links originais
continuam persistidos.
Novas instalações de padrões geram rascunhos;
 novas instalações de padrões geram rascunhos. Cópias entre
contratos não transferem automaticamente URLs/licenças de mídia.
