# Montagem Consolidada da Prescricao

Este documento registra o primeiro recorte tecnico da issue #137. A Montagem Consolidada e a camada intermediaria obrigatoria entre as prescricoes por capacidade e qualquer saida operacional de treino.

## Responsabilidades

- Receber blocos ativos e validados de resistido, flexibilidade, ciclico e equilibrio.
- Registrar aluno, contrato, professor responsavel, versao, status e justificativa.
- Preservar origem dos blocos e dos dados-base usados.
- Detectar conflitos antes da liberacao operacional.
- Separar observacao tecnica, justificativa do professor e instrucao pratica para o aluno.
- Exigir validacao do professor antes de preparar qualquer saida operacional.

## Regras de seguranca

- Capacidade fisica nao envia treino diretamente para `Treino de hoje`.
- Montagem em rascunho ou pronta para revisao nao libera treino operacional.
- Conflitos criticos bloqueiam a liberacao mesmo quando a montagem estiver aprovada.
- Dados vindos de PRNT, ANTR, ADPT, rotina ou observacao manual devem ser rastreaveis ate a origem.
- Exercicios novos e substituicoes por grupamento muscular continuam como cadastros/fila de curadoria, nao como importacao automatica.

## Status previstos

- `draft`: montagem em rascunho.
- `ready_for_review`: pronta para revisao final do professor.
- `approved`: validada pelo professor e sem conflito critico.
- `released`: liberacao operacional preparada.
- `blocked`: montagem bloqueada por conflito, alerta ou escopo.
- `archived`: versao antiga preservada historicamente.

## Limites deste recorte

- Nao cria migration nem persistencia nova.
- Nao altera planos, templates, dias, exercicios planejados ou execucoes atuais.
- Nao implementa feedback pos-treino.
- Nao implementa decisao sugerida automatica.
- Nao gera `Treino de hoje` diretamente.

## Proxima evolucao

A proxima etapa deve persistir a montagem, conectar permissoes e escopo por contrato/aluno, e criar rastreabilidade ate a saida operacional gerada quando a Montagem Consolidada estiver validada.
