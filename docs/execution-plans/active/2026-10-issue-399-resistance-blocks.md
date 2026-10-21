# Plano — Issue #399, blocos e séries estruturadas

## Objetivo
Introduzir séries estruturadas dentro do WorkoutExercise canônico com versão planejada protegida contra execução.

## Escopo
Schema Prisma, migração aditiva, validação do backend, endpoints, Workout Builder, cópia de semana/dia, testes e documentação.

## Fora de escopo
Agrupamentos entre exercícios (#400), comparação planejado/executado (#401), sugestão de carga.

## Critérios de aceite e validação
- Blocos 1..12 e séries 1..30 em ordem contígua por exercício; tipos predefinidos.
- Intervalos de repetições e parâmetros de carga/esforço/tempo opcionais sem defaults clínicos.
- Exercícios simples anteriores à migração permanecem editáveis no modo legado.
- Salvamento atômico do dia e preservação das séries na cópia de dias/semanas.
- Treinos liberados e iniciados imutáveis (serviço e triggers).
- Referência opcional do executado à série planejada correta sem sobrescrevê-la.
- Testes unitários, verificação `pnpm validate`, migração e evidência visual em três viewports.

## Estado de execução
Implementação no branch `feat/399-resistance-blocks-sets`. A homologação operacional foi executada em PostgreSQL isolado; o estado atualizado de cada pendência e os limites desta sessão estão registrados em [relatório de homologação](../../evidence/issue-399/homologation-report.md). `AUD-399-08` e `AUD-399-09` estão PASS; `AUD-399-10` permanece PARCIAL até validação agregada, CI no candidato e replay autenticado completo no SHA mais recente. O plano fica ativo até os gates pendentes e auditoria independente.

## Correção de auditoria — AUD-399-01/02/03 e REC-399-01
- Substituição transacional do dia reconcilia identidades em vez de `deleteMany` geral.
- Linhas históricas referenciadas por execução não podem ser removidas ou regravadas silenciosamente.
- O editor transmite o identificador persistido; cópias novas não reutilizam esse vínculo.
- Erros do endpoint recebem status/código públicos conhecidos, sem mensagens SQL/Prisma.
- Controles unitários incluem correspondência estável, identidade duplicada/inválida e sanitização de erros.
- Gate final: exigir CI `Validate repository` verde no HEAD e homologação visual/migration.

## Remediação da auditoria — AUD-399-04/05/06

- `AUD-399-04`: exigir autenticação de professor ativo e escopo contratual nos caminhos atuais e legados; bloquear leitura e escrita entre contratos.
- `AUD-399-05`: triggers validam origem e destino ao transferir blocos/séries, inclusive quando origem está liberada ou possui execução.
- `AUD-399-06`: manter blocos ao corrigir a data de uma semana e preservar distinção entre campo omitido e lista explicitamente vazia no cliente.
- Regressões obrigatórias: caminhos anônimos/aluno/outro contrato, atualização de relacionamento via Prisma/SQL, reabrir e salvar uma semana após alteração da data.
- Antes do fechamento: `Validate repository` verde no novo SHA, homologação da migration e evidência visual desktop/mobile, seguidas de auditoria independente.

## Remediação de 20/10/2026 — AUD-399-07 e evidências operacionais

- `AUD-399-07`: o retorno de `createTemplate` passa a incluir `workoutDays[].exercises[].resistanceBlocks[].plannedSets[]`, com a mesma estrutura de `getOrCreateTemplate` ao consultar ou atualizar um template existente. O teste de integração da alteração de `weekStartDate` deve compilar sem cast e verificar a série com carga decimal após a releitura.
- `apps/web/src/pages/WorkoutBuilder2/issue-399-browser-evidence.test.js` executa o editor real com React, CSS do produto e Chrome/Puppeteer em 1440, 768 e 390 px. Confere modo legado sem dados inventados, preenchimento e persistência do estado do componente, valores decimais, campos opcionais, rótulos, ausência de overflow e expansão por teclado. Evidência JSON e screenshots são gerados em `artifacts/issue-399/` no workspace do runner (a retenção externa depende da configuração existente de artefatos).
- A validação obrigatória do backend deve incluir `apps/api/tests/workout-session-execution.integration.test.ts` em PostgreSQL real, incluindo preservação de IDs, rollback, isolamento entre contratos, mudança de data e bloqueios de histórico. `prisma migrate deploy` no perfil CRITICAL é necessário, mas não substitui a homologação operacional em staging com dados existentes.
- Gate terminal permanece: `Validate repository` concluído com sucesso no HEAD exato, inspeção dos resultados de navegador, homologação da migração com histórico e auditoria independente. Nenhuma declaração de homologação ou aprovação deve ser inferida apenas da publicação deste plano.

## Remediação de 20/10/2026 — AUD-399-08/09/10

- `AUD-399-08`: a API usa `targetWeekStartDate` e `dayOfWeek` para derivar `workoutDate` na mesma operação que persiste os dados. O frontend não faz mais uma correção assíncrona posterior das datas. Teste integrado valida terça-feira na semana de destino, hora UTC e origem preservada.
- `AUD-399-09`: `copyTemplate` relê a origem e executa lock de destino, exclusão, criação do template, dias, exercícios e todas as séries dentro de **uma transação PostgreSQL serializável**; o frontend não exclui previamente a semana. Testes integrados exercitam rollback com exceção SQL injetada depois da exclusão do destino e recusa de destino liberado.
- `AUD-399-10`: a cobertura de CI inclui base de integração PostgreSQL e harness Chrome responsivo isolado. **Não confundir com homologação funcional em staging**: antes de liberar a PR, é necessário comprovar `prisma migrate deploy` com dados legados existentes em ambiente não produtivo equivalente, fazer replay/autenticação de professor ativo pelo fluxo completo criar → editar → salvar → reabrir → copiar → liberar e guardar evidências visuais 1440/768/390 px. Registrar versão exata do commit, migração aplicada, dataset desidentificado e resultados brutos por cenário; não expor dados pessoais.
- Reexecutar `pnpm validate` ou gate oficial `Validate repository` no novo HEAD; CI verde e testes novos não substituem o aceite independente. Nenhum merge automático.

## Recertificação operacional de 20/10/2026 — commit `c1648447…`

- `AUD-399-08`: **PASS** no PostgreSQL real; datas da cópia correspondem à semana destino por `dayOfWeek`, incluindo virada de mês/ano, sem alterar a origem.
- `AUD-399-09`: **PASS** no PostgreSQL real; integração 23/23 no SHA de referência, com rollback após falha injetada e recusa de destino liberado.
- `AUD-399-10`: **PARCIAL**. Migração, dados sintéticos e fluxo autenticado principal foram verificados; correção para reabrir exercício legado em template liberado foi implementada. No SHA `c1648447…`, 75/75 testes de rota, ESLint e smoke do serviço contra PostgreSQL passaram. A recaptura visual autenticada do caso legado, o `pnpm validate` e o CI desse novo SHA ficaram pendentes por limite de memória no host.
- As evidências SQL e capturas desidentificadas estão em [docs/evidence/issue-399](../../evidence/issue-399/). O relatório discrimina o SHA de cada evidência e os limites de recertificação.
- Não houve merge ou fechamento da issue. O plano permanece ativo até validar os itens pendentes e encaminhar o SHA final para auditoria independente.

## Recertificação operacional de 21/10/2026 — candidato `1de2ae9…`

- `AUD-399-08`: **PASS**, preservado no PostgreSQL real; datas de destino derivadas de `weekStartDate` e `dayOfWeek`, incluindo virada de mês/ano, sem mutar a origem.
- `AUD-399-09`: **PASS**, integração PostgreSQL 26/26 no SHA `1de2ae9…`; rollback e bloqueio de destino liberado continuam cobertos, com regressões adicionais para concorrência `P2002` e `P2034`.
- `AUD-399-10`: **PARCIAL**. Login/navegação reais no candidato exibiram `Remada issue399-replay` como exercício legado em treino liberado, com controles de edição desabilitados. Desktop 1440, tablet 768 e mobile 390 px passaram sem overflow e sem campos de entrada sem label; capturas e métricas estão no [relatório](../../evidence/issue-399/homologation-report.md). Um 404 não fatal de matriz de periodização decorre da ausência dessa matriz no fixture sintético.
- Type-check API isolado, rotas 75/75, ESLint focado e validações Prisma passaram. `pnpm validate` e a reexecução do build da API foram interrompidos por exit 137/limite de memória; o CI do candidato ainda não foi observado.
- O fluxo autenticado completo de criar/editar/copiar/liberar permanece comprovado na evidência histórica do SHA `f651ab6…`, não foi refeito integralmente neste candidato.
- O relatório e o pacote de evidências identificam os SHAs exatos. A PR e a issue permanecem abertas; não houve merge, fechamento ou alteração de produção. Próximos gates: validação agregada, CI no HEAD publicado e auditoria independente em contexto separado.

## Remediação de 21/10/2026 — AUD-399-01 e AUD-399-10

- `AUD-399-01`: as migrations `20261021200000_issue_399_legacy_release_immutability` e `20261021210000_issue_399_legacy_release_insert_guard` ampliam os guards PostgreSQL para bloquear UPDATE/DELETE/INSERT direto de `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise` quando o template está liberado, mesmo sem `ConsolidatedPrescriptionOperationalRelease`. O caso de INSERT resolve o `NEW.templateId` antes de consultar a linha nova. Os guards de blocos e séries permanecem ativos; campos de ciclo de execução do dia continuam permitidos.
- `AUD-399-10`: a homologação foi repetida em fixture sintética isolada no candidato pós-remediação. O replay real executou login de professor, legado → bloco/série, autosave, fechamento/reabertura, cópia semanal com IDs novos e datas derivadas, liberação e reabertura em 1440/768/390 px. O relatório e os artefatos registram SHA, IDs, respostas HTTP, consultas PostgreSQL, hashes das capturas e o controle negativo SQL com rollback.
- A correção do autosave descarta snapshots obsoletos quando a liberação ocorre durante um timer pendente, sem registrar falso erro no console; o bloqueio autoritativo continua no serviço e no banco.
- O ciclo ainda exige validação agregada, CI no SHA publicado e auditoria independente antes de merge/release. Não houve merge nem fechamento da issue.

## Remediação da auditoria independente de 21/10/2026 — AUD-399-12/13

- `AUD-399-12`: as atualizações de `WorkoutTemplate` e `WorkoutDay` rejeitam qualquer `planId`/`templateId` explícito no payload para impedir migração implícita de dados entre contratos. O serviço faz o bloqueio antes da escrita; a fronteira HTTP preserva status 400 e mensagem sanitizada. Regressões cobrem tentativa cross-contract, ausência de efeito e edição legítima.
- `AUD-399-13`: a migration adicional `20261021222000_issue_399_workout_day_parent_release_guard` usa `OLD.templateId` e `NEW.templateId` diretamente nos guards de release (incluindo flag legado sem ledger). Regressão PostgreSQL usa dias de destino sem colisão de posição para impedir falso positivo por unique index e verifica SQLSTATE `23514` nos dois sentidos, além de identidade/estado persistidos após a tentativa.
- **Portões ainda necessários:** migration + regressões PostgreSQL, tests/lint/build e `Validate repository` verdes no novo SHA. Evidências históricas de UI não são tratadas como recertificação visual independente do novo SHA; não realizar merge nem fechar a issue antes da auditoria independente.
