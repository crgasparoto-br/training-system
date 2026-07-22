# Plano: correções finais da auditoria da issue 268

## Objetivo

Corrigir as divergências encontradas na auditoria independente da PR #278 para que o ciclo único de lead até aluno use `Aluno.contractId` como barreira tenant em todos os consumidores, preserve a máquina de estados durante rollback e comprove o backfill sobre uma base legada populada.

## Contexto

- Repositório: `crgasparoto-br/training-system`.
- Issue: #268, subissue da épica #267.
- Branch-base: `develop`.
- Branch reutilizada: `feature/268-student-lifecycle-domain`.
- PR reutilizada: #278.
- Commit inicial desta rodada: `e91a87bad59297e6099a04f28cc7abd72889a46c`.
- Auditoria anterior encontrou acesso tenant ainda derivado de `Professor.contractId`, trigger de rollback interferindo em updates do novo domínio e ausência de teste discriminante de backfill legado.

## Fora de escopo

- UI administrativa de leads.
- Convites e tokens públicos completos.
- Deduplicação administrativa completa da #274.
- Merge da PR ou fechamento da issue.

## Arquivos e módulos principais

- `apps/api/src/modules/alunos/aluno.service.ts`
- `apps/api/src/modules/alunos/student-domain.service.ts`
- `apps/api/src/modules/alunos/student-domain.routes.ts`
- `apps/api/src/modules/agenda/agenda.service.ts`
- `apps/api/src/modules/agenda/fixed-schedule.service.ts`
- `apps/api/src/modules/library/library.service.ts`
- `apps/api/prisma/migrations/20260721120000_student_lifecycle_domain/migration.sql`
- `apps/api/src/modules/alunos/student-lifecycle.service.test.ts`
- `apps/api/src/modules/alunos/student-lifecycle-migration-compatibility.integration.test.ts`
- `.github/workflows/validate-pr.yml`
- `docs/architecture/student-lifecycle-data-ownership.md`
- `docs/architecture/database.md`

## Regras e restrições

- `Aluno.contractId` é a barreira tenant canônica, inclusive quando `professorId` é nulo ou diverge por dado legado.
- Relações com professor podem restringir uma operação funcional, mas não podem substituir o filtro tenant do aluno.
- Atualizações de `Aluno.status` da aplicação nova passam somente por `student-lifecycle.service.ts`.
- A compatibilidade da aplicação antiga deve atuar somente em inserts legados e nunca reclassificar updates normais.
- Backfill deve preservar IDs e relacionamentos existentes e não inventar dados históricos.
- A mesma branch e a mesma PR serão usadas em todos os ciclos.
- Nenhum merge será realizado.

## Passos de implementação

- [ ] Substituir filtros tenant indiretos em consultas de aluno por `Aluno.contractId`.
- [ ] Propagar `companyContractId` a todos os endpoints segmentados e aplicar defesa em profundidade no service.
- [ ] Restringir o trigger legado a `BEFORE INSERT`.
- [ ] Adicionar regressão para aluno ativo sem professor em consulta, agenda, horário fixo e progresso.
- [ ] Adicionar regressão de reabertura com conta, professor e idade preenchidos.
- [ ] Adicionar validação de backfill sobre banco legado isolado e populado.
- [ ] Atualizar documentação e descrição da PR.
- [ ] Executar validações, auditoria independente, higienização e auditoria final.

## Critérios de aceite

- [ ] Aluno ativo sem professor é localizado pelo contrato e não retorna 404 por falsa ausência.
- [ ] Busca, agenda, horários fixos e progresso usam `Aluno.contractId` como escopo.
- [ ] Serviço segmentado não retorna aluno de contrato diferente mesmo quando chamado sem a rota protetora.
- [ ] Reabrir um descartado com conta/professor/idade persiste `LEAD` e auditoria coerente.
- [ ] Insert da aplicação antiga continua derivando contrato e criando aluno ativo.
- [ ] Update da aplicação nova não é reclassificado pelo trigger de compatibilidade.
- [ ] Backfill de base pré-#268 preserva IDs e relações representativas.
- [ ] `pnpm validate` e `pnpm build` passam.
- [ ] Auditoria funcional final é aprovada sem ressalvas.

## Validação manual

- Ativar lead sem professor, consultar na lista e abrir detalhes pelo mesmo contrato.
- Tentar acessar o mesmo ID com contrato diferente e confirmar resposta equivalente a não encontrado.
- Descartar e reabrir registro completo e confirmar estado `LEAD`.
- Executar insert no formato da aplicação antiga sem `contractId/status` e confirmar `ACTIVE_STUDENT`.
- Aplicar migration em schema legado isolado com registros relacionados e confirmar preservação.

## Decisões e pendências

- O trigger temporário permanece somente para inserts da aplicação anterior e será removido na #275.
- Operações que funcionalmente exigem professor devem retornar erro explícito após validar o tenant pelo aluno.
