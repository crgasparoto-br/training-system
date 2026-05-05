# Integração de contratos reais no cadastro de aluno

## Resumo executivo

A rotina de contratos já está funcional e já cria vínculo real com o aluno via tabela `Contract` (`alunoId`).

O cadastro do aluno hoje mistura:
- vínculo estrutural com serviço via `Aluno.serviceId` (FK para `ServiceOption`)
- informações financeiras/contratuais textuais em `AlunoIntakeForm.formResponses.financial` (ex.: `currentService`, `contract`)

A menor alteração segura é fazer o cadastro consumir e exibir contratos reais (`Contract`) sem remover o campo atual de serviço.

## Rotina de contratos localizada

### Backend
- `apps/api/src/modules/contracts/contract.routes.ts`
- `apps/api/src/modules/contracts/contract-document.service.ts`
- `apps/api/src/modules/contracts/contract.service.ts`
- `apps/api/src/modules/contracts/contract-data.service.ts`

### Frontend
- `apps/web/src/services/contract.service.ts`
- `apps/web/src/pages/Settings/ContractTemplates.tsx`
- `apps/web/src/pages/Settings/Contract.tsx`
- `apps/web/src/pages/AlunoContracts.tsx`
- `apps/web/src/pages/PublicContractSignature.tsx`

## Campo atual no cadastro do aluno

### Campo estrutural
- `Aluno.serviceId` (Prisma): string opcional, FK para `ServiceOption`
- Arquivos:
  - `apps/api/prisma/schema.prisma`
  - `packages/utils/validations.ts` (`CreateAlunoSchema` e `UpdateAlunoSchema`)
  - `apps/api/src/modules/alunos/aluno.service.ts`
  - `apps/web/src/pages/AlunoForm.tsx`

Conclusão: o campo principal de serviço no cadastro é `serviceId` (FK), não texto livre.

### Campos textuais financeiros/contratuais no formulário
- Persistidos dentro de `AlunoIntakeForm.formResponses.financial`
- Exemplos: `currentService`, `contract`, `contractStartDate`, `contractDueDate`
- Arquivos:
  - `apps/web/src/pages/AlunoForm.tsx`
  - `apps/web/src/components/alunos/AlunoFinanceiroTab.tsx`
  - `apps/web/src/pages/AlunoDetails.tsx`

Conclusão: existe duplicidade de informação contratual em campos textuais de anamnese/financeiro.

## Models envolvidos

1. `CompanyContract` (tenant/contrato da empresa)
2. `ServiceOption` (catálogo por contrato da empresa)
3. `Aluno` (possui `serviceId` e relação `contracts`)
4. `ContractTemplate`
5. `ContractTemplateClause`
6. `Contract` (contrato gerado do aluno)
7. `ContractSignature`
8. `ContractAuditLog`
9. `AlunoIntakeForm` (onde ficam campos textuais legados em `formResponses`)

