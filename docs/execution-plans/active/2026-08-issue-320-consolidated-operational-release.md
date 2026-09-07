# Plano: issue #320 - liberação operacional da Montagem Consolidada

## Objetivo

Publicar uma versão aprovada da Montagem Consolidada no grafo operacional existente de treino, com autorização específica, concorrência segura, idempotência e rastreabilidade relacional consultável por IDs.

## Contexto

- Base: `develop` após #318 e #319.
- A #319 prepara snapshots e vínculos por ID, mas não escreve no Workout Builder.
- A #317 já define aprovação, bloqueio e nova revisão do agregado.
- O modelo operacional existente continua sendo `TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise`.
- A pendência #339 é absorvida neste candidato sem criar uma segunda árvore: Flexibilidade e Equilíbrio usam `WorkoutDayCapacityOperationalBlock`, relação aditiva do próprio `WorkoutDay`, com FK para a `CapacityPrescriptionVersion` exata, `contractVersion=1` e parâmetros estruturados sem perda. `detailNotes`/`complementNotes` permanecem somente como apresentação derivada.

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
- documentação de liberação, persistência e rastreabilidade

## Regras e restrições

- `contractId`, ator e timestamps vêm da sessão/backend.
- `plans.consolidatedPrescriptions.release` é independente de `manage` e `approve`.
- `dataScope` de `plans` é revalidado dentro da transação definitiva.
- A versão aprovada, capacidades, conflitos e referências operacionais são revalidados após lock.
- O vínculo versão -> treino é relacional, único e append-only.
- `WorkoutTemplate.released` só muda depois da persistência do conteúdo, versão released, blocos estruturados e vínculo de auditoria.
- Treino iniciado/executado nunca é sobrescrito ou reconciliado destrutivamente.
- Um target futuro totalmente planejado pode ser reutilizado, mas deve coincidir exatamente com o snapshot aprovado: dias e exercícios excedentes são removidos e campos gerenciados que deixaram de ser projetados são zerados dentro da mesma transação.
- Retry semanticamente idêntico retorna o mesmo release.
- A cadeia histórica pode ser consultada a partir de `WorkoutTemplate`, `WorkoutDay` ou `WorkoutExercise` usando apenas IDs e relações persistidas.
- Flexibilidade só fica `mapped` quando todas as articulações possuem nome e prescrição sugerida explícita e um `WorkoutDayCapacityOperationalBlock` íntegro pode ser produzido.
- Equilíbrio só fica `mapped` quando possui foco e ao menos apoio ou progressão explícitos e um `WorkoutDayCapacityOperationalBlock` íntegro pode ser produzido.
- O bloco estruturado é a autoridade operacional dessas capacidades; `detailNotes` e `complementNotes` são somente instruções/apresentação derivadas.
- O trigger PostgreSQL exige que `capacity`, aluno, contrato e `parameters` do bloco coincidam com a `CapacityPrescriptionVersion` referenciada e impede mutação posterior.

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
- [x] Definir representação operacional estruturada, versionada e sem perda de Flexibilidade e Equilíbrio (#339), sem fallback textual.
- [x] Manter `detailNotes`/`complementNotes` como apresentação determinística derivada do contrato estruturado.
- [x] Reconciliar target futuro planejado para remover dias/exercícios residuais e limpar campos gerenciados ausentes da montagem aprovada.
- [x] Expor `operationalCapacityBlocks` na consulta de rastreabilidade.
- [x] Adicionar teste PostgreSQL discriminante para target futuro com dia e exercício excedentes.
- [x] Adicionar prova PostgreSQL dos blocos estruturados de Flexibilidade/Equilíbrio e teste fail-closed sem fallback textual.
- [x] Adicionar prova HTTP para permissão revogada, cross-tenant e `dataScope=self`.
- [x] Atualizar documentação do fluxo, banco e rastreabilidade.
- [ ] Executar os gates completos do repositório em checkout com dependências/PostgreSQL.

## Critérios de aceite

- [x] A liberação é independente da aprovação.
- [x] Autorização, tenant e `dataScope` são fail-closed.
- [x] A mesma versão não produz duas saídas operacionais.
- [x] Uma versão diferente não reassocia silenciosamente template já liberado.
- [x] Falha intermediária reverte a transação inteira, inclusive reconciliação e blocos estruturados.
- [x] A versão aprovada permanece histórica e uma nova versão `released` registra a transição.
- [x] `WorkoutTemplate/WorkoutDay/WorkoutExercise` podem ser rastreados por IDs até release, versão consolidada, capacidades e fontes.
- [x] Flexibilidade e Equilíbrio possuem representação operacional estruturada, versionada e consultável sem árvore paralela, exercício fictício ou fallback textual.
- [x] Target futuro planejado é reconciliado exatamente com a montagem aprovada, sem conteúdo residual.
- [x] Documentação registra comportamento e limites.
- [ ] `pnpm validate` passa no SHA final.
- [ ] Gate PostgreSQL discriminante confirma concorrência, rollback, reconciliação e persistência estruturada no SHA final.

## Validação manual

1. Aprovar uma montagem elegível, preparar todos os itens operacionais e escolher um template ainda não executado.
2. Confirmar que Flexibilidade/Equilíbrio possuem `WorkoutDayCapacityOperationalBlock` com `contractVersion=1`, FK para a versão exata e parâmetros íntegros; `detailNotes`/`complementNotes` devem ser apenas a apresentação derivada.
3. Liberar e confirmar `ConsolidatedPrescriptionOperationalRelease`, nova versão `released` e `WorkoutTemplate.released=true`.
4. Consultar `operational-traceability` e confirmar `operationalCapacityBlocks` ligados às mesmas versões de capacidade.
5. Repetir o mesmo body e confirmar resposta idempotente sem nova versão/template.
6. Repetir a versão com destino diferente e confirmar `409`.
7. Preparar previamente um target futuro com dia/exercício excedentes e campos gerenciados antigos; liberar e confirmar que o resultado coincide exatamente com o snapshot aprovado, sem resíduos.
8. Iniciar um dia ou gravar `WorkoutExecution` e confirmar que nova liberação para esse alvo falha sem mutação parcial.
9. Alterar `mappingRevision`/`ExerciseLibrary.updatedAt` depois da preparação e confirmar bloqueio.
10. Revogar `plans.consolidatedPrescriptions.release` depois da emissão do token e confirmar `403`.
11. Tentar aluno de outro contrato ou fora de `dataScope=self` e confirmar `404` genérico, sem enumeração.
12. Consultar `operational-traceability` por template, dia e exercício e confirmar a mesma cadeia histórica até capacidades, blocos estruturados e `sourceRefs`.

## Decisões e pendências

- O comando exige posicionamento explícito; não existe distribuição heurística por dia/seção.
- Somente os campos declarados no contrato operacional são aceitos na projeção.
- A consulta de rastreabilidade exige `plans.consolidatedPrescriptions.view` e não amplia `dataScope`.
- Parâmetro estruturado insuficiente em Flexibilidade/Equilíbrio continua fail-closed com `operational_representation_unavailable`.
- `WorkoutDayCapacityOperationalBlock` é relação aditiva do `WorkoutDay`, não uma árvore paralela de treino.
- O ambiente desta execução é `connector-only`; os gates locais dependentes do checkout não podem ser executados aqui e serão tratados pelo CI automático do SHA congelado, sem disparo ou rerun manual.
