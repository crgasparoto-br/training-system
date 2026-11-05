# Protocolo v1 — conflitos e segurança do treinamento combinado (#403)

**Estado em 05/11/2026: proposta funcional aprovada pelo Product Owner; critérios clínicos NÃO homologados.** Referência técnica: `combined-conflict-v1`. Homologação rastreada em [#534](https://github.com/crgasparoto-br/training-system/issues/534); implementação e auditoria em #403; épica #402.

## Princípio de segurança e fontes canônicas

O motor sinaliza, justifica e solicita revisão; **nunca** altera automaticamente prescrição, montagem, semana, sessão, exercício, liberação ou decisão da #406. A Montagem Consolidada é a fonte de liberação; execução #389, comparação #401, check-in #388 e feedback por revisão #390 são as fontes operacionais. O professor tem a palavra final.

O motor só pode consumir campos estruturados com origem recuperável, capacidade, sessão, aluno e `contractId` — jamais interpretar palavras como “forte”, “longão”, “ruim” ou “dor” para inventar classificação. Observações devem carregar identificador e versão do release, execução, check-in, feedback ou avaliação. Feedback corrigido utiliza apenas a revisão vigente, sem apagar as anteriores. Ausência de observação/valor e cobertura parcial do período produzem `insufficient_data`; não viram zero nem ausência de risco.

## Sete decisões submetidas à homologação — NENHUMA ativa por este documento

| ID | Regra | Proposta inicial a validar | Dados obrigatórios e questões abertas |
| --- | --- | --- | --- |
| CLIN-403-01 | Estímulo intenso | Corrida/cíclico: zonas estruturadas; resistido: %1RM, PSE/RIR conforme fonte. ≥80% 1RM é **referência para discussão**, não limiar de perigo. | Zona e metodologia para cada capacidade; critério distinto para flexibilidade/equilíbrio, se cabível; unidade, fonte e intensidade prescrita vs. executada. |
| CLIN-403-02 | Longão | Marcação explícita e versionada `isLongRun` pelo professor, eventualmente comparada ao histórico. | Definir se duração/distância relativa por aluno será exigida; não inferir da descrição. |
| CLIN-403-03 | Força pesada inferior | Exigir `targetsLowerBody` pelo padrão/grupo de movimento e medida de carga relativa; ≥80% 1RM é apenas candidato. | Grupos/movimentos, séries, intensidade, unidade e tratamento do histórico sem 1RM confiável. |
| CLIN-403-04 | Proximidade temporal | Considerar janelas de revisão <24h e observação de 24–48h como **hipóteses**, não contraindicação universal. | Semântica de “seguido de”, horário da sessão, fuso, inclusividade, descanso, tipo/objetivo do treino e severidade. |
| CLIN-403-05 | Recuperação insuficiente | Considerar PSR, sono, fadiga, dor e tontura como **sinais distintos**; não criar score composto. | Quais combinações estruturadas acionam alerta, com escalas validadas e justificativa, incluindo falta de medida. |
| CLIN-403-06 | Aumento de volume | Comparar semanas equivalentes e unidade homogênea; usar quatro semanas anteriores como **hipótese** de referência. | Percentual de mudança clinicamente validado, período, volume por capacidade, histórico insuficiente e semanas atípicas. Não aplicar regra universal de 10%. |
| CLIN-403-07 | Severidade | `info`: contexto; `warning`: revisão indicada; `critical`: somente situações de segurança definidas em protocolo aprovado. | Matriz por combinação, encaminhamento profissional e eventual impeditivo pré-liberação explicitamente homologado. |

Triagem já canônica da #390 (dor 0–2 verde, 3–4 atenção, >4 alerta) pode ser reutilizada **somente no recorte cíclico ao qual pertence**, sem generalizar limiares para resistido, flexibilidade ou equilíbrio. Tontura/fadiga alta no feedback já sinalizam acompanhamento, não diagnóstico nem mudança automática. Novos critérios e bloqueios exigem validação profissional independente da aprovação de produto.

## Ciclo de vida e ativação auditável

1. `draft`: hipótese documentada, não executável em produção.
2. `approved`: critérios, fontes e testes revisados e **assinados pelo profissional habilitado**; ainda desativado.
3. `active`: promoção explícita após revisão de segurança, CI, autorização, origem, versão e publicação controlada. O motor exige código, versão, documento de origem, severidade, orientação, profissional, credencial e timestamp de homologação. Nenhuma regra do protocolo combinado está ativa na v1.
4. `retired`: inativa, histórico preservado. Evolução cria nova versão; ocorrências antigas guardam regra e evidências originais.

Registro por regra: código e versão imutáveis, capacidades, operadores/limiares/unidades, fonte científica/técnica, janela, severidade, orientação, alcance, protocolo, responsável habilitado e credencial, data de aprovação, vigência, plano de testes positivos/negativos/insuficientes, razão de eventual aposentadoria, histórico de alteração e evidências correspondentes.

A decisão sobre ativação é de configuração **confiável no backend**, nunca controlada por JSON do aluno ou professor em uma requisição comum. Autorização de leitura e `contractId` são verificadas na fronteira da API antes de entregar dados sensíveis ao avaliador. Aluno recebe apenas linguagem prática autorizada, sem orientação técnica/diagnóstico. O fluxo de decisão transacional permanece exclusivamente na #406, com aprovação profissional explícita.

## Contrato técnico inicial entregue

`apps/api/src/modules/workout/combined-training-conflicts.domain.ts` define observações estruturadas e versão de origem por métrica, predicados numéricos/booleanos por capacidade, avaliação de sessão e sequência com janelas, respostas `triggered`, `not_triggered`, `insufficient_data`, `inactive`, rastreabilidade e bloqueio fail-closed para ativação sem homologação declarada ou fonte cruzada de contrato.

O catálogo padrão `ACTIVE_COMBINED_CONFLICT_RULES_V1` é **vazio por projeto**. Portanto não há detecção clínica combinada ativa, endpoint novo, persistência ou efeito no treino nesta etapa. Os parâmetros dos testes são fixtures hipotéticas, não aprovação médica. A integração futura à Montagem Consolidada/rotina exigirá consulta completa e autorizada às fontes, escopo de `contractId`, reavaliação após novas revisões, revisão da UX por audiência e testes de integração e segurança. Não classificar a #403 como concluída antes disso.

## Etapa 2 — integração técnica read-only à Montagem Consolidada (PR de implementação)

O endpoint professor já existente `GET /consolidated-prescriptions/alunos/:alunoId/conflicts` mantém `conflicts`, `hasCritical`, `canUnblock` e `unavailableChecks` inalterados e acrescenta `combinedReview` **apenas quando existe montagem**. Parâmetro opcional `date=YYYY-MM-DD` usa a semana civil canônica (segunda a domingo) no fuso de contrato do produto.

O adapter read-only vincula: versão corrente da Montagem; versões das quatro capacidades; releases imutáveis da #320 do **mesmo aluno/contrato/montagem**; sessões do Workout Builder realmente liberadas; blocos operacionais de flexibilidade/equilíbrio; execução canônica #389; e, **somente com permissão explícita adicional**, check-in #388 e a revisão mais recente de feedback #390 para cada capacidade ou sessão.

A resposta técnica contém proveniência e versão de cada fonte, `sourceCounts`, `sourceSnapshots`, `evaluations`, `coverage`, `unavailableReasons` e `riskConclusion: not_cleared`. Não retorna observações clínicas brutas ou comentários livres. Sem grants de `students.details.preWorkoutCheckIn` e/ou `students.details.postWorkoutFeedback`, o adapter nem consulta os registros restritos. O escopo `plans.consolidatedPrescriptions.view` e o `dataScope` continuam obrigatórios antes de ler qualquer evidência.

Para sessões sem horário de início real, `workoutDate` é somente data civil e não serve como prova de intervalo horário: regras de sequência retornam `insufficient_data`. Não transformar `WorkoutTemplate.totalVolumeKm` (volume semanal) em distância de sessão, `loadPercent` sem metodologia em %1RM, nomes textuais em `isLongRun`, ou observações em restrição clínica.

**Nenhuma regra combinada nova está ativa**: `ACTIVE_COMBINED_CONFLICT_RULES_V1 = []`; resposta `no_active_rules` **não significa ausência de risco**. O GET recompõe os dados a cada consulta, incluindo correções de feedback, sem cache, persistência de alertas, alteração de aprovação, revisão, bloqueio ou liberação. Configuração autorizada, UI técnica/visão do aluno e ativação homologada permanecem fases posteriores.

## Aceite de homologação / desbloqueio

A [#534](https://github.com/crgasparoto-br/training-system/issues/534) só pode ser encerrada com as sete decisões assinadas e exemplos positivos, negativos e `insufficient_data`, com cenário de falso positivo/falso negativo. Depois, implementar as regras aprovadas e validar `pnpm validate` e a auditoria independente sobre o SHA da PR. Nenhum merge automático.
