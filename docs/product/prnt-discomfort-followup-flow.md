# PRNT: fluxo contextual de desconfortos e acompanhamentos

## Issue relacionada

- #182
- Épica: #171

## Situação atual

O PRNT já possui duas bases relacionadas a desconfortos:

- `PainCasesEditor`: permite registrar casos de dor com título, região, data de início e descrição.
- `BodyDiscomfortMap`: permite salvar snapshots corporais com regiões, intensidade e observações.

Essas entregas permitem registrar informação sensível dentro do contexto do aluno, mas ainda não fecham o fluxo completo de acompanhamento contínuo.

## Lacuna funcional

Para concluir a #182 como fluxo completo, ainda é necessário diferenciar três conceitos:

1. **Desconforto ativo**
   - Registro que permanece aberto enquanto impacta avaliação, treino ou conduta.
   - Deve ter status claro, região, intensidade, descrição e data de início.

2. **Acompanhamento do desconforto**
   - Evento vinculado ao desconforto ativo.
   - Deve preservar data, responsável, evolução, conduta e observações.

3. **Encerramento do desconforto**
   - Ação que altera o status sem apagar histórico.
   - Deve registrar data de encerramento e motivo/status final.

## Fluxo recomendado

### 1. Resumo na Central do Aluno

A Central deve exibir:

- quantidade de desconfortos ativos;
- último acompanhamento quando existir;
- maior intensidade atual;
- ação para abrir PRNT no aluno selecionado.

### 2. PRNT como ponto de edição

Dentro do PRNT, o professor deve conseguir:

- criar novo desconforto;
- editar descrição, região, intensidade e status;
- registrar acompanhamento rápido;
- encerrar desconforto sem excluir histórico;
- consultar histórico filtrado por desconforto.

### 3. Histórico unificado

Cada evento relevante deve aparecer no histórico do aluno:

- criação do desconforto;
- alteração de status;
- novo acompanhamento;
- encerramento.

## Permissões e dados sensíveis

- Visualização: `physicalAssessment.prnt.discomforts`.
- Criação/edição: `physicalAssessment.prnt.actions.createRecord` e `physicalAssessment.prnt.actions.editRecord`.
- Encerramento: `physicalAssessment.prnt.actions.closeFollowUp` ou permissão específica futura.
- Todos os dados devem respeitar escopo, aluno selecionado e `contractId`.

## Próxima implementação recomendada

Criar uma entrega técnica para:

1. Confirmar se `ProntuarioPainCase` será o agregado principal de desconfortos ativos.
2. Adicionar UI de status no `PainCasesEditor`.
3. Exibir acompanhamentos de cada caso de dor.
4. Permitir adicionar acompanhamento rápido.
5. Permitir encerrar caso mantendo histórico e `closedAt`.
6. Atualizar a Central com resumo de desconfortos ativos.

## Critério para fechar #182

A #182 deve ser fechada somente quando houver, além do mapa/snapshot existente:

- desconfortos ativos com status;
- acompanhamento vinculado;
- encerramento sem perda de histórico;
- resumo na Central;
- proteção por permissão.
