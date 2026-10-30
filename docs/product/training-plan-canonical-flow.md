# Fluxo canônico de periodização e montagem do treino

Issue de consolidação: #414.

## Decisão

O Sistema Acesso possui uma única fonte operacional para montar a semana de treino:

```text
TrainingPlan
  -> PeriodizationMatrix
     -> ResistedStimulus
     -> CyclicStimulus
  -> WorkoutTemplate
     -> WorkoutDay
        -> WorkoutExercise
        -> WorkoutResistanceGroup (associação com os mesmos exercícios)
  -> liberação / execução
```

`PeriodizationMatrix` representa o planejamento dos estímulos por mesociclo e semana. `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise` representam a montagem operacional que será liberada ao aluno.

Cíclico e Resistido não são tipos de sessão mutuamente exclusivos. Eles podem coexistir no mesmo `WorkoutDay`, conforme a estrutura original das abas `Periodização Macrociclo` e `Montagem` da planilha de referência.

## Estrutura legada

A árvore abaixo permanece temporariamente no schema enquanto consumidores históricos forem eliminados de forma incremental:

```text
TrainingPlan
  -> Macrocycle
     -> Mesocycle
        -> Microcycle
```

`Microcycle.sessionType` foi criado no início do projeto com forte orientação a corrida. Ele não deve ser usado para criar, editar ou excluir a montagem semanal.

A issue #414 remove o CRUD web e os endpoints REST de `Microcycle`. Registros antigos podem continuar sendo lidos por compatibilidade durante a transição, mas não são fonte de verdade para novos treinos.

## Regras de navegação

A tela de detalhes do plano lista semanas globais do período e converte cada uma para a posição usada pelo `WorkoutBuilder2`:

```text
semana global -> mesocycleNumber + weekNumber
```

A quantidade de semanas por mesociclo vem de `PeriodizationMatrix.weeksPerMesocycle`; quando a matriz ainda não existe, o fallback atual é 4.

Toda ação `Montar semana` abre diretamente o `WorkoutBuilder2`. Não deve existir popup paralelo de sessão no detalhe do plano.

## Invariantes

- `PeriodizationMatrix` planeja; não publica treino diretamente.
- `WorkoutTemplate/WorkoutDay/WorkoutExercise` é o grafo operacional canônico.
- Cíclico e Resistido podem coexistir no mesmo dia.
- Histórico liberado não deve ser sobrescrito silenciosamente.
- Novos recursos de #397, incluindo #398 e #399, devem estender o grafo canônico e nunca reativar `Microcycle` como segunda árvore operacional.

## Séries resistidas estruturadas (#399)

