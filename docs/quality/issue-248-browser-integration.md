# Issue 248 — verificação integrada do fluxo ADPT

## Objetivo

Fechar os controles de auditoria que exigem prova do fluxo de Adipometria em navegador real, usando a aplicação web compilada, a API Express real e PostgreSQL real. O verificador não substitui a API por fixtures e não intercepta as chamadas `/api/v1`.

## Cenários obrigatórios

O script `apps/api/scripts/verify-issue-248-adipometry-browser.ts` executa, no mesmo banco de teste:

1. autenticação de um ator profissional sem perfil `Professor`, com responsável clínico elegível separado;
2. aprovação contratual do protocolo Guedes por meio do serviço de governança ADPT;
3. criação do rascunho pela rota guiada iniciada pela Central do Aluno;
4. preenchimento de peso e cinco dobras, cálculo autoritativo e conclusão pela interface;
5. repetição da conclusão pelo navegador com o mesmo fingerprint, comprovando `alreadyFinalized=true` e ausência de nova avaliação, evento ou alteração de `completedAt`;
6. criação, edição, cálculo e conclusão de uma revisão corretiva, preservando `beforeSnapshot`, `afterSnapshot` e `changedFields`;
7. criação e cancelamento de uma nova correção, mantendo a revisão finalizada anterior como vigente.

## Evidências

A execução grava em `artifacts/issue-275`:

- `adipometry-browser-integration.json`;
- `adipometry-browser-finalized.png`;
- `adipometry-browser-correction-finalized.png`;
- `adipometry-browser-correction-cancelled.png`.

O relatório registra SHA, base, merge preview, protocolo, revisões, resultado da repetição idempotente, efeitos persistentes antes/depois e erros de navegador.

## Controle do plano de consulta de token

O wrapper `verify-issue-275-performance-rollout.ts` mantém o verificador canônico anterior em arquivo legado e prepara cardinalidade representativa antes do `EXPLAIN`. São inseridos convites revogados sintéticos com hashes únicos e executado `ANALYZE "PreRegistrationInvite"`.

Esse controle não desabilita `seqscan`, não força índice e não altera o schema. Ele evita que uma tabela com uma única linha torne o teste dependente da preferência legítima do planner por varredura sequencial, preservando a exigência de que o lookup seletivo utilize o índice em volume representativo.

## Execução

A verificação integrada é chamada sequencialmente pelo verificador de privacidade e acessibilidade já usado no gate da Issue 275:

```bash
pnpm --filter @corrida/api exec tsx scripts/verify-issue-275-browser-privacy.ts
```

A primeira etapa preserva integralmente o verificador de pré-matrícula. A segunda executa o ciclo ADPT real. Qualquer falha encerra o comando com status diferente de zero.
