# Plano: correções e validação final da issue 268

## Objetivo

Concluir o gate arquitetural do ciclo único de lead até aluno, corrigindo os achados da auditoria da PR #278 e deixando a implementação segura para as subissues #269 a #275.

## Contexto

- Issue: #268, subissue da épica #267.
- Branch reutilizada: `feature/268-student-lifecycle-domain`.
- PR reutilizada: #278 contra `develop`.
- Auditoria inicial reprovou a entrega por unicidade global da conta, corrida no claim, escrita cross-tenant, propriedade divergente dos dados pessoais, transições sem guardas, contratos duplicados e migration/rollback insuficientes.
- `User`/`Profile` representam a conta global; `Aluno` e `StudentProfile` representam o cadastro operacional tenant-scoped.

## Fora de escopo

- UI administrativa de leads.
- Tokens e convites públicos completos da #269.
- Fluxo público completo da #271.
- Consolidação clínica das #272 e #273.
- Deduplicação e conversão final completas da #274.
- Merge da PR.

## Arquivos e módulos principais

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260721120000_student_lifecycle_domain/migration.sql`
- `apps/api/src/modules/alunos/student-lifecycle.service.ts`
- `apps/api/src/modules/alunos/student-identity.service.ts`
- `apps/api/src/modules/alunos/student-lifecycle.service.test.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/routes/student.routes.ts`
- `apps/api/src/modules/alunos/aluno.service.ts`
- `apps/api/src/modules/alunos/student-financial-contract.service.ts`
- `apps/api/src/modules/alunos/profile-review.service.ts`
- `packages/types/student-lifecycle.ts`
- `docs/architecture/student-lifecycle-data-ownership.md`
- `.github/workflows/validate-pr.yml`

## Regras e restrições

- O mesmo `User` global pode estar vinculado a um `Aluno` por contrato, sem acesso cruzado.
- Toda mutação deve filtrar `alunoId` e `contractId` na operação que grava.
- `StudentProfile` é a fonte canônica tenant-scoped de identificação; campos `Aluno.lead*` são projeções normalizadas para busca e constraints.
- `Profile` é somente conta global/projeção legada e não pode receber escrita independente do domínio do aluno.
- Transições com pré-condições específicas não podem ser executadas por uma API genérica pública.
- A migration deve preservar IDs e relacionamentos, suportar reexecução segura e permitir rollback temporário da aplicação legada.
- Nenhum merge será realizado.

## Passos de implementação

- [x] Corrigir relação conta/aluno e constraints tenant-scoped.
- [x] Tornar claim concorrente, idempotente e reconciliador.
- [x] Tornar conclusão cadastral atômica e tenant-scoped.
- [x] Centralizar ownership e compatibilidade dos dados pessoais.
- [x] Substituir transição genérica por operações guardadas.
- [x] Corrigir migration, backfill, rerun e rollback.
- [x] Adicionar testes discriminantes e validações de compatibilidade.
- [ ] Executar auditoria funcional independente.
- [ ] Higienizar o código alterado e revalidar.
- [ ] Executar auditoria final sem ressalvas.

## Critérios de aceite

- [ ] Mesma conta pode ser vinculada a alunos de contratos diferentes, mas não duplicada no mesmo contrato.
- [ ] Claim concorrente não sobrescreve a conta vencedora nem duplica eventos.
- [ ] Divergências de identidade no claim são retornadas explicitamente.
- [ ] Conclusão cross-tenant não grava nenhum dado.
- [ ] Dados obrigatórios são persistidos na fonte canônica em uma única transação.
- [ ] APIs legadas usam a mesma função de ownership ou projeção temporária documentada.
- [ ] Transições exigem suas pré-condições e resistem a concorrência.
- [ ] Migration aplica em base vazia, preserva base legada e pode ser reexecutada.
- [ ] Rollback da aplicação legada continua criando aluno ativo com `contractId` derivado.
- [ ] `pnpm validate` e `pnpm build` passam no CI.
- [ ] Auditoria final é aprovada sem ressalvas.

## Validação manual

- Criar lead somente com telefone e somente com e-mail.
- Vincular a mesma conta em dois contratos distintos.
- Disputar o mesmo lead com duas contas simultâneas.
- Tentar concluir pré-cadastro usando `contractId` de outro tenant e confirmar ausência de escrita.
- Reexecutar a migration no banco já migrado.
- Simular insert legado sem `contractId`/`status` e confirmar derivação para aluno ativo.

## Decisões e pendências

- O contexto explícito de contrato para uma conta de aluno com múltiplos vínculos será consumido pela #271. Até lá, rotas legadas só resolvem automaticamente quando há um único vínculo ativo; ambiguidade é rejeitada sem escolher tenant silenciosamente.
- A projeção legada em `Profile` terá remoção concluída no rollout integrado da #275, após os consumidores migrarem para `StudentProfile`.


## Passagem adversarial adicional

- removida a unicidade global de `Profile.cpf`, preservando validação de CPF de colaboradores no service;
- e-mail de contato tenant-scoped deixou de ser comparado ao e-mail global de login no claim;
- projeção legada em `Profile` é omitida para contas com múltiplos vínculos, evitando sobrescrita cross-tenant;
- limpeza de nascimento também limpa a idade derivada.
