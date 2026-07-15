# Plano de execução — Issue #236

## Status

Implementação concluída. A cobertura complementar solicitada pela auditoria independente monta os formulários reais de cadastro e edição, valida sucesso, cancelamento e falha da operação composta, protege autorização e isolamento por contrato nas novas rotas e fecha os pontos adicionais encontrados após a primeira auditoria.

## Objetivo

Garantir consistência transacional e uma única fonte de verdade para serviço vigente, vínculo contratual, substituição de contrato e datas financeiras no cadastro e na edição do aluno.

## Pontos reabertos

- [x] Integrar a confirmação de substituição diretamente ao bloqueio real do formulário, sem depender de texto ou posição de botão no DOM e sem segunda confirmação.
- [x] Tornar o serviço do contrato autoritativo no backend para criação e atualização de `StudentContract`.
- [x] Eliminar escritores concorrentes de `intakeForm.formResponses.financial.currentService` na seleção do contrato.
- [x] Persistir perfil e vínculo contratual de forma atômica no cadastro e na edição.
- [x] Corrigir vínculos legados inconsistentes usando o serviço associado ao contrato como fonte de verdade.
- [x] Cobrir os cenários acima com testes de serviço, rota, integração do frontend e PostgreSQL.
- [x] Ignorar `contract.serviceId` enviado pelo cliente e usar `GeneratedContract.serviceId`, com fallback exclusivo para o `Aluno.serviceId` persistido.
- [x] Consumir a chamada legada de ativação após qualquer resultado bem-sucedido da mutação atômica, inclusive `draft` e `pending_signature`.
- [x] Validar o reparo idempotente de vínculos preexistentes divergentes em PostgreSQL.

## Módulos principais

- `apps/web/src/pages/AlunoFormWithContractDelivery.tsx`
- `apps/web/src/pages/AlunoFormWithContractValidityOptions.tsx`
- `apps/web/src/pages/AlunoFormWithContractLifecycle.tsx`
- `apps/web/src/services/contract-replacement-coordination.ts`
- `apps/web/src/services/student-financial-contract-atomic-adapter.ts`
- `apps/api/src/modules/alunos/student-financial-contract.routes.ts`
- `apps/api/src/modules/alunos/student-financial-contract.service.ts`
- `apps/api/src/modules/student-contracts/student-contract-lifecycle-transaction.ts`
- `apps/api/src/modules/student-contracts/student-contract-lifecycle.service.ts`
- `apps/api/prisma/migrations/20260714203000_enforce_student_contract_service_authority/migration.sql`
- `apps/api/prisma/migrations/20260715160000_enforce_persisted_interest_service_fallback/migration.sql`

## Solução aplicada

1. A confirmação é controlada pelo componente que efetivamente bloqueia o envio. A seleção cancelada é restaurada antes de o formulário aplicar a troca; a confirmação aceita é vinculada ao contrato selecionado e reutilizada no salvamento.
2. A automação antiga que procurava e clicava botões por texto/posição no DOM foi removida.
3. O backend resolve o serviço do vínculo pelo `GeneratedContract.serviceId`. Quando o contrato não possui serviço próprio, o banco usa exclusivamente o `Aluno.serviceId` persistido dentro da transação.
4. O campo `contract.serviceId` recebido nas rotas atômicas permanece aceito apenas para compatibilidade de payload, mas é descartado antes de alcançar o serviço de domínio.
5. O cliente não grava diretamente `financial.currentService` na operação composta. O valor é preservado durante a atualização do perfil e sincronizado pelo vínculo contratual autoritativo.
6. Cadastro/edição do aluno, criação/atualização do vínculo e aplicação do ciclo contratual executam na mesma transação Prisma.
7. A chamada legada de ativação executada pelo formulário é consumida localmente depois de qualquer mutação atômica bem-sucedida; não existe segunda requisição para contratos ativos, pendentes ou em rascunho.
8. Contrato não assinado permanece preparado; contrato assinado com início futuro permanece agendado; somente contrato assinado e efetivo encerra o vigente e atualiza o ponteiro atual.
9. `StudentContract.endDate` é preservado durante preparação, assinatura, agendamento e ativação.
10. As migrations corrigem vínculos legados e instalam gatilhos para impedir divergência futura entre `GeneratedContract.serviceId`, o fallback persistido em `Aluno.serviceId`, `StudentContract.serviceId` e o valor financeiro desnormalizado.
11. A função idempotente `repair_student_contract_service_authority_data()` permite validar e repetir de forma controlada a correção dos dados legados.

## Cobertura adicionada

- confirmação e cancelamento no bloqueador real do formulário;
- envio após uma única confirmação;
- falha atômica sem persistência separada do perfil;
- contrato pendente não apresentado como ativo;
- prioridade do serviço persistido no contrato;
- fallback financeiro derivado do Serviço de Interesse persistido;
- rejeição do `serviceId` financeiro enviado pelo cliente nas rotas atômicas;
- preservação do `currentService` autoritativo durante atualização do formulário;
- substituição não assinada sem encerramento do contrato vigente;
- ausência de segunda chamada de ativação para resultados `draft` e `pending_signature`;
- gatilhos PostgreSQL para inserção, atualização, propagação e sincronização do serviço;
- propagação da alteração de `Aluno.serviceId` quando o contrato não possui serviço próprio;
- reparo PostgreSQL de vínculo e `currentService` simulando dado anterior à migration;
- ciclo de assinatura, recusa, expiração, vigência futura, agendador e rollback transacional já coberto pela suíte de integração contratual;
- formulário real de edição com seleção, confirmação e uma única mutação atômica;
- cancelamento e falha transacional no formulário real sem fallback para escritores separados;
- formulário real de cadastro com a mesma data final no perfil e no vínculo;
- bloqueio da rota sem `students.actions.manageFinancialContract` e rejeição de aluno ou documento pertencente a outro contrato empresarial.

## Critérios para encerramento

- A regra autoritativa existe no backend e no banco de dados.
- O cadastro e a edição não deixam persistência parcial quando a mutação contratual falha.
- A confirmação é única no fluxo composto real.
- O contrato vigente permanece ativo até assinatura e data efetiva do substituto.
- O fallback financeiro não pode ser escolhido pelo cliente.
- A operação composta não dispara uma segunda mutação de ciclo após o commit atômico.
- O reparo de dados preexistentes é validado em PostgreSQL.
- O workflow oficial deve concluir migrations, type-check, lint, testes, arquitetura, catálogo de acessos e documentação com sucesso.

## Validação complementar da auditoria

- `pnpm --filter @corrida/web exec vitest run src/pages/AlunoFormFinancialContract.integration.test.tsx src/services/student-financial-contract-atomic-adapter.pending.test.ts`
- `pnpm --filter @corrida/api exec jest --runInBand tests/student-financial-contract.routes.test.ts tests/student-financial-contract-authority.routes.test.ts tests/student-financial-contract.service.test.ts`
- `RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @corrida/api exec jest --runInBand tests/student-financial-contract-authority.integration.test.ts tests/student-financial-contract-authority-fallback.integration.test.ts`
- `pnpm validate`
