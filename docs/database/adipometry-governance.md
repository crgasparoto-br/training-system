# Governança clínica da adipometria

## Tabelas

### `AdipometryClinicalResponsibility`

Histórico temporal append-only da responsabilidade técnica por contrato. O domínio suportado nesta fundação é `ADIPOMETRY_CLINICAL_RESPONSIBLE`.

A restrição parcial `AdipometryClinicalResponsibility_active_key` permite no máximo uma linha com `effectiveTo IS NULL` por contrato e domínio. Uma troca encerra a linha vigente e cria outra; linhas encerradas e campos de identidade são imutáveis por trigger.

O vínculo composto `(professorId, contractId)` impede designação cruzada entre contratos. O trigger também revalida usuário ativo, CREF pessoal, desligamento, status e permissão compatível.

### `AdipometryProtocolApproval`

Aprovação clínica imutável de uma identidade `(protocolId, protocolCode, protocolVersion)` dentro de um contrato. A linha referencia a designação vigente, o professor e o usuário aprovadores e preserva nome, CREF, declaração, hash e definição clínica em snapshot.

A unicidade por contrato e versão impede aprovação concorrente duplicada. O trigger de inserção exige:

- protocolo existente e não desativado;
- snapshot idêntico à definição corrente no instante da aprovação;
- definição executável e vetores reproduzíveis;
- designação ativa no instante da aprovação;
- conta autenticada correspondente ao professor designado;
- elegibilidade profissional revalidada.

Updates e deletes são bloqueados.

## Concorrência

Troca de responsável e aprovação usam transação serializável e `pg_advisory_xact_lock` por contrato/domínio ou contrato/protocolo. A barreira de banco permanece a unicidade parcial/composta, portanto chamadas concorrentes não produzem dois responsáveis ativos nem duas aprovações da mesma versão.

## Gate de conclusão

`canonicalizeAdipometryCompletion` consulta a aprovação do mesmo `contractId` e usa o `protocolDefinitionSnapshot` aprovado. A definição global `DRAFT` não libera cálculo sozinha.

O gate também valida `protocolSex`, decisão auditável, dobras exigidas pela combinação fixa do protocolo, precisão, limites e confirmação de alerta operacional. As dobras não usadas podem ser nulas; quando informadas, continuam sujeitas a precisão e limite técnico e permanecem no histórico.
