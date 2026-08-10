# Plano concluído: correções e validação final da issue 268

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
- `apps/web/src/types/student-lifecycle.ts`
- `packages/types/student-lifecycle.ts`
- `docs/architecture/student-lifecycle-data-ownership.md`
- `.github/workflows/validate-pr.yml`

## Regras e restrições

- O mesmo `User` global pode estar vinculado a um `Aluno` por contrato, sem acesso cruzado.
- Toda mutação filtra `alunoId` e `contractId` na operação que grava.
- `StudentProfile` é a fonte canônica tenant-scoped de identificação; campos `Aluno.lead*` são projeções normalizadas para busca e constraints.
- `Profile` é somente conta global/projeção legada e não recebe escrita tenant-scoped quando a conta possui múltiplos vínculos.
- Transições com pré-condições específicas não podem ser executadas por uma API genérica pública.
- A migration preserva IDs e relacionamentos, suporta reexecução segura e permite rollback temporário da aplicação legada.
- Nenhum merge foi realizado.

## Passos executados

- [x] Corrigir relação conta/aluno e constraints tenant-scoped.
- [x] Tornar claim concorrente, idempotente e reconciliador.
- [x] Tornar conclusão cadastral atômica e tenant-scoped.
- [x] Centralizar ownership e compatibilidade dos dados pessoais.
- [x] Substituir transição genérica por operações guardadas.
- [x] Corrigir migration, backfill, rerun e rollback.
- [x] Adicionar testes discriminantes e validações de compatibilidade.
- [x] Executar auditoria funcional independente.
- [x] Higienizar o código alterado e revalidar.
- [x] Executar auditoria final sem ressalvas.

## Critérios de aceite verificados

- [x] Mesma conta pode ser vinculada a alunos de contratos diferentes, mas não duplicada no mesmo contrato.
- [x] Claim concorrente não sobrescreve a conta vencedora nem duplica eventos.
- [x] Divergências de identidade no claim são retornadas explicitamente.
- [x] Conclusão cross-tenant não grava nenhum dado.
- [x] Dados obrigatórios são persistidos na fonte canônica em uma única transação.
- [x] APIs legadas usam a mesma função de ownership ou projeção temporária documentada.
- [x] Transições exigem suas pré-condições e resistem a concorrência.
- [x] Migration aplica em base vazia, preserva base legada e pode ser reexecutada.
- [x] Rollback da aplicação legada continua criando aluno ativo com `contractId` derivado.
- [x] API e frontend consomem os contratos compartilhados sem duplicar enums.
- [x] Type-check, lint, testes, build, arquitetura, acessos e documentação passaram no CI.
- [x] Auditoria final aprovada sem ressalvas.

## Evidências de validação

- Workflow `Validate PR`, execução 29875307977.
- Migration aplicada e reexecutada no mesmo banco PostgreSQL com sucesso.
- Type-check e lint concluídos sem erros.
- 86 suítes e 397 testes concluídos com sucesso antes do teste adicional de consumo frontend; a validação final inclui também esse novo teste.
- Build do monorepo e gates de arquitetura, catálogo de acessos e documentação concluídos com sucesso.

## Decisões de rollout

- O contexto explícito de contrato para uma conta de aluno com múltiplos vínculos será consumido pela #271. Até lá, rotas legadas só resolvem automaticamente quando há um único vínculo ativo; ambiguidade é rejeitada sem escolher tenant silenciosamente.
- A projeção legada em `Profile` terá remoção concluída no rollout integrado da #275, após os consumidores migrarem para `StudentProfile`.

## Passagem adversarial adicional

- removida a unicidade global de `Profile.cpf`, preservando validação de CPF de colaboradores no service;
- e-mail de contato tenant-scoped deixou de ser comparado ao e-mail global de login no claim;
- projeção legada em `Profile` é omitida para contas com múltiplos vínculos, evitando sobrescrita cross-tenant;
- limpeza de nascimento também limpa a idade derivada;
- `Aluno.contractId` prevalece sobre vínculos financeiros ou professor em todos os consumidores auditados;
- frontend usa os estados de `@corrida/types` para construir opções e rótulos, sem enum paralelo.
