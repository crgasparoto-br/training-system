# RESULTADO: APROVADA INTERNAMENTE

> **Conclusão:** `APROVADA INTERNAMENTE` — achados bloqueantes: `0` — recomendações opcionais: `0`
>
> **Motivo determinante:** a pendência `AUD-399-10` e o bypass `AUD-399-01` foram recertificados no código `3d2f1d0f07679b45bbb6ee8367b1f3d33a47ea06`, com migration aplicada, controle SQL negativo, integração PostgreSQL e replay autenticado responsivo aprovados.
>
> **Libera merge/release:** `NÃO`

**Validade:** controller-adversarial/homologação operacional no mesmo contexto; não substitui auditoria independente nem CI remoto do SHA publicado.

Este relatório preserva os resultados históricos abaixo e acrescenta a recertificação final pós-remediação. A homologação foi executada com dados sintéticos e desidentificados; nenhuma credencial, dado pessoal ou ambiente produtivo foi utilizado.

## Identidade e ambiente

- Repositório: `crgasparoto-br/training-system`
- Issue: [#399](https://github.com/crgasparoto-br/training-system/issues/399)
- PR: [#516](https://github.com/crgasparoto-br/training-system/pull/516), branch `feat/399-resistance-blocks-sets`, base `develop`
- Branch local de remediação: `fix/399-audit-remediation`, parent `c835f40bfe29add78738479d7a41cb4e8a722eac`, commit funcional final `3d2f1d0f07679b45bbb6ee8367b1f3d33a47ea06`
- SHA de referência do fluxo operacional, da migração e das capturas: `f651ab6185bc7bd2b0fca153b25369cbbe010954`
- SHA da correção de leitura e dos testes de regressão: `c16484476bda5dab646e8c84972589b739dedc7b`
- SHA do candidato funcional mais recente: `1de2ae9dac1d19014b918a77d466efba810a2808`.
- O replay autenticado completo e suas capturas foram executados exatamente no commit de código `18fa3b3d9b54a6549505494fe045f6f116466fd9`; a correção incremental posterior `3d2f1d0f…` é restrita ao guard SQL de INSERT e foi validada pelo teste histórico e controle SQL dedicados. O pacote final está publicado na branch da PR, cujo head remoto é `99d9f521147f445dd051950da6873754093e05c0`.
- Antes da publicação deste candidato, o HEAD remoto da PR ainda era `019d9fbadd373eebc56cb809908383ed9d4abe82`; os runs existentes não validam `1de2ae9…`.
- PostgreSQL exclusivo de teste da recertificação final: 16.15, banco `issue399_audit`, publicado somente em `127.0.0.1:5432` no sandbox.
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

## Recertificação pós-remediação — commit `18fa3b3d9b54a6549505494fe045f6f116466fd9`

### AUD-399-01 — bypass de imutabilidade legada: PASS

A migration `20261021200000_issue_399_legacy_release_immutability` foi aplicada no PostgreSQL 16.15, elevando o banco isolado para 154 migrations. Em um template legado com `WorkoutTemplate.released=true` e sem depender do ledger consolidado, o controle negativo executou UPDATE e DELETE de template, dia, exercício, bloco e série em transação com rollback. Todas as dez tentativas foram bloqueadas com SQLSTATE `23514`; o template permaneceu liberado e o bloco/série permaneceram presentes. A evidência bruta está em [legacy-release-immutability-18fa3b3d.txt](./legacy-release-immutability-18fa3b3d.txt) e o estado de migrations em [migration-status-18fa3b3d.txt](./migration-status-18fa3b3d.txt).

O CI exact-SHA do head `428023b4…` encontrou um caso irmão não coberto: `WorkoutDay` podia ser inserido sob um template liberado porque, durante `BEFORE INSERT`, a linha nova ainda não existia para a consulta por `NEW.id`. A migration `20261021210000_issue_399_legacy_release_insert_guard`, no commit de código `3d2f1d0f07679b45bbb6ee8367b1f3d33a47ea06`, passou a resolver `NEW.templateId` diretamente. O teste histórico `consolidated-prescription-release-historical-immutability.integration.test.ts` passou 2/2 depois da correção, e o controle SQL dedicado bloqueou o INSERT com SQLSTATE `23514`, preservando a fixture após rollback. Evidência: [legacy-release-insert-3d2f1d0.txt](./legacy-release-insert-3d2f1d0.txt) e [migration-status-3d2f1d0.txt](./migration-status-3d2f1d0.txt).

### AUD-399-10 — fluxo autenticado e interface: PASS na homologação operacional

No commit `18fa3b3d…`, em fixture sintética nova, o replay real com Chrome/Puppeteer executou: login de professor ativo; abertura de exercício legado; criação de bloco e série estruturada; carga decimal `32.5 kg`, RIR `2`, tempo `3-1-1-0` e faixa `8–12`; salvamento; fechamento/reabertura com leitura dos valores persistidos; cópia da semana 1 para a semana 2; confirmação de IDs novos e datas derivadas (`2026-10-19` → `2026-10-26`); liberação; e reabertura do treino liberado. O resultado foi `passed=true`, sem respostas HTTP fora de 2xx/304 e sem erros de browser/console.

As capturas desidentificadas e seus hashes estão versionadas:

| Captura | Estado | Viewport | SHA-256 |
|---|---|---:|---|
| [full-flow-1440-saved-18fa3b3d.png](./full-flow-1440-saved-18fa3b3d.png) | Série estruturada salva | 1440 × 900 | `15c61b4a05b7bcb850b1ab851aad189636e0508ee729b9453ff8cb278c543c79` |
| [full-flow-1440-copied-18fa3b3d.png](./full-flow-1440-copied-18fa3b3d.png) | Semana copiada com estrutura | 1440 × 900 | `a2b2085d6fea8c0da628475488e633235cf52f3d9a404e70c851b300470f12cf` |
| [full-flow-768-released-18fa3b3d.png](./full-flow-768-released-18fa3b3d.png) | Treino liberado e bloqueado | 768 × 1024 | `959494402b6518eff2e01e9fa5e845ed57d2c3465bcb1a45f0b05cd20152b0e7` |
| [full-flow-390-released-18fa3b3d.png](./full-flow-390-released-18fa3b3d.png) | Treino liberado e bloqueado | 390 × 844 | `07120c9cbfe4f68126b6a2fbf1ffcf5f438707e80d6a7a1d8e9a74e01ce805ce` |

O JSON completo do replay, incluindo passos, respostas HTTP, IDs persistidos e valores reabertos, está em [full-flow-18fa3b3d.json](./full-flow-18fa3b3d.json). O ajuste do frontend descarta um snapshot de autosave obsoleto quando a liberação ocorre durante um timer pendente; a proteção de autoridade continua no serviço e nos triggers do PostgreSQL.

O harness oficial do componente executou 1/1 teste, incluindo teclado, modo legado sem dados inventados, campos opcionais e reflow: em 1440, 768 e 390 px, `scrollWidth` foi respectivamente `1440`, `768` e `390`, com `missingLabels=0`, `blockCount=1` e 16 controles interativos. O manifesto está em [editor-browser-18fa3b3d.json](./editor-browser-18fa3b3d.json), com capturas [1440](./editor-1440-18fa3b3d.png), [768](./editor-768-18fa3b3d.png) e [390](./editor-390-18fa3b3d.png).

## AUD-399-10 — fluxo autenticado e interface: histórico

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

## Validações pós-remediação — replay `18fa3b3d…` e correção SQL `3d2f1d0…`

| Verificação | Resultado |
|---|---|
| Migrations `20261021200000_issue_399_legacy_release_immutability` + `20261021210000_issue_399_legacy_release_insert_guard` | PASS, aplicadas; 155 migrations concluídas no PostgreSQL 16.15 |
| Controle SQL negativo do release legado | PASS, 10/10 operações de UPDATE/DELETE bloqueadas; fixture preservada após rollback |
| Integração PostgreSQL `workout-session-execution.integration.test.ts` | PASS, 26/26 |
| Domínio estruturado + rotas HTTP | PASS, 11/11 + 103/103 |
| Replay autenticado Chrome/Puppeteer | PASS; criar, editar, salvar, reabrir, copiar, liberar; 422 respostas observadas, nenhuma fora de 2xx/304; `browserErrors=[]` |
| Harness visual oficial do editor | PASS, 1/1; 1440/768/390 px, teclado e labels |
| Build web de produção | PASS; 1758 módulos transformados |
| `pnpm validate` no workspace do código | PASS, exit code 0; duração 9m55s |
| `pnpm test` após o guard incremental | LIMITADO pelo sandbox: `consolidated-prescription-persistence.integration.test.ts` exige o binário Docker (`spawnSync docker ENOENT`); os testes relevantes do candidato passaram. O CI CRITICAL executa com Docker disponível. |
| CI exact-SHA [run 39664646497](https://github.com/crgasparoto-br/training-system/actions/runs/39664646497) no head `99d9f521…` | PASS; CRITICAL, Validate repository, testes completos, build, browser real, arquitetura, acesso e documentação |

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

1. Encaminhar o SHA publicado congelado `99d9f521147f445dd051950da6873754093e05c0` para nova auditoria independente com `auditar-issue` em contexto separado.

Não houve merge nem fechamento da issue. Não declarar aprovação independente nesta homologação.
