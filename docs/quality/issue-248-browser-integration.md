# Issues 248 e 249 — verificações integradas de Adipometria

## Objetivo

Fechar os controles que exigem prova do fluxo de Adipometria em navegador real, usando a aplicação web compilada, a API Express real e PostgreSQL real. Os verificadores não substituem a API por fixtures HTTP e não interceptam chamadas `/api/v1`.

O runner `apps/api/scripts/verify-issue-248-adipometry-browser-runner.ts` executa sequencialmente dois cenários isolados no banco descartável de teste:

1. fluxo guiado da issue #248;
2. integração da Central do Aluno da issue #249.

Entre os cenários, o runner remove resíduos da fixture, reinstala apenas o suporte de upsert necessário aos dados de teste e mantém o mesmo contrato de segurança de limpeza.

## Fluxo guiado da issue #248

O script `apps/api/scripts/verify-issue-248-adipometry-browser.ts` cobre:

1. autenticação de um ator profissional sem perfil `Professor`, com responsável clínico elegível separado;
2. aprovação contratual do protocolo Guedes por meio do serviço de governança ADPT;
3. criação do rascunho pela rota guiada iniciada pela Central do Aluno;
4. preenchimento de peso e cinco dobras, cálculo autoritativo e conclusão pela interface;
5. repetição da conclusão com o mesmo fingerprint, comprovando `alreadyFinalized=true` e ausência de novo efeito;
6. criação, edição, cálculo e conclusão de revisão corretiva, preservando snapshots e campos alterados;
7. criação e cancelamento de nova correção, mantendo a revisão finalizada anterior como vigente.

## Central do Aluno da issue #249

O script `apps/api/scripts/verify-issue-249-adipometry-central-browser.ts` prepara dados persistidos deliberadamente distintos e cobre:

1. autenticação de professor com acesso à aba, visão, gestão e correção ADPT;
2. primeira avaliação concluída e posteriormente substituída por revisão corretiva;
3. segunda avaliação concluída, usada para comparação real;
4. terceiro registro mantido como rascunho operacional;
5. abertura da Central real e navegação para a aba `Avaliação Física`;
6. coexistência das ações estruturadas de Antropometria e Adipometria;
7. resumo da revisão vigente, sem duplicar a original substituída;
8. comparação pela API real e presença da tabela acessível;
9. requisição direta a aluno de outro contrato, exigindo `404` e `ADIPOMETRY_RESOURCE_NOT_FOUND`;
10. finalização do rascunho enquanto a Central permanece aberta e atualização direcionada após foco;
11. preservação do mesmo aluno e ausência de overflow horizontal em `390px`;
12. ausência de erros de página e console.

## Evidências

A execução grava em `artifacts/issue-275`.

Fluxo guiado:

- `adipometry-browser-integration.json`;
- `adipometry-browser-finalized.png`;
- `adipometry-browser-correction-finalized.png`;
- `adipometry-browser-correction-cancelled.png`.

Central do Aluno:

- `adipometry-central-browser-integration.json`;
- `adipometry-central-real-comparison.png`;
- `adipometry-central-real-mobile.png`.

Os relatórios registram SHA, base, merge preview, protocolo, revisões, efeitos persistentes, cenário cross-tenant, atualização após retorno, viewports e erros de navegador.

## Controles negativos de permissão

Além da execução integrada, os testes web devem comprovar a matriz de capacidade por revisão:

- gestão libera nova avaliação e R1, mas não R2+;
- correção libera R2+, mas não nova avaliação ou R1;
- ausência de ambas remove todas as pendências operacionais;
- backend e frontend usam a mesma decisão observável.

O helper compartilhado fica em `apps/web/src/access/adipometry-mutation-access.ts`, e o backend continua aplicando `adipometryDraftMutationAccessMiddleware` como barreira final.

## Controle do plano de consulta de token

O wrapper `verify-issue-275-performance-rollout.ts` mantém o verificador canônico anterior em arquivo legado e prepara cardinalidade representativa antes do `EXPLAIN`. São inseridos convites revogados sintéticos com hashes únicos e executado `ANALYZE "PreRegistrationInvite"`.

Esse controle não desabilita `seqscan`, não força índice e não altera o schema. Ele evita que uma tabela com uma única linha torne o teste dependente da preferência legítima do planner por varredura sequencial, preservando a exigência de que o lookup seletivo utilize o índice em volume representativo.

## Execução

Execução direta dos dois cenários ADPT:

```bash
pnpm --filter @corrida/api exec tsx scripts/verify-issue-248-adipometry-browser-runner.ts
```

A verificação também é chamada sequencialmente pelo verificador de privacidade e acessibilidade usado no gate da Issue 275:

```bash
pnpm --filter @corrida/api exec tsx scripts/verify-issue-275-browser-privacy.ts
```

Qualquer falha em preparação, navegador, API, persistência, privacidade, limpeza ou geração de evidência encerra o comando com status diferente de zero.
