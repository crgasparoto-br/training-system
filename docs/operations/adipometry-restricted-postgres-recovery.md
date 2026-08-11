# Recuperação de migration ADPT em PostgreSQL com privilégios restritos

Este runbook cobre as falhas de produção da cadeia ADPT quando o PostgreSQL gerenciado recusa mutações de privilégio com `42501` e a mensagem `restricted superuser cannot grant or revoke privileges`.

## Causa

Alguns provedores gerenciados permitem que a conta de migration crie ou substitua funções, triggers e constraints, mas bloqueiam `GRANT` e `REVOKE`.

A cadeia histórica afetada possui três pontos conhecidos:

- `20260730170000_remediate_issue_246_audit_round_2`: dois `REVOKE`s dos overloads legados de `createAdipometryDraft`;
- `20260730180000_restrict_legacy_adipometry_draft_overloads`: quatro `REVOKE`s de ACL das mesmas assinaturas;
- `20260730190000_close_issue_246_persistence_bypasses`: um `REVOKE INSERT ON TABLE "AdipometryAuditEvent" FROM PUBLIC`.

Os arquivos históricos não são alterados, preservando os checksums registrados pelo Prisma.

## Estratégia de recuperação

O comando abaixo continua sendo o único caminho automatizado permitido para essas falhas conhecidas:

```bash
pnpm --filter @corrida/api db:recover:issue-246-migration
```

O recuperador valida checksum e estrutura das migrations antes de qualquer `migrate resolve`.

Para `170000`, ele omite somente os dois `REVOKE`s legados identificados e executa todas as demais instruções em uma única transação. A migration `180000`, que é exclusivamente de ACL, só pode ser registrada como tratada quando continua contendo exatamente os quatro `REVOKE`s conhecidos.

Para `190000`, o recuperador aceita omitir somente a instrução exata:

```sql
REVOKE INSERT ON TABLE "AdipometryAuditEvent" FROM PUBLIC;
```

Qualquer outro `GRANT` ou `REVOKE` presente nessa migration faz a recuperação abortar. As demais instruções são reaplicadas em uma única transação e a migration só então é registrada como aplicada.

A omissão desse `REVOKE` não vira autorização de escrita de auditoria. `recordAdipometryAuditEvent` usa `SECURITY DEFINER`, e `validateAdipometryAuditEvent` rejeita inserção cujo usuário efetivo não seja o proprietário da tabela com `ADIPOMETRY_AUDIT_INSERT_FORBIDDEN`. Os testes de persistência também concedem `INSERT` deliberadamente a um papel de aplicação e comprovam que uma auditoria forjada continua bloqueada.

Depois, `prisma migrate deploy` continua a cadeia. A migration terminal `20260811141500_disable_legacy_adipometry_draft_overloads` mantém as duas assinaturas históricas sem ator resolvíveis por compatibilidade, mas as transforma em funções fail-closed que terminam com `ADIPOMETRY_ACTOR_REQUIRED` (`42501`) antes de qualquer persistência.

## Guardas do recuperador

A recuperação é recusada quando qualquer uma destas condições não for satisfeita:

- não existe tentativa falha ativa de `170000`, `180000` ou `190000`;
- o checksum da tentativa falha diverge do arquivo versionado;
- a migration não está delimitada por `BEGIN`/`COMMIT` como esperado;
- `170000` não contém exatamente os dois `REVOKE`s legados conhecidos;
- `180000` não contém exatamente os quatro `REVOKE`s conhecidos;
- `190000` contém qualquer mutação de privilégio além do único `REVOKE INSERT` conhecido;
- `190000` falhou sem `170000` e `180000` já estarem resolvidas;
- uma migration transacional falha deixou funções novas no banco, indicando efeito parcial inesperado;
- a migration terminal não contém exatamente dois guards fail-closed das assinaturas sem ator;
- um guard terminal contém operação de persistência.

Não edite `_prisma_migrations` manualmente e não use `prisma db push` para contornar essa recuperação.

## Execução no workflow de produção

O workflow tenta `prisma migrate deploy` normalmente. Se falhar, executa o recuperador restrito.

Uma primeira recuperação pode resolver `170000/180000` e, ao retomar a cadeia, revelar a falha transacional seguinte em `190000`. Por isso o workflow permite uma segunda passagem do mesmo recuperador. Essa segunda passagem não é um retry genérico: o script volta a validar tentativa ativa, checksum, ordem das migrations, ausência de efeitos parciais e o conjunto exato de mutações de privilégio antes de agir.

O Render só deve receber o deploy depois que a etapa de migrations terminar com sucesso.

## Evidência de produção

O diagnóstico manual da primeira falha identificou:

```sql
REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(
  TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE
) FROM PUBLIC;
```

O PostgreSQL retornou `42501` com `restricted superuser cannot grant or revoke privileges`.

Na publicação seguinte, o recuperador concluiu `170000/180000`, retomou o `migrate deploy` e a migration `20260730190000_close_issue_246_persistence_bypasses` passou a ser a tentativa falha ativa. Essa migration possui como única mutação de privilégio o `REVOKE INSERT` da tabela de auditoria descrito acima.
