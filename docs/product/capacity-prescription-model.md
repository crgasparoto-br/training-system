# Prescricao por capacidades fisicas

Este documento registra o primeiro recorte tecnico da issue #136. A prescricao por capacidade e uma camada anterior a Montagem Consolidada e nao publica Treino de hoje diretamente.

## Capacidades iniciais

- Resistido.
- Flexibilidade.
- Ciclico.
- Equilibrio.

## Contrato minimo de cada capacidade

Cada rascunho de capacidade deve carregar:

- aluno;
- contrato;
- professor responsavel;
- capacidade fisica;
- status: planejado, ativo, em ajuste, suspenso ou finalizado;
- versao;
- origens tecnicas usadas;
- objetivos do PRNT vinculados quando existirem;
- justificativa tecnica para o professor;
- resumo tecnico para o professor;
- mensagem pratica segura para o aluno;
- alertas e condicionantes;
- parametros tecnicos da capacidade;
- indicador explicito de que nao publica Treino de hoje.

## Origens tecnicas

As origens devem manter identificacao, rotulo, data de avaliacao quando houver, origem legivel, versao e professor responsavel quando disponivel.

Fontes previstas:

- objetivos e alertas do PRNT;
- avaliacao fisica;
- antropometria;
- adipometria;
- bioimpedancia;
- ultrassom;
- ventilometria;
- avaliacao de flexibilidade;
- preferencia ou restricao do aluno;
- anotacao do professor.

## Limites deste recorte

- Nao cria migration nem persistencia nova.
- Nao altera `TrainingPlan`, `PeriodizationMatrix`, `WorkoutTemplate`, `WorkoutDay`, `WorkoutExercise`, `TrainingExecution` ou `WorkoutExecution`.
- Nao implementa Montagem Consolidada.
- Nao gera Treino de hoje.
- Nao copia justificativa tecnica sensivel para a mensagem do aluno.

## Proxima evolucao

A proxima etapa deve conectar este contrato a uma API persistente com filtro por contrato, aluno e permissao efetiva, adicionando migrations e seeds/demo quando o modelo de dados estiver fechado.
