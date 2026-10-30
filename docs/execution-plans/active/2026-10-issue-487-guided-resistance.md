# Issue #487 — execução resistida guiada

## Arquitetura canônica e dependências

A candidata vigente da issue #487 é a [PR #527](https://github.com/crgasparoto-br/training-system/pull/527), branch `fix/487-canonical-set-lifecycle-develop-20261030`, aberta contra `develop` após a integração da PR #521 (#400) e da PR #525 (consulta histórica por período). As PRs #520, #522 e #524 foram substituídas sem merge, preservando suas branches e históricos. Nenhum merge automático é permitido. O único modelo persistido de agrupamentos é `WorkoutResistanceGroup` + `WorkoutResistanceGroupMember` (#400). A execução usa `WorkoutExerciseBlock`/`WorkoutExercisePlannedSet` (#399), sem escrever valores realizados no planejamento. Lifecycle, versão e pausa vêm da `WorkoutSessionExecution` (#389). A #488 implementará o cronômetro; a #487 apenas comunica os intervalos prescritos.

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

## Fechamento da auditoria de evidência visual (A-487-05)

O job CRITICAL executa a jornada Chrome da #487 e exige a publicação, no artifact
`validate-pr-critical-<HEAD>`, das seis capturas reais de
`artifacts/issue-487/` (antes/depois para desktop 1440×900, tablet 768×1024
e mobile 390×844). O passo `Verify issue-487 exact-head browser captures`
confere o `BROWSER_EVIDENCE_487` bruto de `artifacts/ci/full-tests.log`,
o SHA exato do candidato, os três viewports, os controles declarados e o
SHA-256 dos bytes de cada PNG. Imagem ausente, adulterada, de outro HEAD ou
log sem evidência estruturada reprovam o job antes do upload. Casos positivos
e negativos estão em `scripts/verify-issue-487-browser-evidence.test.mjs`.
Os arquivos ficam no artefato CI e não são adicionados ao Git.

A sincronização com a dependência #400 incorpora o catálogo imutável de
liberação (`WorkoutReleasedExerciseSnapshot`), adicionado no HEAD
`a43aafc85f55e26f3c755b47c2974a30f9ba3104` da PR #521. O modo guiado usa a mesma projeção de catálogo
congelada das leituras de treino; mudanças posteriores em `ExerciseLibrary`
não podem alterar nome, vídeo ou orientação de uma sessão já liberada.

A PR #521 foi integrada à `develop` em 29/10/2026 por merge `c76276637e8136bc247c0aef53103764caa75827`.
A PR #522 foi encerrada como substituída pela PR #524, também encerrada sem merge. A [PR #527](https://github.com/crgasparoto-br/training-system/pull/527) é a candidata atual: parte da `develop` após a PR #525 e preserva tanto as correções da execução guiada quanto as consultas por período da #400. A CI e a auditoria independente devem usar o HEAD material vigente da PR #527, sem reutilizar checks nem merge previews das PRs históricas.

## Remediação de concorrência após auditoria independente — 29/10/2026

