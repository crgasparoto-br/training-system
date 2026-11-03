# Plano de execução: issue #489 — executor guiado de etapas cíclicas

## Objetivo
Permitir que o aluno execute o aeróbio liberado etapa por etapa, com relógio reconstruível, ordem/rodada persistida e registro do realizado separado do planejado.

## Contexto e dependências
- A #398 fornece exclusivamente `WorkoutDay -> WorkoutCyclicStage` (inclusive children e IDs) para a prescrição histórica.
- A #389 fornece exclusivamente `WorkoutSessionExecution`, versão, pausa/retomada, eventos, autorização aluno/contrato e idempotência.
- A #401 consome `sessionValues.cyclicStages` por `(plannedStageId, iteration)` para comparações.
- Referência do produto: `docs/product/student-centered-training-experience.md`; fluxo resistido #487/#488 permanece independente.

## Fora de escopo
Nova árvore de prescrição, relógio durável duplicado, inferência de etapas legadas de campos agregados, mutação de planejamento liberado, merges automáticos.

## Arquivos e módulos
- Contratos: `packages/types/training-routine.ts`.
- Sequência e relógio: `apps/api/src/modules/workout/guided-cyclic.domain.ts`.
- Leitura/escrita transacional: `apps/api/src/modules/workout/workout-session-execution.service.ts`.
- HTTP: `apps/api/src/routes/student.routes.ts`.
- Web: `GuidedCyclicCard.tsx`, `TrainingRoutinePanel.tsx`, `StudentTraining.tsx`, `training-routine.service.ts`.
- Regressões: testes de domínio, componente e integração PostgreSQL no suite de execução.

## Contrato e invariantes
1. A API `GET /api/v1/student/me/training-sessions/:sessionId/execution/guided-cyclic` devolve posição, anterior registrado, próximo, rodada, alvo, estado, `serverNow`, duração restante e versão canônica. Dados legados sem etapas retornam `legacy_read_only`, sem unidades fictícias.
2. `POST .../execution/guided-cyclic/step` aceita `start | complete` com `operationKey`, `expectedVersion`, `plannedStageId` e `iteration`; conclusão inclui `outcome` e opcionalmente `values`. Identidade enviada pelo navegador é revalidada contra a próxima ocorrência no plano na mesma transação.
3. Cada `repeat` é expandido em ordem work/recovery, com IDs planejados estáveis e iteração 1-based. A prescrição é somente leitura e não muda com o resultado executado. O cursor `sessionValues.guidedCyclic` é subestado da própria sessão #389.
4. A duração é calculada com `startedAt` de etapa e `pausedDurationMs/currentPauseStartedAt` da #389, nunca a partir de relógio civil do aparelho. UI avança visualmente com `performance.now()` a partir da amostra servidor; somente a API autoriza confirmação. Etapa por distância exige medição explícita no resultado total/parcial.
5. Toda mutação exige vínculo aluno/contrato e release consolidado; `FOR UPDATE` serializa a sessão e a transação `Serializable` engloba cursor, valores da #401, versão, operação e evento. Repetir chave e payload não duplica efeito; reutilizar a chave com dados distintos resulta 409.
6. A API recusa ações antes de iniciar, durante pausa, em sessão terminal, em etapa errada, após versão vencida ou quando os registros não formam prefixo ordenado. O frontend preserva entradas em falhas de rede, reconcilia 409 e não declara sucesso sem resposta confirmada.
7. A conclusão total da sessão é bloqueada **no backend** pela transição canônica #389, dentro da mesma transação serializável e após checar versão e idempotência, quando alguma etapa #398 permanece pendente ou inconsistente. A UI mantém o guard preventivo. Encerramento `partial` com motivo e legado sem estrutura continuam possíveis.
8. Em `partial`/`completed`/`not_performed` o relógio deixa de avançar no `finishedAt` persistido, inclusive se a sessão foi encerrada durante pausa; leituras futuras são historicamente idênticas. Pausa explícita não é contabilizada como execução.

