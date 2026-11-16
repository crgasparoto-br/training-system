# Feedback pós-treino e decisão profissional (#138, #390, #406)

## Separação das responsabilidades

O feedback canônico da issue #390 é armazenado em revisões imutáveis por sessão e por capacidade. Uma correção cria uma nova revisão e não altera silenciosamente a percepção original. A issue #406 cria um domínio de **decisão profissional separado**, usando a revisão canônica do feedback como origem.

A decisão grava aluno, contrato, sessão, plano, revisão de origem, regra, ação, justificativa, autor, data e um snapshot congelado dos sinais e valores do feedback. Uma correção posterior do feedback não reescreve o histórico.

## Fluxo e efeitos

- **suggested, versão 1:** professor registra sugestão de manter, progredir, reduzir, substituir, suspender ou reavaliar; nenhuma prescrição é modificada.
- **approved, versão 2:** professor aprova explicitamente; registra identidade, data e motivo opcional.
- **rejected, versão 2:** professor rejeita com identidade, data e motivo obrigatório; estado terminal.
- **applied, versão 3:** professor com permissão de aplicação registra uma nova versão imutável de orientação técnica do plano, para início futuro, no mesmo commit transacional da decisão, evento da timeline e operação idempotente; estado terminal.

Somente a decisão aprovada pode ser aplicada. A aplicação cria um registro de **alteração de planejamento futuro** vinculado ao TrainingPlan: versão, período de vigência, ação, instrução, professor e evidências. Não modifica automaticamente exercícios, cargas, prescrição consolidada nem sessões já liberadas. Para alterar um treino operacional, é preciso o fluxo explícito de edição e liberação existente. A avaliação clínica combinada da issue #403 continua não homologada; não gera decisões automáticas.

A nomenclatura antiga de sugestão em memória usa a ação swap, enquanto a API persistida usa replace (substituir). Esses contratos não são intercambiáveis.

## API e contratos

Base: /api/v1/training-decisions.

| Rota | Método | Finalidade |
| --- | --- | --- |
| /alunos/:alunoId/sources | GET | Fontes atuais do feedback paginadas; cursor opcional |
| /alunos/:alunoId | GET | Histórico técnico e versões de planejamento |
| /alunos/:alunoId | POST | Criar sugestão com operationKey, workoutDayId, sourceFeedbackRevisionId, action, rationale e mensagem opcional |
| /alunos/:alunoId/:decisionId/approve | POST | Aprovar com operationKey, expectedVersion, reason opcional |
| /alunos/:alunoId/:decisionId/reject | POST | Rejeitar com operationKey, expectedVersion, reason obrigatório |
| /alunos/:alunoId/:decisionId/apply | POST | Aplicar com operationKey, expectedVersion, expectedPlanningVersion, effectiveFrom (AAAA-MM-DD futura) e instruction |
| /student/me | GET | Mensagens práticas já aplicadas e explicitamente expostas |

O serviço valida novamente ator ativo, bloco de acesso, escopo e pertencimento ao contrato **dentro da transação**, com bloqueios compartilhados dos vínculos, concessões e atribuições para que revogações concorrentes aguardem a conclusão da operação autorizada. A criação bloqueia a sessão de execução; a revisão bloqueia a decisão; a aplicação bloqueia também o plano. A mesma chave e o mesmo payload não geram eventos, operações ou versões duplicadas. Reutilização de chave com conteúdo diferente, versão esperada desatualizada e conflito no planejamento retornam HTTP 409.

O banco impede inclusões que não comecem em `suggested`/versão 1, exclusões e alterações retroativas do histórico, mudanças fora da máquina de estados e aplicação sem registro de efeito antes do commit. Erros em qualquer etapa revertem a transação inteira. A aplicação valida a data futura **dentro da vigência atual do plano** (início e fim), após adquirir o bloqueio e reler o plano, não usando o período consultado antes da trava.

A consulta profissional de histórico é paginada (até 100 decisões por página) pelo parâmetro opcional de cursor; a resposta inclui nextCursor para continuar sem ocultar decisões antigas. O backend valida se o cursor pertence ao aluno e contrato autorizados. A consulta de fontes também usa lotes de até 100 **sessões/escopos distintos**, ordenando as últimas revisões antes de paginar; responde `{sources, nextCursor}` e rejeita cursors de outros contratos, inexistentes ou que deixaram de apontar para a revisão atual.

## Permissões e exposição ao aluno

Blocos específicos: students.details.trainingDecisions.view, .suggest, .approve e .apply. A aplicação exige **concessão persistida distinta inclusive para professor master**. Operações técnicas também requerem o grant explícito de students.details.postWorkoutFeedback, mais escopo válido de plans e acesso aluno/contrato. O histórico de auditoria genérico não concede acesso clínico.

A rota do aluno consulta apenas sua associação ativa, exige contrato explícito quando houver múltiplos, e expõe somente mensagem prática de decisão com status applied e exposeToStudent verdadeiro. Justificativa técnica, snapshot clínico, sugestões pendentes e rejeições permanecem ocultos. Eventos na timeline têm status, versão, vínculos e data, sem evidência clínica.

## Execução e validação

Migration: apps/api/prisma/migrations/20261116130000_issue_406_training_decisions. Schema: apps/api/prisma/schema.prisma. Executar pnpm validate e o workflow Validate PR no SHA final, com PostgreSQL real para os cenários críticos, validações de acesso, segurança, arquitetura e documentação. O histórico imutável é intencional.
