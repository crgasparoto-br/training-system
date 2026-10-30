# Arquitetura de banco de dados

O projeto usa Prisma para modelagem e acesso ao banco.

## Regras para mudancas de schema

- Toda alteracao em schema deve ser acompanhada de migration.
- Toda migration deve ter nome descritivo.
- Mudancas que afetam produto devem atualizar documentacao correspondente em `docs/product/`.
- Mudancas que afetam permissao ou escopo de dados devem atualizar `docs/architecture/auth-and-access-control.md`.
- Seeds ou dados demo devem ser atualizados quando a validacao local depender deles.

## Conexoes de runtime e migrations

- `DATABASE_URL` pertence ao processo da API em execucao. Em producao, deve usar uma credencial de aplicacao e, quando o provedor oferecer, um endpoint com pool.
- `MIGRATION_DATABASE_URL` e opcional e deve conter a conexao direta/privilegiada usada somente por `prisma migrate deploy` durante o start.
- O script de start restaura `DATABASE_URL` antes de iniciar `dist/main.js`; a API nao deve permanecer conectada com o papel de migration.
- `PRISMA_CONNECTION_LIMIT` limita o numero de conexoes por `PrismaClient`. Quando a URL nao possui `connection_limit`, o runtime produtivo usa `1` por padrao e permite ajuste explicito.
- `PRISMA_POOL_TIMEOUT_SECONDS` controla por quanto tempo uma requisicao aguarda conexao livre; o padrao produtivo e `15` segundos quando a URL nao define `pool_timeout`.
- Nao usar `Promise.all` para fan-out amplo de consultas independentes em telas que tambem disparam varias requisicoes HTTP. Prefira consulta agregada, sequencia controlada ou concorrencia limitada.
- Esgotamento ou timeout do pool deve retornar HTTP `503` com mensagem segura. Nome de usuario do banco, papel, host, URL e detalhes internos do Prisma ficam somente nos logs da API.

## Multi-tenant

O `contractId` e a barreira principal entre clientes/contratos. Rotas, services e consultas devem preservar esse filtro.

## Ciclo unico lead -> aluno (issue #268)

`Aluno` e o identificador canonico da participacao da pessoa no dominio de
alunos desde `LEAD` ate `ACTIVE_STUDENT`. `contractId` e obrigatorio e
`userId`, `professorId` e `age` sao opcionais nos estados pre-ativos.

A identidade pessoal tenant-scoped fica em `StudentProfile.identificationData`.
Campos `Aluno.lead*`, `birthDate` e `age` sao projecoes derivadas para
busca/compatibilidade. `User`/`Profile` representam a conta global e podem ser
associados a um `Aluno` por contrato; a constraint e
`@@unique([contractId, userId])`, nao global.

A migration `20260721120000_student_lifecycle_domain` possui guards de
reexecucao, backfill convergente e trigger temporario de compatibilidade para
rollback da aplicacao anterior. O CI deve aplicar todas as migrations e
reexecutar essa migration no mesmo banco para comprovar idempotencia.

Ver `docs/architecture/student-lifecycle-data-ownership.md` para ownership,
claim concorrente, contexto de tenant, transicoes guardadas, auditoria e
estrategia de remocao da compatibilidade na #275.

## Cadastro administrativo segmentado (issue #422)

A #422 nao adiciona tabela nem coluna e, portanto, nao exige migration. Ela fecha
o dual-write historico de `AlunoIntakeForm.formResponses` usando modelos que ja
fazem parte do dominio segmentado:

- `StudentProfile.identificationData`: CPF, RG, estado civil, endereco, rede
  social (`socialNetwork` + `socialAccount`) e contato de emergencia;
- `StudentProfile.preferenceData`: preferencias e consentimentos administrativos;
- `StudentFinancialProfile`: condicoes e campos financeiros administrativos;
- `StudentContract`: autoridade do servico vigente e do ciclo do vinculo.

`AlunoIntakeForm.formResponses` permanece somente como fonte de compatibilidade
de leitura para registros antigos. Fluxos novos e edicoes administrativas nao
executam `INSERT` nem `UPDATE` nesse JSON. A leitura compoe o payload esperado
pelo cliente com precedencia do registro canonico sobre o legado.