## Capacidade e fallback
- O limite de execução `cyclicStages` é derivado da prescrição #398: 40 etapas principais, até 100 rodadas com até 20 filhos cada (no máximo **80.000 ocorrências**). O guard da sequência mantém 80.000 ocorrências folha; o merge persistido, a normalização e o Zod aceitam até 80.040 registros executados (40 agregados opcionais adicionais dos pais `repeat`), sem inventar etapas. Uma sequência válida de 600 ocorrências e seu agregado não são truncados nem classificados falsamente como `invalid_plan`. Todas as gravações guiadas continuam incrementais e versionadas. Em planos extremos, custos de armazenamento/leitura do histórico JSONB devem ser monitorados operacionalmente, sem restringir silenciosamente as sessões liberadas.
- Se uma execução histórica tiver valores sem cursor compatível, a projeção retorna `reconciliation_required` e bloqueia avanço; não corrige, atribui ou elimina histórico automaticamente.
- Agregados opcionais do pai `repeat` registrados pela #401 são vinculados ao ID histórico do pai (iteração 1), permanecem no histórico para comparação, mas não são contados como etapas temporais. A projeção guiada e a conclusão canônica compartilham validação do mesmo conjunto de folhas e pais, recusando agregados duplicados, de outra sessão ou com iteração inválida (A-489-005).

## Checklist de implementação
- [x] Contratos e domínio de expansão de etapas e relógio.
- [x] Integração transacional no lifecycle canônico, com isolamento e idempotência.
- [x] UI responsiva, metas e registros realizados.
- [x] Testes focados e integração PostgreSQL preparados.
- [x] Documentação técnica de API/Web atualizada.
- [x] A-489-005: projeção guiada e conclusão #389 reconciliam agregado de pai `repeat` com execução #401; testes de domínio e integração PostgreSQL cobrem sucesso, concorrência/retry e rejeições adversariais.
- [ ] `pnpm validate` verde no HEAD material final (confirmar no workflow do GitHub Actions).
- [ ] Confirmar as capturas Chrome da #489 no artefato da CI exact-SHA (desktop 1440x900 e mobile 390x844, teclado, foco, pausa, rodada, alvos, contraste, escopo autenticado).
- [ ] Nova auditoria independente exact-SHA após a remediação.

## Validação manual
1. Liberar aquecimento de 5 min, duas rodadas (trabalho 60 s + recuperação 30 s) e desaquecimento de 800 m, com metas FC/pace.
2. Iniciar a sessão, executar etapa e observar alvo, tempo e progresso; trocar de aba/dispositivo, voltar e confirmar a mesma etapa e rodada sem reiniciar relógio.
3. Pausar por alguns segundos; a contagem deve congelar e só retomar após comando canônico #389.
4. Registrar parcial, substituído (com descrição), não realizado e medição numérica zero; comparar com o planejado no histórico (#401).
5. Tentar conclusão antecipada com e sem motivo, retry após timeout, dois clientes concorrentes, acesso de outro contrato, etapa/iteração forjada e ausência de stages legadas.
6. Conferir navegação, foco, alertas, labels, botões tocáveis e layout mobile e desktop.

## Decisões e pendências
- Sem migration: `sessionValues` JSONB existente da execução #389 carrega o cursor e os resultados vinculados às unidades históricas; o novo máximo mantém o mesmo schema.
- Capturas da #489 são produzidas por `issue-489-browser-evidence.test.js` e validadas por `scripts/verify-issue-489-browser-evidence.mjs`; CI arquiva arquivos e hashes com o SHA exact-HEAD. O teste visual usa uma API HTTP isolada para estados e ações de UI; os testes PostgreSQL verificam o boundary real no backend.
- Sem merge ou exclusão de arquivos; toda evidência de CI e revisão visual depende do SHA definitivo.
