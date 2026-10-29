# Issue #487 — execução resistida guiada

## Arquitetura canônica e dependências

Implementação empilhada sobre a PR #521 da issue #400, com destino final `develop` e sem merge automático. O único modelo persistido de agrupamentos é `WorkoutResistanceGroup` + `WorkoutResistanceGroupMember` (#400). A execução usa `WorkoutExerciseBlock`/`WorkoutExercisePlannedSet` (#399), sem escrever valores realizados no planejamento. Lifecycle, versão e pausa vêm da `WorkoutSessionExecution` (#389). A #488 implementará o cronômetro; a #487 apenas comunica os intervalos prescritos.

O próximo passo é reconstruído pelo backend usando exercícios, blocos, séries e membros com IDs estáveis. Para cada grupo, a ordem é rodada → posição do participante, usando `kind`, `position`, `rounds`, `restBetweenExercisesSec` e `restBetweenRoundsSec` persistidos. Quando `rounds` não está preenchido, somente uma quantidade idêntica de séries planejadas para todos os participantes permite derivá-lo; contagens incompatíveis permanecem somente leitura. `system` legado não autoriza a criação de grupo ou rodada sintética.

## Persistência, segurança e integridade

- `GET /api/v1/student/me/training-sessions/:sessionId/execution/guided` apresenta status, versão, próximo item e contexto de agrupamento.
- `POST /api/v1/student/me/training-sessions/:sessionId/execution/guided/complete` exige `operationKey`, `expectedVersion`, `plannedUnitId`, `plannedSetId`, `setNumber`, repetições e carga realizadas. Somente aluno autenticado do mesmo `contractId` e release pode concluir a próxima série.
- A migration `20261028220000_issue_487_guided_resistance_completion` registra `completedAt` e `completedByOperationId`. O FK e o índice único impedem reaproveitar a operação já utilizada. O trigger diferido exige evento e versão da própria operação após a transação serializável.
- Histórico confirmado é imutável; registro de valores não equivale a conclusão. Pausa, atualização concorrente, retry e operações com identidade divergente são rejeitados ou reconciliados pela #389.

## Recuperação e interface

O cartão apresenta uma série por vez, prescrito/realizado separados, série/rodada/posição, repetições, carga, esforço, cadência, orientação e mídia HTTPS quando disponível. `Ver ficha completa` mantém navegação recuperável. Após timeout do POST, a chave idempotente e valores digitados permanecem. Em resposta 409, um GET de revalidação é obrigatório; se também falhar, o botão de conclusão fica bloqueado e os valores digitados não são apagados. A sessão não é encerrada automaticamente na última série.

## Testes e verificação

Testes de domínio: séries e grupos persistidos #400, ordenação rodada/participante, intervalos, legado somente leitura, histórico fora de ordem, identidade estável e mídia opcional. PostgreSQL: persistência, cross-tenant, pausa, concorrência, retry, rollback, SQL direto sem ledger e tentativa de reutilizar uma operação válida para concluir outra série. Web: prescrito/realizado, retry de rede, conflito 409 com GET bem-sucedido/falho, bloqueio de escrita, retorno à ficha e acesso por teclado. A jornada Chrome de `apps/web/src/pages/issue-487-browser-evidence.test.js` verifica desktop 1440×900, tablet 768×1024 e mobile 390×844, incluindo navegação real com Tab; a homologação autenticada permanece separada da simulação.

Antes da auditoria independente: `pnpm validate`, migrations PostgreSQL, testes, lint, type-check, build, checks de arquitetura/acesso, navegador e revisão visual em múltiplos viewports devem estar terminais e associados ao SHA material final. Sem merge/release antes da aprovação independente.

## Remediação da auditoria de 29/10/2026

- **A-001 / CI:** o teste de integração PostgreSQL consulta o catálogo real para comprovar a ausência do agrupamento paralelo em `WorkoutExercise`, sem usar o inexistente campo `groupType` do tipo Prisma.
- **A-002 / dependência #400:** a execução guiada foi sincronizada por conteúdo com o HEAD imutável `e8fa4e29fcce26a1d8a41cf3353a7603911ffac6` da PR #521, preservando simultaneamente os testes e o contrato da #487. Mudanças posteriores na #521 exigem reconciliação e validação no SHA final.
- **RISK-001:** regressão de treino misto estruturado/legado comprova fallback `legacy_read_only`, sem inventar unidades de execução.
- **Gates obrigatórios:** PostgreSQL, testes, type-check, lint, build e `Validate repository` CRITICAL exact-SHA; não fazer merge sem revisão independente.
