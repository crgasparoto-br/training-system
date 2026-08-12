# Plano: issue #319 - integração operacional da Montagem Consolidada

## Objetivo

Integrar a Montagem Consolidada com as prescrições por capacidade, o catálogo técnico, a `ExerciseLibrary` e os modelos já existentes do Workout Builder, criando uma projeção rastreável e versionada sem publicar nem alterar o treino operacional nesta fase.

## Contexto

- Issue: #319.
- Base: `develop`.
- Dependência #317 já materializada em `develop` pela PR #322.
- A interface da #318 já está incorporada em `develop`.
- Fonte de verdade do fluxo: `docs/product/integrated-prescription-control.md`.
- Contrato específico desta entrega: `docs/product/consolidated-prescription-operational-integration.md`.
- `ExerciseLibrary` é a autoridade operacional de `WorkoutExercise.exerciseId`.
- `CapacityTechnicalCatalogItem(category = exercise)` permanece como vocabulário técnico versionado.

## Fora de escopo

- `approved -> released`;
- criação ou alteração definitiva de `TrainingPlan`, `WorkoutTemplate`, `WorkoutDay` ou `WorkoutExercise`;
- geração/publicação do Treino de hoje;
- importação ou deduplicação em massa da biblioteca;
- matching por nome/código/texto;
- sugestão automática de substituição;
- criação de um status fictício de curadoria.

## Arquivos e módulos principais

- `packages/types/capacity-prescription.ts`
- `packages/types/consolidated-prescription-operational.ts`
- `apps/api/src/modules/capacity-prescriptions/capacity-exercise-mapping.service.ts`
- `apps/api/src/modules/capacity-prescriptions/capacity-exercise-mapping.routes.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-operational.service.ts`
- `apps/api/src/modules/consolidated-prescriptions/consolidated-prescription-operational.routes.ts`
- `docs/product/consolidated-prescription-operational-integration.md`

## Regras e restrições

- Toda associação técnica usa ID persistido; nome, código e textos não são chaves de integração.
- `contractId`, ator e `dataScope` vêm da sessão e permanecem barreiras obrigatórias.
- O mapeamento técnico -> operacional é manual e concorrente por `mappingRevision`.
- A capacidade resistida referencia itens técnicos por `exerciseTechnicalCatalogItemIds` em uma nova versão da prescrição.
- A preparação grava snapshots na versão da Montagem Consolidada para proteger histórico contra alterações futuras da biblioteca.
- Campos sem representação inequívoca ficam em `unsupportedParameters` ou incompatibilidade; não há inferência clínica.
- Flexibilidade e equilíbrio permanecem rastreáveis sem criar representação operacional fictícia.
- Substituições exigem ID explícito, motivo, origem, ator e data e não escrevem no Workout Builder.
- Referências internas de projeção/substituição são server-owned e não podem ser sobrescritas por payload comum da composição.

## Passos de implementação

- [x] Definir contratos compartilhados do adaptador e IDs técnicos de exercício.
- [x] Implementar vínculo técnico -> `ExerciseLibrary` por ID e revisão concorrente.
- [x] Implementar rota dedicada para versionar IDs técnicos na capacidade resistida.
- [x] Implementar busca tenant-scoped da biblioteca para seleção humana.
- [x] Implementar projeção explícita das quatro capacidades para os modelos operacionais existentes.
- [x] Implementar preparação versionada sem mutar Workout Builder.
- [x] Implementar substituição manual rastreável e cross-tenant safe.
- [x] Proteger referências internas contra sobrescrita pelo cliente.
- [x] Adicionar testes unitários discriminantes.
- [x] Atualizar documentação de produto.
- [ ] Executar gates finais no candidato publicado.
- [ ] Realizar auditoria independente em contexto separado.

## Critérios de aceite

- [x] Exercício técnico pode participar da prescrição por ID estável.
- [x] Vínculo com `ExerciseLibrary` é explícito, persistido e tenant-scoped.
- [x] Mesmo nome não produz associação automática.
- [x] Resistido e cíclico mapeiam somente campos explicitamente suportados.
- [x] Flexibilidade e equilíbrio permanecem incompatibilidades rastreáveis quando não há modelo operacional.
- [x] Exercício operacional removido/inacessível não é recriado automaticamente.
- [x] Substituição exige alternativa explícita no mesmo contrato e registra rastreabilidade.
- [x] Restrições que a biblioteca não consegue validar não são aprovadas por inferência.
- [x] Snapshots preservam a montagem histórica contra rename/metadados futuros.
- [x] Nenhuma rota desta entrega publica ou libera treino.
- [x] Documentação permanente foi adicionada.
- [ ] `pnpm validate` passa no candidato final.

## Validação manual

1. Versionar uma capacidade resistida com um `CapacityTechnicalCatalogItem(category=exercise)` por ID.
2. Mapear o item para um `ExerciseLibrary` do mesmo contrato e preparar a projeção.
3. Confirmar que outro exercício de mesmo nome não é associado sem ID explícito.
4. Remover ou tornar inacessível o exercício operacional e verificar incompatibilidade rastreável sem alteração da montagem histórica.
5. Preparar capacidade cíclica e confirmar que somente campos suportados aparecem em `WorkoutTemplate`/`WorkoutDay`.
6. Confirmar flexibilidade/equilíbrio como incompatibilidades preservadas.
7. Registrar substituição por ID e conferir motivo, origem, ator, data e snapshots.
8. Tentar substituto de outro contrato e confirmar rejeição.
9. Alterar `mappingRevision` e repetir comando com revisão antiga para confirmar conflito.
10. Confirmar que nenhum fluxo chama liberação de template ou grava `WorkoutDay`/`WorkoutExercise`.

## Decisões e pendências

- `ExerciseLibrary` não possui status real de curadoria. A API expõe `curationStatus = not_modeled` e não inventa aprovação; um domínio de curadoria, se necessário, deve ser especificado em issue própria.
- A mutação operacional definitiva e a transição `released` permanecem reservadas à #320.
- O ambiente desta execução não conseguiu materializar o repositório local por falha DNS; os gates executáveis serão observados no GitHub Actions do candidato publicado, sem rerun ou polling ativo.
