# Issue #401 — Comparar planejado versus executado por unidade

- Base: `develop`; branch de implementação: `feat/401-planned-executed-comparison`.
- Autoridades: WorkoutDay/WorkoutCyclicStage/WorkoutExerciseBlock/WorkoutExercisePlannedSet/WorkoutResistanceGroup (prescrição); WorkoutSessionExecution/Item (#389) (realizado).
- Dependências: #398, #399, #400 e #389 presentes na develop. Nenhuma nova árvore de montagem.
- Status: remediação dos achados A-401-01..04 implementada; checks exact-SHA e nova auditoria independente requeridos.

## Objetivo

Permitir que aluno e professor comparem cada etapa cíclica (inclusive iterações), exercício, bloco, série e agrupamento planejado com valores realmente registrados, sem alterar o histórico prescrito ou inferir melhora/piora.

## Contrato

- A primeira operação canônica da sessão captura `WorkoutSessionExecution.plannedSnapshot` para o `WorkoutDay.id` vinculado à liberação consolidada. Migração aditiva e trigger impedem sobrescrever o snapshot; registros anteriores usam fallback explicitamente rotulado `released_plan`.
- Unidades executadas continuam em `WorkoutSessionExecutionItem` com `plannedUnitId`, `plannedSetId`, `setNumber` e os atributos RIR/RPE/cadência/descanso e outcome opcional. Etapas cíclicas e agrupamentos são guardados em arrays versionados da `sessionValues` com IDs planejados validados contra o mesmo dia, sem tabelas de planejamento paralelas.
- Outcomes de escrita explícitos: `full`, `partial`, `substituted`, `not_performed`. A coluna de outcome não tem default: registros antigos ou sem classificação são `unclassified` na comparação, nunca `full` inferido. Unidade sem valor executado é `not_recorded`. Agregados com algumas séries sem registro são `incomplete_record`, preservando `containsSubstitution` quando também há substituição; um conjunto incompleto não é tratado como execução integral nem como parcial comprovada. Substituição exige observação. Nenhum campo ausente vira zero.
- A API autentica e restringe consultas de comparação por `alunoId` e `contractId` já existentes nas rotas aluno/professor da rotina. A consulta semanal permite expandir comparações de sessões concluídas anteriormente, usando o snapshot da execução em vez do template atual. Visões do professor mostram séries/valores técnicos; visão do aluno mostra resumo, estágios, exercícios e grupos.
- Diferença numérica é mostrada apenas na unidade física equivalente e sem alvo em faixa; dados com unidades incompatíveis ou ausentes não produzem diferença. Diferença nunca é classificação de desempenho.
- O cálculo é projeção read-only, sem média, adesão, progressão, sugestão de prescrição ou integração externa.

## Cenários de validação

- [x] Contrato tipado de leitura, persistência versionada e estruturas de sessão.
- [x] Captura imutável e comparação por IDs; guarda de escopo e referências.
- [x] Componente responsivo partilhado entre Treino de hoje e painel do professor.
- [x] Testes de domínio: igual, diferente, ausência/zero, faixa, substituição, repetição e histórico.
- [x] Testes PostgreSQL: snapshot congelado, gravação estruturada, referência estrangeira/duplicada e rollback.
- [x] Testes web: visibilidade aluno/professor, valor zero, ausência de conclusão automática.
- [x] Regressões A-401-01..04: ausência de classificação não vira `full`; substituições mistas e séries sem registro; recuperação histórica pela semana; identidade de múltiplas gravações de uma série no React.
- [ ] `pnpm validate`, build e testes PostgreSQL no HEAD remoto definitivo.
- [ ] Auditoria independente da PR com evidências de CI e revisão de segurança.

## Validação manual

1. Abrir treino liberado, iniciar sessão, registrar execução parcial de etapa/série/grupo e recarregar.
2. Confirmar que valores do plano e executados aparecem lado a lado, inclusive quando registrado 0, sem cópia silenciosa de valores.
3. No professor verificar séries, faixas, resultados e diferença numérica neutra; no aluno confirmar textos de orientação sem detalhes técnicos.
4. Navegar à semana anterior, expandir a comparação de uma sessão passada e verificar os perfis aluno/professor. Consultar execução legada e verificar indicação de fallback; conferir que a liberação não sofreu mutação.
5. Confirmar cenário com uma série substituída e outra não registrada: resumo identifica registro incompleto com substituição. Repetir série planejada com diferentes `setNumber` sem chave React duplicada.

## Decisões e riscos

- A trilha antiga sem `plannedSnapshot` não pode ser retroativamente reconstruída com certeza. O fallback é leitura do planejamento liberado sob os mesmos guards; jamais apresentar como captura realizada na origem.
- A página não gera dados executados automaticamente. O modo guiado e os coletores específicos das issues #487–#489 poderão alimentar a mesma API sem criarem outra fonte.
- CI e auditoria são bloqueios de conclusão, não justificativa para merge automático.
