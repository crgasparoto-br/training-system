# Governança clínica da adipometria

## Tabelas

### `AdipometryClinicalResponsibility`

Histórico temporal append-only da responsabilidade técnica por contrato. O domínio suportado nesta fundação é `ADIPOMETRY_CLINICAL_RESPONSIBLE`.

A restrição parcial `AdipometryClinicalResponsibility_active_key` permite no máximo uma linha com `effectiveTo IS NULL` por contrato e domínio. Uma troca encerra a linha vigente e cria outra; linhas encerradas e campos de identidade são imutáveis por trigger.

O vínculo composto `(professorId, contractId)` impede designação cruzada entre contratos. O trigger também revalida usuário ativo, CREF pessoal, desligamento, status e a concessão clínica explícita.

A gestão da designação exige `settings.contract.actions.manageClinicalTechnicalResponsibility`. Aprovação e revogação exigem `settings.contract.adipometryProtocolApproval`. As duas capacidades começam negadas e não são herdadas automaticamente por `master`, `professor`, `manager` ou perfil administrativo. O acesso comum à tela de contrato não substitui a concessão sensível.

### `AdipometryProtocolApproval`

A aprovação clínica preserva a identidade `(protocolId, protocolCode, protocolVersion)` dentro de um contrato. A linha referencia a designação vigente, o professor e o usuário aprovadores e guarda nome, CREF, declaração, hash e definição clínica em snapshot.

A unicidade parcial por contrato e versão permite no máximo uma aprovação ativa. O trigger de inserção exige:

- protocolo existente e não desativado;
- snapshot idêntico à definição corrente no instante da aprovação;
- definição executável e vetores reproduzíveis;
- designação ativa no instante da aprovação;
- conta autenticada correspondente ao professor designado;
- elegibilidade e concessão clínica explícita revalidadas dentro da transação.

A aprovação pode sofrer uma única transição auditada para revogada. Somente `revokedAt`, `revokedByProfessorId`, `revokedByUserId` e `revocationReason` podem ser preenchidos; identidade, snapshot e autoria da aprovação continuam imutáveis. A revogação exige o responsável técnico vigente, a mesma conta autenticada e motivo com pelo menos dez caracteres. Deletes continuam bloqueados.

Depois da revogação, avaliações concluídas anteriormente mantêm snapshots e resultados. Novas conclusões ficam bloqueadas até uma nova aprovação ativa, que cria outra linha sem apagar a aprovação revogada.

## Concorrência

Troca de responsável, aprovação e revogação usam transação serializável e `pg_advisory_xact_lock` por contrato/domínio ou contrato/protocolo. As barreiras de banco permanecem a unicidade parcial e os triggers, portanto chamadas concorrentes não produzem dois responsáveis ativos, duas aprovações ativas da mesma versão nem duas revogações do mesmo registro.

## Gate de conclusão

`canonicalizeAdipometryCompletion` usa o `protocolDefinitionSnapshot` aprovado do mesmo `contractId`. A migration `20260731143000_close_issue_246_governance_findings` adiciona guards de inserção e transição para exigir uma aprovação com `revokedAt IS NULL`; a definição global `DRAFT` não libera cálculo sozinha.

O gate também valida `protocolSex`, decisão auditável, dobras exigidas pela combinação fixa do protocolo, precisão, limites e confirmação de alerta operacional. As dobras não usadas podem ser nulas; quando informadas, continuam sujeitas a precisão e limite técnico e permanecem no histórico.

## Persistência de revisões ADPT

A migration `20260731120000_complete_adipometry_revision_lifecycle` adiciona a autoridade histórica de revisão sem reescrever avaliações existentes. O backfill é determinístico: registros sem predecessor tornam-se `R1`; cadeias antigas de correção recebem números crescentes e preservam os vínculos existentes.

A taxonomia auditável de correção é:

- `DATA_ENTRY_ERROR`;
- `MEASUREMENT_TRANSCRIPTION_ERROR`;
- `EVALUATION_DATE_ERROR`;
- `PROTOCOL_SEX_ERROR`;
- `PROTOCOL_SELECTION_ERROR`;
- `OTHER`.

A persistência aplica as seguintes garantias:

- identidade raiz e revisão únicas por `rootAssessmentId`;
- código e sequência únicos somente para avaliações raiz, permitindo que revisões os reutilizem;
- no máximo um rascunho de correção aberto por cadeia;
- no máximo um sucessor finalizado para cada revisão;
- transições terminais imutáveis e proibição de exclusão física do histórico;
- cancelamento e anulação com ator, data e motivo;
- snapshots antes/depois e campos alterados calculados no banco;
- view `AdipometryCurrentAssessment` como fonte da revisão clínica vigente;
- validação efetiva de todos os vetores clínicos antes de uma aprovação por contrato.

As funções `startAdipometryCorrection`, `cancelAdipometryCorrection`, `confirmAdipometryCorrectionProtocolChange` e `voidAdipometryAssessment` exigem o contexto autenticado de ator e preservam isolamento por contrato/aluno.
