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

## PRNT

O PRNT possui historico proprio em `ProntuarioRecord` e tabelas filhas por bloco. `StudentParqSubmission` registra cada envio historico do PAR-Q; o prontuario le a submissao mais recente e mantem acompanhamentos antigos em `ProntuarioAnamnesisFollowUp`.

Snapshots de desconforto corporal ficam em `ProntuarioDiscomfortSnapshot` e `ProntuarioDiscomfortEntry`. Dados legados de desconforto no cadastro do aluno nao sao migrados automaticamente.

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
