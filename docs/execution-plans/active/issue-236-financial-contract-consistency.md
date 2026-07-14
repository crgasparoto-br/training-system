# Plano de execução — Issue #236

## Status

Em implementação. Os itens abaixo permanecem abertos até validação completa no fluxo real e no CI.

## Objetivo

Garantir consistência transacional e uma única fonte de verdade para serviço vigente, vínculo contratual, substituição de contrato e datas financeiras no cadastro e na edição do aluno.

## Pontos reabertos

- [ ] Integrar a confirmação de substituição diretamente ao bloqueio real do formulário, sem depender de texto ou posição de botão no DOM e sem segunda confirmação.
- [ ] Tornar o serviço do contrato autoritativo no backend para criação e atualização de `StudentContract`.
- [ ] Eliminar escritores concorrentes de `intakeForm.financialInfo.currentService` na seleção do contrato.
- [ ] Persistir perfil e vínculo contratual de forma atômica no cadastro e na edição.
- [ ] Corrigir vínculos legados inconsistentes usando o serviço associado ao contrato como fonte de verdade.
- [ ] Cobrir os cenários acima com testes de serviço, rota e integração do frontend.

## Módulos principais

- `apps/web/src/pages/AlunoForm.tsx`
- `apps/web/src/pages/AlunoFormWithContractDelivery.tsx`
- `apps/web/src/pages/AlunoFormWithContractValidityOptions.tsx`
- `apps/web/src/services/aluno.service.ts`
- `apps/web/src/services/contract-replacement-preconfirmation.ts`
- `apps/web/src/services/student-contract-service-resolution.ts`
- `apps/api/src/modules/alunos/aluno.routes.ts`
- `apps/api/src/modules/alunos/aluno.service.ts`
- `apps/api/src/modules/student-contracts/student-contract.service.ts`

## Estratégia

1. Substituir a automação baseada em clique/texto por um estado de confirmação controlado pelo componente que efetivamente bloqueia o envio.
2. Fazer o backend resolver o serviço do vínculo a partir do contrato persistido e corrigir registros inconsistentes durante mutações controladas.
3. Preparar uma operação composta de aluno + vínculo dentro de uma única transação Prisma.
4. Fazer o formulário usar a operação composta quando houver contrato selecionado, mantendo as rotas existentes para compatibilidade.
5. Executar testes focados e `pnpm validate` no workflow oficial antes de marcar qualquer item como concluído.

## Critérios para encerramento

- Nenhum item acima pode ser marcado como concluído apenas porque o CI passou.
- A regra autoritativa precisa existir no backend.
- O cadastro e a edição não podem deixar persistência parcial quando a mutação contratual falhar.
- A confirmação precisa ser única no fluxo composto real.
- Testes devem cobrir sucesso, cancelamento, falha e correção de vínculo legado.
