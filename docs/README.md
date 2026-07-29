# Documentacao do Sistema ACESSO

Este indice define as fontes de verdade e a organizacao da documentacao versionada do projeto.

## Ordem de leitura

Antes de criar ou alterar codigo, plano ou documentacao:

1. leia [`../AGENTS.md`](../AGENTS.md);
2. leia [`../ARCHITECTURE.md`](../ARCHITECTURE.md);
3. consulte [`product/roadmap.md`](product/roadmap.md) para estado funcional e prioridades;
4. localize neste indice a fonte de verdade da area afetada;
5. consulte o plano ativo da iniciativa, quando existir.

Codigo, migrations e testes definem o comportamento efetivamente entregue. Planilhas, benchmarks, issues e documentos de planejamento orientam o produto, mas nao comprovam implementacao isoladamente.

## Fontes de verdade

### Arquitetura e desenvolvimento

- [`../AGENTS.md`](../AGENTS.md): mapa curto para agentes e humanos.
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md): mapa raiz da arquitetura e invariantes.
- [`architecture/overview.md`](architecture/overview.md): visao geral e fronteiras do monorepo.
- [`architecture/api.md`](architecture/api.md): padroes da API.
- [`architecture/web.md`](architecture/web.md): padroes do frontend web.
- [`architecture/database.md`](architecture/database.md): banco, Prisma e multi-tenant.
- [`architecture/auth-and-access-control.md`](architecture/auth-and-access-control.md): autenticacao, autorizacao e escopo de dados.
- [`architecture/deployment.md`](architecture/deployment.md): deploy, ambientes e variaveis.
- [`architecture/pre-registration-api.md`](architecture/pre-registration-api.md): fronteiras HTTP, autenticacao, erros, concorrencia e telemetria da pre-matricula.
- [`architecture/pre-registration-enrollment.md`](architecture/pre-registration-enrollment.md): deduplicacao, revisao versionada, consolidacao e ativacao da pre-matricula.
- [`quality/validation.md`](quality/validation.md): comandos e criterios de validacao.
- [`quality/issue-274-visual-contract.md`](quality/issue-274-visual-contract.md): contrato permanente de evidencia visual e acessibilidade da revisao de pre-matricula.

### Produto

- [`product/roadmap.md`](product/roadmap.md): roadmap canonico, estado funcional e prioridades do Sistema ACESSO.
- [`product/access-control.md`](product/access-control.md): regras de produto para controle de acesso.
- [`product/integrated-prescription-control.md`](product/integrated-prescription-control.md): fluxo PRNT/Avaliacao -> Prescricao -> Montagem -> Treino -> Feedback.
- [`product/student-centered-training-experience.md`](product/student-centered-training-experience.md): experiencia de corrida, musculacao e treino combinado centrada no aluno.
- [`product/future-evolution-roadmap.md`](product/future-evolution-roadmap.md): recorte complementar da issue #139, subordinado ao roadmap canonico e preservado ate seus itens virarem issues especificas.
- [`product/navigation-information-architecture.md`](product/navigation-information-architecture.md): navegacao por hubs, Aluno 360 e rollout.
- [`product/services-commercial-catalog.md`](product/services-commercial-catalog.md): catalogo comercial, opcoes, valores e planos.
- [`product/student-central-action-patterns.md`](product/student-central-action-patterns.md): padrao de pop-up, painel lateral e fluxo guiado.
- [`product/student-central-domain-matrix.md`](product/student-central-domain-matrix.md): fronteira entre Central do Aluno, administracao geral e dominios hibridos.
- [`product/prnt-discomfort-followup-flow.md`](product/prnt-discomfort-followup-flow.md): fluxo implementado de desconfortos e acompanhamentos do PRNT.
- [`product/pre-registration.md`](product/pre-registration.md): ciclo unico de lead, convite, preenchimento, revisao e ativacao no mesmo aluno.
- [`product/pre-registration-health-intake.md`](product/pre-registration-health-intake.md): Anamnese Inicial canônica, opcional, autenticada e retomável.
- [`product/pre-registration-parq.md`](product/pre-registration-parq.md): PAR-Q canônico, versionado, retomável e integrado à análise profissional.
- [`product/pre-registration-enrollment-conversion.md`](product/pre-registration-enrollment-conversion.md): regras permanentes de deduplicacao, decisao administrativa e conversao no mesmo registro.

### Operacao e documentos complementares

