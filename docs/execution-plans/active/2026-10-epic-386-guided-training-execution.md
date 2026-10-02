# Plano: Epic #386 - experiencia guiada de treinamento do aluno

## Objetivo

Transformar o `Treino de hoje` de uma ficha predominantemente consultiva em uma sessao guiada e interativa, preservando a cadeia canonica de planejamento e separando explicitamente o que foi prescrito do que o aluno executou.

Este plano detalha a execucao da epic #386 e suas dependencias com a epic estrutural #397.

## Fontes consultadas

- `AGENTS.md`;
- `ARCHITECTURE.md`;
- `docs/product/roadmap.md`;
- `docs/product/integrated-prescription-control.md`;
- `docs/product/student-centered-training-experience.md`;
- `docs/execution-plans/active/2026-07-student-central-roadmap.md`;
- planilha de referencia funcional "Planilha 46 - Claudinei Gasparoto.xlsx", usada como exemplo de apresentacao atual de semanas, exercicios, sistemas, series, repeticoes, cargas e intervalos.

A planilha e referencia de produto, nao fonte de verdade de implementacao. Codigo, migrations, testes e documentacao versionada continuam definindo o comportamento entregue.

## Resultado esperado

O aluno deve conseguir:

1. consultar a rotina semanal e abrir o Treino de hoje;
2. realizar check-in pre-treino;
3. iniciar a sessao;
4. executar o treino resistido uma unidade por vez;
5. registrar carga e repeticoes realizadas sem alterar os valores prescritos;
6. executar corretamente seriado, superserie, bi-set, tri-set e circuito;
7. ter o descanso controlado automaticamente na transicao correta;
8. executar sessoes ciclicas por etapas de trabalho e recuperacao;
9. pausar, retomar e recuperar a sessao apos refresh ou falha;
10. concluir o treino e registrar feedback/PSE;
11. retornar a Central do Aluno com o mesmo aluno e estado atualizado.

## Fronteiras arquiteturais

Fluxo canonico:

```text
Prontuario / Avaliacao
  -> Prescricao por capacidades
  -> Montagem Consolidada
  -> TrainingPlan / WorkoutTemplate / WorkoutDay / WorkoutExercise
  -> Treino de hoje
  -> Sessao de execucao
  -> Feedback
  -> Evolucao / revisao do professor
```

Invariantes:

- `contractId` continua sendo a barreira multi-tenant;
- #389 e a unica autoridade do lifecycle da sessao;
- #398 e a unica autoridade das etapas ciclicas estruturadas;
- #399 e #400 sao a autoridade de blocos, series e agrupamentos resistidos;
- planejado e executado nunca compartilham a mesma autoridade de dados;
- refresh, retry ou reinicio do cliente nao podem depender apenas de memoria local;
- timers devem ser reconstruiveis por timestamps persistidos;
- nenhuma execucao altera automaticamente prescricao, montagem ou treino futuro;
- o aluno recebe linguagem pratica; detalhes tecnicos continuam sujeitos a permissao.

## Issues e responsabilidades

### Epic funcional

- #386 - experiencia diaria do aluno.

### Base da experiencia

- #387 - rotina semanal e Treino de hoje; contrato de leitura implementado (`docs/execution-plans/active/2026-10-issue-387-weekly-routine-today-workout.md`), controles de execucao aguardam a #389;
- #388 - check-in pre-treino;
- #389 - execucao e lifecycle da sessao;
- #390 - feedback pos-treino;
- #391 - retorno e atualizacao da Central.

### Estrutura de treino

- #397 - epic de representacao estruturada;
- #398 - etapas estruturadas de treino ciclico;
- #399 - blocos e series resistidas;
- #400 - superseries, bi-sets, tri-sets e circuitos;
- #401 - comparacao planejado versus executado.

### Experiencia guiada

- #487 - modo guiado resistido;
- #488 - cronometro e transicoes de descanso;
- #489 - executor guiado ciclico.

## Ordem de implementacao

```text
#387 -> #388
  |
  +--> #389 -------------------------------> #390 -> #391
          |                                    ^
          +--> #487 --> #488 -----------------+
          |
          +--> #489 --------------------------+

#399 --> #400 --> #487 --> #488
#398 -----------> #489
#398/#399/#400 + #389 -----------------------> #401
```

A implementacao pode paralelizar #398 e #399. #487 nao deve inventar agrupamentos antes de #400. #489 nao deve inferir etapas ciclicas antes de #398.

## Contrato do modo guiado resistido

