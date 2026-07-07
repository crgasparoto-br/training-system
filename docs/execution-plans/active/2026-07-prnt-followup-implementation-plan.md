# Plano técnico: acompanhamento de desconfortos no PRNT

## Issue

- #182

## Decisão técnica

O backend já possui suporte para `ProntuarioPainCase` com `followUps`, `status` e `closedAt`. A próxima entrega funcional deve concentrar-se na UI do PRNT e na atualização do resumo da Central do Aluno.

## Arquivos principais

- `apps/web/src/pages/PhysicalAssessment/ProntuarioScreen.tsx`
- `apps/api/src/modules/prontuario/prontuario.service.ts`
- `packages/types/prontuario.ts`
- `apps/web/src/components/alunos/AlunoResumoHubTab.tsx`

## Implementação recomendada

1. Atualizar `PainCasesEditor` para expor status do caso.
2. Exibir acompanhamentos existentes de cada caso.
3. Permitir adicionar acompanhamento com data, intensidade, observação e conduta.
4. Permitir marcar caso como resolvido/arquivado sem remover histórico.
5. Preservar `alunoId` e o registro PRNT selecionado após salvar.
6. Atualizar card/resumo da Central para mostrar contagem de casos ativos e último acompanhamento.

## Validações mínimas

- Caso sem título não deve ser salvo.
- Acompanhamento vazio não deve ser criado.
- Encerramento deve gerar status terminal e manter `closedAt`.
- Usuário sem permissão de PRNT não deve ver os dados sensíveis.

## Critério para fechar a #182

A #182 só deve ser fechada depois de uma PR funcional com UI de acompanhamento e encerramento, além do resumo na Central do Aluno.