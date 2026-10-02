# Plano: Issue #387 - rotina semanal e Treino de hoje

## Objetivo

Permitir que aluno e professor consultem a rotina semanal e o Treino de hoje a partir do grafo operacional liberado, com origem rastreável e estados distintos, sem criar lifecycle ou persistência paralelos à #389.

## Contexto

- Epic #386; plano da epic em `docs/execution-plans/active/2026-10-epic-386-guided-training-execution.md`.
- Base: `develop`. Branch: `feat/387-weekly-routine-today-workout`.
- Fonte de visibilidade: `WorkoutTemplate.released = true` combinado obrigatoriamente com um `ConsolidatedPrescriptionOperationalRelease` do mesmo aluno/contrato.
- Decisão do produto reafirmada pela auditoria independente: somente a saída operacional rastreável até a Montagem Consolidada publica a rotina e o Treino de hoje; liberação manual do Workout Builder não participa desta projeção.
- Decisão do produto (2026-10-01): a entrega cobre a Central do Aluno (professor) e a área do aluno.
- O card anterior da Central lia `Microcycle`, aposentado pela #414; foi substituído.

## Fora de escopo

- máquina de estados, persistência da execução e habilitação de iniciar/pausar/concluir/registrar impossibilidade (#389);
- check-in (#388), feedback (#390) e atualização da Central após execução (#391);
- bloquear a liberação manual do Workout Builder.

## Arquivos e modulos principais

- `packages/types/training-routine.ts`
- `apps/api/src/modules/workout/training-routine.service.ts`
- `apps/api/src/routes/student.routes.ts`
- `apps/api/src/modules/alunos/student-domain.routes.ts`
- `apps/web/src/components/training/TrainingRoutinePanel.tsx`
- `apps/web/src/services/training-routine.service.ts`
- `apps/web/src/pages/StudentTraining.tsx`, `apps/web/src/pages/Home.tsx`, `apps/web/src/App.tsx`
- `apps/web/src/components/alunos/AlunoResumoHubTabBase.tsx`, `apps/web/src/pages/AlunoDetails.tsx`

## Regras e restricoes

- `contractId` e aluno são derivados da sessão; o professor também passa por `students.details.trainingPlans` e escopo do aluno.
- Sessões não liberadas não expõem conteúdo, apenas contagem por dia.
- A visão do aluno não recebe IDs da Montagem nem contexto técnico do professor.
- Nenhuma escrita: serviço web e API são somente leitura; `execution.available = false` até a #389.

## Passos de implementacao

- [x] Contrato compartilhado `TrainingRoutineView`.
- [x] Serviço de leitura com semana, hoje, origem, modalidades e blocos.
- [x] Endpoints do aluno e da Central.
- [x] Painel compartilhado com estados e navegação entre semanas.
- [x] Integração na Central (Aluno 360) e tela `/student/training` com acesso pela home.
- [x] Testes de API (serviço e fronteira HTTP) e web (painel, serviço, Central).
- [x] Documentação canônica.
- [x] Evidência de navegador `apps/web/src/pages/issue-387-browser-evidence.test.js` (CI; local com `ISSUE_387_BROWSER_EVIDENCE=1`).

## Criterios de aceite

- [x] Rotina semanal lista sessões vigentes em ordem temporal estável.
- [x] Treino de hoje derivado somente de templates liberados com release da Montagem Consolidada do mesmo aluno/contrato.
- [x] Objetivo, duração, ordem, parâmetros e orientações apresentados, incluindo distância quando disponível na projeção operacional.
- [x] Origem rastreável até a Montagem Consolidada quando existir release.
- [x] Estados sem treino, não liberado, erro e sem permissão distintos.
- [x] Aluno preservado na navegação (Central inline; aluno preserva `contractId`).
- [x] Permissões e `contractId` validados no backend.
- [x] Nenhuma ação cria ou atualiza estado de execução.
- [x] `pnpm validate` executado localmente.
- [ ] Auditoria independente.

## Validacao manual

1. Professor com `students.details.trainingPlans` abre `/central-do-aluno/:id` (Aluno 360): ver Treino de hoje, rotina da semana e navegação entre semanas.
2. Perfil sem o bloco: painel mostra "Sem permissão" e os demais cards continuam.
3. Aluno abre `/inicio` -> "Ver treino de hoje": ver treino liberado, dia em preparação e recuperação.
4. Template de hoje com `released=false`: estado "em preparação", sem conteúdo.
5. Template liberado pela Montagem: professor vê origem consolidada; aluno vê só "liberado pelo seu professor". Template apenas `released=true` sem release consolidado não aparece.
6. Botões de execução desabilitados com explicação; nenhuma requisição de escrita na aba de rede.
7. Repetir em 1440x900, 1366x768 e 390x844.

## Evidencia de navegador

`apps/web/src/pages/issue-387-browser-evidence.test.js` roda no GitHub Actions e localmente com `ISSUE_387_BROWSER_EVIDENCE=1` (screenshots opcionais via `EVIDENCE_SCREENSHOT_DIR`). Cobre a área do aluno e a rota real `/central-do-aluno/:id` do professor, incluindo treino liberado, em preparação, sem treino, erro localizado, ausência de permissão, navegação entre semanas por teclado, ausência de overflow em desktop/mobile, somente requisições de leitura e preservação do contexto contratual do aluno.

## Decisoes e pendencias

- Semana civil segunda a domingo; "hoje" calculado em `America/Sao_Paulo` no backend.
- Professor não recebe os controles de execução; o painel mostra uma projeção somente leitura no vocabulário canônico da #389 (`planned` legado -> `not_started`), sem definir transições.
- Pendente: habilitar os controles quando a #389 publicar o contrato canônico e mudar `execution.available`.
