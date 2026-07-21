# Issue 265 — agenda fixa no cadastro do aluno

## Status

Implementação concluída na branch da issue; arquivamento deste plano após merge.

## Objetivo

Integrar o conjunto semanal de horários fixos ao cadastro e à edição do aluno, com validação canônica de capacidade, disponibilidade do professor, conflitos, isolamento por contrato, sincronização histórica e proteção contra concorrência.

## Escopo entregue

- editor de recorrências no formulário do aluno, visível apenas para agenda fixa;
- consulta de uma linha ou do conjunto completo, com invalidação após edição;
- códigos e mensagens estáveis por linha;
- revalidação obrigatória no backend;
- sincronização transacional do plano e do conjunto completo;
- inativação histórica de recorrências removidas;
- confirmação ao mudar de fixo para livre quando há reservas futuras;
- advisory locks para disputa de capacidade;
- testes unitários da ordem de validação, sobreposição, transição e locks;
- documentação do comportamento operacional.

## Decisões

- a recorrência não é inferida do contrato comercial;
- `spaceId` é obrigatório para novos horários fixos, mantendo compatibilidade com registros históricos antigos;
- reservas futuras materializadas permanecem intactas na mudança para agenda livre;
- a validação de agendamentos do professor ignora apenas reservas ligadas à própria recorrência editada.

## Validação

Executar `pnpm validate` e revisar os checks do pull request antes do merge.
