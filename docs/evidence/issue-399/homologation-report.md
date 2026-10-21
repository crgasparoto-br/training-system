# Relatório de homologação — Issue #399

**Resultado: PARCIAL.** A migração e as cópias de semanas foram homologadas no PostgreSQL isolado; o fluxo autenticado principal já havia sido executado e a recertificação visual do exercício legado em treino liberado foi concluída no candidato `1de2ae9`. Regressões concorrentes de criação/atualização de templates também foram reproduzidas e corrigidas. `pnpm validate` e o build agregado continuam limitados por memória, e o CI do novo candidato ainda precisa ser observado.

## Identidade e ambiente

- Repositório: `crgasparoto-br/training-system`
- Issue: [#399](https://github.com/crgasparoto-br/training-system/issues/399)
- PR: [#516](https://github.com/crgasparoto-br/training-system/pull/516), branch `feat/399-resistance-blocks-sets`, base `develop`
- SHA de referência do fluxo operacional, da migração e das capturas: `f651ab6185bc7bd2b0fca153b25369cbbe010954`
- SHA da correção de leitura e dos testes de regressão: `c16484476bda5dab646e8c84972589b739dedc7b`
- SHA do candidato funcional mais recente: `1de2ae9dac1d19014b918a77d466efba810a2808`.
- Antes da publicação deste candidato, o HEAD remoto da PR ainda era `019d9fbadd373eebc56cb809908383ed9d4abe82`; os runs existentes não validam `1de2ae9…`.
- PostgreSQL exclusivo de teste: 17.6, container `issue399-pg-f651ab6`, publicado somente em `127.0.0.1:19191`, banco `issue399_test`.
- API e preview web da recertificação foram publicados somente em `127.0.0.1:19192` e `127.0.0.1:19193`; a API usou uma rede de teste sem masquerading e a rede interna exclusiva do PostgreSQL. Conta e dados eram sintéticos; a senha temporária foi gerada em memória e restaurada para o hash de fixture. Nenhum serviço de produção, Caddy, Keycloak ou ambiente da Issue #385 foi alterado.
- O container de API mais antigo permanece parado; o container efêmero da recertificação e a rede temporária criada para ele foram encerrados. O PostgreSQL isolado foi preservado.

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

O teste de integração no PostgreSQL real executou cópia contendo exercícios, blocos e séries, substituição de destino editável, falha controlada após o início da substituição, rollback integral e recusa de destino liberado. O arquivo `workout-session-execution.integration.test.ts` passou 23/23 testes no SHA de referência `f651ab6…`; a recertificação atual no SHA `1de2ae9…` passou 26/26, incluindo duas novas regressões de concorrência. Os trechos de regressão permanecem no próprio teste.

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

Recertificação histórica no SHA `c1648447…`:

- 75/75 testes de `workout.routes.test.ts` passaram.
- Chamada direta ao serviço, carregando o código alterado e consultando o PostgreSQL 17.6 real, abriu o template liberado `issue399-template-1`, manteve `weekStartDate` e `workoutDate`, preservou o ID do exercício legado e confirmou ausência de blocos inventados.
- A regressão correspondente foi adicionada a `workout-session-execution.integration.test.ts`; naquela execução o runner Jest foi encerrado por falta de memória.

Recertificação autenticada no candidato `1de2ae9…`:

- Login real pela rota `/login`, como professor sintético; rota do builder: `/plans/cmvgug83o00h32xmevwnqjdhh/workout-builder/1/1`.
- A aba resistida exibiu `Remada issue399-replay` com a indicação `estrutura simples (legado)`, sem inventar blocos. O controle de detalhamento do exercício e a ação de liberação estavam desabilitados para o treino liberado.
- Nos viewports 1440, 768 e 390 px, `scrollWidth` foi igual à largura do viewport; zero campos de entrada sem label/`aria-label`; um fieldset de edição desabilitado. Não houve erro de página nem resposta API 5xx.
- A chamada não fatal `GET /api/v1/periodization/matrix/cmvgug83o00h32xmevwnqjdhh` retornou 404 porque o fixture sintético não contém essa matriz. O exercício legado e o estado liberado foram carregados normalmente; esta ausência de fixture permanece registrada.
- Capturas desidentificadas, screenshots em página completa e hashes:

| Captura | Rota/audiência/estado | Viewport | SHA do código | SHA-256 da captura |
|---|---|---:|---|---|
| [authenticated-legacy-1440-1de2ae9.png](./authenticated-legacy-1440-1de2ae9.png) | Builder autenticado, treino liberado, exercício legado visível e bloqueado | 1440 × 900 | `1de2ae9dac1d19014b918a77d466efba810a2808` | `577b5781a6553a7eea2609b915b4079012a75ff699112d3858ff642fa48d619c` |
| [authenticated-legacy-768-1de2ae9.png](./authenticated-legacy-768-1de2ae9.png) | Mesmo estado e audiência | 768 × 900 | `1de2ae9dac1d19014b918a77d466efba810a2808` | `1399dba3e22829f3279ea3f8a17c739483bcd4d29266da03735b7e9db9c74b21` |
| [authenticated-legacy-390-1de2ae9.png](./authenticated-legacy-390-1de2ae9.png) | Mesmo estado e audiência | 390 × 844 | `1de2ae9dac1d19014b918a77d466efba810a2808` | `9cff84fe73bc72e80c691fecd76f4c07d213be898235989afea3f3c86fb5bca1` |

O manifesto estruturado e as métricas estão em [authenticated-legacy-browser-1de2ae9.json](./authenticated-legacy-browser-1de2ae9.json). O replay autenticado completo de criação/edição/cópia/liberação permanece evidência do SHA de referência `f651ab6…`; nesta rodada, a jornada autenticada no candidato mais recente recertificou a leitura e o bloqueio do treino legado.

## Corridas concorrentes de templates — candidato `1de2ae9…`

O replay autenticado anterior havia exposto `P2002` ao criar em paralelo o mesmo template semanal e `P2034` em atualizações serializáveis concorrentes. O serviço agora recupera somente o conflito da chave composta do template e faz até duas novas tentativas para mutações serializáveis, revalidando dentro de cada transação os bloqueios de template liberado/iniciado. O teste PostgreSQL usa triggers com atraso controlado para reproduzir as duas corridas; ambas passaram no conjunto de 26 testes do candidato.

## Validações e CI

| Verificação | Resultado |
|---|---|
| Integração PostgreSQL da Issue #399 no SHA `1de2ae9…` | PASS, 26/26; inclui datas, rollback, bloqueios, legado e corridas `P2002`/`P2034` |
| Regressões de rotas no SHA `1de2ae9…` | PASS, 75/75 |
| Type-check isolado da API no SHA `1de2ae9…` | PASS, `tsc --noEmit` |
| Build web de produção com API loopback | PASS; fontes web inalteradas pelo commit de API |
| ESLint focado em serviço e integração no SHA `1de2ae9…` | PASS |
| Smoke de serviço legado no PostgreSQL real no SHA `c1648447…` | PASS |
| Diagnósticos do editor nos quatro arquivos alterados | Nenhum erro |
| `prisma validate` | PASS |
| `prisma migrate status` no PostgreSQL isolado | PASS, 153 migrações e schema atualizado |
| `pnpm docs:check`, `pnpm arch:check`, `pnpm access:check`, `pnpm audit:source-proofs` | PASS |
| Build da API no SHA `1de2ae9…` | Reexecução bloqueada por SIGKILL/exit 137 no `tsc`; um build anterior do mesmo conteúdo funcional havia passado antes do commit |
| `pnpm validate` no SHA `1de2ae9…` | PARCIAL: type-check web passou; `tsc --noEmit` da API foi encerrado por SIGKILL/exit 137 após 600 s. Lint, testes agregados e demais etapas não foram iniciados pelo script |
| CI remoto anterior | [Run 39370249624](https://github.com/crgasparoto-br/training-system/actions/runs/39370249624) e [run 39370246336](https://github.com/crgasparoto-br/training-system/actions/runs/39370246336) estavam verdes em SHA anterior; não certificam `1de2ae9…`. O CI do candidato ainda precisa ser consultado após publicação. |

## Pendências para concluir

1. Disponibilizar memória suficiente para concluir `pnpm validate` e o build da API; os checks focados da API e a integração PostgreSQL passaram.
2. Reexecutar a jornada autenticada completa de criar/editar/copiar/liberar no candidato mais recente; o fluxo completo comprovado anteriormente é do SHA de referência `f651ab6…`, enquanto `1de2ae9…` foi autenticado para recertificar exercício legado liberado e bloqueio.
3. Publicar o candidato na branch da PR e observar uma única vez o CI no SHA remoto exato.
4. Encaminhar o SHA congelado para nova auditoria independente com `auditar-issue` em contexto separado.

Não houve merge nem fechamento da issue. Não declarar aprovação independente nesta homologação.
