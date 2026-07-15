# Plano de execução — Issue #236

## Status

Implementação concluída. A cobertura complementar solicitada pelas auditorias independentes monta os formulários reais de cadastro e edição, valida sucesso, cancelamento e falha da operação composta, protege autorização e isolamento por contrato e por professor, impede fallbacks financeiros controláveis, preserva datas e estados em todos os caminhos, evita vigência retroativa e mantém documentos, vínculos e tokens públicos coerentes.

## Objetivo

Garantir consistência transacional e uma única fonte de verdade para serviço vigente, vínculo contratual, substituição de contrato e datas financeiras no cadastro e na edição do aluno.

## Pontos reabertos

- [x] Integrar a confirmação de substituição diretamente ao bloqueio real do formulário, sem depender de texto ou posição de botão no DOM e sem segunda confirmação.
- [x] Tornar o serviço do contrato autoritativo no backend para criação e atualização de `StudentContract`.
- [x] Eliminar escritores concorrentes de `intakeForm.formResponses.financial.currentService` na seleção de contrato.
- [x] Persistir perfil e vínculo contratual de forma atômica no cadastro e na edição.
- [x] Corrigir vínculos legados inconsistentes usando o serviço associado ao contrato como fonte de verdade.
- [x] Cobrir os cenários acima com testes de serviço, rota, integração do frontend e PostgreSQL.
- [x] Remover `serviceId` do contrato de entrada do domínio e usar `GeneratedContract.serviceId`, com fallback exclusivo para o `Aluno.serviceId` persistido.
- [x] Validar no domínio que o serviço autoritativo pertence ao contrato empresarial autenticado.
- [x] Consumir uma única vez a confirmação legada pelo estado explícito da substituição, sem comparar texto de mensagem.
- [x] Consumir a chamada legada de ativação após qualquer resultado bem-sucedido da mutação atômica, inclusive `draft` e `pending_signature`.
- [x] Validar o reparo idempotente de vínculos preexistentes divergentes em PostgreSQL.
- [x] Impedir que assinatura tardia retroaja o início do contrato substituto e o encerramento do contrato vigente.
- [x] Exigir autorização financeira na geração direta de contratos.
- [x] Persistir documento, vínculo e auditoria da geração direta em uma única transação de domínio.
- [x] Aplicar a mesma transação ao vínculo criado a partir de referência de modelo ativo.
- [x] Proteger consulta e expiração públicas contra concorrência com assinatura.
- [x] Permitir prévia de modelo por gerenciamento financeiro ou por `settings.contract`, mantendo geração restrita ao financeiro.
- [x] Manter uma única rota pública canônica de assinatura.
- [x] Aplicar à prévia e à geração o mesmo escopo de aluno usado nas rotas cadastrais.
- [x] Impedir que professor comum atribua outro professor ao documento.
- [x] Preservar `endDate` na geração por referência de modelo e rejeitar estados incompatíveis explicitamente.
- [x] Separar serviço próprio do documento do fallback efetivo do vínculo.
- [x] Preservar estados terminais durante expiração pública.
- [x] Invalidar tokens públicos em todos os caminhos de cancelamento.
- [x] Aplicar o escopo de aluno também à edição atômica, histórico, documentos, PDFs, auditoria, recusa e reenvio.
- [x] Impedir troca de professor responsável pela edição atômica fora do escopo do ator.
- [x] Compartilhar a mesma expiração segura entre abertura, assinatura e recusa públicas.
- [x] Validar que assinatura de token expirado não sobrescreve vínculo cancelado ou encerrado.

## Módulos principais

