# Issue 265 — agenda fixa no cadastro do aluno

## Status

Implementação concluída, validada e auditada sem ressalvas na branch da issue. Pull request aberta contra `develop`, sem merge.

## Objetivo

Integrar o conjunto semanal de horários fixos ao cadastro e à edição do aluno, com validação canônica de capacidade, disponibilidade do professor, conflitos, isolamento por contrato, sincronização histórica e proteção contra concorrência.

## Escopo entregue

- editor de recorrências no formulário do aluno, visível apenas para agenda fixa;
- consulta de uma linha ou do conjunto completo, com invalidação após edição;
- códigos e mensagens estáveis por linha;
- revalidação obrigatória no backend e indicação de disponibilidade alterada antes do salvamento;
- sincronização transacional do plano e do conjunto completo;
- inativação histórica de recorrências removidas;
- confirmação explícita em toda mudança de agenda fixa para livre;
- preservação dos agendamentos futuros materializados;
- advisory locks para disputa de capacidade;
- testes unitários, de interface e de integração PostgreSQL para ordem de validação, capacidade, conflitos, adjacência, concorrência, rollback, sincronização, transição de plano e edição do próprio slot;
- documentação do comportamento operacional.

## Decisões

- a recorrência não é inferida do contrato comercial;
- `spaceId` é obrigatório para novos horários fixos, mantendo compatibilidade com registros históricos antigos;
- reservas futuras materializadas permanecem intactas na mudança para agenda livre;
- a validação de agendamentos do professor ignora apenas reservas ligadas à própria recorrência editada;
- a consulta positiva é informativa e somente gera `FIXED_SCHEDULE_CHANGED` quando a mesma linha, ainda não alterada, falha na revalidação transacional.

## Validação concluída

- `pnpm type-check`;
- `pnpm lint`;
- `pnpm test` — web: 56 arquivos/229 testes; API: 83 suítes/370 testes;
- `pnpm arch:check`;
- `pnpm access:check`;
- `pnpm docs:check`;
- CI oficial `Validate PR` #2206 aprovado;
- auditoria funcional final e passagem adversarial aprovadas sem ressalvas.
