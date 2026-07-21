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

`Aluno` agora representa o registro canonico da pessoa desde `LEAD` ate
`ACTIVE_STUDENT` (`Aluno.status`), com `userId`, `professorId` e `age`
opcionais para admitir um lead incompleto sem conta, professor ou idade
fabricada. `Aluno.contractId` e obrigatorio desde a criacao do lead e e a
fonte tenant-scoped preferida em vez de navegar por `professor.contractId`
(que pode ser nulo antes da ativacao).

Ver `docs/architecture/student-lifecycle-data-ownership.md` para a matriz de
propriedade de dados pessoais, a regra de conta global vs. tenant-scoped e a
documentacao de migration/rollback. Transicoes de estado ficam centralizadas
em `apps/api/src/modules/alunos/student-lifecycle.service.ts` e nos contratos
compartilhados de `packages/types/student-lifecycle.ts` -- nenhum outro
ponto do codigo deve escrever `Aluno.status` diretamente.

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