- `apps/web/src/pages/AlunoFormWithContractDelivery.tsx`
- `apps/web/src/pages/AlunoFormWithContractValidityOptions.tsx`
- `apps/web/src/pages/AlunoFormWithContractLifecycle.tsx`
- `apps/web/src/services/contract-replacement-coordination.ts`
- `apps/web/src/services/student-contract-replacement.ts`
- `apps/web/src/services/contract-replacement-confirm-copy.ts`
- `apps/web/src/services/student-financial-contract-atomic-adapter.ts`
- `apps/api/src/modules/alunos/student-access-scope.service.ts`
- `apps/api/src/modules/alunos/student-financial-contract.routes.ts`
- `apps/api/src/modules/alunos/student-financial-contract.service.ts`
- `apps/api/src/modules/alunos/student-contract-template-status.routes.ts`
- `apps/api/src/modules/contracts/contract-entry.routes.ts`
- `apps/api/src/modules/contracts/contract-authoritative-generation.service.ts`
- `apps/api/src/modules/contracts/contract-preview-access.middleware.ts`
- `apps/api/src/modules/contracts/contract-public-access.service.ts`
- `apps/api/src/modules/contracts/contract-lifecycle.routes.ts`
- `apps/api/src/modules/contracts/contract-rejection.routes.ts`
- `apps/api/src/modules/student-contracts/student-contract.service.ts`
- `apps/api/src/modules/student-contracts/student-contract-lifecycle-transaction.ts`
- `apps/api/src/modules/student-contracts/student-contract-lifecycle.service.ts`
- `apps/api/prisma/migrations/20260714203000_enforce_student_contract_service_authority/migration.sql`
- `apps/api/prisma/migrations/20260715160000_enforce_persisted_interest_service_fallback/migration.sql`
- `apps/api/prisma/migrations/20260715213000_recompute_terminal_current_service/migration.sql`
- `apps/api/prisma/migrations/20260715233000_invalidate_canceled_contract_public_tokens/migration.sql`

## Solução aplicada

1. A confirmação é controlada pelo componente que efetivamente bloqueia o envio. A seleção cancelada é restaurada antes de o formulário aplicar a troca; a confirmação aceita é vinculada ao contrato selecionado e reutilizada no salvamento.
2. A automação antiga que procurava e clicava botões por texto/posição no DOM e o interceptador global de `window.confirm` foram removidos.
3. O domínio não aceita `serviceId` em `StudentFinancialContractInput`; a compatibilidade HTTP descarta esse campo antes de alcançar o domínio.
4. O serviço próprio do documento vem exclusivamente de `ContractTemplate.serviceId`. Quando o modelo não possui serviço, `GeneratedContract.serviceId` permanece nulo e somente o vínculo usa o `Aluno.serviceId` persistido como fallback efetivo.
5. O serviço efetivo é validado por `id` e `companyContractId`. Triggers PostgreSQL impedem divergência e propagam alterações futuras do aluno quando o documento não possui serviço próprio.
6. O cliente não grava diretamente `financial.currentService`; o valor é preservado na atualização do perfil e sincronizado pelo vínculo contratual autoritativo.
7. Cadastro/edição do aluno, criação/atualização do vínculo e aplicação do ciclo contratual executam na mesma transação Prisma.
8. Contrato não assinado permanece preparado; contrato assinado com início futuro permanece agendado; somente contrato assinado e efetivo encerra o vigente e atualiza o ponteiro atual.
9. Quando a assinatura ocorre depois da data planejada, a vigência começa em `signedAt`; somente vínculos já assinados e previamente agendados ativam na data planejada pelo scheduler.
10. `/contracts/generate` exige `students.actions.manageFinancialContract`; `/contracts/preview` aceita essa permissão ou `settings.contract`.
11. Prévia e geração recebem a identidade do professor autenticado. Professor comum acessa somente alunos próprios e não pode atribuir outro professor; master pode operar em qualquer aluno do mesmo contrato empresarial.
12. A geração direta resolve modelo, aluno, professor e serviços no domínio e grava `Contract`, `StudentContract` e `ContractAuditLog` na mesma transação.
13. O caminho `POST /alunos/:id/contracts` com referência `template:` reutiliza o gerador autoritativo, persiste `startDate` e `endDate` e aceita somente `draft` ou `active`. Estados incompatíveis retornam erro de validação, sem conversão silenciosa.
14. A consulta pública altera `SENT` para `VIEWED` somente quando token e estado ainda correspondem ao documento. A expiração atualiza somente vínculos em `draft` ou `pending_signature`, preservando `canceled` e `terminated`.
15. Cancelar vínculo não assinado cancela o documento e remove o token na mesma transação. Um trigger de banco aplica a mesma regra a escritores administrativos e ao fluxo legado que cancela o documento antes do vínculo.
16. Tokens legados que ainda apontem para documento cancelado são retirados na primeira consulta e nunca expõem o conteúdo ou permitem assinatura.
17. A assinatura pública possui uma única implementação canônica em `contract-lifecycle.routes.ts`.
18. As migrations corrigem vínculos legados, recalculam `currentService` em transições terminais e instalam proteções para autoridade financeira e cancelamento de tokens.
19. `student-access-scope.service.ts` centraliza a regra de professor ou master e protege atualização atômica, histórico, documentos, PDFs, auditoria, leitura de recusa, reenvio e contratos disponíveis.
20. A edição atômica valida o aluno antes da transação e bloqueia uma eventual troca de responsável fora do escopo do professor autenticado.
21. Abertura, assinatura e recusa públicas usam `contractPublicAccessService` para expirar tokens de forma condicional e alterar somente vínculos ainda preparados.

