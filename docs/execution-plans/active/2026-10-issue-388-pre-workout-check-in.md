# Plano de execução — Issue #388 — Check-in pré-treino

## Objetivo

Implementar o check-in pré-treino canônico para sessões liberadas, preservando isolamento por `contractId`, idempotência, imutabilidade após o primeiro início e separação entre orientação prática do aluno e contexto técnico do professor.

## Contexto e dependências

- Base: `develop` após a entrega da #387.
- Sessão operacional: `WorkoutDay`; `planned` é a representação persistida atual de `not_started`.
- A #389 continuará dona do lifecycle completo da sessão. A #388 apenas observa e bloqueia a mutação do check-in fora de `not_started`.
- Fonte de regras: `docs/product/student-centered-training-experience.md#check-in-pre-treino`.

## Implementação

- Persistir um `PreWorkoutCheckIn` canônico por `WorkoutDay`.
- Persistir operações idempotentes por `operationKey` e fingerprint do payload.
- Revalidar sessão liberada, aluno, contrato e estado dentro de transação serializável com lock da sessão.
- Registrar evento referencial em `StudentLifecycleEvent`, sem duplicar os dados sensíveis.
- Aplicar somente a triagem aprovada de dor/desconforto: 0–2 verde, 3–4 atenção e >4 alerta, sem bloqueio ou alteração automática do treino.
- Projetar o check-in na rotina compartilhada; aluno recebe linguagem prática e professor recebe regra/versionamento técnico.
- Expor escrita somente em `/student/me`; professor permanece somente leitura pela rotina da Central.
- Integrar formulário acessível e responsivo ao Treino de hoje, preservando dados locais em falhas recuperáveis.

## Critérios de verificação

- Um check-in por sessão e retry da mesma operação sem duplicação.
- Mesma `operationKey` com payload diferente retorna conflito.
- Sessão iniciada/concluída rejeita criação/edição.
- Sessão/aluno/contrato fora do escopo responde como inexistente.
- Nenhum campo do body pode redefinir aluno, contrato ou ator.
- Timeline contém apenas referência ao check-in/operação e regra, não os valores sensíveis.
- Falha na transação não deixa check-in/evento parcial.
- Web mantém valores após falha e funciona por teclado em viewport móvel e desktop.
- `pnpm validate` e CI da PR devem ficar verdes no SHA material congelado.

## Estado

Implementação em andamento na branch `feat/388-pre-workout-check-in`. Auditoria independente permanece obrigatória após CI verde.

## Remediação da auditoria de 2026-10-05

Referência: `audit-rejection:aeeb98b9-69e6-49e9-accf-3b18e6d495e4`, PR #495.

- **A-388-003:** regenerar o fechamento de requisitos a partir da fonte canônica e validar bytes, decodificação e hashes antes e depois da publicação. O arquivo corrompido anterior não serve como fonte de reconstrução.
- **A-388-004:** vincular controles a evidências por cenário. `pre-workout-check-in.persistence.integration.test.ts` executa o serviço Prisma e a migration reais em schema PostgreSQL isolado, com fixtures explícitas das relações anteriores ao check-in. Verifica valores persistidos, isolamento, reenvio, concorrência, imutabilidade, ausência de backfill e rollback após erro real de inserção na timeline.
- **A-388-005:** tratar o envelope `error`/`details.code`. Somente HTTP 409 com `PRE_WORKOUT_CHECK_IN_LOCKED` confirma o bloqueio; o formulário desabilita campos e remove a ação de envio, preservando o rascunho explicitamente não salvo. Conflitos de idempotência não inventam estado de sessão. Falhas recuperáveis preservam os valores e a chave da operação.

### Comandos e alcance das evidências

```bash
pnpm --filter @corrida/web exec vitest run src/services/pre-workout-check-in.service.test.ts src/components/training/PreWorkoutCheckInCard.test.tsx --no-file-parallelism
ISSUE_388_BROWSER_EVIDENCE=1 pnpm --filter @corrida/web exec vitest run src/components/training/issue-388-browser-evidence.test.js --no-file-parallelism
RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @corrida/api exec jest --runInBand tests/pre-workout-check-in.persistence.integration.test.ts
pnpm validate
```

O teste de banco exige URL local cujo nome de banco contenha `test`; cria e remove apenas seu schema temporário. O teste de navegador usa Chromium, componente/CSS/serviço web de produção e respostas HTTP controladas: comprova interação real, não substitui a evidência de persistência. Cobre desktop e mobile, teclado, sucesso completo/parcial, erro temporário e retry com a mesma chave, página desatualizada, conflitos distintos e somente leitura para aluno/professor.

`artifacts/issue-388/database.json`, `browser.json` e capturas PNG são gerados pelos testes. Os registros JSON por cenário também são emitidos nos logs do workflow `Validate PR`. O job `CRITICAL validation` publica os arquivos de `artifacts/issue-388/**` e `artifacts/ci/full-tests.log` junto ao manifesto de identidade no artefato `validate-pr-critical-<HEAD_SHA>`, inclusive quando os testes falham. O comando `pnpm test` permanece o mesmo; `set -euo pipefail` impede que a captura com `tee` oculte a falha. Os arquivos só podem ser declarados como anexos persistidos depois de conferir o ZIP publicado; sua presença, isoladamente, não representa aprovação dos cenários. Cada JSON registra `subjectSha` e observações dos cenários realmente alcançados. Uma execução interrompida ou vermelha não aprova cenários restantes. O certificado final deve referenciar somente evidências aprovadas do SHA material congelado; a declaração genérica de CI verde não fecha os controles.