Arquivos-base:
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260424230000_add_service_catalog_and_aluno_service_link/migration.sql`

## APIs existentes de contrato

Base: `/api/v1/contracts`

Públicas de assinatura:
- `GET /public/:token`
- `POST /public/:token/sign`

Internas (autenticadas):
- `GET /variables`
- `GET /templates`
- `POST /templates`
- `PUT /templates/:templateId`
- `POST /templates/:templateId/duplicate`
- `POST /templates/:templateId/status`
- `GET /templates/:templateId/clauses`
- `POST /templates/:templateId/clauses`
- `PUT /templates/:templateId/clauses/:clauseId`
- `DELETE /templates/:templateId/clauses/:clauseId`
- `POST /templates/:templateId/clauses/reorder`
- `POST /preview`
- `POST /generate`
- `GET /alunos/:alunoId`
- `GET /documents/:contractDocumentId`
- `POST /documents/:contractDocumentId/pdf`
- `POST /documents/:contractDocumentId/send`
- `POST /documents/:contractDocumentId/cancel`
- `GET /documents/:contractDocumentId/download`
- `GET /documents/:contractDocumentId/audit`
- `GET /me`
- `PUT /me`
- `POST /logo-upload`
- `POST /clone-data`

## Telas afetadas

1. Cadastro de aluno (criação/edição)
- `apps/web/src/pages/AlunoForm.tsx`

2. Detalhes do aluno (aba financeiro)
- `apps/web/src/pages/AlunoDetails.tsx`
- `apps/web/src/components/alunos/AlunoFinanceiroTab.tsx`

3. Fluxo de contratos do aluno
- `apps/web/src/pages/AlunoContracts.tsx`

4. Configurações de contrato/modelos (fonte da rotina)
- `apps/web/src/pages/Settings/Contract.tsx`
- `apps/web/src/pages/Settings/ContractTemplates.tsx`

5. Assinatura pública
- `apps/web/src/pages/PublicContractSignature.tsx`

## Recomendação clara

### 1) Manter campo atual?
Sim, manter `Aluno.serviceId` como "serviço de interesse/base".

Motivo: esse campo já está integrado ao catálogo (`ServiceOption`) e não representa histórico contratual jurídico.

### 2) Substituir por `contractId` no aluno?
Não substituir diretamente.

Motivo: um aluno pode ter múltiplos contratos ao longo do tempo; trocar por um único `contractId` perderia histórico ou geraria sobrescrita.

### 3) Criar `StudentContract`?
Não.

Motivo: já existe `Contract` com `alunoId`, status, assinatura, auditoria e snapshot. Criar nova tabela duplicaria o domínio.

### 4) Backfill?
Sim, apenas de metadados legados, sem apagar histórico.

Plano mínimo:
- manter `formResponses.financial.contract` como legado/observação
- parar de usar esse campo como fonte de verdade
- passar a mostrar no cadastro/financeiro o contrato real vindo de `GET /contracts/alunos/:alunoId` (ex.: mais recente em `SENT|VIEWED|SIGNED|GENERATED`)
- opcional: script de saneamento para marcar registros legados como `contractLegacyNote`

## Menor alteração segura proposta

### Objetivo funcional
Fazer o cadastro do aluno usar contratos reais já gerados, evitando duplicidade e preservando histórico.

### Escopo mínimo (sem migration)

1. Frontend: substituir a exibição de "Contrato" textual por leitura de contratos reais
- `apps/web/src/pages/AlunoForm.tsx`
- `apps/web/src/components/alunos/AlunoFinanceiroTab.tsx`
- `apps/web/src/pages/AlunoDetails.tsx`
- `apps/web/src/services/contract.service.ts` (reuso já existente)

2. UX:
- em edição de aluno: carregar `contractService.listAlunoContracts(alunoId)`
- mostrar contrato vigente real (status + data + link para tela de contratos)
- manter campo textual legado apenas como observação administrativa (não como vínculo)

3. Backend:
- nenhuma mudança obrigatória para viabilizar o vínculo real (já existe em `Contract.alunoId`)
- opcional posterior: endpoint resumido "contrato vigente do aluno" para simplificar frontend

## Arquivos que precisam ser alterados (proposta mínima)

Frontend (obrigatórios):
- `apps/web/src/pages/AlunoForm.tsx`
- `apps/web/src/components/alunos/AlunoFinanceiroTab.tsx`
- `apps/web/src/pages/AlunoDetails.tsx`

Frontend (opcional de acabamento):
- `apps/web/src/pages/AlunoContracts.tsx`

Backend (opcional):
- `apps/api/src/modules/contracts/contract.routes.ts`
- `apps/api/src/modules/contracts/contract-document.service.ts`

Documentação:
- `docs/CONTRATOS.md` (adicionar nota de integração com cadastro do aluno)

## Critérios de aceite x verificação

- Rotina de contratos existente localizada: sim
- Campo atual do cadastro localizado: sim (`serviceId` + legados textuais em `formResponses.financial`)
- Proposta evita duplicidade: sim (fonte de verdade em `Contract`)
- Proposta preserva histórico: sim (mantém histórico em `Contract`, não sobrescreve com 1 único campo)
