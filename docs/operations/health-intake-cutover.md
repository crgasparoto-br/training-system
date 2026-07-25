# Cutover da Anamnese Inicial canônica

## Fonte de verdade

A partir da migration `20260725010000_issue_272_canonical_health_intake`, novas escritas de Anamnese usam exclusivamente `StudentHealthIntake`. A tabela `AlunoIntakeForm` é histórica e recebe um trigger que rejeita `INSERT` e `UPDATE` após o backfill.

## Estratégia de migração

A migration é convergente e usa as seguintes regras:

1. cria metadados de versão, consentimento, conclusão e rastreabilidade;
2. insere um registro canônico somente quando o aluno ainda não possui `StudentHealthIntake`;
3. quando as duas fontes existem, o valor canônico vence e o legado apenas preenche campos canônicos vazios;
4. divergências não são sobrescritas: nomes de campos conflitantes ficam em `migrationReviewData`, com `migrationReviewRequired = true`;
5. `parqResponses` e `formResponses` são explicitamente excluídos do backfill;
6. sincroniza `StudentOnboardingProcess.healthIntakeId`, status e timestamps;
7. remove os gatilhos financeiros de `StudentContract` que ainda espelhavam `currentService` em `AlunoIntakeForm`;
8. bloqueia regressões de dual-write com o trigger `AlunoIntakeForm_read_only_after_issue_272`.

## Verificação pós-deploy

Executar, no mínimo:

```sql
SELECT "migrationStatus", "migrationReviewRequired", COUNT(*)
FROM "StudentHealthIntake"
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT "id", "alunoId", "legacyIntakeId", "migrationReviewData"
FROM "StudentHealthIntake"
WHERE "migrationReviewRequired" = TRUE
ORDER BY "updatedAt" DESC;

SELECT COUNT(*) AS onboarding_without_reference
FROM "StudentOnboardingProcess" onboarding
JOIN "StudentHealthIntake" intake ON intake."alunoId" = onboarding."alunoId"
WHERE onboarding."healthIntakeId" IS DISTINCT FROM intake."id";
```

Registros marcados para revisão devem ser comparados com a fonte histórica. Não remover o legado nem o trigger nesta issue.

## Rollback de aplicação

Uma versão anterior que ainda tente gravar `AlunoIntakeForm` falhará de forma explícita. O rollback seguro exige manter a aplicação nova ou aplicar uma correção compatível que escreva em `StudentHealthIntake`; não desabilitar o trigger silenciosamente, pois isso reintroduz dual-write.
