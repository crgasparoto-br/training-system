# Arquitetura de banco de dados

O projeto usa Prisma para modelagem e acesso ao banco.

## Regras para mudancas de schema

- Toda alteracao em schema deve ser acompanhada de migration.
- Toda migration deve ter nome descritivo.
- Mudancas que afetam produto devem atualizar documentacao correspondente em `docs/product/`.
- Mudancas que afetam permissao ou escopo de dados devem atualizar `docs/architecture/auth-and-access-control.md`.
- Seeds ou dados demo devem ser atualizados quando a validacao local depender deles.

## Multi-tenant

O `contractId` e a barreira principal entre clientes/contratos. Rotas, services e consultas devem preservar esse filtro.

## PRNT

O PRNT possui historico proprio em `ProntuarioRecord` e tabelas filhas por bloco. `StudentParqSubmission` registra cada envio historico do PAR-Q; o prontuario le a submissao mais recente e mantem acompanhamentos antigos em `ProntuarioAnamnesisFollowUp`.

Snapshots de desconforto corporal ficam em `ProntuarioDiscomfortSnapshot` e `ProntuarioDiscomfortEntry`. Dados legados de desconforto no cadastro do aluno nao sao migrados automaticamente.

## Cuidados para agentes

- Nao criar `PrismaClient` em arquivos aleatorios sem necessidade.
- Evitar regras de negocio escondidas em queries grandes sem teste.
- Preferir services pequenos e testaveis.
- Validar impactos de migration em deploy.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
