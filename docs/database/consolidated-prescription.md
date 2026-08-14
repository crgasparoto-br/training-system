# Persistência da Montagem Consolidada

Este documento descreve a persistência da Montagem Consolidada da Prescrição. A issue #316 criou o agregado versionado; a #317 acrescentou workflow backend, revalidação estruturada, autorização e auditoria derivada da cadeia imutável de versões; a #320 acrescenta o vínculo relacional append-only entre uma versão aprovada e sua saída no Workout Builder e o contrato operacional estruturado de Flexibilidade/Equilíbrio.

## Tabelas do agregado

### `ConsolidatedPrescription`

Agregado lógico atual por `(contractId, alunoId)`.

Campos centrais: `id`, `contractId`, `alunoId`, `currentVersion`, `currentStatus`, autoria de criação/atualização e timestamps. A restrição única `(contractId, alunoId)` impede duas cadeias concorrentes para o mesmo aluno no contrato.

### `ConsolidatedPrescriptionVersion`

Histórico imutável das revisões e transições materiais. Cada linha guarda versão sequencial, `previousVersionId`, estado, responsável técnico, justificativa/instrução, metadados de revisão/aprovação/bloqueio, conflitos estruturados, autoria e data.

A chave `(assemblyId, version)` é única. Comandos normais nunca atualizam uma versão histórica.

Além de representar o histórico funcional, esta tabela é a fonte auditável canônica da montagem. Cada ação sensível materializa uma nova versão com ator backend e timestamp; por isso não existe uma segunda tabela de auditoria que possa divergir do estado. `auditEvents` é derivado na leitura a partir da própria cadeia de versões.

Na liberação da #320, a versão `approved` permanece intacta e uma nova versão `released` é adicionada com `previousVersionId` apontando para a versão aprovada.

### `ConsolidatedPrescriptionCapacityBlock`

Vínculo imutável entre uma versão consolidada e uma `CapacityPrescriptionVersion`. Preserva ID canônico, capacidade, versão, status e posição. A FK usa `ON DELETE RESTRICT`.

Triggers verificam que montagem e capacidade têm o mesmo `contractId + alunoId` e que o snapshot de capacidade/versão/status corresponde à versão canônica.

Na criação/edição, o service também exige exatamente `resisted`, `flexibility`, `cyclic` e `balance`, cada uma referenciando a versão corrente `active` de seu agregado de capacidade.

### `ConsolidatedPrescriptionDataRef`

Rastreabilidade mínima das fontes. `capacity_source` é reservado ao backend e corresponde a `CapacityPrescriptionSource` das versões selecionadas. Referências adicionais são revalidadas por `contractId + alunoId` antes da persistência.

A #319 também persiste snapshots server-owned de projeção/substituição nessas referências. A #320 os consome somente depois de revalidar capacidade, vínculo técnico, revisão do mapeamento e `ExerciseLibrary.updatedAt` atual.

Para Flexibilidade/Equilíbrio, o snapshot preparado contém também um `WorkoutDayCapacityOperationalBlock` explícito com `contractVersion=1`, `capacityPrescriptionVersionId` e parâmetros estruturados. O release rejeita snapshot ausente, divergente ou sem versão de contrato.

### `ConsolidatedPrescriptionOperationalRelease`

Evidência relacional append-only da publicação operacional criada pela #320. Cada linha liga de forma explícita:

- `assemblyId`;
- versão `approved` de origem e seu número;
- versão `released` criada pela transação e seu número;
- `contractId` e `alunoId`;
- `TrainingPlan` e `WorkoutTemplate` efetivamente publicados;
- professor ator e `releasedAt`;
- fingerprint canônico da requisição.

`sourceAssemblyVersionId` possui índice único e funciona como chave natural de idempotência. `workoutTemplateId` também é único para impedir que um template já publicado seja silenciosamente reassociado a outra versão consolidada.

O trigger de escopo confirma que as duas versões pertencem à mesma montagem/aluno/contrato, que a origem é `approved`, que a versão seguinte é `released` e aponta para a origem, e que plano/template/ator pertencem ao mesmo tenant. Outro trigger rejeita `UPDATE` e `DELETE`, preservando a evidência histórica.