- [`operations/api-scripts.md`](operations/api-scripts.md): scripts oficiais de manutencao da API.
- [`operations/services-commercial-catalog-rollout.md`](operations/services-commercial-catalog-rollout.md): rollout do catalogo comercial.
- [`operations/student-financial-service-and-contract-history.md`](operations/student-financial-service-and-contract-history.md): autoridade, vigencia e historico contratual do aluno.
- [`operations/health-intake-cutover.md`](operations/health-intake-cutover.md): backfill, precedencia, verificacao e rollback do corte da Anamnese.
- [`operations/parq-cutover.md`](operations/parq-cutover.md): reconciliação, cutover, verificação e rollback do PAR-Q.
- [`operations/pre-registration-rollout-and-qa.md`](operations/pre-registration-rollout-and-qa.md): QA integrado, privacidade, rollout, observabilidade, go/no-go e rollback da pre-matricula.
- [`operations/pre-registration-rollout-audience-contract.md`](operations/pre-registration-rollout-audience-contract.md): contrato de mensagens e evidencias discriminantes para as audiencias publica, autenticada e administrativa durante indisponibilidade.
- [`internal-test-deploy.md`](internal-test-deploy.md): orientacao rapida complementar para testes internos.
- [`ACCESS_CONTROL.md`](ACCESS_CONTROL.md): exemplos operacionais legados; as regras canonicas permanecem nos documentos de arquitetura e produto de acesso.

## Planos de execucao

- [`execution-plans/TEMPLATE.md`](execution-plans/TEMPLATE.md): estrutura obrigatoria para novas iniciativas grandes.
- [`execution-plans/active/`](execution-plans/active/): somente trabalho realmente em andamento ou rollout ainda pendente.
- [`execution-plans/completed/`](execution-plans/completed/): planos concluidos mantidos por valor de auditoria ou decisao.

Planos ativos relevantes:

- [`execution-plans/active/2026-05-workout-builder-debt.md`](execution-plans/active/2026-05-workout-builder-debt.md)
- [`execution-plans/active/2026-05-aluno-details-debt.md`](execution-plans/active/2026-05-aluno-details-debt.md)
- [`execution-plans/active/2026-05-library-module-debt.md`](execution-plans/active/2026-05-library-module-debt.md)
- [`execution-plans/active/2026-05-periodization-schema-debt.md`](execution-plans/active/2026-05-periodization-schema-debt.md)
- [`execution-plans/active/20260526-prnt-module.md`](execution-plans/active/20260526-prnt-module.md)
- [`execution-plans/active/2026-06-integrated-prescription-control.md`](execution-plans/active/2026-06-integrated-prescription-control.md)
- [`execution-plans/active/2026-06-navigation-information-architecture.md`](execution-plans/active/2026-06-navigation-information-architecture.md)
- [`execution-plans/active/2026-07-student-central-roadmap.md`](execution-plans/active/2026-07-student-central-roadmap.md)
- [`execution-plans/active/2026-07-services-commercial-catalog.md`](execution-plans/active/2026-07-services-commercial-catalog.md)
- [`execution-plans/active/2026-07-issue-272-canonical-health-intake.md`](execution-plans/active/2026-07-issue-272-canonical-health-intake.md)
- [`execution-plans/active/2026-07-issue-274-enrollment-conversion.md`](execution-plans/active/2026-07-issue-274-enrollment-conversion.md)
- [`execution-plans/active/2026-07-issue-275-pre-registration-qa-rollout.md`](execution-plans/active/2026-07-issue-275-pre-registration-qa-rollout.md)

Registros concluidos preservados:

- [`execution-plans/completed/2026-05-harness-engineering-foundation.md`](execution-plans/completed/2026-05-harness-engineering-foundation.md)
- [`execution-plans/completed/2026-07-epic-172-completion-assessment.md`](execution-plans/completed/2026-07-epic-172-completion-assessment.md)
- [`execution-plans/completed/2026-07-prnt-followup-implementation-plan.md`](execution-plans/completed/2026-07-prnt-followup-implementation-plan.md)
- [`execution-plans/completed/2026-07-issue-273-canonical-parq.md`](execution-plans/completed/2026-07-issue-273-canonical-parq.md)

## Regras de manutencao

1. Nao criar outro roadmap geral; atualizar `product/roadmap.md`.
2. Documento de produto define comportamento e fronteiras permanentes.
3. Plano de execucao descreve como uma iniciativa ativa sera entregue.
4. Ao concluir um plano, mover para `execution-plans/completed/` somente quando houver valor de auditoria; caso contrario, remover e confiar no historico do Git.
5. Nao manter apontadores que apenas redirecionam para outra fonte ja indexada.
6. Nao versionar backups locais, resumos de uma entrega, checklists vazios ou relatorios sem funcao operacional.
7. Conteudo historico deve ser mantido apenas quando explica decisao, migracao, risco ou operacao ainda relevante.
8. Atualizar este indice e as referencias antes de excluir ou mover documentos.
9. Executar `pnpm docs:check` depois de reorganizar documentacao.
