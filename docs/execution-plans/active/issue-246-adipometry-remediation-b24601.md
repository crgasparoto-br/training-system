# Issue #246 — remediação B-246-01

## Achado

A auditoria independente identificou que `isValidAdipometryContractProtocolDefinition()` retornava `TRUE` imediatamente após validar apenas a presença e a quantidade de `testVectors`. O laço responsável por executar os vetores e comparar `expectedResults` e `tolerance` permanecia inalcançável.

Esse validador é usado pelo trigger de aprovação por contrato. Assim, uma definição clínica com resultados esperados ou tolerâncias adulterados poderia chegar ao fluxo de aprovação quando o snapshot e o hash fossem atualizados de forma consistente.

## Correção

A migration `20260802121500_enforce_adipometry_contract_vector_validation` substitui o validador de forma aditiva, remove o retorno antecipado e exige que todos os vetores sejam executados antes do retorno positivo. A migration também interrompe o deploy caso exista uma aprovação histórica cujo snapshot não seja reproduzível pelo validador corrigido.

## Controle adversarial

`scripts/verify-adipometry-contract-vector-approval.sh` cria um banco exclusivo, aplica somente a cadeia versionada de migrations e executa três controles:

1. a definição canônica de Guedes permanece válida;
2. um resultado esperado adulterado é rejeitado;
3. uma tolerância acima de `0.01` é rejeitada.

Nos dois controles negativos, o script cria um protocolo de prova com snapshot adulterado, recalcula o SHA-256 por `buildAdipometrySpecificationHash()` e tenta persistir a aprovação. O resultado esperado é `ADIPOMETRY_PROTOCOL_DEFINITION_INCOMPLETE`.

O gate isolado foi incorporado a `verify-adipometry-audit-remediation.sh` para impedir que substituições de função realizadas por outros testes no banco compartilhado mascarem regressões na cadeia de migrations.
