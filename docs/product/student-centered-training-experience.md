# Produto: experiencia de treinamento centrada no aluno

Este documento define a experiencia-alvo de treinamento do Sistema ACESSO com foco central no aluno.

Ele complementa:

- `docs/product/integrated-prescription-control.md`, que define o fluxo tecnico entre prontuario, avaliacao, prescricao, montagem, treino e feedback;
- `docs/product/student-central-domain-matrix.md`, que define o que pertence a Central do Aluno, a administracao geral ou aos dois contextos;
- `docs/execution-plans/active/2026-07-student-central-roadmap.md`, que registra o estado funcional e a ordem de evolucao.

Este documento nao autoriza implementacao automatica. Cada incremento funcional deve possuir issue propria, criterios de aceite, permissoes, testes e validacao manual.

## Pergunta central do produto

A experiencia de treinamento deve responder, para o aluno:

> O que preciso fazer hoje, como executo com seguranca, como registro o que aconteceu e como acompanho minha evolucao?

A experiencia do professor deve responder:

> Qual foi a origem da prescricao, o que foi planejado, o que o aluno executou e qual decisao precisa ser validada agora?

## Principios de produto

1. O aluno e o centro da experiencia, mesmo quando a decisao tecnica pertence ao professor.
2. A Central do Aluno e o ponto principal para consultar rotina, treino, execucao, feedback e evolucao de um aluno selecionado.
3. Biblioteca, parametros e templates reutilizaveis continuam na administracao geral; a Central mostra somente o que foi aplicado ao aluno.
4. A visao do aluno deve ser pratica, simples e segura; justificativas tecnicas, conflitos e dados sensiveis ficam restritos ao professor autorizado.
5. Templates sao pontos de partida editaveis, nunca prescricoes automaticas.
6. Nenhuma sugestao altera prescricao, montagem consolidada ou treino liberado sem validacao do professor.
7. O planejado e o executado devem permanecer separados e comparaveis.
8. Toda mudanca relevante deve preservar origem, versao, responsavel, data, aluno e `contractId`.
9. O sistema deve funcionar plenamente sem integracoes externas.
10. Conteudo de terceiros nao deve ser copiado ou importado sem licenca e rastreabilidade adequadas.

## Jornada do aluno

| Momento | Necessidade do aluno | Resposta esperada do sistema |
| --- | --- | --- |
| Inicio da semana | Entender a rotina e os proximos treinos | Mostrar calendario simples, objetivos praticos, duracao estimada e dias de recuperacao |
| Antes do treino | Confirmar se pode iniciar e informar como esta | Check-in curto com recuperacao, sono, fadiga, dor, motivacao e tempo disponivel |
| Durante o treino | Saber exatamente o que fazer | Exibir ordem, etapas, exercicios, series, repeticoes, carga, tempo, distancia, zona e orientacoes simples |
| Diante de dificuldade | Encontrar orientacao segura | Mostrar alertas, alternativa previamente aprovada e opcao de interromper ou pedir ajuda |
| Depois do treino | Registrar o que aconteceu | Confirmar conclusao, valores executados, PSE, dor, dificuldade, substituicoes e observacoes |
| Entre treinos | Saber se esta evoluindo | Mostrar aderencia, consistencia, marcos recentes e proxima acao validada |
| Na revisao | Participar do acompanhamento | Apresentar resumo compreensivel e permitir que o professor valide manter, progredir, reduzir, trocar, suspender ou reavaliar |

## Presenca na Central do Aluno

A Central deve concentrar a aplicacao individual do treinamento, sem incorporar configuracoes gerais do sistema.

### Resumo

Deve mostrar, conforme permissao:

- objetivo ativo;
- situacao do plano atual;
- proximo treino;
- ultima execucao;
- aderencia recente;
- alertas praticos;
- feedback pendente;
- proxima acao esperada do aluno ou do professor.

### Rotina semanal

Deve permitir consultar:

- dias planejados;
- modalidade ou capacidade de cada sessao;
- duracao estimada;
- local ou equipamento principal;
- dias de recuperacao;
- status planejado, realizado, parcial, reagendado, perdido ou suspenso.

### Treino de hoje

Deve ser a saida operacional da Montagem Consolidada e apresentar:

- objetivo pratico da sessao;
- duracao estimada;
- ordem de execucao;
- aquecimento, blocos principais e finalizacao;
- carga, repeticoes, tempo, distancia, pace, velocidade, zona ou esforco alvo quando aplicavel;
- observacoes simples;
- alertas de seguranca;
- acao para iniciar, pausar, concluir ou registrar impossibilidade.

Nao deve exibir formula clinica, justificativa tecnica completa, conflito interno ou configuracao de prescricao.

#### Contrato de leitura implementado (#387)

A rotina semanal e o Treino de hoje sao uma leitura do grafo operacional liberado `TrainingPlan -> WorkoutTemplate(released=true) -> WorkoutDay -> WorkoutExercise`, mas uma sessao so e publicavel quando existe a liberacao correspondente da Montagem Consolidada para o mesmo aluno e contrato. Nao existe modelo, tabela ou estado paralelo de `Treino de hoje`.

- **Fonte**: somente sessoes com `WorkoutTemplate.released = true` e `ConsolidatedPrescriptionOperationalRelease` compativel com aluno, contrato e template. Um template liberado apenas pelo Workout Builder nao publica rotina nem Treino de hoje nesta projecao.
- **Origem**: cada sessao informa `origin.kind = consolidated`. A visao do professor recebe release, montagem e versoes; a do aluno recebe somente a origem e a data de liberacao.
- **Semana**: semana civil de segunda a domingo que contem a data de referencia; sessoes em ordem `workoutDate`, `dayOfWeek`, `id`. Dia sem sessao consolidada liberada nem pendente e apresentado como recuperacao.
- **Hoje**: data civil no fuso `America/Sao_Paulo`, calculada no backend. Estados distintos: `released`, `not_released` (existe sessao `released=false`) e `none`. Falta de permissao e erro de carregamento sao estados da interface, distintos destes.
- **Modalidade**: derivada de dados persistidos, nunca de texto livre: exercicios -> musculacao; tempo/distancia/FC/velocidade/pace/VO2 -> aerobio; `WorkoutDayCapacityOperationalBlock` -> flexibilidade/equilibrio.
- **Blocos**: `WorkoutExercise.section` `mobilidade`/`aquecimento` -> aquecimento; `sessao`/`principal` -> parte principal; `resfriamento`/`finalizacao` -> finalizacao; demais secoes -> outros, preservando a ordem persistida.
- **Aluno x professor**: o aluno ve objetivo pratico (`studentGoal`), parametros, orientacoes e alerta de seguranca generico. Objetivo do professor (`coachGoal`), metodo, divisao, RIR e VO2 ficam no contexto tecnico restrito ao professor.
- **Execucao**: o status exibido e uma projecao somente leitura no vocabulario publico canonico da #389; `WorkoutDay.status = planned` legado e exposto como `not_started`. A #387 nao define transicoes nem cria autoridade concorrente. A resposta declara `execution.available = false` ate a #389 publicar o contrato canonico; enquanto isso as acoes de iniciar e registrar impossibilidade aparecem desabilitadas, sem persistencia, sucesso local ou endpoint temporario.

### Modo guiado de execucao

Ao iniciar o treino, a experiencia deve mudar de uma ficha ampla para um fluxo guiado que apresenta predominantemente a unidade que o aluno precisa executar agora.

Para treino resistido:

- mostrar exercicio, serie/rodada, repeticoes ou faixa, carga, RIR/RPE, tempo/cadencia e orientacao quando aplicaveis;
- permitir confirmar ou ajustar carga e repeticoes realizadas sem modificar o valor prescrito;
- avancar pela ordem persistida da sessao;
- em superserie, bi-set, tri-set e circuito, percorrer todos os itens da rodada antes do descanso final, salvo intervalo intermediario explicitamente prescrito;
- reconstruir a posicao atual a partir do estado persistido apos refresh ou retomada.

Para descanso resistido:

- preservar o intervalo planejado como parte do planejamento historico;
- registrar o descanso efetivamente realizado separadamente;
- permitir extensao manual, inicialmente em incrementos de 15 segundos, e pular o descanso sem alterar a prescricao;
- usar timestamps persistidos para reconstruir o tempo restante; ticks do navegador nao sao fonte de verdade;
- som e vibracao podem ser usados como ajuda opcional quando a plataforma e a permissao do dispositivo permitirem.

Para treino ciclico estruturado:

- mostrar uma etapa por vez com tipo, rodada, duracao/distancia e alvo aplicavel;
- diferenciar trabalho, recuperacao, aquecimento e desaquecimento;
- preservar a ordem e as repeticoes definidas no planejamento estruturado;
- reconstruir temporizadores por timestamps persistidos depois de refresh ou background;
- manter valores executados separados dos planejados.