A aplicação usa SQL explícito para esse ledger relacional porque a tabela é append-only, possui invariantes PostgreSQL próprias e não participa de CRUD genérico. As entidades operacionais continuam acessadas pelo Prisma normalmente.

### `WorkoutDayCapacityOperationalBlock`

Representação operacional estruturada de Flexibilidade/Equilíbrio ligada ao `WorkoutDay` existente. Não é uma árvore paralela de treino.

Cada linha contém:

- `workoutDayId` com FK para a sessão operacional;
- `capacityPrescriptionVersionId` com FK para a versão imutável da capacidade;
- `capacity` restrita a `flexibility | balance`;
- `contractVersion = 1`;
- `parameters JSONB` com o objeto estruturado integral da capacidade;
- timestamp de criação.

A chave única `(workoutDayId, capacity)` impede dois snapshots da mesma capacidade na mesma sessão. O trigger de escopo sobe `WorkoutDay -> WorkoutTemplate -> TrainingPlan -> Aluno/Professor` e exige o mesmo tenant/aluno da `CapacityPrescriptionVersion`.

O mesmo trigger compara `parameters` por igualdade JSONB com o ramo canônico da versão (`parameters.flexibility` ou `parameters.balance`) e exige que `parameters.type` corresponda à capacidade. Assim, texto formatado ou JSON parcial não pode ser usado como autoridade operacional.

Outro trigger proíbe `UPDATE`/`DELETE`. As notas de `WorkoutDay` são somente apresentação derivada; a relação estruturada é a fonte operacional versionada e sem perda.

## Auditoria sem duplicação de persistência

A auditoria funcional da montagem continua reconstruída deterministicamente de `ConsolidatedPrescriptionVersion`:

- primeira versão: `created`;
- `draft -> ready_for_review`: `sent_for_review`;
- `ready_for_review -> approved`: `approved`;
- transição para `blocked`: `blocked` ou `blocked_by_conflict` conforme o motivo canônico persistido;
- `blocked -> blocked` por correção de composição: `composition_updated`;
- `blocked -> draft/ready_for_review`: `unblocked`;
- `approved -> draft`: `revision_created`;
- `approved -> released`: a cadeia de versões preserva `newStatus=released`; o `auditEvents.action` legado ainda deriva `composition_updated`, enquanto o ledger `ConsolidatedPrescriptionOperationalRelease` registra explicitamente a liberação material, o alvo, o ator e a data;
- demais novas versões editáveis: `composition_updated`.

O evento derivado usa `createdByProfessorId` da versão como ator da ação, `createdAt` como timestamp, `previousVersionId` para localizar versão/estado anterior e os campos específicos de revisão/aprovação/bloqueio para rastreabilidade adicional.

A tabela `ConsolidatedPrescriptionOperationalRelease` não substitui essa auditoria de estado: ela prova a relação material entre a transição `released` e os IDs operacionais que receberam a publicação. `WorkoutDayCapacityOperationalBlock` complementa essa cadeia com o vínculo direto sessão -> versão da capacidade para Flexibilidade/Equilíbrio.

Essa estratégia satisfaz atomicidade por construção: estado, conteúdo operacional, blocos estruturados, vínculo e flag de liberação são escritos na mesma transação. Se qualquer etapa falha, nenhuma alteração parcial permanece.

## Concorrência otimista e idempotência

O agregado usa `currentVersion` como CAS:

```text
SELECT ... FROM ConsolidatedPrescription FOR UPDATE

UPDATE ConsolidatedPrescription
SET currentVersion = currentVersion + 1, ...
WHERE id = :id AND currentVersion = :expectedCurrentVersion
```

O row lock elimina TOCTOU entre leitura da versão atual e avanço do agregado; o `WHERE currentVersion = expected` mantém proteção adicional contra escrita concorrente. A divergência retorna `CONFLICT`/HTTP `409` e não persiste versão parcial.

Na #320, uma liberação existente para `sourceAssemblyVersionId` é consultada depois do lock. Se o fingerprint do comando for igual, a resposta é idempotente e reutiliza o mesmo release. Se a mesma origem for reapresentada com outro destino, a operação falha com conflito. Corridas também são fechadas pelos índices únicos e pela transação serializável.

## Revalidação de conflitos e saída operacional

