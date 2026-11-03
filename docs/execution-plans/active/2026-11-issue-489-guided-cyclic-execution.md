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
7. A conclusão total da sessão na UI consulta o progresso canônico: etapas pendentes bloqueiam `Concluir treino`, permitindo continuar ou encerrar como parcial com motivo; legado não inventa pendências.

## Capacidade e fallback
- O contrato de execução #389 atualmente limita `cyclicStages` a 500 ocorrências. Planos válidos da #398 que excedam isso são sinalizados como `invalid_plan` para não executar uma sequência truncada. Essa limitação explícita requer decisão de ampliação para uma futura estrutura operacional em lote, sem inventar progresso.
- Se uma execução histórica tiver valores sem cursor compatível, a projeção retorna `reconciliation_required` e bloqueia avanço; não corrige, atribui ou elimina histórico automaticamente.

## Checklist de implementação
- [x] Contratos e domínio de expansão de etapas e relógio.
- [x] Integração transacional no lifecycle canônico, com isolamento e idempotência.
- [x] UI responsiva, metas e registros realizados.
- [x] Testes focados e integração PostgreSQL preparados.
- [x] Documentação técnica de API/Web atualizada.
- [ ] `pnpm validate` verde no HEAD material final.
- [ ] Auditoria independente exact-SHA com evidência funcional desktop/mobile.

## Validação manual
1. Liberar aquecimento de 5 min, duas rodadas (trabalho 60 s + recuperação 30 s) e desaquecimento de 800 m, com metas FC/pace.
2. Iniciar a sessão, executar etapa e observar alvo, tempo e progresso; trocar de aba/dispositivo, voltar e confirmar a mesma etapa e rodada sem reiniciar relógio.
3. Pausar por alguns segundos; a contagem deve congelar e só retomar após comando canônico #389.
4. Registrar parcial, substituído (com descrição), não realizado e medição numérica zero; comparar com o planejado no histórico (#401).
5. Tentar conclusão antecipada com e sem motivo, retry após timeout, dois clientes concorrentes, acesso de outro contrato, etapa/iteração forjada e ausência de stages legadas.
6. Conferir navegação, foco, alertas, labels, botões tocáveis e layout mobile e desktop.

## Decisões e pendências
- Sem migration: `sessionValues` existente da execução #389 carrega o cursor e os resultados vinculados às unidades históricas.
- Sem merge ou exclusão de arquivos; toda evidência de CI e revisão visual depende do SHA definitivo.
