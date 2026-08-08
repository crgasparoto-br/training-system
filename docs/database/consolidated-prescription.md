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

## Isolamento multi-tenant

A aplicação sempre filtra `Aluno`, `Professor` e `CapacityPrescriptionVersion` por `contractId` antes da gravação. A migration adiciona triggers para revalidar as invariantes diretamente no banco e bloquear escrita direta cross-tenant/cross-student.

Esses triggers complementam, e não substituem, a autorização da API.

## Concorrência otimista

O agregado usa `currentVersion` como CAS:

```text
UPDATE ConsolidatedPrescription
SET currentVersion = currentVersion + 1, ...
WHERE id = :id AND currentVersion = :expectedCurrentVersion
```

Se nenhuma linha for atualizada, a operação retorna conflito. A criação da nova versão ocorre na mesma transação serializável, portanto uma corrida perdida não deixa versão órfã.

## Imutabilidade

`ConsolidatedPrescriptionVersion`, seus blocos e referências não são atualizados por comandos normais. Alterações de composição ou estado criam nova versão e preservam `previousVersionId`.

Aprovação e bloqueio são estados de novas versões. O histórico que precedeu a decisão não é reescrito.

## Compatibilidade da migration

`20260808165000_issue_316_consolidated_prescription_persistence` é aditiva:

- cria somente tabelas, índices, FKs, funções e triggers novos;
- não faz backfill obrigatório porque não existia autoridade persistente anterior para a montagem;
- não remove nem renomeia tabelas existentes;
- preserva modelos operacionais de treino e execução existentes.

Aplicar em banco vazio ou em banco existente produz as mesmas estruturas novas sem depender de transformação de dados legados da montagem em memória.

## Índices principais

- agregado por contrato/aluno/estado;
- histórico por contrato/aluno/data;
- histórico por contrato/aluno/estado;
- referência à versão anterior;
- professor responsável;
- versão de capacidade referenciada;
- origem dos dados-base.

## Validação esperada

Além de `pnpm validate`, esta fundação deve ser verificada com cenários de:

- primeira montagem;
- segunda versão preservando a primeira;
- corrida de duas escritas com o mesmo `expectedCurrentVersion`;
- tentativa cross-tenant/cross-student;
- referência de capacidade incompatível;
- tentativa de excluir `CapacityPrescriptionVersion` em uso;
- atualização posterior da capacidade sem mutar montagem histórica;
- aplicação da migration sobre banco já populado.
