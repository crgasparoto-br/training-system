# Plano concluido: harness engineering foundation

## Status

Concluido. Este registro foi movido de `execution-plans/active/` porque todas as entregas e criterios de aceite foram atendidos.

## Objetivo

Estruturar o repositorio para desenvolvimento agent-first, criando documentacao navegavel, scripts de validacao, harness local, CI de validacao e testes complementares sem alterar comportamento funcional existente.

## Contexto

Este plano aplicou a logica de harness engineering ao Sistema Acesso para reduzir ambiguidade para humanos e agentes e aumentar a validacao automatica antes de PR e deploy.

## Fora de escopo

- Reescrever modulos funcionais.
- Alterar schema Prisma.
- Alterar regras de negocio existentes de permissao.
- Implementar observabilidade avancada.

## Arquivos e modulos principais

- `AGENTS.md`
- `docs/architecture/*`
- `docs/product/access-control.md`
- `docs/execution-plans/TEMPLATE.md`
- `docs/quality/validation.md`
- `scripts/check-architecture.mjs`
- `scripts/check-access-catalog.mjs`
- `scripts/check-docs.mjs`
- `scripts/harness/*`
- `.github/workflows/validate-pr.yml`
- `apps/api/tests/access-control.service.test.ts`

## Regras e restricoes

- Nao alterar comportamento funcional existente.
- Priorizar guardrails mecanicos simples e de baixo risco.
- Scripts devem usar Node.js puro para evitar novas dependencias.
- CI deve rodar em PR e push para branches principais.

## Entregas concluidas

- [x] Criar `AGENTS.md` curto.
- [x] Criar docs de arquitetura e produto.
- [x] Criar template e plano ativo.
- [x] Criar scripts estruturais de validacao.
- [x] Criar harness local basico.
- [x] Adicionar workflow de validacao de PR.
- [x] Adicionar testes complementares de escopo de dados.

## Criterios de aceite atendidos

- [x] `pnpm validate` existe no `package.json`.
- [x] `pnpm arch:check`, `pnpm access:check` e `pnpm docs:check` existem.
- [x] Documentacao agent-first aponta para os documentos corretos.
- [x] Workflow de PR executa validacoes principais.
- [x] Testes de acesso cobrem `self`, `managed`, `contract` e bloqueio sem professor ator.

## Validacao manual

Comandos definidos para validacao:

```bash
pnpm install --frozen-lockfile
pnpm validate
```

Com a API local ativa:

```bash
pnpm harness:smoke-api
```

## Decisoes preservadas

- Guardrails iniciais sao intencionalmente conservadores para evitar falsos positivos em excesso.
- Observabilidade e navegacao automatizada do frontend permaneceram para evolucoes posteriores.