Campos de identificacao passam obrigatoriamente por
`student-identity.service.ts#upsertStudentIdentity`; o adapter administrativo nao
escreve `StudentProfile.identificationData` diretamente. O alias web historico
`instagram` e convertido para `socialAccount` na escrita. `Profile.instagramHandle`
pode participar somente do fallback de Instagram e nao armazena contas de outras
redes.

Quando existe contrato selecionado no cadastro, a operacao usa
`student-financial-contract.service.ts`: perfil, dados administrativos e
criacao/atualizacao/ativacao de `StudentContract` participam da mesma transacao
Prisma. Falha na resolucao ou no ciclo do contrato aborta a operacao inteira; a
regra de lifecycle continua centralizada no dominio de `StudentContract`.

## PRNT e PAR-Q canônico

O PRNT possui histórico próprio em `ProntuarioRecord` e tabelas filhas por bloco. O PAR-Q usa as seguintes entidades canônicas:

- `StudentParqDraft`: rascunho servidor-side, versionado e retomável. Nunca aparece como histórico clínico concluído.
- `StudentParqSubmission`: submissão histórica imutável, com `catalogVersion`, respostas validadas, itens positivos calculados pelo backend, declaração, origem e chave de idempotência.
- `StudentParqProfessionalReview`: pendência e análise profissional vinculadas à submissão, sem alterar as respostas históricas.
- `StudentParqLegacyRecord`: inventário somente leitura das representações antigas, incluindo incompatibilidades, ausência de evidência temporal e divergências.

A migration `20260725201000_issue_273_canonical_parq` importa legado somente quando existe mapeamento semântico completo para uma versão conhecida e data sustentável. Registros incompletos, divergentes ou sem evidência permanecem preservados em `StudentParqLegacyRecord` e produzem `NEEDS_REPEAT`; a migration não fabrica aceite, autoria, data ou versão. Chaves de origem e idempotência impedem duplicação em rerun.

`StudentOnboardingProcess` armazena apenas `parqModuleStatus`, referência da última submissão e timestamps de processo. `Aluno.parqRequiresProfessionalReview` é uma projeção derivada e não uma fonte editável. PRNT, pré-matrícula e administração consultam o mesmo service canônico.

A versão atual do catálogo é `parq-2026-01`, com sete chaves estáveis (`q1` a `q7`). O `q8` do formato legado conhecido representa declaração e não é reinterpretado como pergunta clínica.

Snapshots de desconforto corporal ficam em `ProntuarioDiscomfortSnapshot` e `ProntuarioDiscomfortEntry`. Dados legados de desconforto no cadastro do aluno não são migrados automaticamente.

## Check-in pré-treino (#388)

`PreWorkoutCheckIn` mantém no máximo um registro canônico por `WorkoutDay` e declara relações Prisma explícitas para `Aluno` e `CompanyContract`, além de `workoutDay`. `PreWorkoutCheckInOperation` é o ledger de idempotência por check-in, com chave lógica e fingerprint do patch normalizado submetido. As migrations espelhadas em `apps/api/prisma` e `prisma` adicionam FKs e checks das escalas já definidas pelo produto; a FK de `contractId` referencia a tabela física `Contract`, mapeada pelo model Prisma `CompanyContract`, porque o escopo canônico do check-in é o mesmo `contractId` do aluno autenticado.

A imutabilidade depois do início não depende de flag paralela no check-in: ela deriva do lifecycle canônico de `WorkoutDay`. A escrita bloqueia a linha da sessão e revalida `planned` dentro da mesma transação que grava check-in, operação e evento da timeline.

## Cuidados para agentes

