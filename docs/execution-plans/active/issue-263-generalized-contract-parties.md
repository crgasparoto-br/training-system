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

- [ ] Generalizar schema, relações tipadas, aplicabilidade e origem do vínculo.
- [ ] Criar migration idempotente, constraints, índices concorrentes e backfill do legado.
- [ ] Centralizar validação de aplicabilidade e variáveis de modelos.
- [ ] Generalizar geração, prévia, envio, assinatura, recusa, expiração e vigência.
- [ ] Expor APIs tipadas e protegidas para o colaborador.
- [ ] Incluir o controle contratual na edição individual do colaborador e remover edição do legado.
- [ ] Atualizar configuração de modelos, contratos compartilhados e textos públicos.
- [ ] Adicionar testes de regressão, isolamento, concorrência, legado e aplicabilidade.
- [ ] Atualizar documentação e mover este plano para `completed/`.

## Critérios de aceite

- [ ] Modelos existentes continuam disponíveis para alunos.
- [ ] Aplicabilidade é validada ao salvar, ativar, pré-visualizar e gerar.
- [ ] O ciclo completo funciona para colaborador.
- [ ] Vigente, candidato e histórico aparecem na página de edição do colaborador.
- [ ] Rejeição, cancelamento e expiração não alteram o vigente anterior.
- [ ] Concorrência e constraints impedem dois vínculos ativos.
- [ ] Combinações entre tenants, documentos e partes são rejeitadas.
- [ ] O legado aparece distinguido e sem evidências eletrônicas fabricadas.
- [ ] Testes relevantes foram adicionados ou atualizados.
- [ ] Documentação foi atualizada.
- [ ] `pnpm validate` e `pnpm build` passam.
- [ ] Riscos conhecidos foram registrados no PR.

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
- A validação local poderá depender do CI caso o ambiente não consiga obter o repositório ou as dependências; qualquer bloqueio será registrado na PR.
