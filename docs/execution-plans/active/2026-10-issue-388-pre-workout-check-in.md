# Plano de execução — Issue #388 — Check-in pré-treino

## Objetivo

Implementar o check-in pré-treino canônico para sessões liberadas, preservando isolamento por `contractId`, idempotência, imutabilidade após o primeiro início e separação entre orientação prática do aluno e contexto técnico do professor.

## Contexto e dependências

- Base: `develop` após a entrega da #387.
- Sessão operacional: `WorkoutDay`; `planned` é a representação persistida atual de `not_started`.
- A #389 continuará dona do lifecycle completo da sessão. A #388 apenas observa e bloqueia a mutação do check-in fora de `not_started`.
- Fonte de regras: `docs/product/student-centered-training-experience.md#check-in-pre-treino`.

## Implementação

- Persistir um `PreWorkoutCheckIn` canônico por `WorkoutDay`.
- Persistir operações idempotentes por `operationKey` e fingerprint do payload.
- Revalidar sessão liberada, aluno, contrato e estado dentro de transação serializável com lock da sessão.
- Registrar evento referencial em `StudentLifecycleEvent`, sem duplicar os dados sensíveis.
- Aplicar somente a triagem aprovada de dor/desconforto: 0–2 verde, 3–4 atenção e >4 alerta, sem bloqueio ou alteração automática do treino.
- Projetar o check-in na rotina compartilhada; aluno recebe linguagem prática e professor recebe regra/versionamento técnico.
- Expor escrita somente em `/student/me`; professor permanece somente leitura pela rotina da Central.
- Integrar formulário acessível e responsivo ao Treino de hoje, preservando dados locais em falhas recuperáveis.

## Critérios de verificação

- Um check-in por sessão e retry da mesma operação sem duplicação.
- Mesma `operationKey` com payload diferente retorna conflito.
- Sessão iniciada/concluída rejeita criação/edição.
- Sessão/aluno/contrato fora do escopo responde como inexistente.
- Nenhum campo do body pode redefinir aluno, contrato ou ator.
- Timeline contém apenas referência ao check-in/operação e regra, não os valores sensíveis.
- Falha na transação não deixa check-in/evento parcial.
- Web mantém valores após falha e funciona por teclado em viewport móvel e desktop.
- `pnpm validate` e CI da PR devem ficar verdes no SHA material congelado.

## Estado

Implementação em andamento na branch `feat/388-pre-workout-check-in`. Auditoria independente permanece obrigatória após CI verde.
