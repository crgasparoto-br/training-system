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
Implementação no branch `feat/399-resistance-blocks-sets`. Checkout local via GitHub bloqueado por DNS; checagens completas dependem de runner/CI. O plano fica ativo até homologação e auditoria independente.

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