A experiencia guiada deve usar o lifecycle canonico da sessao e nao criar estado paralelo no frontend.

### Semantica canonica de pausa

- `paused` representa uma pausa **explicita** da sessao e congela relogios operacionais da execucao, incluindo descanso resistido e etapas ciclicas temporais.
- Background, suspensao do navegador ou refresh **nao** significam pausa. Sem comando explicito de pausa, o tempo continua correndo por wall-clock a partir dos timestamps persistidos.
- Ao retomar, o relogio operacional continua do tempo restante preservado no momento da pausa. Exemplo: descanso de 60 s pausado apos 25 s deve retomar com 35 s restantes.
- Nenhum cronometro, etapa, rodada ou serie pode avancar automaticamente enquanto a sessao estiver `paused`.
- `startedAt` permanece o primeiro inicio da sessao e nao e regravado em retomadas. `finishedAt` so existe em estado terminal.
- A persistencia deve permitir reconstruir intervalos de pausa e distinguir tempo corrido de parede de tempo efetivamente ativo quando essa diferenca for relevante para a execucao.
- Retry de `pause` ou `resume` deve ser idempotente.
- A pausa e seu tempo restante devem ser reconstruiveis em outro cliente/dispositivo autorizado; memoria do navegador nao pode ser a fonte de verdade.


### Historico e evolucao

Deve reunir:

- sessoes planejadas e realizadas;
- ajustes de plano;
- feedbacks relevantes;
- substituicoes de exercicio;
- alertas recorrentes;
- marcos de evolucao;
- decisoes validadas pelo professor.

## Separacao entre Central e administracao geral

| Funcionalidade | Contexto principal | Presenca na Central |
| --- | --- | --- |
| Biblioteca geral de exercicios | Administracao geral | Exercicio aplicado, orientacao e alternativa aprovada |
| Templates de corrida, musculacao e combinado | Administracao geral | Plano individual gerado a partir do template |
| Parametros, metodos e siglas | Administracao geral | Nomes legiveis e valores aplicados ao aluno |
| Prescricao por capacidade | Central do Aluno, visao tecnica | Status, origem, parametros e acao do professor |
| Montagem Consolidada | Central do Aluno, visao tecnica | Versao, conflitos, validacao e liberacao operacional |
| Treino de hoje | Central do Aluno | Execucao pratica para professor e aluno |
| Check-in e feedback | Central do Aluno | Registro contextual da sessao |
| Indicadores globais da empresa | Administracao geral | Apenas indicadores individuais autorizados |

## Catalogo interno de templates

O sistema deve permitir templates internos versionados, criados e aprovados pela equipe da Acesso.

Cada template deve possuir, no minimo:

- nome;
- modalidade: corrida, musculacao, combinado ou outra capacidade suportada;
- objetivo;
- nivel;
- duracao em semanas;
- frequencia minima e maxima;
- pre-requisitos;
- restricoes e alertas;
- estrutura de semanas e sessoes;
- parametros editaveis;
- autor e revisor;
- versao;
- status: rascunho, em revisao, aprovado ou desativado;
- data da ultima revisao.

Ao aplicar um template ao aluno, o sistema deve criar uma copia individual versionada. Alterar o template original nao pode modificar silenciosamente planos ja aplicados.

### Catalogo inicial recomendado

Corrida:

- iniciacao corrida/caminhada;
- retorno gradual a corrida;
- base aerobica;
- primeiros 5 km;
- 5 km intermediario;
- 10 km;
- meia maratona;
- manutencao;
- melhora de limiar;
- melhora de VO2max;
- recuperacao pos-prova.

Musculacao:

- adaptacao anatomica;
- full body duas vezes por semana;
- full body tres vezes por semana;
- superior/inferior;
- resistencia muscular;
- hipertrofia basica;
- forca;
- forca para corredores;
- treino para pessoas idosas;
- treino em casa com peso corporal, halteres ou elasticos.

Combinado:

- duas corridas e dois treinos resistidos;
- tres corridas e dois treinos resistidos;
- quatro corridas e dois treinos resistidos;
- corrida com foco complementar em forca e mobilidade;
- manutencao de condicionamento com carga combinada.

## Sessao ciclica estruturada

