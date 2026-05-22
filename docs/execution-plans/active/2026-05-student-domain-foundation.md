# Plano: fundacao do dominio de alunos por origem dos dados

## Objetivo

Criar a base estrutural para separar no Sistema Acesso o que e cadastro declarado pelo aluno, o que e prontuario e avaliacao profissional, o que e financeiro e o que vem de integracoes externas.

## Contexto

- A iniciativa esta registrada nas issues #78 e #79.
- O fluxo atual de alunos mistura dados antropometricos na tabela principal, intake em `AlunoIntakeForm`, financeiro em campos livres do formulario e integracoes em `Integration` com pouca especializacao.
- O Prisma ativo do repositorio aponta para `prisma/schema.prisma`.
- Existe um schema paralelo em `apps/api/prisma/schema.prisma`, mas ele nao e a fonte ativa configurada pelo `prisma.config.ts`.
- A issue #80 usa esta fundacao para expor endpoints segmentados do aluno sem quebrar o contrato legado da tela atual.

## Fora de escopo

- reorganizacao completa do frontend do aluno;
- fluxo OAuth completo de provedores externos;
- migracao total dos dados legados para os novos dominios nesta mesma entrega.

## Arquivos e modulos principais

- `prisma/schema.prisma`
- `prisma/migrations/20260522012000_add_student_domain_foundation/migration.sql`
- `apps/api/src/modules/alunos/student-domain.service.ts`
- `apps/api/src/modules/alunos/student-domain.routes.ts`
- `apps/api/src/modules/alunos/index.ts`
- `apps/api/tests/aluno-segmented.routes.test.ts`
- `docs/execution-plans/active/2026-05-student-domain-foundation.md`

## Regras e restricoes

- `contractId` deve ser preservado como barreira multi-tenant em todos os novos dominios sensiveis.
- A alteracao precisa ser aditiva para nao quebrar o fluxo atual enquanto API e frontend nao migram.
- A base nova deve permitir rastrear origem do dado (`student`, `professional`, `integration`, `system`).
- O schema ativo e `prisma/schema.prisma`; evitar propagar mudancas no schema paralelo ate haver plano especifico de consolidacao.
- Os endpoints novos devem conviver com o modulo legado de alunos, usando fallback para dados que ainda nao migraram.

## Passos de implementacao

- [x] mapear a modelagem atual de aluno, intake, contratos e integracoes
- [x] confirmar qual schema Prisma esta ativo no repositorio
- [x] adicionar modelos dedicados para profile, intake, assessments, financial e external data
- [x] adicionar migration Prisma aditiva para a nova fundacao do dominio
- [x] preparar a base documental para as proximas issues de API e frontend
- [x] criar servico segmentado com fallback para profile, intake, assessments, financial e integrations
- [x] expor rotas segmentadas e resumo consolidado sem remover o roteador legado
- [x] adicionar cobertura basica de testes para as novas rotas

## Criterios de aceite

- [x] o schema suporta separacao entre cadastro declarado, intake, avaliacoes, financeiro e integracoes externas
- [x] todos os novos dominios carregam `contractId`
- [x] a base inclui rastreabilidade minima de origem do dado
- [x] a alteracao permanece compativel com o fluxo atual
- [x] documentacao foi atualizada
- [ ] `pnpm validate` passa

## Validacao manual

- revisar o schema gerado para confirmar que os novos modelos sao aditivos e nao removem o fluxo atual
- revisar a migration para confirmar criacao de tabelas, enums, FKs e indices esperados
- revisar as novas rotas segmentadas para confirmar que elas convivem com o roteador legado e reutilizam a mesma checagem de acesso do professor
- na proxima etapa com ambiente local disponivel, rodar `pnpm validate` e validar as rotas novas com os testes da API

## Decisoes e pendencias

- Decisao: a fundacao sera aditiva, sem remover `AlunoIntakeForm`, `Integration` ou campos atuais de `Aluno` nesta etapa.
- Decisao: o dominio novo sera criado no schema ativo `prisma/schema.prisma`.
- Decisao: a issue #80 foi implementada com endpoints de leitura segmentados e resumo consolidado; as escritas permanecem no fluxo legado por enquanto.
- Pendencia: decidir em PR proprio como consolidar ou aposentar o schema paralelo em `apps/api/prisma/schema.prisma`.
- Pendencia: a issue #81 reorganizara a navegacao e as abas do frontend com base nessa fundacao.
- Pendencia: a issue #82 passara a gravar provedores e atividades reais no dominio novo de integracoes.
