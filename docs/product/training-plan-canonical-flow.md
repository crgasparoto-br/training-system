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