Treinos de corrida e outras atividades ciclicas devem deixar de depender apenas de campos gerais ou texto livre.

A estrutura-alvo deve representar etapas ordenadas, como:

```text
Aquecimento
10 minutos em Z1-Z2

Bloco principal - repetir 4 vezes
5 minutos no pace alvo
2 minutos de recuperacao leve

Desaquecimento
10 minutos leves
```

Cada etapa deve prever:

- ordem;
- tipo: aquecimento, trabalho, recuperacao, desaquecimento ou repeticao;
- duracao por tempo ou distancia;
- valor da duracao;
- alvo por pace, velocidade, frequencia cardiaca, zona ou PSE;
- faixa minima e maxima;
- quantidade de repeticoes;
- inclinacao ou cadencia quando aplicavel;
- orientacao simples ao aluno;
- valor executado quando registrado.

A interface do aluno deve mostrar uma etapa por vez ou uma sequencia facil de acompanhar. A visao tecnica do professor pode mostrar todos os parametros e a comparacao planejado versus executado.

## Sessao resistida por blocos e series

O treino resistido deve permitir configuracao mais rica do que um unico conjunto de valores por exercicio.

Estrutura-alvo:

```text
Agachamento

Aquecimento
1 x 10 com 20 kg
1 x 6 com 35 kg

Series principais
3 x 6-8
RIR 2
Tempo 3-1-1
Descanso 120 s
```

Cada bloco ou serie deve prever:

- tipo: aquecimento, principal, tecnica, complementar ou finalizacao;
- ordem;
- series;
- repeticoes ou faixa de repeticoes;
- carga ou percentual de carga;
- RIR ou RPE;
- tempo de execucao;
- intervalo;
- observacao;
- valores executados;
- status de conclusao.

O sistema tambem deve suportar agrupamentos:

- superserie;
- bi-set;
- tri-set;
- circuito;
- bloco tecnico;
- bloco de mobilidade;
- finalizacao.

## Biblioteca de exercicios e substituicoes

A biblioteca deve evoluir como cadastro curado da empresa, com:

- nome e aliases;
- categoria e capacidade;
- equipamento;
- grupo muscular primario e secundario;
- padrao de movimento;
- articulacoes envolvidas;
- lateralidade;
- dificuldade;
- instrucoes em etapas;
- erros comuns;
- regressao e progressao;
- alternativas;
- restricoes e alertas;
- imagem ou video proprio/licenciado;
- autor, revisor, versao e status de curadoria.

Substituicoes devem ser sugeridas por padrao de movimento, objetivo, equipamento, nivel e restricoes. A troca deve registrar motivo e responsavel quando alterar o treino planejado.

Exercicio novo nao deve entrar automaticamente na biblioteca oficial sem revisao.

## Treinamento combinado

A Montagem Consolidada deve considerar a distribuicao conjunta de corrida, musculacao, flexibilidade e equilibrio.

Exemplos de alerta:

- treino intenso de membros inferiores antes de intervalado forte;
- longao seguido de forca pesada de membros inferiores;
- dois estimulos intensos consecutivos;
- baixa recuperacao antes de sessao de alta intensidade;
- dor ativa incompatível com exercicio ou volume;
- aumento relevante de volume sem justificativa;
- conflito entre restricao de mobilidade e amplitude prescrita.

O sistema deve sugerir revisao ou reorganizacao. Ele nao deve alterar automaticamente a semana ou a prescricao.

## Check-in pre-treino

Antes de iniciar, o aluno pode registrar:

- recuperacao percebida ou PSR;
- qualidade do sono;
- fadiga;
- dor ou desconforto;
- motivacao;
- disponibilidade de tempo;
- observacao livre curta.

### Contrato canonico do primeiro recorte

- **PSR:** inteiro de `0` a `10`, reutilizando a semantica ja adotada pelo produto sem inventar rotulos intermediarios ausentes.
- **Qualidade do sono:** inteiro de `0` a `10`, em que `0` representa qualidade pessima e `10` qualidade excelente.
- **Fadiga:** inteiro de `0` a `10`, em que `0` representa nenhuma fadiga e `10` fadiga extrema.
- **Motivacao:** inteiro de `0` a `10`, em que `0` representa nenhuma motivacao e `10` motivacao muito alta.
- **Disponibilidade de tempo:** minutos inteiros.
- **Dor/desconforto:** reutiliza a regra de triagem ja adotada no feedback pos-treino: `0-2` faixa verde, `3-4` atencao e `>4` alerta para acompanhamento. A faixa nao altera automaticamente o treino.
- Sono, fadiga, motivacao e PSR permanecem sinais independentes. O primeiro recorte nao cria score composto de prontidao nem thresholds clinicos adicionais sem regra aprovada.

