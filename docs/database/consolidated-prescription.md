# Persistência da Montagem Consolidada

Este documento descreve a persistência da Montagem Consolidada da Prescrição. A issue #316 criou o agregado versionado; a #317 acrescentou workflow backend, revalidação estruturada e auditoria atômica.

## Tabelas do agregado

### `ConsolidatedPrescription`

Agregado lógico atual por `(contractId, alunoId)`.

Campos centrais: `id`, `contractId`, `alunoId`, `currentVersion`, `currentStatus`, autoria de criação/atualização e timestamps. A restrição única `(contractId, alunoId)` impede duas cadeias concorrentes para o mesmo aluno no contrato.

### `ConsolidatedPrescriptionVersion`

Histórico imutável das revisões e transições materiais. Cada linha guarda versão sequencial, `previousVersionId`, estado, responsável técnico, justificativa/instrução, metadados de revisão/aprovação/bloqueio, conflitos estruturados, autoria e data.

A chave `(assemblyId, version)` é única. Comandos normais nunca atualizam uma versão histórica.

### `ConsolidatedPrescriptionCapacityBlock`

Vínculo imutável entre uma versão consolidada e uma `CapacityPrescriptionVersion`. Preserva ID canônico, capacidade, versão, status e posição. A FK usa `ON DELETE RESTRICT`.

Triggers verificam que montagem e capacidade têm o mesmo `contractId + alunoId` e que o snapshot de capacidade/versão/status corresponde à versão canônica.

Na criação/edição, o service também exige exatamente `resisted`, `flexibility`, `cyclic` e `balance`, cada uma referenciando a versão corrente `active` de seu agregado de capacidade.

### `ConsolidatedPrescriptionDataRef`

Rastreabilidade mínima das fontes. `capacity_source` é reservado ao backend e corresponde a `CapacityPrescriptionSource` das versões selecionadas. Referências adicionais são revalidadas por `contractId + alunoId` antes da persistência.

### `ConsolidatedPrescriptionAuditEvent`

Tabela append-only criada pela migration `20260809123000_issue_317_consolidated_prescription_audit`.

Campos:

- `assemblyId` e `assemblyVersionId`;
- `contractId` e `alunoId`;
- `actorProfessorId`;
- `action`;
- `previousVersion` / `newVersion`;
- `previousStatus` / `newStatus`;
- `reason`;
- `details` JSON opcional;
- `createdAt`.

A ação aceita somente `created`, `composition_updated`, `sent_for_review`, `approved`, `blocked`, `blocked_by_conflict`, `unblocked` ou `revision_created`.

Um trigger confere que:

- evento, agregado e versão pertencem ao mesmo contrato/aluno;
- `assemblyVersionId` pertence ao agregado informado;
- `newVersion` coincide com a versão persistida;
- o ator pertence ao mesmo contrato.

O service grava o evento dentro da mesma transação da nova versão. Falha de auditoria aborta o commit inteiro.

## Concorrência otimista

O agregado usa `currentVersion` como CAS:

```text
SELECT ... FROM ConsolidatedPrescription FOR UPDATE

UPDATE ConsolidatedPrescription
SET currentVersion = currentVersion + 1, ...
WHERE id = :id AND currentVersion = :expectedCurrentVersion
```

O row lock elimina TOCTOU entre leitura da versão atual e avanço do agregado; o `WHERE currentVersion = expected` mantém proteção adicional contra escrita concorrente. A divergência retorna `CONFLICT`/HTTP `409` e não persiste versão ou auditoria parcial.

## Revalidação de conflitos

A revalidação lê novamente `CapacityPrescriptionVersion`, `CapacityPrescription` e alertas estruturados dentro da operação protegida. Ela considera crítica uma referência que deixou de ser a versão corrente/ativa ou um alerta persistido com severidade `critical`.

Campos de texto livre da capacidade ou da montagem não participam da decisão autoritativa.

Quando uma revalidação encontra `critical` em `draft`, `ready_for_review` ou `approved`, uma nova versão `blocked` e seu evento `blocked_by_conflict` são gravados atomicamente.

Uma composição corretiva pode ser criada enquanto o agregado permanece `blocked`. O desbloqueio é outro comando: relê as fontes e somente cria a nova versão `draft` ou `ready_for_review` quando não existe conflito crítico.

## Isolamento multi-tenant e escopo de dados

A rota valida `contractId` e `dataScope` antes de entrar no domínio. O service revalida `Aluno`, ator e responsável técnico dentro da transação. Relações persistidas continuam protegidas pelos triggers introduzidos na #316.

Para `plans`:

- `self`: aluno diretamente atribuído ao professor;
- `managed`: aluno do professor ou de professor cujo `responsibleManagerId` é o ator;
- `contract`: qualquer aluno do contrato autenticado.

Acesso fora do contrato/escopo não expõe a existência do registro.

## Migrations

A cadeia relevante é:

1. `20260808165000_issue_316_consolidated_prescription_persistence` — agregado, versões, blocos, refs, FKs e guards;
2. `20260808220000_issue_316_capacity_source_authority_guard` — autoridade de `capacity_source`;
3. `20260809123000_issue_317_consolidated_prescription_audit` — auditoria atômica e guard de escopo.

Todas são aditivas. Nenhuma altera/remover `WorkoutTemplate`, `WorkoutDay`, `WorkoutExercise`, planos ou execuções existentes.

## Índices principais

- agregado por contrato/aluno/estado;
- histórico por contrato/aluno/data e estado;
- referência à versão anterior;
- versão de capacidade referenciada;
- origem dos dados-base;
- auditoria por agregado/data;
- auditoria por contrato/aluno/data;
- auditoria por ator/data.

## Validação executável

`apps/api/src/modules/consolidated-prescriptions/consolidated-prescription.service.test.ts` cobre o motor estruturado, ausência de heurística textual, autoridade do backend, composição completa e falha de auditoria.

`apps/api/tests/consolidated-prescription-http.integration.test.ts`, quando `RUN_DATABASE_INTEGRATION_TESTS=true`, cobre PostgreSQL real e HTTP para:

- payload com campos de autoridade rejeitado;
- isolamento cross-tenant e `dataScope`;
- permissão específica de aprovação;
- fluxo `draft -> ready_for_review -> approved`;
- texto livre sem bloqueio;
- alerta `critical` levando a `blocked`;
- remediação ainda bloqueada e desbloqueio explícito;
- nova revisão após aprovação;
- histórico com eventos de auditoria;
- `expectedCurrentVersion` obsoleto retornando `409` sem avanço parcial;
- inexistência de endpoint `released` nesta fase.
