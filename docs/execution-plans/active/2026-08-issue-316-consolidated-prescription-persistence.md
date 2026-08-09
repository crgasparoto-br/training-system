# Issue #316 — Persistência da Montagem Consolidada

## Objetivo

Evoluir a fundação em memória da Montagem Consolidada para uma cadeia persistente e versionada por `contractId + alunoId`, usando referências canônicas às versões das prescrições por capacidade e concorrência otimista.

## Recorte

- `packages/types/consolidated-prescription.ts`: contratos compartilhados sem autoridade de estado/aprovação no cliente.
- `apps/api/src/modules/consolidated-prescriptions/`: service persistente, transições e testes.
- `apps/api/prisma/migrations/20260808165000_issue_316_consolidated_prescription_persistence/`: tabelas, índices, FKs e guards de escopo.
- `docs/product/consolidated-prescription-model.md`: regra permanente do domínio.
- `docs/database/consolidated-prescription.md`: invariantes de persistência.

## Invariantes

1. Uma cadeia lógica por `(contractId, alunoId)`.
2. Toda gravação material cria nova versão; histórico não é sobrescrito.
3. `expectedCurrentVersion` protege avanços concorrentes.
4. `CapacityPrescriptionVersion.id` é a autoridade de origem dos blocos.
5. `contractId`, estado, versão, ator e timestamps são autoridade do backend.
6. `approved` e `blocked` usam comandos próprios; `released` não é transicionado nesta issue.
7. Vínculo cross-tenant/cross-student é bloqueado no service e no banco.
8. Versão de capacidade em uso não pode ser apagada.

## Validação prevista

- testes focados do service;
- migration em banco vazio e banco existente;
- concorrência otimista;
- histórico e imutabilidade;
- referência cross-tenant/cross-student;
- proteção `ON DELETE RESTRICT`;
- `pnpm type-check`;
- `pnpm test`;
- `pnpm arch:check`;
- `pnpm access:check`;
- `pnpm docs:check`;
- `pnpm validate`.

## Limitação do ambiente desta entrega

O ambiente de execução do agente não consegue resolver `github.com` para materializar um checkout local. A implementação é feita pelo conector GitHub; os comandos executáveis acima precisam ser confirmados pelo CI do SHA publicado. Nenhum workflow será disparado ou reexecutado manualmente.