### Politica temporal e idempotencia

- Enquanto a sessao estiver `not_started`, o check-in pode ser criado e alterado.
- Na primeira transicao da sessao para `in_progress`, o check-in vigente fica imutavel e permanece disponivel para consulta.
- Depois do inicio, nao existe criacao tardia, sobrescrita silenciosa ou backfill no fluxo comum.
- Eventual correcao historica futura deve usar mecanismo auditavel separado.
- Cada sessao possui no maximo um check-in canonico. Retry da mesma operacao logica nao pode duplicar check-in nem evento associado.

### Implementação canônica (#388)

- `PreWorkoutCheckIn` é a fonte única por sessão operacional e mantém os valores separados do `WorkoutDay`.
- A escrita do aluno é idempotente por chave lógica; a identidade do retry é calculada a partir do patch normalizado submetido, sem depender de campos alterados posteriormente por outra operação. Cada operação persistida alimenta a timeline apenas com referência e versão da regra.
- A imutabilidade é derivada do lifecycle da própria sessão: `planned` equivale a `not_started`; qualquer estado posterior torna o check-in somente leitura.
- A regra persistida `pre-workout-check-in-v1` implementa exclusivamente a triagem de dor/desconforto definida acima. Não existe score composto de prontidão, threshold adicional, bloqueio automático nem mutação de treino/prescrição.
- A visão do aluno recebe orientação prática. A visão do professor só recebe valores e contexto técnico do check-in quando houver concessão explícita do bloco sensível `students.details.preWorkoutCheckIn`; a permissão genérica `students.details.trainingPlans` não autoriza esses dados.

O check-in pode gerar alertas para o professor e orientacoes seguras para o aluno. Ele nao pode reduzir, trocar, cancelar ou modificar automaticamente a prescricao ou o treino liberado.

Quando houver alerta critico definido por regra aprovada, o sistema deve impedir que a experiencia sugira normalidade e deve orientar o aluno a procurar o professor ou atendimento apropriado conforme a regra vigente.

## Execucao e feedback pos-treino

O registro da execucao deve separar planejado e realizado.

Dados esperados:

- inicio e conclusao;
- execucao integral, parcial ou nao realizada;
- motivo de interrupcao ou nao realizacao;
- valores executados por etapa, exercicio, bloco ou serie;
- carga, repeticoes, tempo, distancia, pace, FC ou zona quando aplicavel;
- PSE;
- dor antes, durante e depois;
- dificuldade;
- substituicao realizada e motivo;
- observacao do aluno;
- observacao do professor.

O sistema deve preservar rascunho e falhas recuperaveis sem perder o que o aluno ja registrou.

### Lifecycle canonico do feedback pos-treino

- Antes da confirmacao, o cliente pode manter rascunho local/recuperavel sem torna-lo fonte canonica.
- O primeiro envio confirmado cria a revisao canonica inicial do feedback.
- Feedback confirmado e imutavel no fluxo comum: correcao posterior cria nova revisao vinculada a anterior; nao existe `UPDATE` destrutivo do historico.
- Apenas a revisao vigente e projetada como feedback atual, mas revisoes anteriores permanecem consultaveis para auditoria.
- Toda correcao exige motivo e registra ator, data/hora, revisao-base e campos alterados.
- A correcao nao pode trocar a sessao, aluno, `contractId` ou origem operacional do feedback.
- Retry da criacao ou correcao e idempotente e nao duplica feedback, timeline, alertas ou efeitos derivados.
- Duas correcoes concorrentes sobre a mesma revisao-base retornam conflito deterministico; nao existe politica de last-write-wins.
- Alertas, timeline, indicadores e decisoes derivadas devem apontar para a revisao correspondente ou ser reconciliados de forma deterministica, sem duplicacao.
- O professor nao pode reescrever silenciosamente a percepcao original do aluno. Complemento tecnico do professor deve permanecer como dado atribuido ao professor; uma correcao sobre resposta do aluno, quando autorizada, deve preservar autoria e trilha de revisao.
- A capacidade do aluno de corrigir o proprio feedback depende de permissao explicita do produto/backend; ausencia dessa permissao mantem o feedback somente leitura para o aluno apos confirmacao.


