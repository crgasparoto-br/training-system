# Plano de execução: issue #398 — etapas cíclicas estruturadas

## Objetivo
Oferecer prescrição cíclica ordenada em vez de depender somente do texto livre, mantendo a árvore operacional única e preservando o histórico.

## Contexto e dependências
Epic #397, tela de Montagem #414 e #399 (precedente de blocos resistidos e bloqueios históricos). A execução de etapas e a comparação do planejado com o realizado pertencem às issues #489 e #401.

## Fora de escopo
Uma nova árvore de treinos, a execução/feedback do aluno, backfill artificial de texto legado e qualquer merge automático.

## Arquivos e módulos
- Prisma principal e espelho: `WorkoutDay -> WorkoutCyclicStage` e migrations.
- API: `cyclic-stages.domain.ts`, `workout-week-structure.service.ts`, `workout.service.ts`, `workout-copy.service.ts`, `training-routine.service.ts`, rotas de montagem.
- Web: `CyclicStagesEditor.tsx`, `WorkoutBuilderCyclic.tsx`, `workout-builder-structure.ts`, `TrainingRoutinePanel.tsx` e contratos compartilhados.

## Regras e restrições
- `contractId` de professor deve ser verificado antes da edição e dentro da transação.
- Não alterar prescrições com liberação operacional ou com histórico de execução (incluindo SQL direto).
- Não inventar alvos/durações para registros legados; `undefined` significa manter a estrutura; `[]` limpa apenas a estrutura editável.
- Sequência e repetições preservam ordem, tipos e valores; IDs de novas cópias devem ser novos.

## Passos
- [x] Modelagem aditiva e domínio de validação.
- [x] Integração transacional de rotas, save semanal, cópias e rotina do aluno.
- [x] Editor da aba Cíclico e projeção de leitura.
- [ ] Testes focados de segurança, casos válidos e regressões.
- [ ] `pnpm validate` verde no head final.
- [ ] Auditoria independente no mesmo SHA final.

## Validação manual
1. Prescrever aquecimento, quatro voltas de trabalho de 90 s + recuperação de 90 s e desaquecimento, com FC-alvo.
2. Recarregar e confirmar duração, faixa, ordem e IDs persistidos.
3. Consultar sessão no painel do aluno, inclusive quando houver resistido no mesmo dia.
4. Preservar texto legado sem estrutura, copiar só cíclico e copiar a semana integral para outro período.
5. Liberar/iniciar sessão e verificar que UI, API e SQL rejeitam mudanças de planejamento com erro seguro.

## Decisões e pendências
Sem merge, sem remoção de artefatos antigos. CI e auditoria independentes serão realizados contra o SHA definitivo; não certificar prematuramente.
