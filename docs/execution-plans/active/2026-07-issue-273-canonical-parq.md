# Issue 273 — PAR-Q canônico e versionado

## Objetivo

Consolidar novas submissões concluídas do PAR-Q em `StudentParqSubmission`, com catálogo compartilhado e versionado, rascunho retomável, cálculo backend de alertas, migração idempotente do legado e integração segura com pré-matrícula e PRNT.

## Requisitos atômicos

- REQ-273-01: publicar catálogo compartilhado com versão, chave, ordem, texto, obrigatoriedade, regra positiva e status.
- REQ-273-02: adotar sete perguntas canônicas (`q1` a `q7`) e rejeitar `q8` em novas gravações.
- REQ-273-03: calcular `positiveItems`, `positiveCount` e estado exclusivamente no backend.
- REQ-273-04: persistir rascunho servidor-side, com versão otimista e sem aparecer no histórico clínico.
- REQ-273-05: concluir em transação, com consentimento, idempotência e pendência profissional rastreável.
- REQ-273-06: impedir leitura/escrita por token público, cross-tenant e mass assignment.
- REQ-273-07: migrar apenas legado semanticamente completo, preservando origem e idempotência.
- REQ-273-08: manter legado incompatível somente leitura e expor `NEEDS_REPEAT`.
- REQ-273-09: fazer onboarding, PRNT e administração consumirem o mesmo service canônico.
- REQ-273-10: manter PAR-Q opcional e sem liberação clínica automática.

## Impacto documental

Fontes consultadas: `AGENTS.md`, `docs/architecture/database.md`, documentação de lifecycle e pré-matrícula, issue #273.

Atualizações previstas:

- arquitetura e ownership do ciclo do aluno;
- contrato de produto do PAR-Q;
- runbook de cutover e reconciliação do legado;
- índice `docs/README.md`;
- este plano de execução.

## Estado do ciclo

Em correção. O catálogo compartilhado, a decisão `q1`–`q7`, a validação de versão/conjunto e o cálculo backend foram iniciados. Persistência, rotas, UI, migração, PRNT, pendência profissional e gates completos ainda precisam ser concluídos antes do handoff.
