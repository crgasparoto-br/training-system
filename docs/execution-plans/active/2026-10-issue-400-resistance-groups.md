# Issue #400 — Agrupamentos de treino resistido

- Repositório: `crgasparoto-br/training-system`
- Base: `develop`; branch de implementação: `feat/400-resistance-groups`
- Dependência: #399 (blocos e séries do exercício canônico)
- Estado: candidato à validação em CI e revisão independente; não há autorização de merge.

## Contrato e riscos

1. Tipagem explícita dos sete agrupamentos, ordem e cardinalidade dos membros, rodadas e intervalos sem valores presumidos.
2. Identidade canônica: `WorkoutResistanceGroupMember` vincula `WorkoutExercise.id`, sem duplicar exercício/série ou misturar realizado e planejado.
3. Escopo seguro: transações verificam dia, contrato e exercícios participantes no mesmo `WorkoutDay`; SQL restringe vínculos de outro dia e impedem reparenting.
4. Imutabilidade histórica: proteger `released`, ledger operacional, execução iniciada e `WorkoutExecution`; também SQL direto.
5. Compatibilidade: ausência de grupos preserva treinos legados; cópia ressignifica IDs de membros, nunca replica linhas históricas; reenvio idêntico é no-op.
6. Editor acessível: agrupar, revisar, mudar tipo, mudar ordem, desfazer sem apagar o exercício; somente leitura herdada do `fieldset` operacional.

## Arquivos e cenários de validação

- Esquema e migrações: `apps/api/prisma/schema.prisma`, `prisma/schema.prisma`, migrações aditivas `20261028223000_issue_400_resistance_groups`.
- Domínio/API: `resistance-groups.domain.ts`, `workout-week-structure.service.ts`, `workout-copy.service.ts`, `workout.service.ts`, rotas e leitura de aluno.
- Interface: `ResistanceGroupsEditor.tsx`, `WorkoutBuilderResistance.tsx`, `workout-builder-structure.ts`, `index.tsx`.
- Controles negativos: tipo desconhecido, cardinalidade inválida, referência cruzada, contrato alheio, reparenting, tentativa de editar grupo liberado, falha de transação sem mutação parcial.
- Regressão: treinos sem grupos, blocos #399, cópia apenas cíclica #398, novos IDs da cópia resistida, histórico e simultaneidade de gravação.
- Validação canônica exigida: `pnpm validate` (Prisma, type-check, lint, testes, arquitetura, acessos, docs e provas). Integração PostgreSQL adicional com `RUN_DATABASE_INTEGRATION_TESTS=true`.

## Entrega

Não efetuar merge. A implementação só será considerada concluída após checks do HEAD exato, validação de migração, testes relevantes e auditoria independente sem pendências.