- Nao criar `PrismaClient` em arquivos aleatorios sem necessidade.
- Reutilizar o cliente do dominio quando funcoes relacionadas participarem do mesmo fluxo.
- Evitar regras de negocio escondidas em queries grandes sem teste.
- Preferir services pequenos e testaveis.
- Validar impactos de migration em deploy.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`


## Student lifecycle migration compatibility

A migration `20260721120000_student_lifecycle_domain` preserva o mesmo `Aluno.id` e
seus relacionamentos. O isolamento de tenant usa `Aluno.contractId` diretamente; a
relação com professor é opcional e não pode ser usada como substituta da barreira
tenant-scoped.

Durante a janela de rollback, o trigger `student_lifecycle_legacy_aluno_defaults`
atende somente `INSERT` da aplicação anterior, derivando o contrato e classificando
o cadastro administrativo completo como `ACTIVE_STUDENT`. Updates não são
interceptados, preservando a autoridade do serviço de ciclo sobre transições.

O workflow de validação monta uma base pré-#268 populada, aplica a migration,
confirma a preservação de contrato, PRNT, avaliações, agenda, treino, dados clínicos
e IDs e, em seguida, reexecuta a migration para validar convergência.

## Projeções administrativas da pré-matrícula (issue #270)

A migration `20260723011500_issue_270_admin_consistency` adiciona projeções em
`Aluno` para que a listagem administrativa filtre, ordene e exiba a mesma fonte de
verdade:

- `lastActivityAt`: maior atividade observada no registro, onboarding, ciclo,
  convite atual ou PAR-Q;
- `currentPreRegistrationInviteStatus` e
  `currentPreRegistrationInviteExpiresAt`: convite de pré-cadastro mais recente;
- `parqRequiresProfessionalReview`: resultado calculado pela existência de qualquer
  `StudentParqProfessionalReview` em estado `PENDING` para o aluno no mesmo contrato;
  uma submissão negativa mais recente não encerra pendências anteriores;
- contatos adicionais normalizados para busca e deduplicação tenant-scoped.

Triggers atualizam as projeções quando as tabelas de origem mudam. As projeções não
são fontes editáveis: identidade continua sendo escrita somente por
`student-identity.service.ts`, convites pelo domínio de convites e PAR-Q pelo módulo
clínico. A criação administrativa usa transação serializável para que deduplicação,
registro canônico, responsável e identidade sejam confirmados ou revertidos como
uma única operação.

## Vínculo de duplicidade resolvida (issue #274)

`Aluno.canonicalAlunoId` registra, sem exclusão física, que um cadastro descartado
foi consolidado em outro `Aluno` do mesmo `contractId`. A migration
`20260727010500_issue_274_canonical_duplicate_link` recupera vínculos legados a
partir de `discardReason = DUPLICATE_OF:<id>` e instala chave estrangeira, índice e
trigger que impedem autorreferência, destino cross-tenant e cadeia de registros já
resolvidos. O detector considera somente candidatos sem `canonicalAlunoId`.

Antes de descartar a origem, a aplicação classifica as relações do modelo `Aluno` em duas famílias. Dados estritamente históricos de processo e auditoria — perfil de origem, revisões registradas, logs, onboarding, eventos e convites revogados — permanecem no registro descartado. Relações ativas ou de negócio que exigiriam reassociação — agenda, avaliações, treino, contratos, financeiro, integrações, saúde, PAR-Q, prontuário, métricas, nutrição, configuração de revisão e autorização de responsável — bloqueiam a consolidação. O inventário tipado fica em `pre-registration-clinical-ownership.service.ts`; a migration `20260728081500_issue_274_clinical_ownership_guard` replica a família bloqueante em trigger para fechar chamadas diretas e corridas entre o preflight e o descarte. Enquanto não existir serviço transacional por domínio, qualquer ocorrência retorna `CLINICAL_REASSOCIATION_REQUIRED` e preserva origem, destino e todos os dados owned.

## Adipometria histórica (issue #246)

A ADPT possui domínio próprio em `AdipometryProtocol`, `AdipometrySequence`,
`AdipometryAssessment` e `AdipometryAuditEvent`. Os modelos Prisma representam as
relações de runtime; checks, funções e triggers PostgreSQL completam as invariantes
que não cabem no schema declarativo.

A sequência é serializada por `(contractId, alunoId)` e gera códigos com largura
mínima de três dígitos. Chaves estrangeiras compostas vinculam aluno, professor,
Antropometria de apoio, correção e auditoria ao mesmo contrato, impedindo a
combinação de identificadores válidos de tenants distintos.

Somente protocolo estruturalmente completo com aprovação clínica ativa no mesmo
`contractId` permite conclusão. `GUEDES_1991_ADULT_YOUNG` permanece `DRAFT`
globalmente e só se torna efetivamente aprovado por contrato via
`AdipometryProtocolApproval`; o estado global sozinho nunca libera cálculo. A
avaliação concluída preserva entradas, resultados, versão, aprovação e snapshot
coerentes e é imutável. Correção cria nova revisão auditada e preserva a anterior.
Slaughter permanece `DISABLED` e incompleto, sem seleção, aprovação operacional ou
fallback. O contrato clínico canônico está em `docs/product/adipometry-protocol.md`.

Os gates PostgreSQL oficiais são:

- `scripts/verify-adipometry-migration-existing-data.sh`;
- `scripts/verify-adipometry-foundation.sh`.

## Blocos/séries resistidos (#399)

`WorkoutExerciseBlock` e `WorkoutExercisePlannedSet` dependem do `WorkoutExercise` canônico, com FKs, posição única por pai e checks numéricos. `WorkoutSessionExecutionItem.plannedSetId` é opcional para compatibilidade e tem FK e validação de pertencimento ao mesmo `plannedUnitId`. A migration `20261019190000_issue_399_resistance_blocks` não preenche valores legados presumidos; o schema de runtime é `apps/api/prisma/schema.prisma`. Triggers protegem o planejado liberado/começado da alteração direta. A migration `20261021200000_issue_399_legacy_release_immutability` estende os guards aos pais `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise` quando `WorkoutTemplate.released=true`, inclusive no caminho legado que ainda não possui `ConsolidatedPrescriptionOperationalRelease`; a migration `20261021210000_issue_399_legacy_release_insert_guard` resolve o `NEW.templateId` antes de um INSERT de `WorkoutDay`, pois a linha ainda não existe na tabela durante o trigger. Campos de ciclo de execução continuam sendo a única exceção mutável no dia. A migration aditiva `20261021222000_issue_399_workout_day_parent_release_guard` endurece o mesmo trigger nas transferências de um `WorkoutDay`: verifica `OLD.templateId` e `NEW.templateId` diretamente, sem reler o valor antigo da linha pelo `id`, bloqueando origem e destino liberados (por flag legado ou ledger) com SQLSTATE `23514`.

As migrations `20261022100000_issue_399_execution_reference_guards` e `20261022101000_issue_399_execution_start_planning_guard` fecham os bypasses de SQL direto: a primeira exige correspondência entre execução, aluno/contrato, dia, exercício e série planejada; a segunda congela template/dia/exercício após a execução sair de `not_started`, preservando apenas os campos de ciclo de vida do dia. A migration incremental `20261022103000_issue_399_execution_graph_integrity` torna imutáveis os vínculos/origens da execução, rejeita regressões de status e exclusões de histórico, valida biblioteca e contrato do `WorkoutExercise`, impede reparenting de template/dia/exercício e serializa o início da execução com mutações do planejamento por lock do dia canônico. A migration `20261022104000_issue_399_trigger_record_safety` substitui o guard de identidade compartilhado por funções específicas de template, dia e exercício; isso evita que o PostgreSQL avalie `NEW`/`OLD` com campos de outra tabela e bloqueie inserts legítimos com `record "new" has no field ...`. A referência `plannedSetId` distingue campo omitido de `null`: clientes legados que não enviam o campo não apagam vínculo já persistido; `null` explícito continua representando ausência de série. A migration `20261022102000_issue_399_position_integrity` impõe os limites superiores 12/30, executa preflight fail-closed de dados existentes e verifica posições contíguas em triggers de constraint diferidos, permitindo substituições aninhadas dentro da mesma transação. Não modificar migrations anteriores já aplicadas após publicação em ambiente compartilhado.

A migration `20261022105000_issue_399_legacy_execution_guards` fecha a superfície histórica de `WorkoutExecution` sem misturar registros `NEW`/`OLD` de tabelas com formatos diferentes. O trigger de execução permite a inserção de um registro legado somente quando o `WorkoutExercise` pertence ao mesmo aluno do plano; a exigência de treino liberado permanece na fronteira canônica de `recordExecution`, enquanto fixtures e importações históricas em draft continuam compatíveis. Depois de existir histórico legado, `WorkoutExecution` é imutável e template/dia/exercício não podem ser alterados, removidos ou reparentados por SQL. A integração PostgreSQL também cobre esses bloqueios, além de limites/gaps de posições e rollback.

A migration `20261023100000_issue_399_execution_serialization` redefine os guards finais para tomar o lock do `WorkoutDay` canônico na mesma ordem usada pelo início da execução. Isso fecha a janela entre o preflight de planejamento e a confirmação de uma execução concorrente. O mesmo migration cria a proteção do ledger `WorkoutSessionExecutionItem`: medições podem ser atualizadas durante a execução, mas identidade, `plannedUnitId`, `plannedSetId`, `setNumber` e remoção ficam congelados depois que a sessão deixa `not_started`.

O script `scripts/verify-issue-399-existing-data.sh` aplica a cadeia completa em um banco isolado que primeiro recebe um conjunto desidentificado de `WorkoutTemplate`, `WorkoutDay`, `WorkoutExercise` e `WorkoutExecution` legados. Após as migrations da issue, ele confirma a preservação das linhas e a existência das tabelas de blocos/séries e da referência `plannedSetId`. O workflow crítico executa esse replay além do deploy normal, sem usar dados produtivos.

A migration `20261024100000_issue_399_resistance_structure_integrity` reforça a fronteira
de blocos e séries com um trigger seguro por tabela. O trigger resolve o exercício
antigo e o novo, toma lock ordenado dos `WorkoutDay` envolvidos e verifica que ambos
permanecem no mesmo aluno/contrato e no catálogo do contrato do plano. Assim, um
`UPDATE` SQL que transfira um bloco ou uma série entre grafos distintos falha mesmo
quando os dois templates ainda estão em draft; a operação não deixa escrita parcial.
O mesmo guard relê release, execução iniciada, histórico legado e itens executados
antes de permitir mutações. A integração adversarial mantém uma transação de início
com lock do dia aberta e confirma que a inserção estrutural concorrente aguarda o
commit e então é rejeitada.

## Execução guiada e vínculo de conclusão (#487)

A migration `20261028220000_issue_487_guided_resistance_completion` acrescenta `WorkoutSessionExecutionItem.completedAt` e `completedByOperationId`, com FK para `WorkoutSessionExecutionOperation.id` e unicidade por operação. Um item concluído é imutável, a operação deve pertencer à mesma execução e ter ação `complete_resistance_set`, e o trigger diferido exige vínculo com a versão resultante e o evento de lifecycle da #389. Assim, uma operação de uma série não pode confirmar outra, mesmo por SQL direto. Valores realizados permanecem distintos das séries planejadas da #399.

Agrupamentos usam exclusivamente as tabelas `WorkoutResistanceGroup` e `WorkoutResistanceGroupMember` entregues pela #400 (PR #521), com identidade e ordem persistidas. A #487 não acrescenta campos de agrupamento em `WorkoutExercise`; a UI percorre o grafo canônico por rodada e participante, e treinos legados sem estrutura suficiente continuam em leitura segura. A migration #400 valida origem e destino das associações e cardinalidade final dos grupos em constraints diferidas.

A migration adicional `20261029210000_issue_487_completed_operation_guard` fecha a janela de alteração direta no ledger de uma série já concluída enquanto a sessão permanece `in_progress`. Operações referenciadas por `completedByOperationId` rejeitam UPDATE de fingerprint, versão, chave, ação ou evento e DELETE, com a única exceção da ligação inicial `lifecycleEventId` nulo para não nulo no mesmo registro, sem alterar os demais campos, exigida pelo fluxo transacional #389. O teste PostgreSQL direto rejeita alterações posteriores e confirma que a conclusão normal e o replay idempotente continuam válidos.


### Integridade ordinal e proveniência dos eventos da #487

A migration 20261030120000_issue_487_set_event_integrity exige que WorkoutSessionExecutionItem.setNumber corresponda ao ranking persistido das séries, ordenado por bloco.position e série.position. Novas gravações SQL com IDs ou ordinais inconsistentes são rejeitadas. A migration não inventa backfill e não altera silenciosamente histórico; rascunhos anteriores são recuperados por serviço apenas quando há destino livre.

A operação de conclusão passa a ter FK entre WorkoutSessionExecutionOperation.lifecycleEventId e StudentLifecycleEvent.id, validando os valores preexistentes e falhando caso haja referências órfãs. O trigger de ledger diferido garante o mesmo aluno, contrato, treino, operação, domínio, ação e versões do lifecycle. O evento vinculado a uma série concluída fica imutável. O fluxo canônico #389 cria, vincula e confirma tudo em uma transação serializável; a aprovação exige regressões PostgreSQL de casos falsos e replay verdadeiro.
