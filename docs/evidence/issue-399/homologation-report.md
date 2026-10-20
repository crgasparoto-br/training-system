# Relatório de homologação — Issue #399

**Resultado: PARCIAL.** A migração, a cópia de semanas e o fluxo autenticado principal foram homologados no PostgreSQL e na aplicação isolada. A correção de leitura de exercício legado em treino liberado foi implementada e verificada no banco real, mas a recertificação visual desse caso, o gate agregado e o CI no novo SHA não puderam ser concluídos nesta sessão.

## Identidade e ambiente

- Repositório: `crgasparoto-br/training-system`
- Issue: [#399](https://github.com/crgasparoto-br/training-system/issues/399)
- PR: [#516](https://github.com/crgasparoto-br/training-system/pull/516), branch `feat/399-resistance-blocks-sets`, base `develop`
- SHA de referência do fluxo operacional, da migração e das capturas: `f651ab6185bc7bd2b0fca153b25369cbbe010954`
- SHA da correção de leitura e dos testes de regressão: `c16484476bda5dab646e8c84972589b739dedc7b`
- O SHA `c1648447…` foi criado localmente na branch; no momento desta evidência, o HEAD remoto da PR ainda era `f651ab6…`. Os runs anteriores não validam o SHA da correção.
- PostgreSQL exclusivo de teste: 17.6, container `issue399-pg-f651ab6`, publicado somente em `127.0.0.1:19191`, banco `issue399_test`.
- A API e o preview web foram usados somente por portas loopback; dados e contas eram sintéticos. Não foram alterados produção, Caddy, Keycloak ou o ambiente da Issue #385.
- O container temporário da API foi recriado sem política de remoção automática e ficou parado após não responder sob o limite de 512 MiB. Nenhum outro container foi parado ou alterado.

## AUD-399-08 — consistência das datas: PASS

A cópia foi executada com semana de origem e destino diferentes, incluindo cenário próximo à virada do mês/ano. A API derivou a data do dia a partir da semana de destino e de `dayOfWeek`; a origem permaneceu inalterada.

Exemplo de consulta de conferência:

```sql
SELECT t."weekStartDate", d."dayOfWeek", d."workoutDate"
FROM "WorkoutTemplate" t
JOIN "WorkoutDay" d ON d."templateId" = t.id
WHERE t.id = :template_de_destino
ORDER BY d."dayOfWeek";
```

No replay operacional, a âncora mudou de `2026-10-22` para `2026-10-15`; para `dayOfWeek = 1`, a data mudou de `2026-10-19` para `2026-10-12`, dentro da semana de destino. A semana de origem permaneceu `2026-10-22` / `2026-10-19`.

## AUD-399-09 — atomicidade: PASS

O teste de integração no PostgreSQL real executou cópia contendo exercícios, blocos e séries, substituição de destino editável, falha controlada após o início da substituição, rollback integral e recusa de destino liberado. O arquivo `workout-session-execution.integration.test.ts` passou 23/23 testes no SHA de referência `f651ab6…`; os trechos de regressão permanecem no próprio teste.

Consulta de verificação do estado do destino após a falha:

```sql
SELECT t.id, t."weekStartDate", t.released,
       d.id AS day_id, d."dayOfWeek", d."workoutDate",
       e.id AS exercise_id, e."exerciseOrder",
       b.id AS block_id, s.id AS planned_set_id, s."loadKg"
FROM "WorkoutTemplate" t
LEFT JOIN "WorkoutDay" d ON d."templateId" = t.id
LEFT JOIN "WorkoutExercise" e ON e."workoutDayId" = d.id
LEFT JOIN "WorkoutExerciseBlock" b ON b."workoutExerciseId" = e.id
LEFT JOIN "WorkoutExercisePlannedSet" s ON s."blockId" = b.id
WHERE t.id = :template_de_destino
ORDER BY d."dayOfWeek", e."exerciseOrder", b.position, s.position;
```

O estado e os IDs anteriores foram preservados após o rollback. Destino liberado foi rejeitado. A resposta de falha de cópia é genérica e os testes verificam que detalhes SQL não são devolvidos ao cliente.

## Migração e preservação do histórico

- Schema prévio aplicado: 152 migrações.
- Migração `20261019190000_issue_399_resistance_blocks` aplicada em PostgreSQL 17.6; total: 153 migrações aplicadas.
- Criadas `WorkoutExerciseBlock` e `WorkoutExercisePlannedSet`; confirmadas cinco FKs relevantes e três triggers de proteção/correspondência.
- Registros legados, IDs, cargas executadas e relações planejadas/executadas foram preservados. Triggers rejeitaram alterações de planejamento protegido e referência de série planejada incompatível. Vincular uma série correta não alterou a carga planejada (`32.5 kg`); a execução permaneceu `35.5 kg`.

Consultas de conferência reproduzíveis:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name = '20261019190000_issue_399_resistance_blocks';

SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_name IN ('WorkoutExerciseBlock', 'WorkoutExercisePlannedSet')
ORDER BY table_name;

SELECT t.tgname, c.relname AS table_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND t.tgname LIKE 'issue399_%'
ORDER BY t.tgname;

SELECT id, "workoutDayId", "exerciseId", section, "exerciseOrder", sets, reps
FROM "WorkoutExercise"
WHERE id = 'issue399-exercise-1';

SELECT id, "workoutExerciseId", "setsCompleted", "repsCompleted", "loadUsed"
FROM "WorkoutExecution"
WHERE id = 'issue399-legacy-execution';

SELECT id, "plannedUnitId", "plannedSetId", "loadKg", repetitions
FROM "WorkoutSessionExecutionItem"
WHERE id IN ('issue399-linked-execution-item',
             'issue399-legacy-session-item',
             'issue399-started-session-item');
```

Resultados exportados sem credenciais: [migration-integrity.txt](./migration-integrity.txt) e [trigger-results.txt](./trigger-results.txt).

## AUD-399-10 — fluxo autenticado e interface: PARCIAL

No SHA de referência `f651ab6…`, a navegação autenticada como professor sintético criou um treino resistido, adicionou exercícios, cinco tipos de bloco e seis séries; salvou, reabriu, editou carga decimal (`32.5` → `33.75`), copiou semana 4 para semana 3 e liberou o destino. As chamadas de cópia e liberação retornaram HTTP 200. Consultas SQL confirmaram a preservação dos dados, as datas do destino e a origem inalterada.

Em `1440`, `768` e `390` px não houve overflow horizontal. Foram encontrados 78 campos com nome acessível e nenhum campo sem label/`aria-label`. Capturas sintéticas do fluxo principal:

| Captura | Rota/audiência/estado/interação | Viewport | SHA do código | SHA-256 da captura |
|---|---|---:|---|---|
| [desktop-f651ab6.png](./desktop-f651ab6.png) | Builder de treino, professor sintético, semana 4 preenchida; criar, editar e salvar cinco tipos de bloco | 1440 × 4008 | `f651ab6185bc7bd2b0fca153b25369cbbe010954` | `1b1d77389e231c969f3335deb08466af5f4d41f224cb344f98d720bb56488d43` |
| [tablet-f651ab6.png](./tablet-f651ab6.png) | Mesmo estado persistido da jornada principal | 768 × 4804 | `f651ab6185bc7bd2b0fca153b25369cbbe010954` | `5b7c0b3eea149dfbd457888c04e4bfd1838ec9f586fe7317f04aa7208caad859` |
| [mobile-f651ab6.png](./mobile-f651ab6.png) | Mesmo estado persistido da jornada principal | 390 × 7940 | `f651ab6185bc7bd2b0fca153b25369cbbe010954` | `0961b3d8707b5ec6ccf232c9dfa1fbbeed730ffad24fd1a30d578a9a3fce925f` |

Durante a abertura de um exercício legado em template liberado, foi encontrado que `getOrCreateTemplate` tentava corrigir `weekStartDate`, embora a proteção corretamente impedisse mutação. O builder não carregava. A correção em `c1648447…` agora devolve o template liberado existente sem atualizar suas datas; erros inesperados do endpoint também deixaram de expor `error.message`.

Recertificação no SHA `c1648447…`:

- 75/75 testes de `workout.routes.test.ts` passaram.
- Chamada direta ao serviço, carregando o código alterado e consultando o PostgreSQL 17.6 real, abriu o template liberado `issue399-template-1`, manteve `weekStartDate` e `workoutDate`, preservou o ID do exercício legado e confirmou ausência de blocos inventados.
- A regressão correspondente foi adicionada a `workout-session-execution.integration.test.ts`, mas o runner Jest desse arquivo foi encerrado por falta de memória antes de produzir resultado.
- A navegação autenticada em navegador e a captura visual da tela legada após a correção **não foram comprovadas**. O runtime API temporário atingiu o limite de 512 MiB e não respondeu; foi parado sem remoção do container.

## Validações e CI

| Verificação | Resultado |
|---|---|
| Integração PostgreSQL anterior, incluindo cópia/datas/rollback/bloqueios | PASS, 23/23 no SHA `f651ab6…` |
| Regressões de rotas no SHA `c1648447…` | PASS, 75/75 |
| Smoke de serviço legado no PostgreSQL real no SHA `c1648447…` | PASS |
| ESLint dos quatro arquivos API alterados | PASS |
| Diagnósticos do editor nos quatro arquivos alterados | Nenhum erro |
| `prisma validate` | PASS |
| `prisma migrate status` no PostgreSQL isolado | PASS, 153 migrações e schema atualizado |
| `pnpm docs:check`, `pnpm arch:check`, `pnpm access:check`, `pnpm audit:source-proofs` | PASS |
| ESLint agregado (`pnpm lint`) | BLOQUEADO por `SIGKILL`/exit 137 no lint de `apps/web`; ESLint API focado passou |
| `pnpm validate` | BLOQUEADO por `SIGKILL`/exit 137 no `tsc --noEmit` de `apps/web`; lint, testes, build e demais etapas agregadas não foram iniciados pelo script |
| Build agregado (`pnpm build`) | BLOQUEADO por `SIGKILL`/exit 137 durante `tsc` de `apps/web`/`packages/types`; o build da API não foi alcançado |
| Build de produção web anterior | PASS no SHA de referência `f651ab6…`; nenhuma alteração web nesta correção |
| `tsc --noEmit` da API e integração Jest do arquivo PostgreSQL após a alteração | BLOQUEADOS por limite de memória do host (`SIGKILL`/exit 137) |
| CI remoto | [Run 39370249624](https://github.com/crgasparoto-br/training-system/actions/runs/39370249624) e [run 39370246336](https://github.com/crgasparoto-br/training-system/actions/runs/39370246336) estavam verdes no SHA `f651ab6…`. Nenhum deles certifica `c1648447…`. |

## Pendências para concluir

1. Disponibilizar memória para executar `pnpm validate`, build/type-check e a regressão Jest PostgreSQL adicionada.
2. Reiniciar a API isolada e repetir autenticação/navegação real até a tela do exercício legado liberado, verificar bloqueio de edição e capturar estado após a correção nas larguras necessárias.
3. Publicar o candidato validado na branch da PR e confirmar CI verde no SHA remoto exato.
4. Encaminhar o SHA congelado para nova auditoria independente com `auditar-issue` em contexto separado.

Não houve merge nem fechamento da issue. Não declarar aprovação independente nesta homologação.
