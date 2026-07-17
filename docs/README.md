# Documentacao do Sistema ACESSO

Este indice define as fontes de verdade do projeto. O objetivo e evitar documentos duplicados, planos concluidos em `active/` e roadmaps concorrentes.

## Ordem de leitura

Antes de criar ou alterar codigo, plano ou documentacao:

1. [`../AGENTS.md`](../AGENTS.md)
2. [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
3. [`product/roadmap.md`](product/roadmap.md)
4. a fonte de verdade especifica da area afetada
5. o plano ativo da iniciativa, quando existir

Codigo, migrations e testes definem o comportamento efetivamente entregue. Planilhas, issues e documentos de planejamento orientam o produto, mas nao comprovam implementacao isoladamente.

## Fontes de verdade

### Arquitetura

- [`architecture/overview.md`](architecture/overview.md): visao geral e fronteiras do monorepo.
- [`architecture/api.md`](architecture/api.md): padroes da API.
- [`architecture/web.md`](architecture/web.md): padroes do frontend web.
- [`architecture/database.md`](architecture/database.md): banco, Prisma e multi-tenant.
- [`architecture/auth-and-access-control.md`](architecture/auth-and-access-control.md): autenticacao, autorizacao e escopo de dados.
- [`architecture/deployment.md`](architecture/deployment.md): deploy, ambientes e variaveis.

### Produto

- [`product/roadmap.md`](product/roadmap.md): estado funcional, prioridades e evolucoes do Sistema ACESSO.
- [`product/access-control.md`](product/access-control.md): regras de produto para controle de acesso.
- [`product/integrated-prescription-control.md`](product/integrated-prescription-control.md): fluxo PRNT/Avaliacao -> Prescricao -> Montagem -> Treino -> Feedback.
- [`product/capacity-prescription-model.md`](product/capacity-prescription-model.md): recorte tecnico atual da prescricao por capacidades.
- [`product/navigation-information-architecture.md`](product/navigation-information-architecture.md): navegacao por hubs, Aluno 360 e rollout.
- [`product/student-central-domain-matrix.md`](product/student-central-domain-matrix.md): fronteira entre Central do Aluno, administracao e dominios hibridos.
- [`product/student-central-action-patterns.md`](product/student-central-action-patterns.md): padrao de pop-up, painel lateral e fluxo guiado.
- [`product/prnt-discomfort-followup-flow.md`](product/prnt-discomfort-followup-flow.md): fluxo atual de desconfortos e acompanhamentos do PRNT.
- [`product/services-commercial-catalog.md`](product/services-commercial-catalog.md): catalogo comercial, opcoes, valores e planos.

### Contratos funcionais complementares

- [`student-app-data-contract.md`](student-app-data-contract.md): contrato de dados da visao do aluno.
- [`student-contract-integration.md`](student-contract-integration.md): integracao de contratos do aluno.

### Operacao e qualidade

- [`operations/api-scripts.md`](operations/api-scripts.md): scripts oficiais de manutencao da API.
- [`operations/services-commercial-catalog-rollout.md`](operations/services-commercial-catalog-rollout.md): rollout do catalogo comercial.
- [`quality/validation.md`](quality/validation.md): comandos e criterios de validacao.
- [`internal-test-deploy.md`](internal-test-deploy.md): orientacao complementar para publicacao de testes internos.

## Planos de execucao

- [`execution-plans/TEMPLATE.md`](execution-plans/TEMPLATE.md): estrutura obrigatoria para novas iniciativas grandes.
- [`execution-plans/active/`](execution-plans/active/): somente trabalho realmente em andamento.
- [`execution-plans/completed/`](execution-plans/completed/): registros concluidos que ainda precisam permanecer acessiveis por motivo operacional.

Planos ativos relevantes no estado atual:

- [`execution-plans/active/2026-06-integrated-prescription-control.md`](execution-plans/active/2026-06-integrated-prescription-control.md)
- [`execution-plans/active/2026-06-navigation-information-architecture.md`](execution-plans/active/2026-06-navigation-information-architecture.md)
- [`execution-plans/active/2026-05-library-module-debt.md`](execution-plans/active/2026-05-library-module-debt.md)
- [`execution-plans/active/2026-05-workout-builder-debt.md`](execution-plans/active/2026-05-workout-builder-debt.md)
- [`execution-plans/active/2026-05-aluno-details-debt.md`](execution-plans/active/2026-05-aluno-details-debt.md)
- [`execution-plans/active/2026-05-periodization-schema-debt.md`](execution-plans/active/2026-05-periodization-schema-debt.md)
- [`execution-plans/active/2026-07-services-commercial-catalog.md`](execution-plans/active/2026-07-services-commercial-catalog.md)

## Regras de manutencao

1. Nao criar outro roadmap geral; atualizar `product/roadmap.md`.
2. Nao duplicar regras entre roadmap, documento de produto e plano de execucao.
3. Documento de produto explica o comportamento e as fronteiras permanentes.
4. Plano de execucao explica somente como uma iniciativa ativa sera entregue.
5. Ao concluir um plano, incorporar as decisoes permanentes na fonte de verdade e remover o plano de `active/`.
6. Evitar apontadores de compatibilidade sem uso real. O historico do Git preserva documentos removidos.
7. Nao versionar backups locais, relatorios pontuais ou resumos de uma PR como documentacao permanente.
8. Atualizar este indice quando uma nova fonte de verdade for criada ou removida.
9. Executar `pnpm docs:check` depois de reorganizar documentacao.

## Criterio para manter um documento

Um documento deve permanecer versionado quando pelo menos uma condicao for verdadeira:

- define arquitetura ou regra permanente;
- e fonte de verdade de produto;
- descreve operacao necessaria em ambiente real;
- define validacao vigente;
- orienta iniciativa realmente ativa;
- documenta contrato consumido por mais de uma camada.

Documentos substituidos, planos concluidos, backups, resumos de entrega e historicos sem uso operacional devem ser removidos. O historico permanece disponivel no Git.