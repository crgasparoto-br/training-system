# Integração operacional da Montagem Consolidada

## Objetivo

Este documento define a ponte da issue #319 entre a prescrição técnica por capacidades, a Montagem Consolidada e os modelos operacionais já existentes de biblioteca e Workout Builder.

A #319 prepara, valida e registra a projeção operacional sem escrever no Workout Builder. No fluxo integrado atual, a #320 consome uma versão aprovada e preparada, revalida o gate e executa a mutação definitiva no grafo existente `TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise`, sem criar uma árvore paralela de `Treino de hoje`.

## Autoridades existentes

A implementação preserva as autoridades atuais:

- `CapacityTechnicalCatalogItem(category = exercise)` é o vocabulário técnico versionado da prescrição;
- `ExerciseLibrary` é a autoridade operacional usada por `WorkoutExercise.exerciseId`;
- `CapacityPrescriptionVersion` preserva os parâmetros técnicos e seus IDs explícitos;
- `ConsolidatedPrescriptionVersion` preserva a composição e os snapshots de preparação/substituição;
- `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise` continuam sendo o modelo operacional já existente.

Nome, código, categoria e grupo muscular não são chaves de integração.

## Referência técnica por ID

A capacidade resistida pode persistir `exerciseTechnicalCatalogItemIds` em seus parâmetros. Os IDs precisam:

1. existir em `CapacityTechnicalCatalogItem`;
2. pertencer ao mesmo `contractId`;
3. ter `category = exercise`;
4. estar na versão corrente no momento em que a nova versão da capacidade é criada.

A rota dedicada para versionar essas referências é:

`PATCH /api/v1/capacity-prescriptions/alunos/:alunoId/resisted/:prescriptionId/technical-exercises`

Ela copia a versão técnica corrente, altera somente os IDs técnicos de exercício e cria uma nova versão usando `expectedCurrentVersion`. O `POST /api/v1/capacity-prescriptions/alunos/:alunoId` também aceita `exerciseTechnicalCatalogItemIds`; quando uma nova versão resistida envia parâmetros atualizados sem repetir somente esse campo, o backend preserva os IDs da versão corrente. Uma lista enviada explicitamente — inclusive vazia — continua sendo autoridade para substituir ou limpar as referências. A validação de existência, categoria corrente e `contractId` ocorre dentro da mesma transação que versiona a prescrição, antes de qualquer mutação da raiz.

## Vínculo técnico -> biblioteca operacional

O vínculo é explícito e persistido no metadado do item técnico sob `operationalExerciseMapping`. O vínculo contém:

- `exerciseLibraryId`;
- snapshot dos campos reais do `ExerciseLibrary`;
- `mappingRevision`;
- professor ator;
- data do vínculo;
- origem estável do adaptador.

A gravação exige o ID do item técnico e o ID do exercício operacional. Ambos são validados no mesmo contrato. A operação nunca:

- procura correspondência por nome, código, categoria ou grupo muscular;
- cria `ExerciseLibrary` automaticamente;
- promove item importado ou recém-criado por heurística;
- inventa campos de equipamento, articulação, dificuldade, restrição clínica ou curadoria que não existem no modelo atual.

Como `ExerciseLibrary` não possui hoje um status de curadoria, a API expõe esse gap como `curationStatus = not_modeled`. A ausência desse campo não é convertida em aprovação fictícia.

A rota é:

`PUT /api/v1/consolidated-prescriptions/alunos/:alunoId/exercise-mappings/:technicalCatalogItemId`

O comando exige `expectedMappingRevision`, evitando sobrescrita silenciosa de vínculo concorrente. Como o vínculo é persistido no catálogo técnico do contrato e pode afetar montagens de vários alunos, a mutação exige simultaneamente `plans.consolidatedPrescriptions.manage` e `settings.parameters.capacityPrescriptions`. O `dataScope` de `plans` continua validando o aluno usado como contexto da operação, mas não concede por si só autoridade para alterar configuração global do catálogo.

