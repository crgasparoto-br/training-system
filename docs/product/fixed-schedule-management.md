# Agenda fixa do aluno

## Objetivo

O plano de agenda fixa registra o conjunto semanal recorrente do aluno. Cada recorrência informa dia da semana ISO (`1` para segunda-feira e `7` para domingo), início, fim, espaço da academia e professor responsável.

## Fonte de verdade

A validação canônica está no backend. A checagem exibida no formulário é informativa e sempre é repetida durante a gravação, dentro da mesma transação que altera o plano do aluno e sincroniza as recorrências.

## Ordem obrigatória de validação

1. **Academia/espaço**: o espaço deve pertencer ao mesmo contrato, estar ativo e possuir capacidade durante todo o intervalo. A capacidade considera outros `FixedScheduleSlot` ativos que se sobreponham ao período.
2. **Professor**: o professor deve pertencer ao mesmo contrato e estar ativo; a disponibilidade precisa cobrir integralmente o intervalo; não pode existir outro horário fixo nem agendamento ativo aplicável no mesmo período.
3. **Aluno**: recorrências do mesmo aluno no mesmo dia não podem se sobrepor, mesmo quando usam espaços ou professores diferentes. Intervalos adjacentes são aceitos.

Quando a etapa do espaço falha, o retorno contém somente o motivo principal dessa etapa; o professor não é classificado como disponível.

## Sincronização e histórico

- `free -> fixed`: exige ao menos uma recorrência válida.
- edição de `fixed`: o payload representa o conjunto completo. Linhas com `id` são atualizadas, linhas novas são criadas e linhas removidas são inativadas.
- `fixed -> free`: exige confirmação explícita em qualquer transição. Quando existirem agendamentos futuros materializados, a mensagem também informa que eles serão preservados para decisão operacional separada.
- recorrências nunca são excluídas fisicamente pelo fluxo do cadastro.
- qualquer falha cancela toda a transação; plano e recorrências não ficam parcialmente gravados.

## Concorrência

A gravação adquire advisory locks transacionais do PostgreSQL para aluno, espaço/dia e professor/dia em ordem determinística. Depois dos locks, todas as regras são revalidadas. Em disputa pela última vaga, somente a primeira transação válida conclui; a seguinte recebe o código estável `SPACE_CAPACITY_FULL` ou outro conflito efetivamente encontrado.

## Códigos de erro

A API retorna mensagem em português e código estável, entre eles:

- `FIXED_SCHEDULE_REQUIRED`
- `INVALID_DAY_OF_WEEK`
- `INVALID_TIME_RANGE`
- `SPACE_NOT_FOUND`
- `SPACE_INACTIVE`
- `SPACE_CAPACITY_FULL`
- `PROFESSOR_NOT_FOUND`
- `PROFESSOR_INACTIVE`
- `PROFESSOR_OUTSIDE_AVAILABILITY`
- `PROFESSOR_FIXED_SLOT_CONFLICT`
- `PROFESSOR_BOOKING_CONFLICT`
- `STUDENT_FIXED_SLOT_CONFLICT`
- `FIXED_SLOT_NOT_FOUND`
- `FIXED_TO_FREE_CONFIRMATION_REQUIRED`
- `FUTURE_BOOKINGS_CONFIRMATION_REQUIRED`
- `FIXED_SCHEDULE_CHANGED`
