# Validacao de qualidade

Este documento lista os comandos padrao para validar mudancas no Sistema Acesso.

## Comando principal

```bash
pnpm validate
```

O comando executa:

1. `pnpm type-check`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm arch:check`
5. `pnpm access:check`
6. `pnpm docs:check`

## Validacoes estruturais

### `pnpm arch:check`

Valida arquivos essenciais de arquitetura, workflow e scripts.

### `pnpm access:check`

Valida consistencia do catalogo de acesso compartilhado.

### `pnpm docs:check`

Valida se documentos obrigatorios existem e se tarefas ativas possuem secoes minimas.

## Harness local

### `pnpm harness:smoke-api`

Executa uma verificacao simples contra a API local. Por padrao usa `http://localhost:3333`, mas aceita `API_BASE_URL`.

### `pnpm harness:validate-env`

Confere se variaveis esperadas para producao estao presentes no ambiente atual. Deve ser usado como checklist local, nao como substituto de segredo no provedor.
Para validar segredos de deploy como erro bloqueante, execute com `HARNESS_VALIDATE_DEPLOY_SECRETS=1`.

## Em PRs

Inclua no corpo do PR:

- resumo da mudanca;
- comandos executados;
- riscos conhecidos;
- screenshots ou evidencias manuais quando houver UI.