## Busca da biblioteca

A seleção operacional usa:

`GET /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-exercises`

A consulta é sempre filtrada por `contractId` e pode receber `search`, `category` e `muscleGroup`. Esses campos servem somente à busca humana; não constituem contrato de associação técnica.

Somente os campos realmente presentes no `ExerciseLibrary` são retornados: ID, nome, vídeo, tipos de carga/movimento/contagem, categoria, grupo muscular, notas e `updatedAt`.

## Projeção operacional

`GET /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-preview` calcula a proposta sem escrever no Workout Builder.

`POST /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-preview/prepare` grava snapshots da proposta em uma nova versão da Montagem Consolidada. O comando usa `expectedCurrentVersion`.

Os snapshots são referências internas `manual_observation` com origem reservada `consolidated_operational_projection_v1`. Nas rotas normais de criação/edição da montagem, **qualquer** referência fornecida pelo cliente com uma origem operacional reservada é descartada antes da validação da composição, independentemente do `sourceType` informado. Somente referências internas já persistidas pelo servidor com o contrato canônico são reaproveitadas. Isso impede que uma fonte ordinária válida seja usada para forjar `origin/context` de preparação ou substituição.

### Resistido

A projeção só usa exercícios técnicos explicitamente referenciados por ID e vinculados explicitamente ao `ExerciseLibrary`.

Campos com representação direta podem ser propostos, por exemplo:

- `method` -> `WorkoutTemplate.trainingMethod`;
- `split` -> `WorkoutTemplate.trainingDivision`;
- reserva inteira simples -> `WorkoutTemplate.repReserve`;
- `sets` -> `WorkoutExercise.sets`;
- repetição inteira simples -> `WorkoutExercise.reps`.

Parâmetros sem representação inequívoca, como carga textual, PSE esperado, grupos musculares e restrições, permanecem em `unsupportedParameters`. Nenhum deles é convertido por inferência.

Ausência de item técnico, ausência de vínculo ou exercício operacional removido/inacessível produz incompatibilidade rastreável; não cria exercício e não corrompe a montagem.

### Cíclico

Somente campos com representação explícita são propostos:

- categoria -> `WorkoutDay.method`;
- percentual de VO2máx -> `WorkoutDay.vo2maxPct`;
- tempo expresso explicitamente em **minutos inteiros** -> `WorkoutDay.stimulusDurationMin`;
- distância expressa explicitamente em quilômetros -> `WorkoutTemplate.totalVolumeKm`.

Zonas, limiar, princípio de reversibilidade, PSE esperado e qualquer texto sem unidade inequívoca permanecem rastreados como não suportados. Durações fracionárias em minutos também permanecem em `unsupportedParameters`; o adaptador não arredonda o valor para caber silenciosamente no campo inteiro do `WorkoutDay`.

### Flexibilidade e equilíbrio

Flexibilidade e Equilíbrio possuem representação operacional estruturada quando os parâmetros mínimos necessários estão presentes. A projeção usa `WorkoutDayCapacityOperationalBlock`, relação aditiva ligada ao `WorkoutDay` e à `CapacityPrescriptionVersion` exata, com `contractVersion = 1` e snapshot integral em `parameters`.

Para Flexibilidade, a capacidade é representável somente quando existe ao menos uma articulação e todas as articulações possuem `name` e `suggestedPrescription` não vazios. Para Equilíbrio, é obrigatório haver `focus` e pelo menos um apoio válido em `supports` ou uma `progressionNotes` válida; entradas vazias em `supports` tornam o bloco incompatível.

Quando esses critérios são atendidos, a projeção retorna `compatibility = mapped` e alvo `WorkoutDay`. `WorkoutDay.detailNotes` para Flexibilidade e `WorkoutDay.complementNotes` para Equilíbrio são apresentação determinística derivada; não são a autoridade operacional nem fallback textual. A autoridade é o bloco relacional estruturado e versionado.

