# Issue #487 — Execução resistida guiada

## Contratos e responsabilidades

A branch parte de develop. O lifecycle e o versionamento da sessão permanecem exclusivamente com a #389 (`WorkoutSessionExecution`). A sequência simples deriva do planejamento liberado em `WorkoutExerciseBlock`/`WorkoutExercisePlannedSet` (#399), com IDs persistidos por exercício/série. Não se usa índice visual ou texto como identidade.

A #400 ainda não fornece um modelo canônico de agrupamentos de exercícios no HEAD develop inspecionado. A execução de bi-sets, tri-sets, superséries e circuitos exige rodadas e participantes persistidos por #400; enquanto não houver contrato, o guia fica em `grouping_pending` (sem confirmações) quando o rótulo legado sinaliza agrupamento, sem inferir rodadas. Treinos sem séries estruturadas ficam em leitura `legacy_read_only`. A #488 implementará o cronômetro de descanso.

## APIs

- `GET /api/v1/student/me/training-sessions/:sessionId/execution/guided`: devolve `status`, `version`, disponibilidade, progresso, série atual e próxima. Exige conta de aluno ativa, `x-contract-id` contextual e o release operacional do treino no mesmo contrato.
- `POST /api/v1/student/me/training-sessions/:sessionId/execution/guided/complete`: `operationKey`, `expectedVersion`, `plannedUnitId`, `plannedSetId`, `setNumber`, `repetitions` e `loadKg`. Conclui apenas a próxima série canônica, exclusivamente com sessão `in_progress` e versão vigente. A idempotência, a transação serializável e o evento usam #389.

## Persistência e semântica

A migration `20261028220000_issue_487_guided_resistance_completion` adiciona `WorkoutSessionExecutionItem.completedAt`: valor preenchido não equivale a unidade concluída. A marcação e os valores executados são gravados no mesmo ato atômico; os valores prescritos não são alterados. O marcador resiste a refresh e troca de dispositivo. O histórico confirmado não pode ser modificado pelo endpoint de valores comum. Uma série não pode ser confirmada fora de ordem; concorrência responde HTTP 409.

Um clique final não fecha automaticamente a sessão da #389, inclusive em treinos com outras modalidades. A ação de conclusão da sessão segue disponível no painel. Pausa explícita não permite confirmar nova série; troca de janela sem pausa não muda o estado por si só.

## Interface e recuperação

Durante `in_progress`/`paused`, o aluno tem um cartão focal com exercício, seção, bloco e série, faixa de repetições, carga, RIR/RPE, cadência, notas e descanso prescrito. Repetições/carga realizadas têm campos independentes; nulos não viram zero inventado. O cartão permite retornar à ficha completa e retomar o guia sem perder posição persistida. Após retorno HTTP 409 atualiza a leitura; em erro de rede preserva os dados e a chave idempotente para retry. Descanso é somente orientação até a entrega da #488, não um timer que avance sozinho.

## Validações e limitações

Testes de domínio cobrem IDs, ordem, nulidade, retomada, registros de valores ainda não concluídos e histórico fora de ordem. Testes web cobrem entradas realizadas, falha de rede/retry, concorrência, pausa e agrupamento bloqueado. Executar `pnpm validate`, build e migration em CI antes de concluir.

**Critério ainda bloqueado:** execução real por rodada/item para supersérie, bi-set, tri-set e circuito depende da entrega persistida de #400. Não aprovar a #487 integralmente até incorporar a #400 e repetir os cenários de agrupamento.

A orientação em mídia é opcional: quando a biblioteca tem `videoUrl` HTTPS
configurada, a etapa atual oferece um link externo acessível. URLs inseguras ou
ausentes não são exibidas e jamais bloqueiam a confirmação da série.