A interface deve mostrar predominantemente a unidade que o aluno precisa executar agora.

Exemplo conceitual:

```text
Bi-set - rodada 2 de 3

Supino
10 repeticoes
Carga prescrita: 47 kg
Carga realizada: 47 kg

[Concluir serie]

Proximo: Crucifixo inverso
```

Ao concluir uma unidade:

- se houver proximo item na mesma rodada do agrupamento, avancar para ele;
- se for o ultimo item da rodada e houver descanso, iniciar o descanso;
- se houver nova rodada, voltar ao primeiro item;
- se o agrupamento terminou, seguir para a proxima unidade do treino.

O proximo item deve vir da ordem persistida, nunca de heuristica do frontend.

## Contrato de descanso

Para treino seriado, o descanso inicia depois da serie quando houver intervalo aplicavel.

Para agrupamentos:

```text
Supino
  -> Crucifixo inverso
  -> descanso
  -> Supino
  -> Crucifixo inverso
  -> descanso
```

Em tri-set:

```text
A -> B -> C -> descanso -> A -> B -> C -> descanso
```

Regras:

- o intervalo prescrito e imutavel como parte do planejamento historico;
- o descanso realizado e registrado separadamente;
- `+15 s` afeta apenas a execucao atual;
- `Pular descanso` registra que o descanso real foi menor;
- refresh/background recalcula o restante por timestamps;
- som/vibracao e opcional e depende da permissao da plataforma.

## Contrato de execucao ciclica

Uma sessao como:

```text
4 x (
  1m30 trabalho a 153-159 bpm / 17,2-18,2 km/h
  1m30 recuperacao
)
```

deve ser executada como etapas ordenadas com:

- rodada atual e total;
- tipo da etapa;
- tempo ou distancia;
- alvo e unidade;
- proxima etapa;
- valores executados quando informados.

O timer temporal segue a mesma regra de timestamps persistidos usada pelo descanso resistido.

## Planejado versus executado

Exemplo resistido:

| Serie | Prescrito | Realizado | Carga prescrita | Carga realizada |
| --- | ---: | ---: | ---: | ---: |
| 1 | 10 | 10 | 47 kg | 47 kg |
| 2 | 10 | 10 | 47 kg | 47 kg |
| 3 | 10 | 8 | 47 kg | 47 kg |

O sistema pode pre-preencher o realizado com o valor prescrito para reduzir interacao, mas a confirmacao gera dado de execucao independente.

## Recuperacao, idempotencia e concorrencia

Toda acao mutavel relevante deve ser reconstruivel e segura para retry:

- concluir serie/etapa;
- iniciar descanso;
- adicionar tempo;
- pular descanso;
- pausar;
- retomar;
- concluir sessao;
- enviar feedback.

O mesmo comando repetido nao pode duplicar unidade executada, rodada, timer, evento ou feedback. Em conflito concorrente, o cliente deve reconciliar com o estado canônico do backend e nunca exibir sucesso ficticio.

## UX e acessibilidade

- mobile e o viewport prioritario da execucao;
- a acao primaria deve permanecer facil de alcancar;
- nao depender apenas de cor para trabalho, descanso, alerta ou conclusao;
- manter foco e semantica acessiveis;
- permitir sair para a visao geral e voltar a mesma posicao;
- preservar dados informados em falha recuperavel.

## Fora de escopo deste ciclo

- Garmin, Strava, TrainingPeaks e smartwatch;
- coleta automatica de frequencia cardiaca;
- progressao automatica de carga;
- alteracao automatica de prescricao;
- coaching ou voz por IA;
- metrônomo de cadencia;
- importacao de midia proprietaria;
- decisao autonoma sobre substituicoes.

## Validacao

Cada issue deve executar validacoes proporcionais ao risco e, antes da conclusao, o conjunto integrado deve incluir:

- testes de dominio da maquina de estados;
- testes de idempotencia e concorrencia;
- testes de API com isolamento por `contractId`;
- testes de temporizacao com relogio controlado;
- testes web de fluxo guiado e retomada;
- cenarios mobile/desktop;
- acessibilidade das acoes principais;
- refresh/background e retry;
- `pnpm validate`;
- auditoria independente do candidato final conforme fluxo do repositorio.

## Criterio de conclusao da epic

A #386 somente pode ser considerada concluida quando o aluno conseguir iniciar uma sessao liberada, executar resistido e ciclico nos recortes suportados, recuperar o estado apos interrupcao, registrar realizado e feedback e retornar a Central sem que nenhuma dessas operacoes altere silenciosamente o planejamento original.
