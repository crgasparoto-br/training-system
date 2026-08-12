# Liberação operacional da Montagem Consolidada

## Objetivo

A issue #320 transforma uma versão aprovada da Montagem Consolidada em saída operacional no grafo de treino já existente, sem criar um modelo paralelo de `Treino de hoje`.

A saída autoritativa continua sendo:

`TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise -> ExerciseLibrary`.

Para capacidades sem exercício, `WorkoutDayCapacityOperationalBlock` é uma relação aditiva do próprio `WorkoutDay`; não cria uma segunda árvore de treino.

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
6. todas as referências canônicas obrigatórias persistidas na versão aprovada continuam existentes, acessíveis no mesmo aluno/contrato e elegíveis para o tipo de origem registrado;
7. existe projeção operacional preparada para cada capacidade da composição;
8. nenhum item preparado está marcado como incompatível;
9. Flexibilidade e Equilíbrio possuem `WorkoutDayCapacityOperationalBlock` preparado com `contractVersion=1`, FK da versão exata da capacidade e parâmetros idênticos ao snapshot estruturado;
10. vínculos técnicos, `mappingRevision`, substituições e exercícios da biblioteca continuam válidos e atuais;
11. o `TrainingPlan` informado pertence ao mesmo aluno e contrato;
12. cada `workoutDate` corresponde exatamente a `weekStartDate + (dayOfWeek - 1)` e é estritamente futuro na data da liberação;
13. um `WorkoutTemplate` alvo existente pertence à mesma semana/período solicitado, seus dias persistidos continuam coerentes com `weekStartDate x dayOfWeek`, todos continuam futuros e nenhum foi iniciado, executado ou liberado por outra origem.

A revalidação de referências ocorre dentro da mesma transação serializável do release, antes de qualquer mutação operacional. Uma fonte válida na aprovação que seja removida, fique inacessível ou perca elegibilidade antes da liberação bloqueia a operação sem efeitos parciais.

A resposta cross-tenant ou fora do `dataScope` não revela a existência do recurso.

## Escrita operacional

A projeção pode escrever apenas os campos explicitamente suportados pela ponte operacional:

- `WorkoutTemplate`: `trainingMethod`, `trainingDivision`, `repReserve`, `totalVolumeKm`;
- `WorkoutDay`: `method`, `vo2maxPct`, `stimulusDurationMin`, `detailNotes`, `complementNotes`;
- `WorkoutExercise`: `sets`, `reps`, além do `exerciseId` resolvido por vínculo persistido;
- `WorkoutDayCapacityOperationalBlock`: somente o contrato estruturado versionado de Flexibilidade/Equilíbrio, ligado por FK à `CapacityPrescriptionVersion` exata.

Qualquer outro campo presente no snapshot é recusado. IDs estruturais, status e `released` não podem ser injetados pela projeção.

O posicionamento de dias/exercícios é explícito no comando. A liberação não cria semana alternativa automaticamente quando o alvo está ocupado e não procura exercício por nome. `weekStartDate`, `dayOfWeek` e `workoutDate` formam uma única invariante temporal: o backend não aceita uma data fora da semana declarada nem usa o estado `planned` como autorização para reescrever alvo passado ou presente.

Um template planejado e ainda não executado pode ser reutilizado somente quando já representa o mesmo período temporal solicitado. A versão aprovada passa a ser o snapshot canônico do conteúdo gerenciado pela ponte. Antes de liberar, o backend:

- confirma que `weekStartDate` do template existente é a mesma semana solicitada;
- confirma que cada dia persistido continua coerente com `weekStartDate x dayOfWeek` e permanece futuro;
- remove dias planejados do template que não aparecem nos posicionamentos aprovados;
- remove exercícios planejados cujas posições `seção + ordem` não aparecem na projeção aprovada;
- zera campos gerenciados de template/dia que deixaram de ser projetados;
- atualiza/cria somente os dias e exercícios restantes da projeção.

Essa reconciliação só ocorre depois de confirmar que nenhum dia saiu de `planned`, não há `startedAt/finishedAt`, nenhum exercício possui execução e o período persistido é o mesmo do comando. Conteúdo iniciado/executado, passado/presente ou de outra semana nunca é removido ou reescrito.

### Flexibilidade e Equilíbrio

A representação operacional da #339 é estruturada e versionada dentro do grafo existente:

- cada bloco publicado cria um `WorkoutDayCapacityOperationalBlock` com `contractVersion=1`;
- o bloco referencia por FK a `CapacityPrescriptionVersion` exata;
- `parameters` guarda integralmente o objeto estruturado da capacidade;
- trigger PostgreSQL confirma que `capacity`, aluno, contrato e `parameters` são exatamente os da versão referenciada;
- o bloco é imutável após persistido.

**Flexibilidade** só é mapeável quando existe ao menos uma articulação e cada articulação possui `name` + `suggestedPrescription`. `angle`, `deficit`, `priority` e `expectedPse` permanecem no snapshot estruturado quando informados.

**Equilíbrio** só é mapeável quando existe `focus` e pelo menos `supports` ou `progressionNotes`. Apoios, progressão e `expectedPse` permanecem no snapshot estruturado quando informados.

`WorkoutDay.detailNotes` e `WorkoutDay.complementNotes` continuam sendo gerados deterministicamente para apresentação/instrução ao aluno, mas **não são a representação canônica nem fallback de integração**. A autoridade é o bloco relacional estruturado. Parâmetros insuficientes permanecem `operational_representation_unavailable` e bloqueiam o release de forma fail-closed.

## Rastreabilidade relacional e idempotência

A migration `20260812143000_issue_320_consolidated_operational_release` cria `ConsolidatedPrescriptionOperationalRelease` como evidência relacional append-only entre:

- montagem e versão aprovada de origem;
- versão `released` criada pela transição;
- aluno e contrato;
- `TrainingPlan` e `WorkoutTemplate` publicados;
- professor ator e timestamp;
- fingerprint canônico da requisição.

A mesma migration cria `WorkoutDayCapacityOperationalBlock`, permitindo navegar do dia operacional diretamente para a versão imutável de Flexibilidade/Equilíbrio e, pelo template, para o release consolidado.

A chave única em `sourceAssemblyVersionId` é a chave natural de idempotência. Repetir o mesmo comando para a mesma versão devolve a liberação existente. Repetir a mesma versão com destino diferente retorna conflito. `workoutTemplateId` também é único para impedir reassociação silenciosa do mesmo treino a outra versão consolidada.

Triggers verificam a cadeia de versões e o escopo relacional e proíbem `UPDATE`/`DELETE` das evidências de liberação e dos blocos estruturados.

## Ordem atômica

Dentro de uma única transação serializável:

1. autorização e escopo são revalidados;
2. o agregado é bloqueado com `FOR UPDATE`;
3. versão, capacidades, conflitos, referências canônicas, projeção, contratos estruturados, mapeamentos e destino são revalidados;
4. a coerência `weekStartDate x dayOfWeek x workoutDate`, o futuro do destino e o período de target reutilizado são confirmados antes de reconciliação;
5. um target futuro reutilizado é reconciliado para coincidir exatamente com a projeção aprovada;
6. o conteúdo operacional e os blocos estruturados são criados/atualizados ainda com `released = false`;
7. uma nova `ConsolidatedPrescriptionVersion` em `released` é criada preservando a versão aprovada como histórica;
8. o vínculo relacional de liberação é inserido;
9. somente então o `WorkoutTemplate` recebe `released = true` e `releasedAt`.

Qualquer falha desfaz reconciliação, conteúdo, blocos estruturados, versão, vínculo e flag de publicação juntos.

## Revisão depois da liberação

A versão aprovada usada como origem e a versão `released` permanecem imutáveis. Uma alteração posterior deve seguir o fluxo de nova revisão da #317, voltar a ser preparada/aprovada e executar um novo comando de liberação. Uma nova versão não substitui silenciosamente o template de uma liberação anterior.

## Validação

Os testes da #320/#339 cobrem:

- contrato de permissão, transação/lock, evidência de aprovação, proteção de treino iniciado e idempotência por fingerprint;
- projeção de Flexibilidade e Equilíbrio para blocos estruturados versionados mais notas derivadas;
- fail-closed quando o contrato estruturado não pode ser produzido;
- liberação PostgreSQL de uma montagem com as quatro capacidades e verificação dos parâmetros relacionais sem perda;
- revalidação PostgreSQL de liveness para objetivo clínico removido, avaliação removida e avaliação que perde elegibilidade de categoria entre aprovação e release, sempre sem efeitos parciais;
- controles temporais para data fora da semana declarada, alvo passado, borda da data atual e target existente de período divergente;
- reconciliação de target futuro previamente preenchido, removendo dia/exercício excedentes e limpando campos gerenciados residuais;
- concorrência com duas conexões e rollback integral por falha injetada;
- boundary HTTP para permissão de `release` revogada depois da emissão do token, cross-tenant e `dataScope=self`, com resposta de não enumeração.
