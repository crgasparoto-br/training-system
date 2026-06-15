# Feedback pos-treino e decisao sugerida

Este documento registra o primeiro recorte tecnico da issue #138. O feedback pos-treino amplia a execucao atual sem substituir `WorkoutDay`, `WorkoutExercise` ou `WorkoutExecution`.

## Responsabilidades

- Vincular feedback ao Treino de hoje executado.
- Preservar relacao com aluno, contrato, professor responsavel e montagem consolidada quando existir.
- Registrar feedback unico por sessao, separado por capacidade quando aplicavel.
- Consolidar PSE, PSR, dor, desconforto, dificuldade, carga usada, repeticoes realizadas, aderencia e observacoes.
- Criar decisao sugerida: manter, progredir, reduzir, trocar, suspender ou reavaliar.
- Exigir validacao final do professor antes de aplicar qualquer decisao.
- Alimentar linha do tempo e relatorios evolutivos.

## Separacao professor/aluno

A visao do professor pode conter origem dos dados, indicadores, justificativa tecnica, alertas e historico. A visao do aluno deve manter linguagem pratica, clara e segura, sem expor justificativa tecnica completa.

## Regras de seguranca

- Decisao sugerida nasce sempre com status `suggested`.
- Uma decisao so pode virar `applied` apos status `approved`, professor aprovador e data de aprovacao.
- Mesmo aplicada, a decisao nao altera prescricao automaticamente neste recorte.
- Dor relevante, tontura, fadiga alta ou falta devem marcar necessidade de acompanhamento no PRNT.

## Limites deste recorte

- Nao cria migration nem persistencia nova.
- Nao substitui execucoes atuais.
- Nao implementa decisao autonoma, IA ou smartwatch.
- Nao altera prescricao ou treino liberado automaticamente.

## Proxima evolucao

A proxima etapa deve persistir feedback e decisoes, conectar permissao por visao professor/aluno e expor a linha do tempo de evolucao por periodo.