Quando os parâmetros mínimos não permitem representação sem perda, a projeção permanece fail-closed com `compatibility = incompatible`, alvo `none` e `operational_representation_unavailable`. O sistema não inventa `WorkoutExercise`, exercício fictício nem tradução por texto.

## Liberação operacional atual

A mutação definitiva é um comando separado da aprovação:

`POST /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-release`

O comando exige `plans.consolidatedPrescriptions.release`, deriva ator e timestamp da sessão e revalida no backend a versão aprovada vigente, conflitos críticos, capacidades, snapshots preparados, mapping revisions, substituições, biblioteca, `contractId`, aluno, plano e alvo operacional. A operação usa transação serializável e vínculo relacional idempotente; `WorkoutTemplate.released` só é marcado depois de conteúdo, versão `released` e registro de liberação terem sido persistidos na mesma transação.

A saída continua no grafo existente. Não existe entidade paralela `TodayWorkout`: `TrainingPlan`, `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise` permanecem os artefatos operacionais, e Flexibilidade/Equilíbrio acrescentam apenas `WorkoutDayCapacityOperationalBlock` ao dia correspondente.

A rastreabilidade operacional é consultável por ID persistente em:

`GET /api/v1/consolidated-prescriptions/alunos/:alunoId/operational-traceability`

A consulta aceita um único identificador operacional por vez (`workoutTemplateId`, `workoutDayId` ou `workoutExerciseId`) e percorre release, versão exata da Montagem Consolidada, versões das capacidades e referências de origem, incluindo os blocos estruturados de Flexibilidade/Equilíbrio.

## Snapshot, histórico e staleness

A preparação grava snapshot dos IDs, metadados e `mappingRevision` usados naquela versão da Montagem Consolidada. Assim, mudança posterior de nome ou metadados da biblioteca não reescreve a montagem histórica.

A visualização corrente também verifica a disponibilidade e o `updatedAt` atual do `ExerciseLibrary`. Se o exercício vinculado for removido ou ficar inacessível, a projeção corrente passa a `operational_exercise_unavailable`, preservando no histórico o snapshot anterior. Se nome ou outro metadado da biblioteca mudar mantendo o mesmo ID, o snapshot histórico também permanece intacto, mas a projeção preparada é marcada como desatualizada para exigir nova validação.

`hasStalePreparedSnapshot` fica verdadeiro quando:

- a montagem avançou para outra versão sem nova preparação;
- a revisão do vínculo técnico mudou desde o snapshot preparado; ou
- o `updatedAt` atual do exercício operacional efetivo diverge daquele usado na preparação, inclusive em substituições.

A correção exige nova preparação explícita; não há atualização automática da montagem histórica.

## Substituições

A rota:

`POST /api/v1/consolidated-prescriptions/alunos/:alunoId/exercise-substitutions`

registra uma substituição manual em nova versão da Montagem Consolidada. O registro preserva:

- ID técnico original;
- ID operacional original;
- ID operacional substituto;
- snapshots original e substituto;
- versão da capacidade de origem;
- revisão do mapeamento técnico-operacional original;
- motivo informado pelo professor;
- origem/regra informada;
- ator derivado da sessão;
- data gerada pelo servidor;
- montagem e versão relacionadas;
- confirmação de que não houve matching textual nem escrita operacional.

O substituto precisa existir no mesmo contrato e ser diferente do exercício original. Não há escolha automática de alternativa.

Antes de registrar a substituição, o backend exige uma compatibilidade estrutural mínima baseada somente nos atributos realmente modelados no `ExerciseLibrary`. Pelo menos um dos campos estruturados `loadType`, `movementType` ou `countingType` precisa existir no snapshot do exercício original, e todo campo estruturado conhecido deve ser igual no substituto. Quando `category` ou `muscleGroup` estiverem presentes no original, eles também precisam coincidir como restrições adicionais; esses textos nunca são usados isoladamente para inferir compatibilidade clínica. Se não houver atributos estruturados suficientes, a substituição é recusada em vez de assumir equivalência.

