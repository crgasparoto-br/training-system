# Issue #400 — agrupamentos resistidos estruturados

## Objetivo

Fechar a dependência estrutural da execução guiada #487 sem duplicar exercícios. O agrupamento organiza os `WorkoutExercise` canônicos já vinculados ao `WorkoutDay`.

## Contrato

Cada participante declara `groupType`. O backend materializa `groupId`, `groupPosition` e `groupRounds` em transação serializável. Tipos suportados: `superset`, `biset`, `triset`, `circuit`, `technical_block`, `mobility` e `finisher`.

- `groupId`: identidade estável do grupo na versão planejada.
- `groupPosition`: ordem persistida do participante.
- `groupRounds`: rodadas, iguais à quantidade de séries estruturadas de cada participante.
- `groupBreakBefore`: fronteira explícita entre grupos contíguos do mesmo tipo.
- `intervalSec` e `restSec`: prescrições de intervalo já existentes; o agrupamento não inventa descanso.

Códigos ou textos em `system` podem continuar visíveis por compatibilidade, mas não autorizam execução agrupada.

## Persistência e segurança

A migration `20261029010000_issue_400_resistance_groups` adiciona o enum e os campos canônicos, valida a forma completa, a ordem e a cardinalidade e bloqueia mutações depois de release, início ou histórico. Cópias recriam o `groupId` no destino e preservam tipo, ordem e rodadas.

## Interface

O editor separa Sistema de Agrupamento e permite iniciar uma nova fronteira de grupo. Identidade, posição e rodadas são derivadas pelo backend a partir da declaração explícita e das séries estruturadas.

## Execução

A #487 consome somente a estrutura persistida. Grupos são achatados em ordem rodada → participante; a posição corrente é reconstruída por `completedAt` e IDs planejados. Lifecycle, pausa, retry, conflito e tenant permanecem sob a autoridade da #389.

## Validação

Testes cobrem cardinalidade, rodadas, fronteiras, estabilidade do `groupId`, ordem por rodada e UI do editor. Migrations PostgreSQL, `pnpm validate`, build e CI exact-SHA são obrigatórios antes do handoff.
