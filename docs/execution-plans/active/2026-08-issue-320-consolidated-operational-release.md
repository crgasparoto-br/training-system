# Plano: issue #320 - liberação operacional da Montagem Consolidada

## Objetivo

Publicar uma versão aprovada da Montagem Consolidada no grafo operacional existente de treino, com autorização específica, concorrência segura, idempotência e rastreabilidade relacional consultável por IDs.

## Contexto

- Base: `develop` após #318 e #319.
- A #319 prepara snapshots e vínculos por ID, mas não escreve no Workout Builder.
- A #317 já define aprovação, bloqueio e nova revisão do agregado.
- O modelo operacional existente é `TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise`.
- A pendência #339 é absorvida neste candidato: Flexibilidade usa `WorkoutDay.detailNotes` e Equilíbrio usa `WorkoutDay.complementNotes`, sempre a partir de parâmetros estruturados e mantendo os snapshots originais.

## Fora de escopo

- Criar entidade paralela de `Treino de hoje`.
- Fazer matching por nome/texto.
- Criar exercício fictício para flexibilidade/equilíbrio.
- Criar semana alternativa para contornar conflito com treino iniciado.
- Alterar automaticamente uma versão depois da liberação.
- Adicionar fluxo visual novo de liberação nesta issue.

## Arquivos e módulos principais

- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-operational.service.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-flex-balance-operational.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-release.service.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-release.routes.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-traceability.service.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-traceability.routes.ts`
- `apps/api/prisma/migrations/20260812143000_issue_320_consolidated_operational_release/migration.sql`
- `packages/types/access-control.ts`
- testes unitários, PostgreSQL e HTTP
- documentação de liberação e rastreabilidade

## Regras e restrições

- `contractId`, ator e timestamps vêm da sessão/backend.
- `plans.consolidatedPrescriptions.release` é independente de `manage` e `approve`.
- `dataScope` de `plans` é revalidado dentro da transação definitiva.
- A versão aprovada, capacidades, conflitos e referências operacionais são revalidados após lock.
- O vínculo versão -> treino é relacional, único e append-only.
- `WorkoutTemplate.released` só muda depois da persistência do conteúdo, versão released e vínculo de auditoria.
- Treino iniciado/executado nunca é sobrescrito.
- Retry semanticamente idêntico retorna o mesmo release.
- A cadeia histórica pode ser consultada a partir de `WorkoutTemplate`, `WorkoutDay` ou `WorkoutExercise` usando apenas IDs e relações persistidas.
- Flexibilidade só fica `mapped` quando todas as articulações possuem nome e prescrição sugerida explícita.
- Equilíbrio só fica `mapped` quando possui foco e ao menos apoio ou progressão explícitos.
- Os parâmetros estruturados completos permanecem em `sourceParameters`; a nota do dia é somente a materialização operacional.

## Passos de implementação

- [x] Confirmar dependências #318/#319 em `develop`.
- [x] Criar permissão específica de liberação e defaults seguros.
- [x] Criar comando backend separado da aprovação.
- [x] Implementar revalidação transacional, lock e CAS da versão.
- [x] Persistir vínculo relacional imutável/idempotente por migration.
- [x] Mapear somente campos explicitamente suportados pelo grafo operacional existente.
- [x] Proteger `WorkoutDay`/`WorkoutExecution` já iniciados.
- [x] Criar versão `released` e liberar template somente ao final da transação.
- [x] Implementar consulta da cadeia por ID de template, dia ou exercício.
- [x] Definir representação operacional explícita de Flexibilidade e Equilíbrio (#339).
- [x] Substituir o fixture sintético das duas capacidades por projeções coerentes com o contrato real.
- [x] Adicionar prova HTTP para permissão revogada, cross-tenant e `dataScope=self`.
- [x] Atualizar documentação do fluxo.
- [ ] Executar os gates completos do repositório em checkout com dependências/PostgreSQL.

## Critérios de aceite

- [x] A liberação é independente da aprovação.
- [x] Autorização, tenant e `dataScope` são fail-closed.
- [x] A mesma versão não produz duas saídas operacionais.
- [x] Uma versão diferente não reassocia silenciosamente template já liberado.
- [x] Falha intermediária reverte a transação inteira.
- [x] A versão aprovada permanece histórica e uma nova versão `released` registra a transição.
- [x] `WorkoutTemplate/WorkoutDay/WorkoutExercise` podem ser rastreados por IDs até release, versão consolidada, capacidades e fontes.
- [x] Flexibilidade e Equilíbrio possuem representação operacional explícita sem árvore paralela nem exercício fictício.
- [x] Documentação registra comportamento e limites.
- [ ] `pnpm validate` passa no SHA final.
- [ ] Gate PostgreSQL discriminante confirma concorrência e rollback com duas conexões.

## Validação manual

1. Aprovar uma montagem elegível, preparar todos os itens operacionais e escolher um template ainda não executado.
2. Confirmar que Flexibilidade aparece como `WorkoutDay.detailNotes` e Equilíbrio como `WorkoutDay.complementNotes`, mantendo os parâmetros estruturados nos `sourceRefs`.
3. Liberar e confirmar `ConsolidatedPrescriptionOperationalRelease`, nova versão `released` e `WorkoutTemplate.released=true`.
4. Repetir o mesmo body e confirmar resposta idempotente sem nova versão/template.
5. Repetir a versão com destino diferente e confirmar `409`.
6. Iniciar um dia ou gravar `WorkoutExecution` e confirmar que nova liberação para esse alvo falha sem mutação parcial.
7. Alterar `mappingRevision`/`ExerciseLibrary.updatedAt` depois da preparação e confirmar bloqueio.
8. Revogar `plans.consolidatedPrescriptions.release` depois da emissão do token e confirmar `403`.
9. Tentar aluno de outro contrato ou fora de `dataScope=self` e confirmar `404` genérico, sem enumeração.
10. Consultar `operational-traceability` por template, dia e exercício e confirmar a mesma cadeia histórica até capacidades/sourceRefs.

## Decisões e pendências

- O comando exige posicionamento explícito; não existe distribuição heurística por dia/seção.
- Somente os campos declarados no contrato operacional são aceitos na projeção.
- A consulta de rastreabilidade exige `plans.consolidatedPrescriptions.view` e não amplia `dataScope`.
- Parâmetro estruturado insuficiente em Flexibilidade/Equilíbrio continua fail-closed com `operational_representation_unavailable`.
- O ambiente desta execução é `connector-only`; os gates locais dependentes do checkout não podem ser executados aqui e serão tratados pelo CI automático do SHA congelado, sem disparo ou rerun manual.