## Evolucao e apoio a decisao

A visao do aluno deve priorizar indicadores compreensiveis:

- sessoes realizadas na semana;
- consistencia recente;
- progresso de carga, tempo ou distancia quando comparavel;
- marcos atingidos;
- proximo treino;
- proxima avaliacao ou revisao;
- decisao pratica validada pelo professor.

A visao tecnica do professor pode incluir:

- prescritas versus realizadas;
- volume semanal e distribuicao por zonas;
- pace e duracao;
- tonelagem e volume por grupo muscular;
- evolucao de carga e repeticoes;
- RIR, PSE e PSR;
- substituicoes;
- sessoes interrompidas;
- alertas recorrentes;
- aderencia por mesociclo;
- comparacao planejado versus executado.

Decisoes sugeridas:

- manter;
- progredir;
- reduzir;
- trocar;
- suspender;
- reavaliar.

Toda decisao sugerida deve possuir justificativa, origem e status: sugerida, aprovada, rejeitada ou aplicada.

## Linguagem para o aluno

A interface deve:

- usar nomes legiveis em vez de siglas isoladas;
- explicar o objetivo pratico da sessao;
- mostrar unidade junto ao valor;
- evitar termos clinicos sem explicacao;
- diferenciar alerta, orientacao e bloqueio;
- nao expor justificativas internas, diagnosticos ou observacoes tecnicas sem finalidade e permissao.

Codigos tecnicos como `CEXT`, `CINT`, `IEXT` e `IINT` podem permanecer internamente, mas a interface deve apresentar nomes e descricoes compreensiveis.

## Permissoes, privacidade e rastreabilidade

Toda futura implementacao deve:

- filtrar dados por `contractId`;
- respeitar `screenKey`, `blockKey` e `dataScope` quando aplicavel;
- limitar o aluno aos proprios dados;
- limitar o professor aos alunos autorizados;
- separar mensagem pratica de justificativa tecnica;
- registrar origem, versao, data e responsavel;
- preservar historico de alteracoes relevantes;
- impedir que ocultacao de interface seja usada como unica barreira de seguranca.

## Ordem de evolucao recomendada

### Incremento 1 - experiencia diaria do aluno

- rotina semanal;
- treino de hoje compreensivel;
- status da sessao;
- check-in pre-treino;
- conclusao e feedback simples;
- retorno ao mesmo aluno na Central.

### Incremento 2 - catalogo interno e aplicacao individual

- templates versionados;
- biblioteca enriquecida;
- nomes amigaveis para metodos;
- copia individual do template;
- criterios de elegibilidade, progressao e regressao.

### Incremento 3 - representacao estruturada

- etapas de treino ciclico;
- blocos e series do treino resistido;
- superseries e circuitos;
- planejado versus executado por unidade de treino.

### Incremento 4 - evolucao e revisao

- indicadores individuais;
- historico integrado;
- alertas de conflito combinado;
- sugestoes de decisao;
- aprovacao ou rejeicao pelo professor.

### Incremento 5 - comunicacao e operacao

- lembretes;
- reagendamento;
- agenda e frequencia;
- mensagens praticas;
- relatorios individuais.

Integracoes com plataformas externas permanecem adiadas e nao devem bloquear nenhum incremento acima.

## Criterios de pronto para futuras epicas

Uma entrega de treinamento centrada no aluno so deve ser considerada pronta quando:

- parte de um aluno selecionado ou preserva explicitamente o contexto do aluno;
- possui visao pratica para o aluno e visao tecnica adequada ao professor;
- preserva planejado e executado;
- possui estados vazio, carregamento, erro e falha recuperavel;
- atualiza a Central apos salvar ou concluir;
- registra historico quando aplicavel;
- protege dados por permissao e `contractId`;
- nao altera prescricao sem validacao do professor;
- possui testes relevantes e validacao manual;
- atualiza as fontes de verdade afetadas.

## Fora do escopo atual

- integracoes com Garmin, Strava, TrainingPeaks ou outros provedores;
- sincronizacao em background;
- importacao de planos, textos, imagens ou videos proprietarios;
- prescricao ou progressao totalmente automatica;
- diagnostico clinico automatico;
- configuracao completa de catalogos dentro da Central do Aluno;
- substituicao destrutiva dos modelos atuais sem plano de migracao e compatibilidade.