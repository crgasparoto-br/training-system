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

## Remediação da auditoria independente (29/10/2026)

- **A-400-01:** reconciliar associações antes de excluir um exercício pela rota legada, substituição do dia ou gravação semanal que omite `resistanceGroups`. Remover um grupo abaixo da cardinalidade mínima, compactar membros/grupos sobreviventes e preservar exercícios/séries restantes na mesma transação.
- **A-400-02:** reordenar a seção inteira de forma contínua mesmo em chamadas parciais; rejeitar no resolvedor qualquer seção/posição duplicada existente antes de criar ou alterar um grupo.
- **REC-400:** reenvio exclusivamente de agrupamentos sem mudança de conteúdo não altera `WorkoutTemplate.updatedAt` nem os IDs persistidos (dia e semana).
- **Controles PostgreSQL adicionais:** exclusão individual de bi-set e de bloco que permanece válido; substituição semanal e de dia; reordenação parcial; posições legadas ambíguas; replay idêntico com leitura da revisão.
- **Validação e auditoria:** executar CI CRITICAL e testes de integração no HEAD corrigido; nova auditoria independente obrigatória. Sem merge automático.

## Remediação da auditoria independente — segunda rodada (29/10/2026)

- **A-001 (concorrência):** exigir `baseUpdatedAt` ISO UTC tanto no endpoint de grupos por dia quanto em snapshots semanais com `resistanceGroups`. Conferir a revisão dentro da transação serializável, com incremento monotônico no reorder, e rejeitar replay obsoleto com 409 sem mudar vínculos.
- **A-002 (estado assíncrono):** envio parcial do delta de `resistedExercises` pelo callback de carga máxima. Controles React verificam que criar um grupo durante consulta pendente não é sobrescrito pela resposta.
- **A-003 (elegibilidade):** categoria canônica resistida validada pelo serviço, com trigger de banco protegendo inclusão direta, alterações de vínculo e recategorização para cíclico.
- **RISK-001 (ordenação legada):** impedir mudança isolada de `exerciseOrder` na atualização individual; manter reorder transacional da seção.
- **Controles:** integrar casos adversariais em PostgreSQL e interface, validando ausência de persistência parcial e preservação de grupos.
- **Status:** remediação material preparada para gates completos, CI exact-SHA e nova auditoria independente em contexto separado.

## Remediação independente adicional — 29/10/2026 (A-003/A-004)

- **A-003 (categoria cíclica Unicode):** normalização SQL equivalente ao frontend/API aplicada aos três triggers existentes, sem editar migrations históricas. Testes PostgreSQL negativos para NFD, NBSP, espaço Unicode, recategorização, associação SQL direta e troca de biblioteca; regressão positiva resistida.
- **A-004 (metadados históricos):** snapshot imutável por `WorkoutExercise` real capturado na liberação legada ou consolidada; backfill somente com metadados disponíveis no momento da migração. Leituras de aluno, professor e rotina projetam nomes liberados, com compatibilidade histórica e sem duplicação de exercício/séries.
- **Provas necessárias:** criação de snapshot por ambos os caminhos, alteração subsequente do catálogo sem alteração da leitura histórica, SQL negativo de update/delete/insert tardio, replay da liberação e manutenção dos IDs do agrupamento. Execução de CI CRITICAL/PostgreSQL, type-check, lint, build, checks de arquitetura e documentação no SHA exato.
- **Critério terminal:** nova auditoria independente após todos os checks no HEAD definitivo, sem merge ou release automático.

## Entrega

Não efetuar merge. A implementação só será considerada concluída após checks do HEAD exato, validação de migração, testes relevantes e auditoria independente sem pendências.

## Evidência visual específica da #400 — 29/10/2026

- A suíte `apps/web/src/pages/WorkoutBuilder2/issue-400-browser-evidence.test.js` exercita o componente e CSS reais em Chromium no CI (`GITHUB_ACTIONS=true`), em 1440, 768 e 390 px.
- Cenário positivo: bi-set com exercícios canônicos, troca para tri-set, inclusão do terceiro participante, edição de rodadas e descansos, screenshots com SHA-256, reflow e controles rotulados.
- Controles negativos: exercício cíclico Unicode NFD não oferecido, desfazer agrupamento preserva exercícios, e somente leitura desabilita ações.
- As evidências ficam em `artifacts/issue-400/` do run do SHA exato. A suíte é isolada com UI/CSS reais, **não** representa login real ou backend autenticado; os controles API/PostgreSQL permanecem em testes separados.
- Auditoria independente permanece necessária. Nenhum merge autorizado.
