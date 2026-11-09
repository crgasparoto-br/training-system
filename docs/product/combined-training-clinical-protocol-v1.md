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

## Aceite de homologação / desbloqueio

A [#534](https://github.com/crgasparoto-br/training-system/issues/534) só pode ser encerrada com as sete decisões assinadas e exemplos positivos, negativos e `insufficient_data`, com cenário de falso positivo/falso negativo. Depois, implementar as regras aprovadas e validar `pnpm validate` e a auditoria independente sobre o SHA da PR. Nenhum merge automático.


## Etapa 2 — adaptador de fontes canônicas da Montagem Consolidada

A prévia técnica GET `/alunos/:alunoId/combined-conflicts?start=ISO-UTC&end=ISO-UTC` exige professor autenticado, `plans.consolidatedPrescriptions.view`, escopo efetivo do aluno/contrato e **ambas** as permissões `students.details.preWorkoutCheckIn` e `students.details.postWorkoutFeedback`. A rota reutiliza o controle de escopo da Montagem e não recebe regras do usuário.

O adaptador consulta `WorkoutDay` de template liberado com `TrainingPlan/Aluno` autorizado e com `ConsolidatedPrescriptionOperationalRelease` correspondente; os blocos de capacidade são lidos de `WorkoutDayCapacityOperationalBlock`. Check-in e revisão vigente do feedback são lidos somente por IDs de sessão, aluno e contrato. Feedback de outra liberação/execução não gera sinal. Dor do check-in não é generalizada automaticamente a resistido, flexibilidade ou equilíbrio; sinais de feedback específicos dessas capacidades permanecem vinculados exclusivamente à sua origem. Os objetos retornados não contêm notas textuais ou feedback integral.

O contrato é explicitamente **somente leitura**. `WorkoutDay.workoutDate` armazena dia civil, sem horário efetivo comprovado; por isso `coverage=partial` impede uma conclusão de ausência de conflito por janela temporal. A cada GET, as fontes vigentes são lidas novamente, preservando revisões e proveniência. `ACTIVE_COMBINED_CONFLICT_RULES_V1=[]` mantém `state=no_active_rules`, sem alterar prescrição, sessão, liberação ou regras de bloqueio.

A integração à liberação prévia de rascunhos, a homologação profissional #534, os casos HTTP reais e a auditoria independente são entregáveis separados antes do encerramento integral da #403.


### Remediação de fontes, escopos e versões — PR #537

- A proveniência de cada observação inclui a liberação operacional (`recordId`, `releasedAssemblyVersionId` e versão), a `CapacityPrescriptionVersion` exata (ID e versão) da `ConsolidatedPrescriptionCapacityBlock` liberada e o registro operacional estruturado do dia. A consulta rejeita vínculos discordantes em vez de trocar de versão silenciosamente.
- O recorte cíclico usa campos planejados estruturados de `WorkoutDay` ou estágios cíclicos e, nos novos releases, também o vínculo de dia `WorkoutDayCyclicOperationalBlock` (necessário para distância armazenada somente no template); resistido usa exercícios/grupos operacionais; flexibilidade e equilíbrio usam exclusivamente `WorkoutDayCapacityOperationalBlock`. Esta última tabela **continua proibindo** cíclico/resistido pelo `CHECK` PostgreSQL. Texto livre e notas derivadas nunca criam capacidade.
- `sessionSignals[]` mantém check-in e feedback de escopo `session` separadamente das observações específicas em `observations[]`, com fonte, revisão e release. Tontura, dor, PSR, fadiga e sono são apenas sinais estruturados; nenhum deles gera classificação combinada não homologada. Feedback de capacidade só alimenta a capacidade correspondente; feedback geral não é atribuído artificialmente a nenhuma capacidade.
- Feedback só é consumido se sua execução, release, template e plano coincidirem com a sessão publicada. Apenas a revisão corrente de cada `scopeKey` é utilizada; um novo GET realiza nova leitura. As respostas não retornam notas livres, dados integrais ou diagnósticos.
- `observationCount` conta observações por capacidade; `sessionSignalCount` conta sinais de sessão. `coverage=partial` e `ACTIVE_COMBINED_CONFLICT_RULES_V1=[]` permanecem inalterados; esta integração **não** equivale à homologação #534 nem encerra a issue #403.

A seleção de registro estrutural usa ordenação estável de estágios, exercícios e grupos; a natureza do registro (dia, estágio, exercício, grupo ou bloco) é explicitada na proveniência. A escala de dor do check-in respeita a validação canônica existente (inteiro não negativo), sem gerar severidade automática no protocolo combinado.

### Fechamento do achado A-004 — feedback específico por capacidade

Cada observação das quatro capacidades (`cyclic`, `resisted`, `flexibility`, `balance`) conserva os sinais estruturados da revisão vigente de seu próprio `scopeKey`: `painAfter` em `numeric.painLevel`, `psr` em `numeric.psr`, tontura em `flags.dizziness` e fadiga/sono em `categorical.fatigueLevel` e `categorical.sleepQuality`. Cada medida traz `kind=feedback`, ID e número da revisão; nenhum valor é copiado para outra capacidade ou deduzido de texto livre. `sessionSignals[]` permanece reservado ao check-in e ao feedback geral da sessão.

A mesma extração tipada é usada para feedback geral e específico; somente registros associados à execução e à liberação consolidadas são considerados. Correções são refletidas por nova consulta sem expor revisões anteriores ou campos textuais. Os valores permanecem apenas **evidências**: não se aplica a triagem de dor cíclica às demais capacidades, não se ativa a interpretação clínica sem #534 e não se altera o treino automaticamente. Os testes unitários abrangem quatro capacidades, separação de escopo, revisões corrigidas e origem estrangeira; o teste HTTP/PostgreSQL cobre criação, correção e releitura das quatro capacidades com liberação operacional real.

### Remediação A-005 — corrida somente por distância

Uma prescrição cíclica cujo único parâmetro operacional seja `distance` pode projetar
apenas `WorkoutTemplate.totalVolumeKm`, sem preencher `WorkoutDay.method`,
`stimulusDurationMin` ou estágio cíclico. O produtor da liberação persiste um
`WorkoutDayCyclicOperationalBlock` na data da colocação aprovada, vinculado ao
`CapacityPrescriptionVersion` exato e protegido por triggers de tenant, conteúdo,
imutabilidade e publicação. A consulta reúne esse marcador com os blocos
flexibilidade/equilíbrio sem ampliar os limites físicos desses últimos e rejeita versão
diferente do snapshot consolidado. A proveniência distingue `workout_cyclic_block` de
`workout_capacity_block`, para resolver a fonte física correta sem ambiguidade. A distância do template jamais é aplicada
automaticamente a outros dias com somente treino resistido. Releases anteriores sem
marcador utilizam as provas operacionais existentes; permanece `coverage=partial`.

A integração PostgreSQL comprova um dia cíclico com distância isolada e outro dia
resistido sem propagação entre sessões, com origem e versão corretas. O contrato
continua somente leitura, `no_active_rules` até #534 e sem mutações de treino.

## Etapa 3 — revisão da Montagem Consolidada (06/11/2026)

Antes de liberar sessões, a Montagem tem fontes canônicas de prescrições por
capacidade, mas **não tem cronograma de sessões comprovado** no contrato da
composição. O endpoint de conflitos estruturados agrega a projeção segura
`combinedReview` com a versão exata de Montagem, IDs e versões das
quatro capacidades, `state=no_active_rules` e `coverage=partial`. Essa
projeção não obtém check-in/feedback e não autoriza concluir ausência de risco.
É recalculada quando o professor carrega/reavalia a Montagem, inclusive após
enviar para revisão, aprovar ou criar nova versão.

O professor com as duas permissões clínicas disponíveis poderá consultar,
por solicitação explícita, as evidências **históricas** das sessões liberadas
pela Montagem Consolidada nos últimos 30 dias. O resultado separado inclui
versões/origens, avaliação de regras ativas (quando existirem), ausência de
dados e contagens da leitura por capacidades; nunca é agregado à resposta
básica de consulta da Montagem nem à visão do aluno. A consulta nunca altera
as transições de estado e falha sem reciclar dados antigos em caso de erro.
As telas não estimam severidade a partir de notas livres.

`send-for-review` e `approve` permanecem sujeitos aos
impedimentos críticos estruturados já existentes; a prévia combinada
**não** promove, bloqueia, substitui ou libera treino automaticamente.
A homologação profissional #534, a avaliação temporal de prescrições futuras
e a futura ativação controlada são etapas distintas. O merge desta etapa não
conclui a #403.


## Etapa 4 — evidência temporal futura vinculada à Agenda (#403)

A Agenda mantém `AgendaBooking.bookingDate` como timestamp legado dependente
do fuso do servidor para disponibilidade, mas novos agendamentos também gravam
`bookingCivilDate` como `DATE` originado do campo `YYYY-MM-DD` recebido.
`startTime/endTime` continuam horários locais e `updatedAt` versiona a fonte;
não há fuso autoritativo do contrato nem uma relação
automática entre agendamento e prescrição. Por isso **não é correto**
deduzir um horário UTC de `WorkoutDay.workoutDate`, nem atribuir qualquer
agendamento de mesmo dia a uma capacidade sem vínculo explícito.

O professor com `plans.consolidatedPrescriptions.view` + acesso à tela
`agenda` pode consultar um horizonte futuro de até 31 dias e
selecionar quais agendamentos correspondem a cada
`ConsolidatedPrescriptionCapacityBlock` da **versão corrente**.
A prévia exige: identidade do aluno e do contrato derivadas da autenticação,
versão exata da montagem, capacidade ativa/current canônica, ID do agendamento,
`AgendaBooking.updatedAt` esperado (controle de concorrência),
status `scheduled` e fuso IANA explicitamente confirmado pelo professor.
Nada disso é inferido de nomes, notas livres, disponibilidade geral ou mero
dia da semana.

A conversão de data+hora local para UTC enumera todos os instantes com
offset IANA compatível. Se o horário não existir por mudança de relógio ou
ocorrer duas vezes, ele é marcado `unverified`, **sem hora fictícia**.
Reservas antigas sem `bookingCivilDate`, mesmo que o timestamp legado pareça
meia-noite, permanecem `unverified/invalid_source_date`: o fuso da criação não
está comprovado. A lista de candidatos mostra data civil ausente como não
comprovada (`bookingDate=null`) em vez de apresentar o dia UTC possivelmente
errado. Horários inválidos também não produzem observações. A prévia compara o fim de um agendamento comprovado
com o início do próximo (horas cronológicas, inclusive sobreposição), sem
classificar a distância como alerta médico ou impedimento.

A API retorna `coverage=partial`,
`mayConcludeNoConflict=false`, estado clínico
`no_active_rules` enquanto #534 estiver aberta e
`temporalEvidenceStatus` independente, com os IDs, versões e
horas UTC apenas dos agendamentos explicitamente associados. Capacidades sem
horário são destacadas. Um vínculo cancelado, de outro contrato/aluno, com
versão incorreta ou prescrição defasada falha fechado (400/404/409). Nova
consulta revalida as fontes; **não há cache confiável, persistência do vínculo,
efeito no fluxo de liberação #320 ou mutação de treino**.

Limitação deliberada: o fuso informado pelo professor é uma **hipótese
explícita de prévia**, não configuração autoritativa do contrato, e não se
comprova completude da agenda ou da semana. A avaliação transacional de
horários de sessões **no ato definitivo da liberação**, um cadastro
canônico de fuso e a persistência versionada dos vínculos serão necessários
antes de qualquer regra temporal clínica bloqueante. Nenhuma janela 24/48h
ou limiar novo foi ativado.

### Remediação A-539-001/A-539-002 — duração de revisão e fonte civil autoritativa

O intervalo do GET é somente o recorte de seleção. A ação POST renova
`windowStart/windowEnd` em relação ao instante corrente, sem alterar os IDs ou
`updatedAt` previamente selecionados: o servidor revalida a janela, a versão da
montagem, o status e a fonte de cada agendamento. Uma espera acima de cinco
minutos não provoca falha artificial nem apaga vínculos; falhas transitórias
preservam a seleção para nova tentativa. Negação de acesso, ausência do aluno
ou conflito de versão (403/404/409) exigem nova consulta e descartam vínculos
antigos. Sessões realmente passadas continuam rejeitadas.

`bookingCivilDate DATE NULL` preserva o `YYYY-MM-DD` informado no fluxo de
criação real da Agenda sem depender de `TZ` do servidor; o timestamp legado
`bookingDate` permanece para as regras existentes de agenda. O campo ausente
não é completado com o fuso informado na prévia: não existe proveniência
retroativa segura. Testes cobrem a escrita/consulta/preview em UTC, São Paulo e
fuso positivo, o legado sem origem e a seleção demorada.
