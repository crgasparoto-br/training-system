# Plano de execução — Issue #236

## Status

Implementação concluída. O encerramento permanece condicionado à aprovação integral do workflow oficial **Validate PR** no head final da branch.

## Objetivo

Garantir consistência transacional e uma única fonte de verdade para serviço vigente, vínculo contratual, substituição de contrato e datas financeiras no cadastro e na edição do aluno.

## Pontos reabertos

- [x] Integrar a confirmação de substituição diretamente ao bloqueio real do formulário, sem depender de texto ou posição de botão no DOM e sem segunda confirmação.
- [x] Tornar o serviço do contrato autoritativo no backend para criação e atualização de `StudentContract`.
- [x] Eliminar escritores concorrentes de `intakeForm.formResponses.financial.currentService` na seleção do contrato.
- [x] Persistir perfil e vínculo contratual de forma atômica no cadastro e na edição.
- [x] Corrigir vínculos legados inconsistentes usando o serviço associado ao contrato como fonte de verdade.
- [x] Cobrir os cenários acima com testes de serviço, rota, integração do frontend e PostgreSQL.

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

## Solução aplicada

1. A confirmação é controlada pelo componente que efetivamente bloqueia o envio. A seleção cancelada é restaurada antes de o formulário aplicar a troca; a confirmação aceita é vinculada ao contrato selecionado e reutilizada no salvamento.
2. A automação antiga que procurava e clicava botões por texto/posição no DOM foi removida.
3. O backend resolve o serviço do vínculo pelo `GeneratedContract.serviceId`. O Serviço de Interesse é usado somente quando o contrato persistido não possui serviço próprio.
4. O cliente não grava diretamente `financial.currentService` na operação composta. O valor é preservado durante a atualização do perfil e sincronizado pelo vínculo contratual autoritativo.
5. Cadastro/edição do aluno, criação/atualização do vínculo e aplicação do ciclo contratual executam na mesma transação Prisma.
6. Contrato não assinado permanece preparado; contrato assinado com início futuro permanece agendado; somente contrato assinado e efetivo encerra o vigente e atualiza o ponteiro atual.
7. `StudentContract.endDate` é preservado durante preparação, assinatura, agendamento e ativação.
8. A migration corrige vínculos legados e instala gatilhos para impedir divergência futura entre `GeneratedContract.serviceId`, `StudentContract.serviceId` e o valor financeiro desnormalizado.

## Cobertura adicionada

- confirmação e cancelamento no bloqueador real do formulário;
- envio após uma única confirmação;
- falha atômica sem persistência separada do perfil;
- contrato pendente não apresentado como ativo;
- prioridade do serviço persistido no contrato;
- preservação do `currentService` autoritativo durante atualização do formulário;
- substituição não assinada sem encerramento do contrato vigente;
- gatilhos PostgreSQL para inserção, atualização, propagação e sincronização do serviço;
- ciclo de assinatura, recusa, expiração, vigência futura, agendador e rollback transacional já coberto pela suíte de integração contratual.

## Critérios para encerramento

- A regra autoritativa existe no backend e no banco de dados.
- O cadastro e a edição não deixam persistência parcial quando a mutação contratual falha.
- A confirmação é única no fluxo composto real.
- O contrato vigente permanece ativo até assinatura e data efetiva do substituto.
- O workflow oficial deve concluir migrations, type-check, lint, testes, arquitetura, catálogo de acessos e documentação com sucesso.
