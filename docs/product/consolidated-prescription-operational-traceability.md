# Consulta de rastreabilidade da saída operacional

A issue #320 exige que a ligação entre a saída do Workout Builder e a Montagem Consolidada seja não apenas persistida, mas também consultável por IDs estáveis.

## Endpoint

`GET /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-traceability`

A consulta recebe **exatamente um** dos parâmetros:

- `workoutTemplateId`;
- `workoutDayId`;
- `workoutExerciseId`.

O backend resolve `WorkoutDay -> WorkoutTemplate` ou `WorkoutExercise -> WorkoutDay -> WorkoutTemplate` por relações persistidas. Nome de exercício, label, data aproximada ou texto livre não participam da associação.

## Cadeia retornada

Quando o artefato pertence ao aluno/contrato e foi produzido por uma liberação consolidada, a resposta expõe a cadeia:

```text
WorkoutTemplate / WorkoutDay / WorkoutExercise
  -> ConsolidatedPrescriptionOperationalRelease
  -> ConsolidatedPrescriptionVersion aprovada de origem
  -> ConsolidatedPrescriptionVersion released
  -> ConsolidatedPrescriptionCapacityBlock
  -> CapacityPrescriptionVersion IDs
  -> ConsolidatedPrescriptionDataRef/sourceRefs
```

Para Flexibilidade/Equilíbrio existe ainda a ligação operacional direta:

```text
WorkoutDay
  -> WorkoutDayCapacityOperationalBlock (contractVersion=1)
  -> CapacityPrescriptionVersion exata
```

A resposta inclui:

- IDs do plano, template e, quando usados como entrada, dia/exercício;
- ID do release, ator e data;
- montagem e IDs/números/status das versões de origem e released;
- capacidades e respectivos `CapacityPrescriptionVersion.id`;
- `operationalCapacityBlocks` com `workoutDayId`, capacidade, versão do contrato, FK da capacidade e parâmetros estruturados integrais de Flexibilidade/Equilíbrio;
- referências de origem persistidas na versão aprovada.

Quando a consulta é por `workoutDayId` ou `workoutExerciseId`, `operationalCapacityBlocks` contém somente os blocos do dia resolvido. Quando a consulta é por `workoutTemplateId`, contém os blocos de todos os dias daquele template, ordenados por dia/capacidade.

O endpoint não reconstrói a cadeia por nomes nem usa as notas formatadas como autoridade. `detailNotes`/`complementNotes` são apresentação derivada; o bloco estruturado é a representação operacional canônica dessas duas capacidades.

## Autorização e não enumeração

A leitura exige `plans.consolidatedPrescriptions.view` e o `dataScope` efetivo de `plans` para o aluno consultado.

Antes de consultar o ledger, o backend valida:

- professor ator no contrato;
- aluno no contrato e no escopo efetivo;
- artefato operacional ligado ao mesmo aluno;
- `TrainingPlan` e professor do plano dentro do mesmo contrato.

ID operacional inexistente, de outro aluno/tenant ou sem vínculo de liberação recebe o mesmo `404 Recurso não encontrado`, evitando usar a rota para enumerar artefatos de outro escopo.

## Papel do ledger

`ConsolidatedPrescriptionOperationalRelease` continua sendo a evidência relacional autoritativa do release. `WorkoutDayCapacityOperationalBlock` complementa o ledger no nível da sessão, ligando o dia às versões imutáveis de Flexibilidade/Equilíbrio sem substituir a cadeia do release.

A consulta não cria estado novo e não altera a montagem. O vínculo único por `sourceAssemblyVersionId` e `workoutTemplateId` garante que a cadeia consultada seja determinística para a versão publicada.

## Histórico

A consulta parte da versão **aprovada de origem**, não da versão corrente da montagem. Portanto uma nova revisão posterior não muda a cadeia histórica de um treino já liberado. As capacidades, blocos estruturados e `sourceRefs` retornados são os que pertencem à saída materializada por aquele release.
