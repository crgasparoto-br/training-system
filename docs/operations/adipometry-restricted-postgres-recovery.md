# Recuperação de migration ADPT em PostgreSQL com privilégios restritos

Este runbook cobre a falha de produção em que a migration `20260730170000_remediate_issue_246_audit_round_2` para na primeira mutação de ACL com PostgreSQL `42501` e a mensagem `restricted superuser cannot grant or revoke privileges`.

## Causa

Alguns provedores gerenciados permitem que a conta de migration crie ou substitua funções, mas bloqueiam `GRANT` e `REVOKE`. A remediation histórica contém dois `REVOKE`s dos overloads legados de `createAdipometryDraft`, e a migration seguinte `20260730180000_restrict_legacy_adipometry_draft_overloads` é composta somente por quatro mutações de ACL equivalentes.

Os arquivos históricos não são alterados, preservando os checksums registrados pelo Prisma.

## Estratégia de recuperação

O comando abaixo continua sendo o único caminho automatizado permitido para essa falha específica:

```bash
pnpm --filter @corrida/api db:recover:issue-246-migration
```

O recuperador valida o checksum e a estrutura das migrations conhecidas. Para a remediation, ele aceita omitir somente os dois `REVOKE`s legados identificados; as demais instruções são executadas em uma única transação. A migration exclusivamente de ACL é registrada como tratada somente quando continua contendo exatamente os quatro `REVOKE`s conhecidos.

Depois, `prisma migrate deploy` continua a cadeia normalmente. A migration terminal `20260811141500_disable_legacy_adipometry_draft_overloads` substitui as duas assinaturas históricas sem ator por funções fail-closed. Elas permanecem resolvíveis por assinatura para compatibilidade, mas qualquer chamada termina imediatamente com `ADIPOMETRY_ACTOR_REQUIRED` (`42501`) antes de `INSERT`, `UPDATE`, `DELETE` ou `MERGE`.

Assim, a segurança do caminho sem ator não depende de o provedor permitir alteração de ACL. Os overloads com ator explícito permanecem inalterados e são o caminho de runtime da API.

## Guardas do recuperador

A recuperação é recusada quando qualquer uma destas condições não for satisfeita:

- não existe tentativa falha ativa da remediation ou da migration ACL-only conhecida;
- o checksum da tentativa falha diverge do arquivo versionado;
- a remediation não está delimitada por `BEGIN`/`COMMIT` ou não contém exatamente os dois `REVOKE`s esperados;
- a migration ACL-only não contém exatamente os quatro `REVOKE`s esperados;
- a migration terminal não contém exatamente dois guards fail-closed das assinaturas sem ator;
- um guard terminal contém operação de persistência;
- a remediation falha deixou funções novas no banco, indicando efeito parcial inesperado.

Não edite `_prisma_migrations` manualmente e não use `prisma db push` para contornar essa recuperação.

## Evidência de produção que motivou a correção

O diagnóstico manual `Diagnose Production Adipometry Migration` identificou a primeira falha na instrução:

```sql
REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(
  TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE
) FROM PUBLIC;
```

O PostgreSQL retornou código `42501` com `restricted superuser cannot grant or revoke privileges`.
