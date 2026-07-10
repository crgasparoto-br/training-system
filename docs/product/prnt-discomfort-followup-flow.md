# PRNT: fluxo contextual de desconfortos e acompanhamentos

## Issues relacionadas

- #182
- Épica #171

## Status

Fluxo funcional implementado.

As entregas principais foram realizadas nas PRs #207, #208 e #209.

## Modelo funcional

O fluxo diferencia três conceitos.

### Desconforto ativo

Registro que permanece aberto enquanto impacta avaliação, treino ou conduta.

Deve preservar:

- título;
- região;
- data de início;
- descrição;
- status;
- vínculo com o registro PRNT e o aluno.

### Acompanhamento do desconforto

Evento vinculado a um desconforto.

Deve preservar:

- data;
- intensidade quando informada;
- observação;
- conduta;
- vínculo com o caso de origem.

### Encerramento

Alteração de status para resolvido ou arquivado sem apagar o histórico do caso nem seus acompanhamentos.

## Experiência atual

### Central do Aluno

A Central apresenta um resumo contextual com:

- quantidade de casos ativos ou em acompanhamento;
- último acompanhamento disponível;
- intensidade mais recente quando informada;
- alerta técnico quando existe caso ativo;
- ação para abrir o PRNT preservando o `alunoId`.

### PRNT

O PRNT permite:

- visualizar casos existentes;
- criar novo desconforto;
- editar título, região, data, descrição e status;
- registrar acompanhamento com data, intensidade, observação e conduta;
- marcar caso como resolvido;
- manter os acompanhamentos anteriores no histórico do caso.

## Componentes e contratos atuais

- `apps/web/src/pages/PhysicalAssessment/ProntuarioScreenWithDiscomfortFollowUps.tsx`;
- `apps/web/src/components/alunos/AlunoDiscomfortSummaryCard.tsx`;
- `apps/web/src/services/prontuario.service.ts`;
- `apps/api/src/modules/prontuario/prontuario.service.ts`;
- `packages/types/prontuario.ts`.

## Permissões e dados sensíveis

- A visualização deve respeitar os blocos de saúde/PRNT aplicáveis ao perfil.
- A API continua sendo a barreira de segurança.
- Todos os registros e vínculos devem respeitar `contractId` e o aluno selecionado.
- A Central não deve expor dados de saúde para perfis sem acesso ao bloco correspondente.

## Pendências reais

O fluxo principal da #182 foi entregue. Permanecem como evoluções possíveis, não como requisito para considerar o fluxo atual funcional:

- registrar todos os eventos de criação, acompanhamento e encerramento no histórico unificado do aluno;
- formalizar permissão específica de encerramento caso a regra de acesso seja separada no futuro;
- revisar necessidade de motivo de encerramento estruturado;
- ampliar cobertura automatizada do editor completo do PRNT.

## Critério de manutenção

Atualize este documento quando mudar:

- o agregado usado para representar desconfortos;
- o contrato de acompanhamento;
- as permissões do fluxo;
- a integração com o histórico unificado;
- a experiência da Central ou do PRNT.

Documentos de plano antigos não devem repetir este conteúdo. Devem apontar para esta fonte de verdade.
