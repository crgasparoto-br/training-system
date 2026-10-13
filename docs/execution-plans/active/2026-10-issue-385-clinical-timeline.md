# Plano: linha do tempo clínica canônica (Issue #385)

## Objetivo

Unificar PRNT, Antropometria e Adipometria no Histórico da Central do Aluno, preservando autoria, origem e revisões sem tornar a timeline uma nova fonte de dados de saúde.

## Contexto

- Depende de #382 (eventos da Antropometria) e #384 (histórico versionado PRNT).
- Histórico da Central já possui cursor e eventos de treinamento em `student-domain.service.ts`.
- A API deve aplicar `students.details.audit` e os blocos clínicos específicos antes da consulta de cada origem.

## Fora de escopo

- Alterar schemas, migrations ou regras de gravação dos sistemas clínicos.
- Copiar snapshots, medições, respostas ou conteúdo sensível para eventos da Central.
- Substituir os editores canônicos dos protocolos.

## Arquivos principais

- `apps/api/src/modules/alunos/student-clinical-timeline.service.ts`
- `apps/api/src/modules/alunos/student-domain.service.ts`
- `apps/api/src/modules/alunos/student-domain.routes.ts`
- `apps/web/src/components/alunos/AlunoHistoricoTab.tsx`
- `apps/web/src/services/aluno.service.ts`

## Decisões

1. Projetar IDs de cada fonte existente, com `sourceType/sourceId/contractId/actorUserId`.
2. Consultar PRNT por tipo autorizável; ADPT somente finalizadas e preservando revisões; ANTR por evento canônico de conclusão/correção.
3. Filtro por `alunoId` e `contractId` em cada consulta, mais autorização do professor na fronteira HTTP.
4. Paginação por cursor e desempate determinístico entre grupos.
5. Falha em fonte autorizada torna a resposta parcial e não esconde as fontes disponíveis.

## Validação

- Testes focados de consulta multi-tenant, versões, correção, permissões parciais, deduplicação e origem.
- `pnpm validate` e checks da PR após publicação.
- Revisar manualmente professor com/bloco sem permissão, aluno trocado, aluno sem eventos, erro localizado e carregamento de páginas antigas.

## Pendências e riscos

Aprovação independente e homologação visual/funcional no ambiente com dados clínicos de teste só podem ser declaradas depois das respectivas evidências no HEAD da PR. Nenhum merge ou publicação em produção é realizado por este plano.

## Remediação da auditoria TL-385 — 13/10/2026

- **TL-385-001 (reclassificado: falso positivo):** `trainingTimeFilter` já inclui o mesmo timestamp para cursores `legacy` e `clinical` e só aplica o desempate por ID a cursores `training`. A auditoria confundiu a cláusula alternativa com ausência de empate. Reforçada regressão de paginação integrada com os três grupos, sem alterar comportamento correto.
- **TL-385-002 (P1):** links da timeline passam a gerar argumentos específicos por origem: `recordId/entityType/entityId/version` para PRNT, `intakeRevision` para Anamnese, `parqSubmissionId` para PAR-Q e `assessmentId` para ANTR/ADPT (mais `correctionId` quando aplicável). Os destinos consomem os parâmetros com os grants existentes e consultam versões pela API clínica canônica.
- **TL-385-003 (P1):** os resultados incrementais passam pelo agregador testável de páginas, que acumula `partial/unavailableDomains` e elimina eventos repetidos. A atualização integral da primeira página substitui o estado acumulado.
- **TL-385-004 (P2):** o estado de existência da revisão da Anamnese passa a ser consultado por `alunoId/contractId`, independentemente do cursor. O legado só reaparece quando a fonte canônica não existir; falhas são localizadas.
- **Regressões:** `student-domain.service.test.ts`, `student-timeline-pagination.test.ts` e `AlunoHistoricoTab.test.ts`.

Aprovação depende de validações no HEAD corrigido e nova auditoria independente. Sem merge ou publicação em produção por este plano.

## Remediação da auditoria TL-385 — segunda rodada

- **TL-385-005 (P1):** a timeline da Adipometria inclui revisões concluídas com `revisionStatus` `FINALIZED` e `SUPERSEDED`, preservando o evento original R1 após a correção R2; rascunhos, correções canceladas e revisões invalidadas não são projetados como conclusões vigentes.
- **TL-385-006 (P2):** a autoria de conclusão deriva da trilha canônica `AdipometryAuditEvent`: ação `COMPLETED` para R1 e `CORRECTION_FINALIZED` para R2+. A consulta é restrita ao `contractId` e aos IDs paginados; seleciona somente `assessmentId`, `action` e `actorUserId`. Snapshots e dados de avaliação permanecem nos registros de origem. Para correção legada sem auditoria de finalização usa-se `correctionAuthorUserId`, enquanto a conclusão R1 sem autoria comprovável permanece com ator nulo.
- **Regressões:** teste adversarial com autores distintos para criação da correção e sua conclusão, primeira autoria da finalização R1, retenção da R1 marcada `SUPERSEDED`, ausência de auditoria, fronteira negada, falha localizada e acesso por contrato.
- **Validação de saída:** testes focados, `pnpm validate` e checks da PR #510 no novo HEAD; uma nova auditoria independente é necessária para liberação. Nenhum merge ou publicação em produção.

## Remediação da terceira auditoria

- **TL-385-007 (P1):** eventos legados da Anamnese exigem permissão do bloco de saúde e permissão clínica específica, sem contorno pela tela de histórico.
- **TL-385-008 (P1):** falha na consulta agregada aciona recuperação sequencial das fontes autorizadas, sempre com `alunoId/contractId`. Somente o domínio cujo retry falhar aparece em `unavailableDomains`; o caminho normal permanece agregado.
- **TL-385-009 (P2):** o fallback legado exige ausência canônica confirmada por consulta do aluno/contrato; erro na verificação deixa o evento oculto e a resposta parcial.
- **Regressões:** perfis com grants parciais, rejeição da projeção e da verificação de existência, snapshot agregado indisponível e falha em uma fonte opcional com PRNT preservado.
- **Gate de saída:** testes API/web, `pnpm validate`, CI da PR no HEAD novo e reauditoria independente. Sem merge/deploy.

## Remediação TL-385-010 — paginação sem perda de eventos

- **P1 — Implementação:** a projeção de Antropometria passa a continuar a consulta paginada até reunir `limit + 1` eventos **válidos e distintos** ou esgotar a fonte. A consulta restringe ações a `completed` e `corrected`, mantém ordenação por `createdAt/id`, `alunoId/contractId` e descarta linhas inválidas ou duplicadas antes de decidir se há página posterior.
- **Continuidade:** o cursor global entre eventos clínicos, legados e treinamento permanece inalterado. Na web, páginas incrementais deduplicam também pela identidade da fonte clínica (`type/sourceType/sourceId`), evitando duplicatas que cruzam limites de página.
- **Regressões:** `student-clinical-timeline.service.test.ts` valida lotes inválidos, duplicados e continuação da consulta; `student-domain.service.test.ts` valida que um evento clínico posterior ainda produz `nextCursor` até alcançar o legado; `student-timeline-pagination.test.ts` cobre a mesma fonte clínica em páginas diferentes.
- **Validação obrigatória:** CI `Validate PR` e check `Validate repository` no HEAD material corrigido, com testes API/web, análise de acesso/documentação e `pnpm validate` quando disponível. Aprovação operacional exige nova auditoria independente. Sem merge e sem deploy.
