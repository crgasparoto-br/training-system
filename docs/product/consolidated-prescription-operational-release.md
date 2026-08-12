# Liberação operacional da Montagem Consolidada

## Objetivo

A issue #320 transforma uma versão aprovada da Montagem Consolidada em saída operacional no grafo de treino já existente, sem criar um modelo paralelo de `Treino de hoje`.

A saída autoritativa continua sendo:

`TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise -> ExerciseLibrary`.

A liberação é um comando próprio e posterior à aprovação. Aprovar uma montagem não publica treino automaticamente.

## Comando HTTP

`POST /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-release`

O body informa somente a versão esperada e o destino operacional explícito:

- `expectedCurrentVersion`;
- `trainingPlanId`;
- `mesocycleNumber` e `weekNumber`;
- `weekStartDate`;
- posicionamentos explícitos da projeção por `projectionKey`, dia, data, seção e ordem quando o item representa exercício.

`contractId`, professor ator, data de liberação, status resultante e IDs de auditoria são derivados no backend. O comando não distribui itens por nome, categoria, texto ou heurística.

## Autorização e escopo

A liberação exige:

- `plans.consolidatedPrescriptions.release`;
- acesso à tela pai `plans`;
- `dataScope` efetivo de `plans` para o aluno alvo;
- ator autenticado pertencente ao mesmo contrato.

A autoridade é revalidada dentro da mesma transação serializável que realiza a publicação. Middleware ou preflight anterior não substitui essa verificação.

Defaults:

- `manager`: recebe `release` por padrão, assim como `approve`;
- `master`: mantém acesso total pelo contrato geral do controle de acesso;
- `professor` comum não recebe `release` automaticamente;
- os demais perfis também não recebem a capacidade por padrão.

## Pré-condições de liberação

A transação só avança quando todas as condições abaixo continuam verdadeiras após o lock do agregado:

1. a versão informada é a versão corrente da Montagem Consolidada;
2. a montagem e a versão estão em `approved`;
3. a versão possui `approvedByProfessorId` e `approvedAt` persistidos e o aprovador pertence ao mesmo contrato;
4. não existe conflito `critical` persistido ou revalidado;
5. as quatro versões de capacidade ainda pertencem ao aluno/contrato e permanecem correntes e `active`;
6. existe projeção operacional preparada para cada capacidade da composição;
7. nenhum item preparado está marcado como incompatível;
8. vínculos técnicos, `mappingRevision`, substituições e exercícios da biblioteca continuam válidos e atuais;
9. o `TrainingPlan` informado pertence ao mesmo aluno e contrato;
10. o `WorkoutTemplate` alvo não foi iniciado, executado nem liberado por outra origem.

A resposta cross-tenant ou fora do `dataScope` não revela a existência do recurso.

## Escrita operacional

A projeção pode escrever apenas os campos explicitamente suportados pela ponte operacional:

- `WorkoutTemplate`: `trainingMethod`, `trainingDivision`, `repReserve`, `totalVolumeKm`;
- `WorkoutDay`: `method`, `vo2maxPct`, `stimulusDurationMin`, `detailNotes`, `complementNotes`;
- `WorkoutExercise`: `sets`, `reps`, além do `exerciseId` resolvido por vínculo persistido.

Qualquer outro campo presente no snapshot é recusado. IDs estruturais, status e `released` não podem ser injetados pela projeção.

O posicionamento de dias/exercícios é explícito no comando. A liberação não cria semana alternativa automaticamente quando o alvo está ocupado e não procura exercício por nome.

Um template planejado e ainda não executado pode ser atualizado. Dias iniciados (`status != planned`, `startedAt`, `finishedAt`) ou exercícios com `WorkoutExecution` bloqueiam toda a operação.

### Flexibilidade e Equilíbrio

A representação operacional da #339 reutiliza campos já existentes de `WorkoutDay`, sem criar exercício fictício, entidade paralela ou matching textual:

- **Flexibilidade** chega a `WorkoutDay.detailNotes`. Cada articulação precisa ter `name` e `suggestedPrescription`; quando presentes, `angle`, `deficit`, `priority` e `expectedPse` também são materializados deterministicamente na instrução operacional.
- **Equilíbrio** chega a `WorkoutDay.complementNotes`. É obrigatório existir `focus` e pelo menos `supports` ou `progressionNotes`; quando presentes, todos os apoios, progressão e `expectedPse` são materializados.

Os parâmetros estruturados originais continuam preservados integralmente em `sourceParameters` do snapshot de projeção. A nota operacional é uma visão executável desses dados, não a fonte técnica. Parâmetros insuficientes permanecem `operational_representation_unavailable` e bloqueiam o release de forma fail-closed.

## Rastreabilidade relacional e idempotência

A migration `20260812143000_issue_320_consolidated_operational_release` cria `ConsolidatedPrescriptionOperationalRelease` como evidência relacional append-only entre:

- montagem e versão aprovada de origem;
- versão `released` criada pela transição;
- aluno e contrato;
- `TrainingPlan` e `WorkoutTemplate` publicados;
- professor ator e timestamp;
- fingerprint canônico da requisição.

A chave única em `sourceAssemblyVersionId` é a chave natural de idempotência. Repetir o mesmo comando para a mesma versão devolve a liberação existente. Repetir a mesma versão com destino diferente retorna conflito. `workoutTemplateId` também é único para impedir reassociação silenciosa do mesmo treino a outra versão consolidada.

Triggers verificam a cadeia de versões e o escopo relacional e proíbem `UPDATE`/`DELETE` das evidências de liberação.

## Ordem atômica

Dentro de uma única transação serializável:

1. autorização e escopo são revalidados;
2. o agregado é bloqueado com `FOR UPDATE`;
3. versão, capacidades, conflitos, projeção, mapeamentos e destino são revalidados;
4. o conteúdo operacional é criado/atualizado ainda com `released = false`;
5. uma nova `ConsolidatedPrescriptionVersion` em `released` é criada preservando a versão aprovada como histórica;
6. o vínculo relacional de liberação é inserido;
7. somente então o `WorkoutTemplate` recebe `released = true` e `releasedAt`.

Qualquer falha desfaz conteúdo, versão, vínculo e flag de publicação juntos.

## Revisão depois da liberação

A versão aprovada usada como origem e a versão `released` permanecem imutáveis. Uma alteração posterior deve seguir o fluxo de nova revisão da #317, voltar a ser preparada/aprovada e executar um novo comando de liberação. Uma nova versão não substitui silenciosamente o template de uma liberação anterior.

## Validação

Os testes da #320/#339 cobrem:

- contrato de permissão, transação/lock, evidência de aprovação, proteção de treino iniciado e idempotência por fingerprint;
- projeção de Flexibilidade e Equilíbrio para os campos operacionais existentes, preservando `sourceParameters`;
- liberação PostgreSQL de uma montagem com as quatro capacidades, persistindo as notas no mesmo `WorkoutDay` e mantendo rastreabilidade;
- concorrência com duas conexões e rollback integral por falha injetada;
- boundary HTTP para permissão de `release` revogada depois da emissão do token, cross-tenant e `dataScope=self`, com resposta de não enumeração.
