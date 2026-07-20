# Plano: generalizar contratos para alunos e colaboradores

## Objetivo

Evoluir o módulo de contratos para atender alunos e colaboradores com a mesma infraestrutura de modelos, documentos, assinatura pública, auditoria e vigência, preservando contratos existentes e o histórico legado dos colaboradores.

## Contexto

- Issue: #263.
- A página individual e a edição dedicada de colaboradores foram entregues pela #264.
- O domínio atual exige `Aluno` em `Contract` e usa `StudentContract` como vínculo de vigência.
- `Professor` representa o colaborador e ainda mantém `hasSignedContract` e `signedContractDocumentUrl` como fonte legada.
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
- `apps/web/src/pages/Settings/Contracts.tsx`
- `apps/web/src/pages/CollaboratorFormPage.tsx`
- `apps/web/src/features/collaborators/*`
- `apps/web/src/services/contract.service.ts`
- `packages/types/*`
- `docs/CONTRATOS.md`

## Regras e restrições

- `contractId` deve ser respeitado em todas as consultas e mutações multi-tenant.
- Documento e vínculo devem pertencer a exatamente uma parte tipada: aluno ou colaborador.
- Somente documento assinado pode entrar em vigor.
- Entrada em vigor e encerramento do vínculo anterior devem ocorrer na mesma transação.
- Deve existir no máximo um vínculo ativo por parte, inclusive sob concorrência.
- Modelos existentes migram com aplicabilidade `STUDENT`.
- Modelo `BOTH` aceita somente variáveis comuns.
- O legado do colaborador é somente leitura depois do backfill e nunca é apresentado como assinatura eletrônica.
- IDs, URLs públicas, snapshots, hashes, auditorias e históricos dos alunos devem permanecer válidos.

## Passos de implementação

- [x] Generalizar schema, relações tipadas, aplicabilidade e origem do vínculo.
- [x] Criar migration idempotente, constraints, índices concorrentes e backfill do legado.
- [x] Centralizar validação de aplicabilidade e variáveis de modelos.
- [x] Generalizar geração, prévia, envio, assinatura, recusa, expiração e vigência.
- [x] Expor APIs tipadas e protegidas para o colaborador.
- [x] Incluir o controle contratual na edição individual do colaborador e remover edição do legado.
- [x] Atualizar configuração de modelos, contratos compartilhados e textos públicos.
- [x] Adicionar testes de regressão, isolamento, concorrência, legado e aplicabilidade.
- [x] Atualizar documentação.
- [ ] Mover este plano para `completed/` após aprovação final da auditoria.

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
- [ ] `pnpm validate` e `pnpm build` passam no commit final.
- [x] Riscos conhecidos foram registrados no PR.

## Validação manual

1. Criar modelos para aluno, colaborador e ambos, validando tokens permitidos e proibidos.
2. Gerar, visualizar, enviar, assinar, programar vigência e substituir contrato de um colaborador.
3. Recusar, cancelar e expirar candidatos sem encerrar o vigente.
4. Consultar contrato legado com PDF e declaração sem PDF.
5. Repetir as rotinas principais de um aluno existente e abrir links públicos anteriores.
6. Tentar acessar documentos e colaboradores de outro tenant.

## Decisões e pendências

- A infraestrutura eletrônica continuará em `Contract`; os vínculos de vigência permanecerão tipados em `StudentContract` e `CollaboratorContract`.
- O legado será materializado como vínculo de origem legada, sem `Contract`, assinatura, token, hash ou vigência eletrônica.
- O primeiro ciclo de auditoria identificou divergência de schema, regressões de estado terminal, consulta documental incompleta, descrição de permissão legada e ausência de teste concorrente específico do colaborador.
- As correções foram incorporadas na mesma branch e todos os arquivos temporários de sincronização foram removidos.
- A aprovação final depende da execução do CI padrão e de nova auditoria independente sobre o commit resultante.
