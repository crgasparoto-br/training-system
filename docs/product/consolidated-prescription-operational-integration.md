# Integração operacional da Montagem Consolidada

## Objetivo

Este documento define a ponte da issue #319 entre a prescrição técnica por capacidades, a Montagem Consolidada e os modelos operacionais já existentes de biblioteca e Workout Builder.

A integração prepara, valida e registra uma projeção operacional. Ela **não** cria, altera, libera nem publica `TrainingPlan`, `WorkoutTemplate`, `WorkoutDay` ou `WorkoutExercise`. A mutação operacional definitiva pertence à issue #320.

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

O modelo operacional atual não possui representação suficiente para transportar esses parâmetros sem perda de semântica. O adaptador preserva a capacidade e seus parâmetros no snapshot e retorna `operational_representation_unavailable`; não inventa `WorkoutExercise` nem converte texto em exercício.

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
- motivo informado pelo professor;
- origem/regra informada;
- ator derivado da sessão;
- data gerada pelo servidor;
- montagem e versão relacionadas;
- confirmação de que não houve matching textual nem escrita operacional.

O substituto precisa existir no mesmo contrato e ser diferente do exercício original. Não há escolha automática de alternativa.

Antes de registrar a substituição, o backend exige uma compatibilidade estrutural mínima baseada somente nos atributos realmente modelados no `ExerciseLibrary`. Pelo menos um dos campos estruturados `loadType`, `movementType` ou `countingType` precisa existir no snapshot do exercício original, e todo campo estruturado conhecido deve ser igual no substituto. Quando `category` ou `muscleGroup` estiverem presentes no original, eles também precisam coincidir como restrições adicionais; esses textos nunca são usados isoladamente para inferir compatibilidade clínica. Se não houver atributos estruturados suficientes, a substituição é recusada em vez de assumir equivalência.

Se a capacidade possui restrições estruturadas, mas o `ExerciseLibrary` não modela atributos suficientes para verificar essas restrições, a substituição também é recusada em vez de ser declarada compatível por inferência.

As substituições usam origem interna reservada `consolidated_exercise_substitution_v1`. Em edições comuns da montagem, referências com qualquer origem operacional reservada fornecidas pelo cliente são descartadas, e apenas as cópias canônicas já persistidas pelo servidor podem ser preservadas.

## Concorrência, permissões e tenant

- rotas de leitura exigem `plans.consolidatedPrescriptions.view`;
- preparação e substituição exigem `plans.consolidatedPrescriptions.manage`;
- alteração do vínculo técnico-operacional exige `plans.consolidatedPrescriptions.manage` **e** `settings.parameters.capacityPrescriptions`, porque modifica configuração reutilizada no contrato inteiro;
- o `dataScope` da tela `plans` é aplicado ao aluno, sem ampliar autoridade global de catálogo;
- `contractId` e professor ator vêm da sessão;
- IDs cross-tenant recebem erro sem promover associação;
- versões usam `expectedCurrentVersion` e vínculos usam `expectedMappingRevision`;
- a integração não chama `releaseTemplate` nem cria/edita dias ou exercícios do Workout Builder.

## Limites desta fase

Permanecem fora da #319:

- criação ou alteração definitiva de `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise`;
- transição da Montagem Consolidada para `released`;
- geração/publicação do Treino de hoje;
- importação em massa e deduplicação de biblioteca;
- matching por texto;
- sugestão automática de substituição;
- criação de um modelo fictício de curadoria.

A issue #320 deverá consumir a projeção preparada, revalidar versão, tenant, disponibilidade da biblioteca e incompatibilidades antes de qualquer mutação operacional.