## Cobertura adicionada

- confirmação e cancelamento no bloqueador real do formulário;
- envio após uma única confirmação e confirmações não relacionadas preservadas;
- falha atômica sem persistência separada do perfil;
- injeção de serviço financeiro ignorada em rotas e chamadas internas;
- fallback derivado do aluno persistido, sem materialização no documento;
- propagação PostgreSQL após alteração de `Aluno.serviceId`;
- rejeição de aluno de outro professor dentro do mesmo contrato empresarial;
- acesso de master ao contrato inteiro;
- bloqueio de atribuição de outro professor por ator não master;
- proteção do histórico e de documentos contra acesso por outro professor da mesma empresa;
- proteção da atualização atômica e da troca de responsável;
- preservação de `endDate` no caminho por modelo;
- rejeição de estados incompatíveis antes da rota legada;
- rollback PostgreSQL de documento, vínculo e auditoria;
- assinatura tardia sem vigência retroativa;
- consulta e expiração concorrentes com assinatura;
- assinatura de token expirado sem sobrescrever vínculo terminal;
- expiração sem sobrescrever vínculo cancelado;
- cancelamento dedicado, genérico e iniciado pelo documento removendo token público;
- aposentadoria de token legado ainda associado a documento cancelado;
- gatilhos PostgreSQL para inserção, atualização, propagação, sincronização e cancelamento;
- reparo PostgreSQL de vínculo e `currentService` simulando dados anteriores às migrations;
- formulário real de cadastro e edição com sucesso, cancelamento e rollback.

## Critérios para encerramento

- A regra autoritativa existe no domínio, nas rotas e no banco de dados.
- Chamadas HTTP e internas de geração não escolhem arbitrariamente serviço, aluno ou professor.
- O cadastro, a edição e qualquer caminho de geração não deixam persistência parcial quando uma etapa falha.
- A confirmação é única no fluxo composto real e não libera confirmações posteriores.
- O contrato vigente permanece ativo até assinatura e data efetiva do substituto.
- Uma assinatura tardia nunca produz vigência anterior à assinatura.
- Consulta, assinatura, recusa, expiração e cancelamento públicos não deixam documento, assinatura, token e vínculo em estados divergentes.
- O editor de modelos consegue gerar prévia sem receber permissão de geração, mas continua sujeito ao escopo do aluno.
- Professor comum não consegue editar, listar, consultar, reenviar ou atribuir contratos de aluno de outro professor no mesmo contrato empresarial.
- O fallback financeiro não pode ser escolhido pelo cliente nem virar serviço próprio do documento.
- `startDate` e `endDate` são equivalentes nos caminhos atômico, administrativo e por referência de modelo.
- Estados de vínculo não suportados são rejeitados explicitamente.
- O reparo de dados preexistentes é validado em PostgreSQL.
- O workflow oficial conclui migrations, type-check, lint, testes, arquitetura, catálogo de acessos e documentação com sucesso.

## Validação da implementação

A implementação deve ser considerada concluída somente no head em que o workflow oficial **Validate PR** aprovar migrations PostgreSQL, type-check, lint, testes, arquitetura, catálogo de acessos e documentação.