- **A-001 (GET fora de ordem/409):** cada leitura do guia recebe geração de requisição; respostas de gerações anteriores não podem alterar a projeção, os valores digitados, a mensagem de erro nem o bloqueio de reconciliação. POST confirmado e conflito 409 invalidam explicitamente leituras já iniciadas.
- **Projeção monotônica:** não aceitar GET com `version` menor que a versão já exibida ou a versão canônica informada pela tela; após 409, GET com a mesma versão da operação rejeitada também não libera a confirmação. Identidade `sessionId` divergente não é exibida.
- **Recuperação:** se a revalidação falhar, o formulário mantém os dados digitados e a confirmação permanece desabilitada; somente uma nova consulta válida desfaz o bloqueio. O cartão é remontado ao trocar `sessionId`, evitando que estado de outro treino seja reutilizado.
- **Controles negativos:** testes React com promessas controladas simulam GET anterior ao 409 resolvendo após GET falho, dois GETs retornando em ordem invertida, POST confirmado antes de GET antigo, resposta de mesma versão após 409 e identidade de sessão divergente. O teste de 409 + GET falho existente continua obrigatório.
- **A-002 (dependência #400):** a PR #521 já foi integrada à `develop`. A PR #524 (histórica, substituída sem merge) preservou sua árvore canônica por comparação de conteúdo; a candidata #527 mantém esse contrato sem modelagem paralela de grupos. Novos deltas na `develop` exigem reconciliação sem apagar adaptações da #487. Não integrar nem encerrar a issue até CI exact-SHA e nova auditoria independente.

## Remediação A-487-06 e R-487-01 — 29/10/2026

- **A-487-06 (descanso terminal):** `restBetweenRoundsSec` é exibido somente após o último participante de uma rodada que ainda tenha sucessora. A última rodada pode apresentar descanso individual explicitamente prescrito, mas o cartão não anuncia descanso depois da última série efetivamente confirmada da sessão. Testes de domínio distinguem bi-set, tri-set e circuito, descanso intermediário, última rodada e prescrição individual opcional.
- **R-487-01 (rascunho recuperável):** `TodaySession` guarda a referência do rascunho por sessão e `plannedSetId`; o cartão grava repetições/carga a cada edição e retém a operação (chave + payload) após timeout. Ao abrir a ficha e voltar, a mesma série restaura esses valores e a mesma chave quando a versão ainda corresponde; outra série/sessão recebe somente os próprios valores planejados.
- **Concorrência:** o bloqueio de 409 acompanha o rascunho ao voltar da ficha. GET com mesma versão permanece recusado; GET com versão nova libera a confirmação após reconciliação e preserva o texto digitado para a unidade que não mudou. Não há persistência do rascunho em storage compartilhado do navegador.
- **Provas adicionadas:** regressões React de timeout + ficha + mesma chave, isolamento entre sessões, bloqueio de conflito ao voltar e ausência de descanso após a série final. Browser Chrome de #487 executa timeout simulado, retorno ao mesmo item, retry sem operação duplicada e finalização sem descanso fictício; o validador exige as tags das novas verificações, com controle negativo correspondente.
- **Integração:** código de #400 está presente na `develop` por merge da PR #521. A PR **#527 é a única candidata vigente aberta** para #487; manter sem merge até os checks `Validate repository` exact-HEAD e a auditoria independente sobre o SHA definitivo. As PRs #522 e #524 foram encerradas como substituídas e seus históricos permanecem preservados.

## Remediação da auditoria A-487-07 e RISK-487-02 (29/10/2026)

- **A-487-07:** uma resposta POST obsoleta pode chegar depois de a `TrainingRoutinePanel` conhecer versão mais recente. `GuidedResistanceCard` usa um piso monotônico com a versão mais alta do pai e das leituras aceitas, inclusive dentro do callback assíncrono criado antes do rerender. Rejeita a projeção tardia, invalida GET anterior e revalida automaticamente antes de permitir nova confirmação. Falha de GET mantém rascunho e bloqueio, sem exibir sucesso falso.
- **Controles A-487-07:** testes React simulam POST v2 tardio, prop v3, GET v3 em voo, reconciliação positiva e falha com recuperação manual; o Chrome reproduz a mesma condição por atualização do painel por foco real e respostas HTTP adiadas. O verificador de evidência exige a marca `stale-post-parent-version-reconciled` com um controle negativo.
- **RISK-487-02:** migration PostgreSQL aditiva impede alteração de `WorkoutSessionExecutionOperation` referenciada por série concluída, mesmo antes do encerramento da sessão. Mantém somente a ligação inicial de evento canônico no commit; teste de SQL direto rejeita fingerprint, versão, evento e DELETE após a conclusão, e exige que replay canônico continue intacto.
- **Validação obrigatória:** publicar material na PR #527 sem reescrever histórico, obter `Validate repository` + CRITICAL + PostgreSQL + browser no **novo SHA** e preparar auditoria independente; checks da PR #524 e o run do SHA `7fabcff` permanecem históricos e não certificam a candidata atual.


## Homologação automatizada com API real (R-487-01)

O teste `apps/web/src/pages/issue-487-real-api-browser-evidence.test.js`
complementa o harness Chrome mockado sem substituí-lo. A CI CRITICAL o executa
explicitamente após as migrations PostgreSQL e os builds de tipos/utilitários,
com token JWT sintético de aluno ativo e a API HTTP real. O aluno inicia o treino
no desktop, confirma uma série com carga/repetições diferentes das prescritas,
faz replay idempotente e testa isolamento de contrato; em seguida alterna para
a ficha, recarrega, pausa, tenta uma gravação bloqueada e retoma no celular até
concluir a sessão. As asserções leem novamente `WorkoutSessionExecution`,
`WorkoutSessionExecutionItem`, `WorkoutSessionExecutionOperation` e a série
prescrita no PostgreSQL. O teste exige ausência de overflow e erros JS nos
dois tamanhos de tela e publica `artifacts/issue-487/real-api-browser.json`
com três PNGs e hashes SHA-256 ligados ao `VERIFICATION_HEAD_SHA`.

O arquivo de teste é pulado nos testes web sem banco configurado e executado
obrigatoriamente pela etapa `Issue #487 authenticated real API student browser
evidence` da CI CRITICAL. Nenhum resultado verde é presumido: o novo HEAD
material exige execução terminal da CI e auditoria independente posterior.

Na etapa de encerramento real, a automação exige que o `TrainingRoutinePanel`
tenha consumido uma projeção autenticada da mesma versão canônica em que todas
as séries estão concluídas antes do clique em `Concluir treino`; assim, o
teste não dispara artificialmente uma transição com versão obsoleta enquanto a
própria revalidação da UI ainda está em curso. Se o encerramento não aparecer,
a falha registra texto da tela e status/versão persistidos para diagnóstico,
sem transformar conflito em sucesso automático.


## Remediação dos achados A-487-API-001 e A-487-DB-002 — 30/10/2026

A validação do salvamento comum e da conclusão guiada agora compara plannedSetId com o ordinal persistido, não com a posição visual da interface. Em exercícios com múltiplos blocos, o índice deriva da ordem bloco/série da #399. SetNumber legado 0 com plannedSetId é normalizado, e omissão de ambos depende de uma única série anterior. Rascunhos pré-existentes desordenados só são reposicionados se não foram concluídos e não existir colisão. Se houver conflito, a operação falha sem alterar dados ou versão; não são apagadas séries nem cargas.

A migration aditiva 20261030120000_issue_487_set_event_integrity vincula a operação ao evento de StudentLifecycleEvent por FK, impõe metadata de execução, aluno/contrato, action, operationId, eventKey e versões no trigger diferido, e impede adulteração posterior do evento ligado a conclusão. Dados órfãos anteriores bloqueiam a implantação da constraint até reconciliação documentada, sem evento sintético. Os testes PostgreSQL adversariais devem provar rejeição de ordinal errado, evento inexistente, evento de outro contrato e metadata falsa, além de conclusão real e replay idempotente.

A PR #527 de remediação utiliza `develop` atualizado sem merge de PR em branch protegida; seu HEAD material final exige CI CRITICAL exact-SHA e auditoria independente separada. A homologação operacional física permanece na issue #526 após deploy.

## Ressalva de UX R-001 — conclusão com séries pendentes (30/10/2026)

O botão **Concluir treino** agora realiza preflight na projeção canônica `GET /execution/guided`. Se houver séries estruturadas não confirmadas, o aluno vê a quantidade restante, pode voltar ao guia ou informar motivo e encerrar como `partial` pelo lifecycle #389. A ação `completed` só é enviada quando a projeção estruturada indica todas as séries concluídas; sessão, status e versão divergentes não autorizam essa transição. GET indisponível ou progresso inconsistente mantém o treino aberto, sem resultado fictício. Treino legado `legacy_read_only` conserva o encerramento antigo, sem deduzir séries inexistentes.

Regressões: `TrainingRoutinePanel.test.tsx` verifica bloqueio, fluxo parcial com motivo e foco no campo, retorno ao guia, conclusão íntegra, leitura falha, versão/cross-session divergente e fallback legado. O cenário autenticado `issue-487-real-api-browser-evidence.test.js` verifica que a tentativa de concluir antes da última série não altera status ou versão persistidos no PostgreSQL, e que a conclusão válida ao final continua funcionando. Após a publicação da mudança, CI `CRITICAL`/`Validate repository` e auditoria independente devem ser feitas no novo HEAD da PR #527; checks anteriores não certificam este delta.
