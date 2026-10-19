# Fluxo canônico de periodização e montagem do treino

Issue de consolidação: #414.

## Decisão

O Sistema Acesso possui uma única fonte operacional para montar a semana de treino:

```text
TrainingPlan
  -> PeriodizationMatrix
     -> ResistedStimulus
     -> CyclicStimulus
  -> WorkoutTemplate
     -> WorkoutDay
        -> WorkoutExercise
  -> liberação / execução
```

`PeriodizationMatrix` representa o planejamento dos estímulos por mesociclo e semana. `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise` representam a montagem operacional que será liberada ao aluno.

Cíclico e Resistido não são tipos de sessão mutuamente exclusivos. Eles podem coexistir no mesmo `WorkoutDay`, conforme a estrutura original das abas `Periodização Macrociclo` e `Montagem` da planilha de referência.

## Estrutura legada

A árvore abaixo permanece temporariamente no schema enquanto consumidores históricos forem eliminados de forma incremental:

```text
TrainingPlan
  -> Macrocycle
     -> Mesocycle
        -> Microcycle
```

`Microcycle.sessionType` foi criado no início do projeto com forte orientação a corrida. Ele não deve ser usado para criar, editar ou excluir a montagem semanal.

A issue #414 remove o CRUD web e os endpoints REST de `Microcycle`. Registros antigos podem continuar sendo lidos por compatibilidade durante a transição, mas não são fonte de verdade para novos treinos.

## Regras de navegação

A tela de detalhes do plano lista semanas globais do período e converte cada uma para a posição usada pelo `WorkoutBuilder2`:

```text
semana global -> mesocycleNumber + weekNumber
```

A quantidade de semanas por mesociclo vem de `PeriodizationMatrix.weeksPerMesocycle`; quando a matriz ainda não existe, o fallback atual é 4.

Toda ação `Montar semana` abre diretamente o `WorkoutBuilder2`. Não deve existir popup paralelo de sessão no detalhe do plano.

## Invariantes

- `PeriodizationMatrix` planeja; não publica treino diretamente.
- `WorkoutTemplate/WorkoutDay/WorkoutExercise` é o grafo operacional canônico.
- Cíclico e Resistido podem coexistir no mesmo dia.
- Histórico liberado não deve ser sobrescrito silenciosamente.
- Novos recursos de #397, incluindo #398 e #399, devem estender o grafo canônico e nunca reativar `Microcycle` como segunda árvore operacional.

## Séries resistidas estruturadas (#399)

A estrutura de cada `WorkoutExercise` pode incluir `WorkoutExerciseBlock[]` (posição, tipo e observação) com `WorkoutExercisePlannedSet[]` (posição, repetições mínimas/máximas, carga em kg ou percentual, RIR/RPE, tempo/cadência, descanso em segundos e observação). Blocos são filhos do exercício operacional do `WorkoutDay`, não grupos entre exercícios (#400).

A ausência de blocos preserva o contrato simples existente (`sets`, `reps`, `load`, `intervalSec`), sem backfill presumido. Blocos têm ordem 1..N e tipos `aquecimento | principal | tecnica | complementar | finalizacao`; cada bloco possui de 1 a 30 séries ordenadas e opcionais sem coerção para zero. Campo ausente não vira carga prescrita. Os IDs estruturados fazem parte da prescrição e devem permanecer reproduzíveis após liberação.

Leituras de template, dia e exercício incluem `resistanceBlocks[].plannedSets[]` ordenados. O Workout Builder permite editar a estrutura por exercício e salva a composição do dia atomicamente via `PUT /api/v1/workout/days/:id/resistance-exercises`, com payload `{ exercises: [...] }`. Escritas em template liberado e/ou execução iniciada são bloqueadas, inclusive por gatilho de banco. A execução real permanece separada em `WorkoutSessionExecutionItem`, cuja referência opcional `plannedSetId` aponta para uma série planejada pertencente ao mesmo exercício; a comparação será responsabilidade da #401. A migração é aditiva e não cria nova árvore de montagem.


### Preservação de identidade no editor de séries (#399)

O salvamento transacional de exercícios resistidos de um `WorkoutDay` deve reconciliar os exercícios existentes pelo identificador persistido `workoutExerciseId`; clientes legados podem ser conciliados pelo exercício da biblioteca e seção quando não houver identificador explícito. O editor não deve excluir e recriar indiscriminadamente todas as linhas do dia, pois execuções históricas dependem dos identificadores de `WorkoutExercise`. A remoção ou alteração de linhas com histórico de execução é bloqueada; séries planejadas não são confundidas com os valores executados. Falhas inesperadas da persistência nunca expõem detalhes internos na resposta da API.

As mutações de planejamento também consultam o histórico legado de `WorkoutExecution` dentro da transação, antes de atualizar, reordenar ou excluir exercícios e dias. O guard de séries no banco trata esse histórico como bloqueio de mutabilidade.

O endpoint de substituição de exercícios estruturados requer token válido e vínculo ativo de professor. O serviço verifica o contrato do aluno associado ao `WorkoutDay` antes da mutação e novamente na transação, além de validar que todos os exercícios da biblioteca pertencem ao mesmo contrato; referências de outro contrato são rejeitadas sem efeito parcial.
