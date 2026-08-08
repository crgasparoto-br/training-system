# Persistência da Montagem Consolidada

Este documento descreve a persistência introduzida pela issue #316 para a Montagem Consolidada da Prescrição.

## Tabelas

### `ConsolidatedPrescription`

Agregado lógico atual por `(contractId, alunoId)`.

Campos centrais:

- `id`;
- `contractId`;
- `alunoId`;
- `currentVersion`;
- `currentStatus`;
- autoria de criação e atualização;
- timestamps.

A restrição única `(contractId, alunoId)` impede duas cadeias concorrentes para o mesmo aluno dentro do mesmo contrato.

### `ConsolidatedPrescriptionVersion`

Histórico imutável das revisões e transições materiais.

Cada linha guarda:

- versão sequencial;
- `previousVersionId`;
- estado;
- professor responsável técnico;
- justificativa interna e instrução prática separadas;
- metadados de revisão, aprovação e bloqueio;
- conflitos detectados;
- autoria e data.

A chave única `(assemblyId, version)` preserva uma única revisão para cada número de versão.

### `ConsolidatedPrescriptionCapacityBlock`

Vínculo imutável entre uma versão da montagem e uma `CapacityPrescriptionVersion`.

A tabela preserva o ID canônico da versão de capacidade, além do snapshot mínimo de capacidade, versão, status e posição. A FK para `CapacityPrescriptionVersion` usa `ON DELETE RESTRICT` para impedir exclusão de uma origem já usada por histórico.

Um trigger confere que:

- montagem e capacidade pertencem ao mesmo `contractId`;
- montagem e capacidade pertencem ao mesmo `alunoId`;
- capacidade, número da versão e status gravados correspondem à `CapacityPrescriptionVersion` canônica.

### `ConsolidatedPrescriptionDataRef`

Rastreabilidade mínima de dados-base e observações adicionais. Referências já presentes nas versões de capacidade são persistidas como `capacity_source`; dados completos não são duplicados quando a referência canônica é suficiente.

`capacity_source` é papel reservado ao backend. O contrato TypeScript não o aceita em `dataRefs` adicionais e a migration `20260808220000_issue_316_capacity_source_authority_guard` reforça a fronteira em runtime: a referência precisa corresponder exatamente a uma `CapacityPrescriptionSource` de uma das versões de capacidade selecionadas e uma segunda declaração da mesma origem na mesma versão consolidada é rejeitada. Como o service persiste primeiro as referências canônicas derivadas das capacidades, um payload adversarial que tente declarar `capacity_source` provoca rollback da transação.

## Isolamento multi-tenant

A aplicação sempre filtra `Aluno`, `Professor` e `CapacityPrescriptionVersion` por `contractId` antes da gravação. As migrations adicionam triggers para revalidar as invariantes diretamente no banco e bloquear escrita direta cross-tenant/cross-student.

Esses triggers complementam, e não substituem, a autorização da API.

## Concorrência otimista

O agregado usa `currentVersion` como CAS:

```text
UPDATE ConsolidatedPrescription
SET currentVersion = currentVersion + 1, ...
WHERE id = :id AND currentVersion = :expectedCurrentVersion
```

A mutação ocorre dentro da mesma transação que bloqueia o agregado corrente com `SELECT ... FOR UPDATE`. Depois de adquirir o row lock, o service compara `expectedCurrentVersion` com a versão observada e o `UPDATE` mantém a condição CAS. Se outra escrita tiver avançado primeiro, a operação retorna conflito e a transação não persiste uma nova versão órfã. O service não depende de `SERIALIZABLE`; a garantia descrita aqui é row lock + CAS em transação PostgreSQL.

## Imutabilidade

`ConsolidatedPrescriptionVersion`, seus blocos e referências não são atualizados por comandos normais. Alterações de composição ou estado criam nova versão e preservam `previousVersionId`.

Aprovação e bloqueio são estados de novas versões. O histórico que precedeu a decisão não é reescrito.

## Compatibilidade da migration

`20260808165000_issue_316_consolidated_prescription_persistence` é aditiva:

- cria somente tabelas, índices, FKs, funções e triggers novos;
- não faz backfill obrigatório porque não existia autoridade persistente anterior para a montagem;
- não remove nem renomeia tabelas existentes;
- preserva modelos operacionais de treino e execução existentes.

`20260808220000_issue_316_capacity_source_authority_guard` também é aditiva: substitui somente a função de validação usada pelo trigger de `ConsolidatedPrescriptionDataRef`, sem remover dados ou estruturas existentes.

Aplicar a cadeia em banco vazio ou em banco existente produz as mesmas estruturas novas sem depender de transformação de dados legados da montagem em memória. O teste de integração da issue monta um schema PostgreSQL previamente populado, aplica as duas migrations e comprova que dados operacionais anteriores continuam presentes.

## Índices principais

- agregado por contrato/aluno/estado;
- histórico por contrato/aluno/data;
- histórico por contrato/aluno/estado;
- referência à versão anterior;
- professor responsável;
- versão de capacidade referenciada;
- origem dos dados-base.

## Validação executável

`apps/api/tests/consolidated-prescription-persistence.integration.test.ts`, quando `RUN_DATABASE_INTEGRATION_TESTS=true`, cobre em PostgreSQL real:

- primeira montagem com Resistido, Flexibilidade, Cíclico e Equilíbrio;
- revisão, aprovação e nova composição com histórico append-only;
- atualização posterior de uma capacidade sem mutar a montagem aprovada anterior;
- duas escritas com o mesmo `expectedCurrentVersion` usando conexões distintas, com uma rejeitada por `CONFLICT`;
- referência cross-tenant e cross-student rejeitada pelo service;
- escrita direta cross-tenant rejeitada pelo trigger;
- `ON DELETE RESTRICT` para `CapacityPrescriptionVersion` em uso;
- tentativa adversarial de declarar `capacity_source` com rollback completo;
- aplicação das migrations sobre schema previamente populado, preservando dados operacionais existentes.

A migration em banco vazio continua exercitada pelo `prisma migrate deploy` do gate `Validate PR`, antes da suíte de integração.
