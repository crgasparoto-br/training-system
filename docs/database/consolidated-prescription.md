# Persistência da Montagem Consolidada

Este documento descreve a persistência da Montagem Consolidada da Prescrição. A issue #316 criou o agregado versionado; a #317 acrescentou workflow backend, revalidação estruturada, autorização e auditoria derivada da cadeia imutável de versões.

## Tabelas do agregado

### `ConsolidatedPrescription`

Agregado lógico atual por `(contractId, alunoId)`.

Campos centrais: `id`, `contractId`, `alunoId`, `currentVersion`, `currentStatus`, autoria de criação/atualização e timestamps. A restrição única `(contractId, alunoId)` impede duas cadeias concorrentes para o mesmo aluno no contrato.

### `ConsolidatedPrescriptionVersion`

Histórico imutável das revisões e transições materiais. Cada linha guarda versão sequencial, `previousVersionId`, estado, responsável técnico, justificativa/instrução, metadados de revisão/aprovação/bloqueio, conflitos estruturados, autoria e data.

A chave `(assemblyId, version)` é única. Comandos normais nunca atualizam uma versão histórica.

Além de representar o histórico funcional, esta tabela é a fonte auditável canônica da montagem. Cada ação sensível materializa uma nova versão com ator backend e timestamp; por isso não existe uma segunda tabela de auditoria que possa divergir do estado. `auditEvents` é derivado na leitura a partir da própria cadeia de versões.

### `ConsolidatedPrescriptionCapacityBlock`

Vínculo imutável entre uma versão consolidada e uma `CapacityPrescriptionVersion`. Preserva ID canônico, capacidade, versão, status e posição. A FK usa `ON DELETE RESTRICT`.

Triggers verificam que montagem e capacidade têm o mesmo `contractId + alunoId` e que o snapshot de capacidade/versão/status corresponde à versão canônica.

Na criação/edição, o service também exige exatamente `resisted`, `flexibility`, `cyclic` e `balance`, cada uma referenciando a versão corrente `active` de seu agregado de capacidade.

### `ConsolidatedPrescriptionDataRef`

Rastreabilidade mínima das fontes. `capacity_source` é reservado ao backend e corresponde a `CapacityPrescriptionSource` das versões selecionadas. Referências adicionais são revalidadas por `contractId + alunoId` antes da persistência.

## Auditoria sem duplicação de persistência

A auditoria é reconstruída deterministicamente de `ConsolidatedPrescriptionVersion`:

- primeira versão: `created`;
- `draft -> ready_for_review`: `sent_for_review`;
- `ready_for_review -> approved`: `approved`;
- transição para `blocked`: `blocked` ou `blocked_by_conflict` conforme o motivo canônico persistido;
- `blocked -> blocked` por correção de composição: `composition_updated`;
- `blocked -> draft/ready_for_review`: `unblocked`;
- `approved -> draft`: `revision_created`;
- demais novas versões editáveis: `composition_updated`.

O evento derivado usa `createdByProfessorId` da versão como ator da ação, `createdAt` como timestamp, `previousVersionId` para localizar versão/estado anterior e os campos específicos de revisão/aprovação/bloqueio para rastreabilidade adicional.

Essa estratégia satisfaz atomicidade por construção: estado e trilha auditável são a mesma escrita append-only. Se a transação falha ao persistir a nova versão ou alguma de suas relações obrigatórias, nem a alteração funcional nem seu evento auditável passam a existir.

## Concorrência otimista

O agregado usa `currentVersion` como CAS:

```text
SELECT ... FROM ConsolidatedPrescription FOR UPDATE

UPDATE ConsolidatedPrescription
SET currentVersion = currentVersion + 1, ...
WHERE id = :id AND currentVersion = :expectedCurrentVersion
```

O row lock elimina TOCTOU entre leitura da versão atual e avanço do agregado; o `WHERE currentVersion = expected` mantém proteção adicional contra escrita concorrente. A divergência retorna `CONFLICT`/HTTP `409` e não persiste versão parcial.

## Revalidação de conflitos

A revalidação lê novamente `CapacityPrescriptionVersion`, `CapacityPrescription` e alertas estruturados dentro da operação protegida. Ela considera crítica uma referência que deixou de ser a versão corrente/ativa ou um alerta persistido com severidade `critical`.

Campos de texto livre da capacidade ou da montagem não participam da decisão autoritativa.

Quando uma revalidação encontra `critical` em `draft`, `ready_for_review` ou `approved`, uma nova versão `blocked` é criada atomicamente. O motivo canônico diferencia no histórico um bloqueio derivado de conflito estruturado de um bloqueio manual.

Uma composição corretiva pode ser criada enquanto o agregado permanece `blocked`. O desbloqueio é outro comando: relê as fontes e somente cria a nova versão `draft` ou `ready_for_review` quando não existe conflito crítico.

## Isolamento multi-tenant e escopo de dados

A rota valida `contractId` e `dataScope` antes de entrar no domínio. O service revalida `Aluno`, ator e responsável técnico dentro da transação. Relações persistidas continuam protegidas pelos triggers introduzidos na #316.

Para `plans`:

- `self`: aluno diretamente atribuído ao professor;
- `managed`: aluno do professor ou de professor cujo `responsibleManagerId` é o ator;
- `contract`: qualquer aluno do contrato autenticado.

Acesso fora do contrato/escopo não expõe a existência do registro.

## Migrations

A #317 não adiciona nova tabela à persistência da #316. A cadeia relevante continua:

1. `20260808165000_issue_316_consolidated_prescription_persistence` — agregado, versões, blocos, refs, FKs e guards;
2. `20260808220000_issue_316_capacity_source_authority_guard` — autoridade de `capacity_source`.

O workflow da #317 reutiliza essas estruturas e mantém `schema.prisma` e histórico de migrations alinhados, sem introduzir uma tabela paralela de auditoria.

## Índices principais

- agregado por contrato/aluno/estado;
- histórico por contrato/aluno/data e estado;
- referência à versão anterior;
- versão de capacidade referenciada;
- origem dos dados-base.

## Validação executável

`apps/api/src/modules/consolidated-prescriptions/consolidated-prescription.service.test.ts` cobre o motor estruturado, ausência de heurística textual, `info`/`warning`/`critical`, autoridade do backend, composição completa, capacidade não ativa e falha de persistência da versão auditável.

`apps/api/tests/consolidated-prescription-http.integration.test.ts`, quando `RUN_DATABASE_INTEGRATION_TESTS=true`, cobre PostgreSQL real e HTTP para:

- payload com campos de autoridade rejeitado;
- isolamento cross-tenant e `dataScope`;
- permissão específica de aprovação;
- fluxo `draft -> ready_for_review -> approved`;
- texto livre sem bloqueio;
- alerta `critical` levando a `blocked`;
- remediação ainda bloqueada e desbloqueio explícito;
- nova revisão após aprovação;
- histórico com eventos de auditoria derivados das versões;
- `expectedCurrentVersion` obsoleto retornando `409` sem avanço parcial;
- inexistência de endpoint `released` nesta fase.

`apps/api/tests/consolidated-prescription-persistence.integration.test.ts` preserva os testes PostgreSQL da #316, incluindo duas escritas concorrentes na mesma `expectedCurrentVersion`, rollback transacional por guard de origem e imutabilidade das versões anteriores.