A revalidação lê novamente `CapacityPrescriptionVersion`, `CapacityPrescription` e alertas estruturados dentro da operação protegida. Ela considera crítica uma referência que deixou de ser a versão corrente/ativa ou um alerta persistido com severidade `critical`.

Campos de texto livre da capacidade ou da montagem não participam da decisão autoritativa.

Na liberação, o backend também revalida os snapshots operacionais preparados: IDs técnicos, `mappingRevision`, exercício original, substituição explícita, exercício efetivo e `updatedAt` da biblioteca. Para Flexibilidade/Equilíbrio, revalida também `contractVersion`, capacidade, FK de origem e igualdade entre o snapshot estruturado preparado e `sourceParameters`; o PostgreSQL fecha a igualdade final contra a versão canônica. Não existe matching textual ou geração automática de alternativa.

Um `WorkoutTemplate` já existente só pode ser usado quando nenhum dia saiu de `planned`, não existem `startedAt/finishedAt` e nenhum `WorkoutExercise` possui `WorkoutExecution`. Essa checagem ocorre antes de qualquer reconciliação ou flag `released`.

Quando esse target futuro é reutilizado, a montagem aprovada passa a ser o snapshot canônico do conteúdo gerenciado pela ponte: dias não posicionados e exercícios em slots não projetados são removidos; campos gerenciados de template/dia que deixaram de aparecer são definidos como `NULL`; os itens restantes são atualizados/criados. A mesma transação desfaz toda a reconciliação se o release falhar depois.

## Isolamento multi-tenant e escopo de dados

As rotas normais validam `contractId` e `dataScope`. Para a liberação da #320, a autoridade final de `plans.consolidatedPrescriptions.release` e o `dataScope` de `plans` são revalidados com o mesmo `TransactionClient` que persiste a saída.

Para `plans`:

- `self`: aluno diretamente atribuído ao professor;
- `managed`: aluno do professor ou de professor cujo `responsibleManagerId` é o ator;
- `contract`: qualquer aluno do contrato autenticado.

Acesso fora do contrato/escopo não expõe a existência do registro. Os triggers do ledger e dos blocos operacionais estruturados fecham combinações cross-tenant mesmo se houver chamada direta fora do service.

## Migrations

A cadeia relevante é:

1. `20260808165000_issue_316_consolidated_prescription_persistence` — agregado, versões, blocos, refs, FKs e guards;
2. `20260808220000_issue_316_capacity_source_authority_guard` — autoridade de `capacity_source`;
3. `20260812143000_issue_320_consolidated_operational_release` — vínculo relacional de liberação, chaves de idempotência, guards de escopo/imutabilidade e `WorkoutDayCapacityOperationalBlock` estruturado da #339.

A migration da #320 é aditiva: não remove nem reescreve plano, template, dia, exercício ou execução existente durante a migração. A reconciliação de target planejado é comportamento transacional do comando de release, não efeito da migration.

## Índices principais

- agregado por contrato/aluno/estado;
- histórico por contrato/aluno/data e estado;
- referência à versão anterior;
- versão de capacidade referenciada;
- origem dos dados-base;
- release por versão aprovada de origem (único);
- release por template operacional (único);
- release por contrato/aluno/data e por plano;
- bloco operacional por `(workoutDayId, capacity)` (único);
- bloco operacional por `capacityPrescriptionVersionId`.

## Validação executável

Os testes existentes da #316/#317 continuam cobrindo versão, composição, concorrência e isolamento. A #320/#339 acrescenta testes focados para:

- permissão específica e revalidação transacional;
- lock serializável e evidência de aprovação;
- bloqueio de treino iniciado/executado;
- fingerprint idempotente;
- relação versionada -> plano/template;
- snapshot estruturado de Flexibilidade/Equilíbrio com FK, `contractVersion=1` e parâmetros sem perda;
- reconciliação exata de target futuro com dias/exercícios residuais;
- índices únicos e imutabilidade do ledger/blocos estruturados;
- ordem de escrita que só marca `WorkoutTemplate.released` depois da persistência do conteúdo, dos blocos e do vínculo.

Os cenários PostgreSQL de corrida, rollback e falha injetada permanecem gate obrigatório para fechamento integral da entrega crítica.
