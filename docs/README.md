# Documentacao do Sistema Acesso

Este diretorio concentra a documentacao versionada do projeto.

## Fontes de verdade

### Para agentes e desenvolvimento

- [`../AGENTS.md`](../AGENTS.md): mapa curto para agentes e humanos.
- [`architecture/overview.md`](architecture/overview.md): visao geral da arquitetura.
- [`quality/validation.md`](quality/validation.md): comandos e criterios de validacao.

### Arquitetura

- [`architecture/api.md`](architecture/api.md): padroes da API.
- [`architecture/web.md`](architecture/web.md): padroes do frontend web.
- [`architecture/database.md`](architecture/database.md): banco, Prisma e multi-tenant.
- [`architecture/auth-and-access-control.md`](architecture/auth-and-access-control.md): autenticacao, autorizacao e escopo de dados.
- [`architecture/deployment.md`](architecture/deployment.md): deploy, variaveis e ambientes.

### Produto

- [`product/access-control.md`](product/access-control.md): regras de produto para controle de acesso.

### Operacao

- [`operations/api-scripts.md`](operations/api-scripts.md): scripts oficiais de manutencao/operacao da API.

### Planos de execucao

- [`execution-plans/TEMPLATE.md`](execution-plans/TEMPLATE.md): template para tarefas grandes.
- [`execution-plans/active/`](execution-plans/active/): planos em andamento.
- [`execution-plans/completed/`](execution-plans/completed/): planos concluidos, quando aplicavel.

## Documentos historicos ou complementares

Documentos antigos que ainda possuem valor historico devem ser movidos para [`archive/`](archive/) ou atualizados para apontar para as fontes de verdade acima.

Documentos complementares atualmente mantidos na raiz de `docs/`:

- [`internal-test-deploy.md`](internal-test-deploy.md): orientacao complementar para publicacao de testes internos; conferir sempre `architecture/deployment.md` e `quality/validation.md`.
- [`BIBLIOTECA_MELHORIAS.md`](BIBLIOTECA_MELHORIAS.md): registro historico de melhorias da tela de Biblioteca; conferir `execution-plans/active/2026-05-library-module-debt.md`.
- [`CHECKLIST_TESTES_BIBLIOTECA.md`](CHECKLIST_TESTES_BIBLIOTECA.md): checklist manual complementar da tela de Biblioteca; conferir `quality/validation.md` e o plano do modulo.

## Regra de manutencao

Ao adicionar nova documentacao:

1. Prefira criar em `architecture/`, `product/`, `quality`, `operations/` ou `execution-plans/`.
2. Evite duplicar conteudo ja existente.
3. Atualize este indice quando o documento for uma fonte de verdade.
4. Arquivos de backup local nao devem ser versionados na raiz de `docs/`.