A estrutura de cada `WorkoutExercise` pode incluir `WorkoutExerciseBlock[]` (posição, tipo e observação) com `WorkoutExercisePlannedSet[]` (posição, repetições mínimas/máximas, carga em kg ou percentual, RIR/RPE, tempo/cadência, descanso em segundos e observação). Blocos são filhos do exercício operacional do `WorkoutDay`, não grupos entre exercícios (#400).

A ausência de blocos preserva o contrato simples existente (`sets`, `reps`, `load`, `intervalSec`), sem backfill presumido. Blocos têm ordem 1..N e tipos `aquecimento | principal | tecnica | complementar | finalizacao`; cada bloco possui de 1 a 30 séries ordenadas e opcionais sem coerção para zero. Campo ausente não vira carga prescrita. Os IDs estruturados fazem parte da prescrição e devem permanecer reproduzíveis após liberação.

Leituras de template, dia e exercício incluem `resistanceBlocks[].plannedSets[]` ordenados. O Workout Builder permite editar a estrutura por exercício e salva a composição do dia atomicamente via `PUT /api/v1/workout/days/:id/resistance-exercises`, com payload `{ exercises: [...] }`. Escritas de planejamento em template liberado e/ou execução iniciada são bloqueadas no serviço e no banco. Os gatilhos cobrem tanto releases ligados a `ConsolidatedPrescriptionOperationalRelease` quanto o caminho legado com `WorkoutTemplate.released=true` sem ledger; somente campos de ciclo de execução do dia permanecem mutáveis. A execução real permanece separada em `WorkoutSessionExecutionItem`, cuja referência opcional `plannedSetId` aponta para uma série planejada pertencente ao mesmo exercício; a comparação será responsabilidade da #401. A migração é aditiva e não cria nova árvore de montagem.


### Mensagens de somente leitura no treino resistido (#399)

O Workout Builder mantém a edição bloqueada quando o treino está liberado, o dia está fora do período do plano ou há uma operação impeditiva em andamento. O aviso reflete a causa real: **treino liberado** tem prioridade, **dia fora do período** só é apresentado quando a data está efetivamente fora dos limites, e bloqueios operacionais sem essas causas exibem mensagem de indisponibilidade. Os avisos não alteram a autorização, as restrições da API ou os guards de integridade no banco.

## Preservação de identidade no editor de séries (#399)

O salvamento transacional de exercícios resistidos de um `WorkoutDay` deve reconciliar os exercícios existentes pelo identificador persistido `workoutExerciseId`; clientes legados podem ser conciliados pelo exercício da biblioteca e seção quando não houver identificador explícito. O editor não deve excluir e recriar indiscriminadamente todas as linhas do dia, pois execuções históricas dependem dos identificadores de `WorkoutExercise`. A remoção ou alteração de linhas com histórico de execução é bloqueada; séries planejadas não são confundidas com os valores executados. Falhas inesperadas da persistência nunca expõem detalhes internos na resposta da API.

As mutações de planejamento também consultam o histórico legado de `WorkoutExecution` dentro da transação, antes de atualizar, reordenar ou excluir exercícios e dias. O guard de séries no banco trata esse histórico como bloqueio de mutabilidade.

O endpoint de substituição de exercícios estruturados requer token válido e vínculo ativo de professor. O serviço verifica o contrato do aluno associado ao `WorkoutDay` antes da mutação e novamente na transação, além de validar que todos os exercícios da biblioteca pertencem ao mesmo contrato; referências de outro contrato são rejeitadas sem efeito parcial.

## Endurecimento da segurança e consistência — AUD-399-04/05/06

Todas as rotas do Workout Builder exigem autenticação, vínculo ativo de professor e escopo do aluno no mesmo contrato. Os endpoints legados de mutação de exercícios revalidam contrato e biblioteca dentro da transação, não apenas no middleware.

Os triggers dos blocos e séries verificam origem (`OLD`) e destino (`NEW`) em atualizações de vínculo. Uma estrutura liberada, iniciada ou com histórico executado não pode ser transferida para outro exercício editável.

A resposta de template após correção de `weekStartDate` inclui `resistanceBlocks[].plannedSets[]`. A interface diferencia campo ausente (`undefined`, preservar planejamento) de array vazio (`[]`, remoção intencional). Nenhuma simples releitura pode apagar séries prescritas.

Ao alterar `weekStartDate` de um template editável, o serviço recalcula cada `WorkoutDay.workoutDate` a partir do **dia real da semana da âncora em UTC** e de `dayOfWeek` (1=segunda, 7=domingo), preservando horário UTC, identificadores de dias/exercícios/blocos/séries e conteúdo prescrito. A âncora não precisa ser segunda-feira; mudanças de mês/ano não deslocam os dias para a semana errada. Templates liberados continuam imutáveis. Regressões PostgreSQL verificam datas persistidas, controle negativo da fórmula antiga, identidade e séries planejadas.

As cópias de semanas pelo endpoint `POST /api/v1/workout/templates/:id/copy` calculam `WorkoutDay.workoutDate` a partir de `targetWeekStartDate` e de `dayOfWeek` (1=segunda, 7=domingo) dentro da transação de destino. A substituição de um template de destino editável exclui o destino anterior e cria template, dias, exercícios, blocos e séries em **uma única transação serializável**: qualquer falha restaura integralmente a versão anterior. Destinos liberados ou com execução/histórico são recusados antes da exclusão. O frontend não pode excluir o destino nem ajustar as datas depois da cópia; o payload retornado já representa a semana persistida.

## Integridade de vínculos e histórico liberado — AUD-399-12/13

Os identificadores de relacionamento de templates e dias são imutáveis nas rotas de edição: `PUT /api/v1/workout/templates/:id` rejeita qualquer `planId` explícito e `PUT /api/v1/workout/days/:id` rejeita qualquer `templateId` explícito, mesmo se o valor for igual ao atual ou nulo. O serviço devolve HTTP 400 (`INVALID_RESISTANCE_STRUCTURE`) sem realizar mutação; editar observações e demais campos permitidos continua funcionando. Alteração de vínculo entre contratos ou semanas deve usar um fluxo específico com autorização própria, nunca um update genérico.

O trigger `guard_consolidated_released_workout_day` inspeciona os identificadores reais de origem (`OLD.templateId`) e destino (`NEW.templateId`) em INSERT/UPDATE/DELETE. A migration incremental `20261021222000_issue_399_workout_day_parent_release_guard` corrige o check da origem/destino em UPDATE sem editar migrações já executadas. Qualquer transferência para/dentro de um template liberado por `WorkoutTemplate.released` ou ledger consolidado é recusada no banco com SQLSTATE `23514`, mesmo quando o dia da semana de destino está livre. Apenas status e feedback de execução continuam editáveis na linha liberada.

## Erros públicos das rotas de treino — AUD-399-11

Toda a família `/api/v1/workout` mantém autenticação e verificação de contrato antes do serviço. Erros inesperados de leitura ou mutação nas rotas legadas retornam HTTP 500 com `code: WORKOUT_OPERATION_FAILED` e mensagem pública genérica, sem diagnóstico de SQL/Prisma ou mensagem de exceção; o detalhe permanece apenas no log interno. Erros de domínio reconhecidos permanecem explicitamente classificados: validação inválida (400), dia não encontrado (404) e planejamento liberado ou com execução (409). Os caminhos `templates/get-or-create` e cópia de template mantêm códigos públicos específicos já documentados, sem expor causas internas. Testes HTTP negativos cobrem todas as rotas legadas alteradas, inclusive cópia de dia, reordenação e exclusão de exercícios.

## Fronteira estrita de entrada e persistência (AUD-399-14)

As operações de criação/edição de templates, dias e exercícios aceitam somente campos escalares documentados e os blocos/séries expressamente tipados. A validação ocorre na rota HTTP e novamente no serviço. Campos inesperados, operadores Prisma (`set`, `increment`) e relações aninhadas (`workoutDays`, `exercises`, `exercise`, `executions`, `executionItems`) são rejeitados com 400 `INVALID_RESISTANCE_STRUCTURE`; nunca são repassados diretamente ao Prisma. A mesma política vale para o endpoint transacional de substituição de exercícios.

Somente arrays `resistanceBlocks[].plannedSets[]` com campos previstos, posições determinísticas e de 1 a 30 séries por bloco são aceitos. Campos ausentes permanecem ausentes, sem prescrição implícita. O backend confirma, dentro da transação, que o exercício de biblioteca pertence ao `contractId` autenticado, inclusive quando um exercício existente é editado ou movido. Edição legítima de metadados, observações, duração e parâmetros resistidos permanece suportada; nenhuma edição genérica pode manipular relações do Prisma.


## Etapas cíclicas estruturadas (#398)

A prescrição cíclica operacional é armazenada como `WorkoutDay.cyclicStages[]` (`WorkoutCyclicStage`), na mesma semana dos exercícios resistidos. O dia pode conter as duas modalidades. `PeriodizationMatrix/CyclicStimulus` continuam sendo planejamento do estímulo; `Microcycle` não volta a ser uma fonte de montagem.

Cada etapa tem identidade persistente, posição 1..N e tipo `warmup | work | recovery | cooldown | repeat`. Etapas simples exigem duração positiva em `seconds` ou distância em `meters`. Alvos opcionais usam `pace_min_per_km`, `speed_kmh`, `heart_rate_bpm`, `zone` ou `pse`, com valor único **ou** faixa mínimo/máximo, além de inclinação, cadência e orientação opcional. Campos ausentes não significam zero. Uma etapa `repeat` define de 2 a 100 voltas com subetapas ordenadas contendo explicitamente trabalho e recuperação; não há repetição aninhada.

O Workout Builder edita etapas por dia na aba Cíclico e grava o snapshot transacional pela rota `PUT /api/v1/workout/templates/:id/save-week`, aceitando `cyclicStages: { "1": [...] }`. A API isolada `PUT /api/v1/workout/days/:id/cyclic-stages` aceita `{ "stages": [...] }`. Ambas exigem professor autenticado, escopo de `contractId`, validação de esquema estrito e bloqueiam mudanças após liberação ou início/histórico de execução. Um trigger no banco impede desvios por escrita SQL direta e transferência de vínculo; conflito otimista semanal não sobrepõe rascunhos. Gravação idêntica preserva IDs da prescrição, enquanto cópias geram novas identidades no destino.

Treinamentos legados permanecem válidos: se `cyclicStages` estiver ausente, a sessão continua consultável pelos campos `method`, `numSets`, `sessionTime`, `restTime`, `targetHrMin`, `targetSpeedMin` e `detailNotes`, sem migração sintética. `cyclicStages: []` remove apenas a estrutura de um dia **editável** sem alterar dados legados; enviar uma semana sem a chave `cyclicStages` mantém a estrutura existente. Leituras da rotina do aluno expõem `cyclicStages[]` ordenado e com as mesmas identidades para a execução guiada futura #489, sem modificar a prescrição. Nenhuma execução/feedback é alterada por #398.

## Agrupamentos estruturados do treino resistido (#400)

`WorkoutResistanceGroup` é filho opcional do mesmo `WorkoutDay` que possui `WorkoutExercise` e `WorkoutExerciseBlock`. A ordem dos agrupamentos é `position` (1..N). Cada `WorkoutResistanceGroupMember` possui `position` dentro do grupo e um vínculo `workoutExerciseId` **com uma linha real do mesmo dia**. A associação não cria nova linha de exercício, não duplica séries da #399 e não altera o esquema cíclico da #398.

Tipos explícitos: `superserie` (2–4 participantes), `bi_set` (2), `tri_set` (3), `circuito` (2–20), `bloco_tecnico` (1–20), `mobilidade` (1–20) e `finalizacao` (1–20). O agrupamento pode informar `rounds` (1–100), `restBetweenExercisesSec`, `restBetweenRoundsSec` (0–86400 cada) e `notes` (até 500 caracteres). A omissão de rodadas ou descanso representa valor **não prescrito**, nunca zero presumido. Uma linha de `WorkoutExercise` participa de no máximo um grupo do seu dia. O código de `system` e o marcador legado `groupBreakBefore` continuam disponíveis para treinos antigos, mas **não definem** um grupo estruturado novo por inferência textual.

A tela de montagem resistida permite selecionar e substituir participantes já existentes sem desfazer grupos, alterar tipo, ordenar grupos e participantes, editar rodadas/intervalos e desfazer agrupamentos. Quando faltam participantes livres, explica o mínimo necessário antes de habilitar a criação. Excluir um exercício retira sua associação; um grupo que perder a cardinalidade mínima é desfeito sem apagar os outros exercícios. A tela de dia/semana liberados é de somente leitura.

O salvamento principal da montagem é `PUT /api/v1/workout/templates/:id/save-week`, incluindo `resistanceGroups: { "1": [{ position, kind, rounds?, restBetweenExercisesSec?, restBetweenRoundsSec?, notes?, members: [{ position, section, exerciseOrder }] }] }`. Os campos `section` e `exerciseOrder` identificam a linha canônica **após a conciliação do mesmo snapshot de exercícios**; o servidor nunca aceita IDs ou relações Prisma arbitrárias do cliente como substituição de autorização. Também existe `PUT /api/v1/workout/days/:id/resistance-groups` com `{ groups: [...], baseUpdatedAt: "<WorkoutTemplate.updatedAt em ISO UTC>" }`. Sempre que `resistanceGroups` for enviado no snapshot semanal, `baseUpdatedAt` também é obrigatório; a API rejeita versão ausente/inválida (400) ou obsoleta (409) antes de resolver as posições dos participantes. A reordenação incrementa a revisão de maneira monotônica, mesmo quando duas alterações ocorrem no mesmo milissegundo. O campo omitido preserva agrupamentos anteriores; a lista vazia explícita os remove somente enquanto o planejamento estiver editável.

Cópia de dia, cópia de semana inteira e cópia apenas da parte resistida preservam composição, tipo, ordem, rodadas e intervalos e **reapontam** cada membro aos novos IDs de exercício no destino. Cópia apenas da parte cíclica preserva os grupos resistidos do destino. Um reenvio semanticamente idêntico de grupos mantém os IDs persistidos; mudanças efetivas antes da liberação podem substituir o conjunto. Nenhum agrupamento retroativo é inventado para treinos antigos sem grupos.

A elegibilidade resistida é validada no editor e novamente no serviço com a categoria canônica da biblioteca, inclusive para chamadas diretas à API. Triggers PostgreSQL proíbem associações cíclicas via SQL e recategorização de exercícios já agrupados. A edição legada de um exercício não pode alterar isoladamente `exerciseOrder`; deve usar a rota atômica de reordenação. Atualizações assíncronas de carga no editor atualizam somente `resistedExercises`, preservando os agrupamentos editados desde o início da consulta.

Ao excluir um exercício de um dia ainda editável, os endpoints de exclusão individual, substituição do dia e snapshot semanal retiram sua associação dentro da mesma transação, antes do `ON DELETE CASCADE`. Caso o grupo fique abaixo da cardinalidade mínima, apenas o grupo é desfeito, preservando os outros exercícios e séries; grupos e participantes restantes têm posições contínuas. Reordenações parciais priorizam os IDs solicitados e preservam a ordem relativa dos demais, normalizando todas as posições da seção. Quando um dado legado ainda contém duas linhas com a mesma seção/posição, a gravação de agrupamentos falha de forma explícita até a ambiguidade ser corrigida, sem selecionar arbitrariamente um exercício.

Reenvio idêntico **somente de grupos**, tanto pelo endpoint do dia quanto pelo snapshot semanal sem outros campos alterados, preserva IDs de grupos/membros e também a revisão `WorkoutTemplate.updatedAt`. Alterações reais continuam avançando a revisão.

Após `WorkoutTemplate.released`, liberação operacional consolidada, início de execução ou histórico legado, os agrupamentos e associações ficam imutáveis pelo serviço e por triggers PostgreSQL (inclusive SQL direto e tentativas de reatribuir membros entre dias). Execução por rodada/item da #401 poderá referenciar os IDs planejados do grupo e seus membros; **nenhum campo de execução realizada é incluído na prescrição desta issue**. A implementação é aditiva, sem backfill e sem criar um segundo grafo de treino.

### Remediação A-003/A-004: catálogo histórico e categorias Unicode

A elegibilidade de exercícios cíclicos na API e nos gatilhos PostgreSQL usa o mesmo contrato: trim de espaços Unicode nas extremidades, normalização NFD, remoção das marcas combinantes U+0300–U+036F e conversão para minúsculas. As categorias `Cíclico`, `Ci\u0301clico` e variantes com espaço não separável são impedidas de entrar ou permanecer em agrupamentos resistidos, inclusive por SQL direto ou por recategorização posterior. A migração adicional redefine os guards sem modificar o checksum da migração original de #400.

Ao liberar um `WorkoutTemplate` (`released: false → true`), seja pelo fluxo legado, pelo consolidado com ledger ou por atualização SQL direta, o PostgreSQL captura um `WorkoutReleasedExerciseSnapshot` para cada `WorkoutExercise` real. A entidade contém os metadados de apresentação do catálogo em JSONB (nome, categoria, grupo muscular, vídeo, tipos de carga, contagem, movimento e observações); não duplica exercícios nem séries. As leituras do aluno, da rotina e dos detalhes do professor usam esse snapshot para treinos liberados, de modo que renomear o catálogo posteriormente não altera a prescrição histórica. Os triggers impedem alteração, exclusão ou inserção tardia de snapshots de um treino já liberado.

A migração preenche snapshots de treinos **já liberados** somente com o catálogo disponível na data da migração. Nomes anteriores não podem ser reconstruídos e não são inventados; registros historicamente sem snapshot têm fallback explícito para o catálogo atual. Novas liberações capturam o valor real da liberação e não dependem desse fallback.

### Leitura histórica por período — AUD-400-05

As consultas `GET /api/v1/executions/workout-days` (aluno, somente treinos liberados) e
`GET /api/v1/executions/professor/workout-days` (professor, incluindo rascunhos) usam a
mesma projeção de catálogo que a leitura individual do dia. Cada `WorkoutDay`
liberado exibe os metadados capturados em `WorkoutReleasedExerciseSnapshot`,
mesmo após alterações posteriores na biblioteca. Dias ainda não liberados
exibem o catálogo editável corrente. A resposta pública não inclui
`releasedCatalog`; identidades dos exercícios, agrupamentos, membros e
séries planejadas permanecem inalteradas. O escopo do aluno/contrato e
a seleção `releasedOnly` das rotas são preservados.
