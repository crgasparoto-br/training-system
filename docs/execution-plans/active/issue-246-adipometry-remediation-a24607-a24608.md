# Issue 246 — remediação A-246-07 e A-246-08

## Escopo

Esta remediação fecha as duas divergências encontradas na auditoria independente do head `182e44393a08d82ccdd650281639838d495ff5a9`.

## A-246-07 — conclusão concorrente com revogação

A conclusão passa a selecionar a aprovação clínica ativa com `FOR SHARE OF approval` dentro da própria transação de persistência.

O lock estabelece a seguinte ordem:

- quando a conclusão vincula a aprovação primeiro, uma revogação concorrente aguarda o commit da conclusão;
- quando a revogação atualiza a aprovação primeiro, a conclusão aguarda e reavalia `revokedAt IS NULL` depois do commit, falhando com `ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT`;
- a avaliação não pode terminar com `completedAt` posterior ao `revokedAt` da aprovação registrada no snapshot.

O controle `scripts/verify-adipometry-approval-revocation-concurrency.sh` usa duas conexões PostgreSQL independentes e cobre os dois interleavings, incluindo rollback sem linha de conclusão quando a revogação vence a corrida.

## A-246-08 — contrato compartilhado da proveniência clínica

`AdipometryCalculationSnapshot` exige `protocolApproval`, tipado por `AdipometryProtocolApprovalSnapshot`, com:

- aprovação e responsabilidade utilizadas;
- data e profissional aprovador;
- nome e CREF históricos;
- hash da especificação;
- referência bibliográfica congelada;
- snapshot integral da definição clínica aprovada.

O banco injeta esses dados autoritativamente no momento da conclusão. API e web não precisam interpretar campos JSON extras fora do contrato compartilhado.

## Gates impactados

- migrations Prisma em banco vazio e cadeia com dados existentes;
- controle PostgreSQL concorrente de conclusão versus revogação;
- contrato e serialização do snapshot de cálculo;
- `pnpm type-check`;
- `pnpm test`;
- `pnpm docs:check`;
- workflow `Validate PR`.
