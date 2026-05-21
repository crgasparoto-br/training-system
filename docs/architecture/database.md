# Arquitetura de banco de dados

O projeto usa Prisma para modelagem e acesso ao banco.

## Regras para mudancas de schema

- `apps/api/prisma/schema.prisma` e a fonte de verdade ativa do schema Prisma.
- Toda alteracao em schema deve ser acompanhada de migration.
- Toda migration deve ter nome descritivo.
- Arquivos auxiliares de schema devem deixar explicito se sao referencia, rascunho ou historico, e nao devem gerar migrations diretamente.
- Mudancas que afetam produto devem atualizar documentacao correspondente em `docs/product/`.
- Mudancas que afetam permissao ou escopo de dados devem atualizar `docs/architecture/auth-and-access-control.md`.
- Seeds ou dados demo devem ser atualizados quando a validacao local depender deles.

## Multi-tenant

O `contractId` e a barreira principal entre clientes/contratos. Rotas, services e consultas devem preservar esse filtro.

## Cuidados para agentes

- Nao criar `PrismaClient` em arquivos aleatorios sem necessidade.
- Evitar regras de negocio escondidas em queries grandes sem teste.
- Preferir services pequenos e testaveis.
- Validar impactos de migration em deploy.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
