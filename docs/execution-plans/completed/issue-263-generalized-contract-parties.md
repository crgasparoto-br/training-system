# Plano concluído: generalizar contratos para alunos e colaboradores

## Objetivo

Evoluir o módulo de contratos para atender alunos e colaboradores com a mesma infraestrutura de modelos, documentos, assinatura pública, auditoria e vigência, preservando contratos existentes e o histórico legado dos colaboradores.

## Contexto

- Issue: #263.
- A página individual e a edição dedicada de colaboradores foram entregues pela #264.
- `Aluno` e `Professor` permanecem entidades distintas, com vínculos contratuais tipados.
- Fontes de verdade: `docs/CONTRATOS.md`, `docs/architecture/database.md`, `docs/architecture/auth-and-access-control.md` e `docs/product/access-control.md`.

## Fora de escopo

- Provedores externos de assinatura.
- Folha de pagamento, remuneração ou regras trabalhistas.
- Mudança das regras comerciais existentes dos alunos.
- Exclusão ou reescrita de documentos históricos.
- Unificação de `Aluno` e `Professor` em uma única entidade.

## Arquivos e módulos principais

- `apps/api/prisma/schema.prisma` e `prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/src/modules/contracts/*`
- `apps/api/src/modules/student-contracts/*`
- `apps/api/src/modules/professores/*`
- `apps/web/src/pages/Settings/ContractTemplates.tsx`
- `apps/web/src/pages/CollaboratorFormPage.tsx`
- `apps/web/src/features/collaborators/*`
- `apps/web/src/services/contract.service.ts`
- `packages/types/*`
- `docs/CONTRATOS.md`

## Regras e restrições atendidas

- `contractId` é respeitado em todas as consultas e mutações multi-tenant.
- Documento e vínculo pertencem a exatamente uma parte tipada: aluno ou colaborador.
- Somente documento assinado pode entrar em vigor.
- Entrada em vigor e encerramento do vínculo anterior ocorrem na mesma transação.
- Existe no máximo um vínculo ativo por parte, inclusive sob concorrência.
- Modelos existentes migram com aplicabilidade `STUDENT`.
- Modelo `BOTH` aceita somente variáveis comuns.
- O legado do colaborador é somente leitura depois do backfill e nunca é apresentado como assinatura eletrônica.
- IDs, URLs públicas, snapshots, hashes, auditorias e históricos dos alunos permanecem válidos.

## Passos concluídos

- [x] Generalizar schema, relações tipadas, aplicabilidade e origem do vínculo.
- [x] Criar migration idempotente, constraints, índices concorrentes e backfill do legado.
- [x] Centralizar validação de aplicabilidade e variáveis de modelos.
- [x] Generalizar geração, prévia, envio, assinatura, recusa, expiração e vigência.
- [x] Expor APIs tipadas e protegidas para o colaborador.
- [x] Incluir o controle contratual na edição individual do colaborador e remover edição do legado.
- [x] Atualizar configuração de modelos, contratos compartilhados e textos públicos.
- [x] Adicionar testes de regressão, isolamento, concorrência, legado e aplicabilidade.
- [x] Atualizar documentação e estratégia de rollback.
- [x] Concluir auditoria independente sem ressalvas.
- [x] Concluir higienização sem pendências.

## Critérios de aceite

- [x] Modelos existentes continuam disponíveis para alunos.
- [x] Aplicabilidade é validada ao salvar, ativar, pré-visualizar e gerar.
- [x] O ciclo completo funciona para colaborador.
- [x] Vigente, candidato e histórico aparecem na página de edição do colaborador.
- [x] Rejeição, cancelamento e expiração não alteram o vigente anterior.
- [x] Concorrência e constraints impedem dois vínculos ativos.
- [x] Combinações entre tenants, documentos e partes são rejeitadas.
- [x] O legado aparece distinguido e sem evidências eletrônicas fabricadas.
- [x] Testes relevantes foram adicionados ou atualizados.
- [x] Documentação foi atualizada.
- [x] `pnpm validate` e `pnpm build` passam no commit final.
- [x] Riscos conhecidos foram registrados no PR.

## Validação executada

1. Geração do Prisma Client e aplicação das migrations em PostgreSQL.
2. Validação dos dois schemas Prisma canônicos.
3. Type-check, lint e suíte completa de testes.
4. Build completo dos workspaces.
5. Checks de arquitetura, catálogo de acessos e documentação.
6. Testes discriminantes de tenant, parte, datas, estados terminais e concorrência.
7. Teste de assinatura versus recusa concorrentes para colaborador.
8. Testes do backfill legado e dos ponteiros de vigência.

## Decisões finais

- A infraestrutura eletrônica permanece em `Contract`; os vínculos de vigência são `StudentContract` e `CollaboratorContract`.
- O legado é materializado como vínculo de origem legada, sem `Contract`, assinatura, token, hash ou vigência eletrônica fabricados.
- Consulta do HTML e do PDF persistidos é autenticada e valida tenant, escopo e parte.
- Estados terminais existentes não são sobrescritos por expiração ou atualização concorrente posterior.
- Todos os arquivos e workflows temporários usados durante o ciclo corretivo foram removidos.
- Parecer final da auditoria: **Aprovado sem ressalvas**.
