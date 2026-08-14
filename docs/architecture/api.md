# Arquitetura da API

A API fica em `apps/api`.

## Responsabilidades

- Expor rotas HTTP para o web e mobile.
- Aplicar autenticacao, autorizacao e escopo de dados antes de acessar dados sensiveis.
- Concentrar regras de negocio em services/modulos.
- Usar Prisma como camada de persistencia.

## Regras para novas rotas

- Rotas privadas devem usar middleware de autenticacao.
- Rotas que representam telas devem validar `screenKey` quando aplicavel.
- Acoes internas, abas e blocos devem validar `blockKey` quando aplicavel.
- Consultas multi-tenant devem filtrar por `contractId`.
- Consultas de colaboradores/professores devem aplicar escopo de dados quando a funcao exigir.

## Padrao de implementacao

1. Definir tipos compartilhados em `packages/types` quando o contrato tambem for usado no frontend.
2. Criar ou atualizar service no modulo correspondente.
3. Aplicar middlewares de seguranca na rota.
4. Criar testes unitarios ou de integracao para regras de permissao e dados.
5. Atualizar docs quando a regra de negocio mudar.

## Montagem Consolidada e integração operacional

O módulo autoritativo continua em `apps/api/src/modules/consolidated-prescriptions` e é montado em `/api/v1/consolidated-prescriptions`.

A integração operacional da issue #319 adicionou preparação e rastreabilidade sem escrever no Workout Builder. A issue #320 adiciona o comando definitivo de liberação:

- leitura da biblioteca e da projeção exige `plans.consolidatedPrescriptions.view`;
- vínculo técnico, preparação e substituição exigem `plans.consolidatedPrescriptions.manage`;
- liberação exige `plans.consolidatedPrescriptions.release` e `dataScope` efetivo de `plans`;
- a autorização definitiva, o aluno, o contrato, a versão aprovada, as capacidades e o destino são revalidados dentro da transação serializável;
- o vínculo `CapacityTechnicalCatalogItem(category=exercise)` -> `ExerciseLibrary` continua usando somente IDs persistidos e revisão concorrente;
- snapshots internos de projeção/substituição permanecem server-owned e são revalidados antes da escrita operacional;
- a saída usa os modelos existentes `TrainingPlan`, `WorkoutTemplate`, `WorkoutDay` e `WorkoutExercise`;
- `WorkoutTemplate.released` só é marcado depois de conteúdo, nova versão `released` e vínculo relacional de auditoria terem sido persistidos na mesma transação;
- treino iniciado/executado não pode ser sobrescrito, e retry da mesma versão/destino é idempotente;
- flexibilidade/equilíbrio continuam fail-closed enquanto a ponte operacional não definir representação explícita sem perda semântica.

Os contratos permanentes estão em `docs/product/consolidated-prescription-operational-integration.md` e `docs/product/consolidated-prescription-operational-release.md`.

## Adipometria (ADPT)

O módulo `apps/api/src/modules/adipometry` é montado em `/api/v1/adipometry`.

Regras de fronteira:

- todas as rotas exigem autenticação de professor e a tela `physicalAssessment.protocol`;
- leitura exige `physicalAssessment.adpt.view`;
- criação, edição, cálculo e conclusão exigem `physicalAssessment.adpt.actions.manage`;
- correção de avaliação concluída exige `physicalAssessment.adpt.actions.correctCompleted`;
- `contractId`, usuário e professor ator são derivados do token e nunca aceitos no body;
- resultados são calculados novamente na conclusão; campos derivados enviados pelo cliente não fazem parte dos schemas HTTP;
- conclusão usa transação serializável, bloqueio do rascunho e bloqueio da aprovação clínica ativa;
- identificadores de outro contrato recebem o mesmo 404 público de um recurso inexistente;
- falhas inesperadas retornam código estável e `correlationId`, sem mensagem bruta do banco.

A API reutiliza as funções e restrições PostgreSQL implantadas pela fundação da issue #246 para numeração, ator de auditoria, imutabilidade e ciclo de revisões.

## Manual do Professor

O módulo `apps/api/src/modules/professor-manual` é montado em `/api/v1/professor-manual`.

- a listagem exige autenticação e contexto profissional;
- o contrato é derivado da sessão e usado para garantir os itens padrão e filtrar o conteúdo;
- os painéis contextuais da Central do Aluno consomem essa rota, inclusive na área de avaliações físicas;
- a rota deve permanecer registrada no bootstrap da API sempre que os componentes web do Manual do Professor estiverem ativos, evitando que uma capacidade existente seja apresentada como erro 404.

## Clonagem de dados do contrato

A rota `POST /api/v1/contracts/clone-data` continua autenticada no contexto de professor e restrita a professor master. O contrato alvo é sempre o `contractId` da sessão autenticada; o body não redefine o alvo.

No fluxo da tela `/settings/contract`, em que `copyParameters`, `copyExercises` e `copyAssessmentTypes` estão habilitados e `sourceContractId` não é informado, a origem automática segue este contrato:

1. `DEFAULT_CONTRACT_ID` tem precedência somente quando for diferente do contrato alvo e possuir pelo menos um parâmetro de treinamento, exercício de biblioteca ou tipo de avaliação;
2. se o default estiver ausente, apontar para o alvo ou estiver vazio nas três categorias, a API seleciona outro contrato elegível;
3. entre candidatos elegíveis, a ordem é: possuir exercícios de biblioteca, cobrir mais categorias, possuir mais registros no total, ser o contrato mais antigo (`createdAt`) e, por fim, menor `id` para desempate determinístico;
4. se nenhum contrato elegível possuir exercícios, o ranking começa por cobertura de categorias, depois total de registros, antiguidade e `id`;
5. se não houver origem elegível, a rota responde `404` em vez de sucesso com todos os contadores zerados.

A elegibilidade considera os registros existentes na origem, sem calcular previamente o delta contra o alvo. A deduplicação permanece em `cloneContractData`: uma repetição idempotente pode retornar `created = 0` quando os itens da origem já existirem no alvo, refletindo-os nos respectivos contadores `skipped`.

Chamadas com `sourceContractId` explícito preservam sua semântica. Chamadas técnicas que desabilitam uma ou mais das três categorias também preservam o fallback legado de `DEFAULT_CONTRACT_ID` e, na ausência dele, do contrato diferente mais antigo.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
- `pnpm access:check`
