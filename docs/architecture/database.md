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

Antes de descartar a origem, a aplicação classifica as relações do modelo `Aluno` em duas famílias. Dados de processo e auditoria — perfil, onboarding, eventos, convites, autorizações e revisões — permanecem no registro de origem como histórico imutável. Relações operacionais ou de negócio que exigiriam reassociação — agenda, avaliações, treino, contratos, financeiro, integrações, saúde, PAR-Q, prontuário, métricas e nutrição — bloqueiam a consolidação. O inventário tipado fica em `pre-registration-clinical-ownership.service.ts`; a migration `20260728081500_issue_274_clinical_ownership_guard` replica a família bloqueante em trigger para fechar chamadas diretas e corridas entre o preflight e o descarte. Enquanto não existir serviço transacional por domínio, qualquer ocorrência retorna `CLINICAL_REASSOCIATION_REQUIRED` e preserva origem, destino e todos os dados owned.
