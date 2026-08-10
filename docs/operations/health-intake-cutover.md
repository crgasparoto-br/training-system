# Cutover da Anamnese Inicial canônica

## Fonte de verdade

A partir da migration `20260725010000_issue_272_canonical_health_intake`, novas escritas de Anamnese usam exclusivamente `StudentHealthIntake`. A tabela `AlunoIntakeForm` é histórica e recebe um trigger que rejeita `INSERT` e `UPDATE` após o backfill.

A migration complementar `20260725123000_issue_272_audit_fixes` normaliza o estado de registros que já existiam somente em `StudentHealthIntake`: conteúdo real passa a `IN_PROGRESS`/`REVIEW`; registros vazios permanecem `NOT_STARTED`. Essa correção não cria consentimento, autoria, declaração ou conclusão.

## Estratégia de migração

As migrations são convergentes e usam as seguintes regras:

1. criam metadados de versão, consentimento, conclusão e rastreabilidade;
2. inserem um registro canônico somente quando o aluno ainda não possui `StudentHealthIntake`;
3. quando as duas fontes existem, o valor canônico vence e o legado apenas preenche campos canônicos vazios;
4. divergências não são sobrescritas: nomes de campos conflitantes ficam em `migrationReviewData`, com `migrationReviewRequired = true`;
5. `parqResponses` e `formResponses` são explicitamente excluídos do backfill;
6. registros canônicos preexistentes com conteúdo são marcados `IN_PROGRESS`, sem inferir consentimento ou conclusão;
7. sincronizam `StudentOnboardingProcess.healthIntakeId`, status e timestamps;
8. removem os gatilhos financeiros de `StudentContract` que ainda espelhavam `currentService` em `AlunoIntakeForm`;
9. bloqueiam regressões de dual-write com o trigger `AlunoIntakeForm_read_only_after_issue_272`;
10. writers genéricos rejeitam alterações em Anamnese `COMPLETED`; uma revisão futura precisa de fluxo explícito e auditável.

## Concorrência e conclusão

Toda gravação pública ou genérica da Anamnese deve ocorrer dentro de uma transação que bloqueie a linha correspondente de `StudentOnboardingProcess` com `FOR UPDATE` antes de ler `StudentHealthIntake`.

Esse lock compartilhado é a fronteira de serialização do módulo: uma conclusão pública e uma alteração administrativa para o mesmo aluno e contrato não podem avançar simultaneamente. Depois de adquirir o lock, o writer deve reler o registro canônico e rejeitar a operação quando `status = COMPLETED` ou `completedAt` estiver preenchido. A ausência da linha de onboarding deve falhar de forma fechada, sem criar ou alterar a Anamnese.

Não substituir esse protocolo por uma verificação anterior ao `upsert`, porque a leitura sem lock permite que outra transação conclua a Anamnese entre a verificação e a escrita.

## Verificação automatizada

O comando oficial para reproduzir os cenários discriminantes em PostgreSQL é:

```bash
bash scripts/verify-issue-272-health-intake-migration.sh
```

O script cria um banco efêmero e valida:

- aluno somente com `AlunoIntakeForm`;
- aluno somente com `StudentHealthIntake` preexistente;
- fontes equivalentes;
- fontes divergentes com precedência canônica e preenchimento apenas de lacunas;
- ausência de cópia de PAR-Q e `formResponses`;
- ausência de consentimento ou conclusão fabricados;
- sincronização do onboarding;
- bloqueio de escrita no legado;
- reaplicação convergente das duas migrations.

Os testes focados do writer também devem comprovar que o lock do onboarding ocorre antes da leitura e da escrita canônicas, que registros concluídos são rejeitados após o lock e que a ausência do onboarding impede qualquer mutação.

O workflow `.github/workflows/issue-272-regression.yml` executa esse script, testes focados e o fluxo real de API, PostgreSQL e navegador, gerando o artefato `issue-272-regression-<run_id>` vinculado ao head/base/merge preview do run.

## Verificação pós-deploy

Executar, no mínimo:

```sql
SELECT "migrationStatus", "migrationReviewRequired", "status", COUNT(*)
FROM "StudentHealthIntake"
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

SELECT "id", "alunoId", "legacyIntakeId", "migrationReviewData"
FROM "StudentHealthIntake"
WHERE "migrationReviewRequired" = TRUE
ORDER BY "updatedAt" DESC;

SELECT COUNT(*) AS canonical_content_marked_not_started
FROM "StudentHealthIntake"
WHERE "status" = 'NOT_STARTED'
  AND (
    "assessmentDate" IS NOT NULL OR
    COALESCE("clinicalHistoryData", '{}'::jsonb) <> '{}'::jsonb OR
    COALESCE("medicationData", '{}'::jsonb) <> '{}'::jsonb OR
    COALESCE("injuryData", '{}'::jsonb) <> '{}'::jsonb OR
    COALESCE("allergyData", '{}'::jsonb) <> '{}'::jsonb OR
    NULLIF(BTRIM("observations"), '') IS NOT NULL
  );

SELECT COUNT(*) AS onboarding_without_reference
FROM "StudentOnboardingProcess" onboarding
JOIN "StudentHealthIntake" intake ON intake."alunoId" = onboarding."alunoId"
WHERE onboarding."healthIntakeId" IS DISTINCT FROM intake."id"
   OR onboarding."healthModuleStatus" IS DISTINCT FROM intake."status";
```

`canonical_content_marked_not_started` e `onboarding_without_reference` devem retornar zero. Registros marcados para revisão devem ser comparados com a fonte histórica. Não remover o legado nem o trigger nesta issue.

## Rollback de aplicação

Uma versão anterior que ainda tente gravar `AlunoIntakeForm` falhará de forma explícita. O rollback seguro exige manter a aplicação nova ou aplicar uma correção compatível que escreva em `StudentHealthIntake`; não desabilitar o trigger silenciosamente, pois isso reintroduz dual-write.

O rollback da aplicação não exige excluir registros canônicos migrados. A proteção de registros concluídos deve continuar ativa em qualquer versão de correção: reabrir ou revisar uma Anamnese concluída somente pode ocorrer por fluxo dedicado que preserve ator, motivo, versão e histórico.
