# Issue #401 — Comparar planejado versus executado por unidade

- Base: `develop`; branch de implementação: `feat/401-planned-executed-comparison`.
- Autoridades: WorkoutDay/WorkoutCyclicStage/WorkoutExerciseBlock/WorkoutExercisePlannedSet/WorkoutResistanceGroup (prescrição); WorkoutSessionExecution/Item (#389) (realizado).
- Dependências: #398, #399, #400 e #389 presentes na develop. Nenhuma nova árvore de montagem.
- Status: remediações A-401-01..16 e A-401017 preservadas. O CI exact-SHA da correção A-401017 passou em `9ec2d6256faa249383ffc29dd06c2a6e7732a7c4` (push e PR); a evidência visual acrescentada depois exige seus próprios checks no novo HEAD e uma nova auditoria independente.

## Objetivo

Permitir que aluno e professor comparem cada etapa cíclica (inclusive iterações), exercício, bloco, série e agrupamento planejado com valores realmente registrados, sem alterar o histórico prescrito ou inferir melhora/piora.

## Contrato

- A primeira operação canônica da sessão captura `WorkoutSessionExecution.plannedSnapshot` para o `WorkoutDay.id` vinculado à liberação consolidada. Migração aditiva e trigger impedem sobrescrever o snapshot; registros anteriores usam fallback explicitamente rotulado `released_plan`.
- Unidades executadas continuam em `WorkoutSessionExecutionItem` com `plannedUnitId`, `plannedSetId`, `setNumber` e os atributos RIR/RPE/cadência/descanso e outcome opcional. Etapas cíclicas e agrupamentos são guardados em arrays versionados da `sessionValues` com IDs planejados validados contra o mesmo dia, sem tabelas de planejamento paralelas. A-401017: novos itens fazem upsert por `plannedStageId+iteration` ou `plannedGroupId`. Omissão de item ou campo conserva o registro, `null` limpa apenas a medição informada, `0` é valor real, `[]` não remove. `removeCyclicStages` (ID e iteração) e `removeResistanceGroups` (IDs) excluem registros explicitamente, após validação de vínculo; os comandos de remoção pertencem ao fingerprint da operação e não aparecem na leitura.
- Outcomes de escrita explícitos: `full`, `partial`, `substituted`, `not_performed`. A coluna de outcome não tem default: registros antigos ou sem classificação são `unclassified` na comparação, nunca `full` inferido. Unidade sem valor executado é `not_recorded`. Agregados com algumas séries sem registro são `incomplete_record`, preservando `containsSubstitution` quando também há substituição; um conjunto incompleto não é tratado como execução integral nem como parcial comprovada. Substituição exige observação. Nenhum campo ausente vira zero.
- A API autentica e restringe consultas de comparação por `alunoId` e `contractId` já existentes nas rotas aluno/professor da rotina. A consulta semanal permite expandir comparações de sessões concluídas anteriormente, usando o snapshot da execução em vez do template atual. Visões do professor mostram séries/valores técnicos; visão do aluno mostra resumo, estágios, exercícios e grupos.
- A velocidade da sessão executada (`sessionValues.speedKmh`) é opcional, explícita e não negativa, inclusive para treinos cíclicos legados sem `cyclicStages`. A API rejeita tipo não numérico/valor inválido; `0` não é ausência e `null` limpa o registro sem gerar valor fictício. Não se converte distância/pace em velocidade.
- Diferença numérica é mostrada apenas na unidade física equivalente e sem alvo em faixa; dados com unidades incompatíveis ou ausentes não produzem diferença. Diferença nunca é classificação de desempenho. Metas de volume semanal não são usadas como distância diária; os limites de faixas de FC, velocidade e pace permanecem disponíveis. O resultado `full` da sessão só decorre de confirmação explícita de todas as unidades comparáveis, não apenas do status terminal. Em legado sem snapshot, as metas e deltas históricos permanecem indisponíveis para evitar falsas comparações.
- A apresentação numérica preserva os valores de entrada distintos com até 17 algarismos significativos, em `pt-BR`; diferenças calculadas usam até 8 algarismos significativos e recebem o sinal `≈` quando aproximadas, sem exibir um delta real não nulo como zero (A-401-10). String, unidade, ausência e zero real mantêm seus significados.
- O cálculo é projeção read-only, sem média, adesão, progressão, sugestão de prescrição ou integração externa.

## Cenários de validação

- [x] Contrato tipado de leitura, persistência versionada e estruturas de sessão.
- [x] Captura imutável e comparação por IDs; guarda de escopo e referências.
- [x] Componente responsivo partilhado entre Treino de hoje e painel do professor.
- [x] Testes de domínio: igual, diferente, ausência/zero, faixa, substituição, repetição e histórico.
- [x] Testes PostgreSQL: snapshot congelado, gravação estruturada, referência estrangeira/duplicada e rollback.
- [x] Testes web: visibilidade aluno/professor, valor zero, ausência de conclusão automática.
- [x] Regressões A-401-01..04: ausência de classificação não vira `full`; substituições mistas e séries sem registro; recuperação histórica pela semana; identidade de múltiplas gravações de uma série no React.
- [x] Regressões A-401-05..08: volume semanal distinto da execução diária; faixas com limites diferentes e upper-only; sessão `completed` com série parcial/ausente/substituída, sessão sem registro e execução em andamento; tipo público restrito a outcomes graváveis e rejeição de resultados derivados em PostgreSQL.
- [x] Controle do risco legado: `released_plan` não exibe metas/diferenças históricas inventadas; conserva valores executados e indicação da ausência de captura.
- [x] Remediação A-401-09: contrato, API e persistência da velocidade no nível de sessão, testes para legado sem etapas, faixa, zero/ausência, idempotência, leitura histórica e rejeição de valores inválidos.
- [x] Remediação A-401-10: regressão web para diferenças de ±0,0004 kg, valores numéricos precisos, delta efetivamente zero, ausência e pequenas diferenças, inclusive projeção visual do professor.
- [x] Remediação A-401-11: distinguir alvo exato, limite inferior isolado, limite superior e faixa (cíclico/sessão/série), sem delta para limites e sem conversão; `A partir de` na interface para mínimo unilateral. Cobertura com controle positivo para alvo exato e valores ausentes/zero.
- [x] Remediação A-401-12: exercício com séries estruturadas apresenta apenas cobertura por IDs distintos de séries; carga/repetições/intervalo pertencem à comparação da série específica. Exercícios sem blocos preservam comparação legada. Regressões para séries divergentes, única série registrada, conjunto completo e visões aluno/professor.
- [x] Testes adversariais A-401-13: múltiplas séries legadas preservadas por ID do exercício e ordinal executado, valores divergentes, substituição, ausência e fallback histórico.
- [x] Testes adversariais A-401-14: métricas cíclicas registradas por exercício legado ou série estruturada, valores ausentes/zero e alvos indisponíveis sem fabricação.
- [x] A-401-15: a etapa cíclica apresenta duração e distância executadas simultaneamente e todas as medições adicionais pace, velocidade, FC, zona e PSE; apenas a grandeza com prescrição explícita recebe meta/diferença. Regressões cobrem tempo prescrito, distância prescrita, alvo de velocidade, zero, ausência e fallback histórico.
- [x] A-401-16: integração sem perda das rotas, validações, esquema e execução guiada da #487 com o comparador da #401; o gate definitivo depende da confirmação remota de ausência de conflitos e da CI do commit combinado. A leitura reconhece `completedAt` por série como confirmação explícita guiada, sem classificar registros sem `outcome` e sem `completedAt` como integrais; a rotina semanal transporta esse campo.
- [x] A-401017: testes PostgreSQL de duas gravações sequenciais, atualização parcial, remoção explícita, rollback por ID alheio, idempotência, versão, snapshots e projeção histórica; testes HTTP de schema de remoção.
- [x] `pnpm validate`, build e testes PostgreSQL da correção A-401017 no HEAD `9ec2d6256faa249383ffc29dd06c2a6e7732a7c4`: [PR CI #41134648703](https://github.com/crgasparoto-br/training-system/actions/runs/41134648703) e [push CI #41134640232](https://github.com/crgasparoto-br/training-system/actions/runs/41134640232), ambos `completed/success`; `CRITICAL validation`, `Merge preview compatibility` e `Validate repository` da PR passaram. Este check registra somente esse SHA, não antecipa resultado de commits posteriores.
- [x] Evidência visual dedicada da comparação aluno/professor adicionada em `apps/web/src/components/training/issue-401-browser-evidence.test.js`: Chromium real, 1440×900 / 768×1024 / 390×844, teclado, árvore de acessibilidade, ausência de overflow, substituição, valores ausentes/zero, séries técnicas exclusivamente ao professor e fallback histórico. O CI gera PNGs + `browser.json` com SHA-256 no artefato `validate-pr-critical-<HEAD>`; o teste usa cenário sintético da API e não substitui os testes reais de autorização/persistência.
- [x] Remediação A-401-18: atualização parcial de substituições validada após conciliação com o outcome/observação persistidos, inclusive rejeições atômicas e replay idempotente em PostgreSQL.
- [x] Remediação A-401-19: lotes de plannedSetId distintos sem setNumber prévio resolvem ordinais canônicos antes do teste de duplicidade; regressões de duplicação real, ordinal incorreto, foreign ID e histórico legado.
- [ ] CI exact-SHA do commit com A-401-18/19 e nova auditoria independente. Não reutilizar checks ou parecer de SHAs anteriores.

## Validação manual

1. Abrir treino liberado, iniciar sessão, registrar execução parcial de etapa/série/grupo e recarregar.
2. Confirmar que valores do plano e executados aparecem lado a lado, inclusive quando registrado 0, sem cópia silenciosa de valores.
3. No professor verificar séries, faixas, resultados e diferença numérica neutra; no aluno confirmar textos de orientação sem detalhes técnicos.
4. Navegar à semana anterior, expandir a comparação de uma sessão passada e verificar os perfis aluno/professor. Consultar execução legada e verificar indicação de fallback; conferir que a liberação não sofreu mutação.
5. Confirmar cenário com uma série substituída e outra não registrada: resumo identifica registro incompleto com substituição. Repetir série planejada com diferentes `setNumber` sem chave React duplicada.
6. Em sessão cíclica legada sem etapas, registrar 9 km/h contra faixa planejada de 8–10 km/h; confirmar comparação sem delta, ausência diferente de 0, histórico, versão/idempotência e leitura em ambos os perfis.
7. No professor, comparar 20 kg prescritos com 20,0004 kg e 19,9996 kg executados: conferir valores originais distintos e diferenças positivas/negativas não zeradas; comparar também 20 kg versus 20 kg (zero legítimo), ausência de registro e uma diferença inferior a 0,001 kg.
8. Na etapa cíclica e na série resistida, comparar limite inferior isolado (8 contra 9/10), superior isolado, faixa e alvo exato; confirmar `A partir de`/`Até` e que somente alvos exatos recebem diferença numérica.
9. Em exercício estruturado com séries de 20 kg e 22 kg, registrar apenas a segunda série com 22 kg: o resumo do exercício deve mostrar 1 de 2 séries registradas, sem comparar a carga legada do exercício com a série. Conferir ambas as séries registradas e o fallback de exercício sem blocos.
10. Em exercício legado sem plannedSetId, registrar duas séries com setNumber distintos (inclusive fora de ordem), cargas/repetições e substituição diferentes: o professor deve ver cada registro, o aluno apenas o resumo; não atribuir a uma série planejada inexistente.
11. Registrar tempo, distância, ritmo e FC/zona diretamente num exercício legado ou série estruturada: confirmar valor individual, zero real e meta indisponível quando não houver prescrição própria por exercício, sem reutilizar valores de sessão/etapa.
12. Em etapa planejada por segundos, registrar também metros, pace, velocidade, FC, zona e PSE, verificar cada medição sem meta/delta artificial; repetir numa etapa por metros com segundos extras, zero real e fallback histórico. Confirmar que a tela de execução guiada #487 permanece utilizável.
13. A-401017: gravar etapa A e grupo A; gravar apenas etapa B e grupo B sem reenviar os primeiros; alterar só velocidade de B. Recarregar e conferir A/B e duração original de B em aluno/professor. Informar `null` para limpar uma medição, `0` para registrar zero e `[]` para enviar lote vazio sem apagar histórico. Remover B apenas via `removeCyclicStages`/`removeResistanceGroups`, conferindo que A e o plano congelado permanecem intactos. Checar versionamento, replay, tentativa de ID de outro contrato e rejeição de entrada duplicada.

14. A-401-18: alterar carga e depois a observação de série substituída em requisições separadas, omitindo ora a observação, ora o outcome; conferir trim, versões, replay e falha sem escrita para substituição sem observação ou observação em série não substituída.
15. A-401-19: registrar de uma vez duas séries planejadas distintas de um exercício, com plannedSetId explícito e setNumber ausente, em ordem inversa; verificar ordinais, dados e comparação por série. Rejeitar duplicação da mesma série, ordinal inválido, plannedSetId estrangeiro e lote legado duplicado, sem gravar parcialmente.

## Decisões e riscos

- A trilha antiga sem `plannedSnapshot` não pode ser retroativamente reconstruída com certeza. O fallback usa o planejamento liberado apenas como referência de identidade/estrutura para os registros existentes, com metas planejadas e diferenças intencionalmente nulas; jamais apresentar como captura histórica realizada na origem.
- A página não gera dados executados automaticamente. O modo guiado e os coletores específicos das issues #487–#489 poderão alimentar a mesma API sem criarem outra fonte.
- CI e auditoria são bloqueios de conclusão, não justificativa para merge automático.