Antes desse cálculo de compatibilidade, o backend revalida que o `exerciseLibraryId`, a `mappingRevision`, a disponibilidade e o `updatedAt` atual do exercício operacional original ainda correspondem ao snapshot que fundamentou o vínculo. Se o registro original mudou ou ficou indisponível, a substituição é recusada com conflito e exige remapeamento explícito. Quando existe projeção preparada para a versão corrente da montagem, ela também precisa continuar coerente com a revisão e os metadados atuais; caso contrário, é necessário preparar novamente antes de registrar a substituição.

A substituição persiste a revisão do mapeamento original. Na projeção corrente, uma substituição histórica só é aplicada enquanto `originalExerciseLibraryId`, `originalMappingRevision` e a atualidade do snapshot original continuarem correspondendo ao vínculo vigente. Remapeamento do item técnico ou alteração posterior do exercício original invalida a decisão anterior como `exercise_substitution_stale` e exige nova decisão explícita, sem reescrever a montagem histórica.

Se a capacidade possui restrições estruturadas, mas o `ExerciseLibrary` não modela atributos suficientes para verificar essas restrições, a substituição também é recusada em vez de ser declarada compatível por inferência.

As substituições usam origem interna reservada `consolidated_exercise_substitution_v1`. Em edições comuns da montagem, referências com qualquer origem operacional reservada fornecidas pelo cliente são descartadas, e apenas as cópias canônicas já persistidas pelo servidor podem ser preservadas.

## Concorrência, permissões e tenant

- rotas de leitura e rastreabilidade exigem `plans.consolidatedPrescriptions.view`;
- preparação e substituição exigem `plans.consolidatedPrescriptions.manage`;
- liberação definitiva exige `plans.consolidatedPrescriptions.release`;
- alteração do vínculo técnico-operacional exige `plans.consolidatedPrescriptions.manage` **e** `settings.parameters.capacityPrescriptions`, porque modifica configuração reutilizada no contrato inteiro;
- o `dataScope` da tela `plans` é aplicado ao aluno, sem ampliar autoridade global de catálogo;
- `contractId` e professor ator vêm da sessão;
- IDs cross-tenant recebem erro sem promover associação;
- versões usam `expectedCurrentVersion` e vínculos usam `expectedMappingRevision`;
- preparação/preview não chama `releaseTemplate` nem cria/edita dias ou exercícios do Workout Builder; somente o comando explícito de `operational-release` pode realizar a mutação definitiva.

## Fronteiras de fase e estado integrado

A fronteira histórica da #319 permanece válida para seus comandos de preview, preparação, mapeamento e substituição: esses comandos não criam nem liberam o treino operacional por conta própria.

Com a #320 integrada, a versão aprovada e preparada pode seguir pelo comando explícito de liberação para:

- criar ou reconciliar um `WorkoutTemplate` futuro ainda não iniciado;
- criar/atualizar `WorkoutDay` e `WorkoutExercise` somente nos campos representados pela projeção;
- persistir `WorkoutDayCapacityOperationalBlock` para Flexibilidade/Equilíbrio quando representáveis;
- criar a versão `released` e o vínculo relacional append-only da liberação;
- manter idempotência, histórico e rastreabilidade por IDs;
- recusar sobrescrita de treino iniciado/executado ou de alvo já liberado por outra origem.

Continuam fora do fluxo integrado:

- importação em massa e deduplicação de biblioteca;
- matching por nome/texto como contrato de integração;
- sugestão automática de substituição;
- criação de modelo fictício de curadoria;
- criação de uma árvore paralela de `Treino de hoje`;
- escolha automática de outra semana/período para contornar conflito.
