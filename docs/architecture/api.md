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

A rota `POST /api/v1/contracts/clone-data` continua restrita a professor master e deriva o contrato alvo exclusivamente da sessão autenticada.

Quando a chamada não informa `sourceContractId` e solicita as três categorias usadas pela tela Empresa / prestador (parâmetros, exercícios e tipos de avaliação), a origem automática segue esta precedência:

1. `DEFAULT_CONTRACT_ID`, se estiver configurado, for diferente do alvo e possuir ao menos um registro clonável;
2. candidatos com ao menos um exercício de biblioteca;
3. maior quantidade de categorias com dados;
4. maior quantidade total de registros nas três categorias;
5. contrato mais antigo por `createdAt`, com `id` como desempate determinístico.

Contratos completamente vazios não são elegíveis. Se o default estiver vazio ou apontar para o alvo, ele é ignorado e o ranking automático continua. Se nenhuma origem elegível existir, a rota responde `404`. A elegibilidade considera os dados existentes na origem, sem calcular delta contra o alvo; a deduplicação permanece em `cloneContractData`, portanto repetições idempotentes continuam retornando sucesso com itens em `skipped`.

Chamadas com `sourceContractId` explícito e chamadas técnicas que clonam apenas um subconjunto das categorias preservam a resolução anterior.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
- `pnpm access:check`
