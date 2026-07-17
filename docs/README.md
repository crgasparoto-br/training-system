# Documentacao do Sistema ACESSO

Este diretorio concentra a documentacao versionada do projeto.

## Leitura obrigatoria antes de mudar documentacao ou codigo

Antes de criar, alterar ou revisar qualquer documentacao, plano ou codigo, leia primeiro:

1. [`../AGENTS.md`](../AGENTS.md): mapa curto para agentes e humanos.
2. [`../ARCHITECTURE.md`](../ARCHITECTURE.md): mapa raiz da arquitetura, invariantes e fronteiras principais.
3. [`product/roadmap.md`](product/roadmap.md): estado funcional, prioridades e evolucao geral do produto.
4. Este indice (`docs/README.md`) para localizar a fonte de verdade especifica.

Depois disso, leia os documentos especificos da area afetada. Nao crie nova documentacao ou plano sem conferir se ja existe uma fonte de verdade aplicavel.

Codigo, migrations e testes definem o comportamento efetivamente entregue. Planilhas, benchmarks, issues e documentos de planejamento orientam o produto, mas nao comprovam implementacao isoladamente.

## Fontes de verdade

### Para agentes e desenvolvimento

- [`../AGENTS.md`](../AGENTS.md): mapa curto para agentes e humanos.
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md): mapa raiz da arquitetura e invariantes.
- [`product/roadmap.md`](product/roadmap.md): roadmap canonico e estado funcional do produto.
- [`architecture/overview.md`](architecture/overview.md): visao geral da arquitetura.
- [`quality/validation.md`](quality/validation.md): comandos e criterios de validacao.

### Arquitetura

- [`architecture/api.md`](architecture/api.md): padroes da API.
- [`architecture/web.md`](architecture/web.md): padroes do frontend web.
- [`architecture/database.md`](architecture/database.md): banco, Prisma e multi-tenant.
- [`architecture/auth-and-access-control.md`](architecture/auth-and-access-control.md): autenticacao, autorizacao e escopo de dados.
- [`architecture/deployment.md`](architecture/deployment.md): deploy, variaveis e ambientes.

### Produto

- [`product/roadmap.md`](product/roadmap.md): estado funcional, prioridades e evolucao geral do Sistema ACESSO.
- [`product/access-control.md`](product/access-control.md): regras de produto para controle de acesso.
- [`product/integrated-prescription-control.md`](product/integrated-prescription-control.md): arquitetura-alvo do fluxo integrado de prontuario, avaliacao, prescricao, montagem consolidada, treino de hoje, feedback e decisao.
- [`product/student-centered-training-experience.md`](product/student-centered-training-experience.md): fonte detalhada da experiencia de corrida, musculacao e treino combinado centrada no aluno.
- [`product/future-evolution-roadmap.md`](product/future-evolution-roadmap.md): detalhamento complementar de evolucoes futuras; deve permanecer subordinado ao roadmap canonico.
- [`product/navigation-information-architecture.md`](product/navigation-information-architecture.md): mapa atual, arquitetura por hubs, Aluno 360, telas longas, inicio por perfil, permissoes e rollout da nova navegacao.
- [`product/services-commercial-catalog.md`](product/services-commercial-catalog.md): arquitetura de produto para catalogo comercial, opcoes, valores, apresentacao e composicao de planos.
- [`product/student-central-action-patterns.md`](product/student-central-action-patterns.md): padrao de pop-up, painel lateral e fluxo guiado para acoes contextuais da Central do Aluno.
- [`product/student-central-domain-matrix.md`](product/student-central-domain-matrix.md): fonte de verdade para a fronteira entre Central do Aluno, administracao geral e funcionalidades hibridas.
- [`product/prnt-discomfort-followup-flow.md`](product/prnt-discomfort-followup-flow.md): fluxo implementado de desconfortos e acompanhamentos no PRNT.

### Operacao

- [`operations/api-scripts.md`](operations/api-scripts.md): scripts oficiais de manutencao/operacao da API.
- [`operations/services-commercial-catalog-rollout.md`](operations/services-commercial-catalog-rollout.md): ordem de deploy, carga idempotente, compatibilidade, rollback e checklist do catalogo comercial.

### Planos de execucao

- [`execution-plans/TEMPLATE.md`](execution-plans/TEMPLATE.md): template para tarefas grandes.
- [`execution-plans/active/`](execution-plans/active/): planos realmente em andamento; arquivos concluidos mantidos nesse caminho apenas por compatibilidade devem declarar explicitamente que nao sao ativos.
- [`execution-plans/active/2026-06-integrated-prescription-control.md`](execution-plans/active/2026-06-integrated-prescription-control.md): plano ativo para evolucao do fluxo integrado de prontuario, prescricao e treino.
- [`execution-plans/active/2026-06-navigation-information-architecture.md`](execution-plans/active/2026-06-navigation-information-architecture.md): plano ativo para reorganizacao incremental da navegacao, Aluno 360, inicio por perfil e permissoes.
- [`execution-plans/active/2026-07-student-central-roadmap.md`](execution-plans/active/2026-07-student-central-roadmap.md): detalhamento da Central do Aluno, fases e proximos passos, subordinado ao roadmap canonico.
- [`execution-plans/active/2026-07-epic-172-completion-assessment.md`](execution-plans/active/2026-07-epic-172-completion-assessment.md): levantamento do que foi entregue na epica #172 e do que ainda falta para concluir a Fase 5 de antropometria.
- [`execution-plans/active/2026-07-services-commercial-catalog.md`](execution-plans/active/2026-07-services-commercial-catalog.md): registro de implementacao da epica #210; mantido no caminho ativo por compatibilidade ate a validacao operacional.
- [`execution-plans/completed/`](execution-plans/completed/): planos concluidos, quando aplicavel.

## Apontadores de compatibilidade

Alguns caminhos antigos permanecem versionados para nao quebrar links existentes. Eles nao sao fontes de verdade e devem apontar para o documento atual.

- `product/student-central-boundary-map.md` aponta para `product/student-central-domain-matrix.md`.
- `product/prnt-followup-implementation-plan.md` aponta para `product/prnt-discomfort-followup-flow.md`.
- `execution-plans/active/2026-07-prnt-followup-implementation-plan.md` registra uma entrega concluida e nao deve ser interpretado como plano ativo.

## Documentos historicos ou complementares

Documentos antigos que ainda possuem valor historico podem permanecer em [`archive/`](archive/) ou como apontadores curtos. A remocao deve ocorrer em uma revisao documental propria, com verificacao de links e confirmacao de que o conteudo permanente foi incorporado a uma fonte de verdade.

### Complementares ainda mantidos na raiz de `docs/`

- [`internal-test-deploy.md`](internal-test-deploy.md): orientacao complementar para publicacao de testes internos.
- [`BIBLIOTECA_MELHORIAS.md`](BIBLIOTECA_MELHORIAS.md): apontador para o registro historico da Biblioteca e o plano ativo do modulo.
- [`CHECKLIST_TESTES_BIBLIOTECA.md`](CHECKLIST_TESTES_BIBLIOTECA.md): apontador para o checklist historico da Biblioteca e os criterios atuais de validacao.

### Arquivos historicos arquivados

- [`archive/BIBLIOTECA_MELHORIAS-2026-02-02.md`](archive/BIBLIOTECA_MELHORIAS-2026-02-02.md): registro historico da tela de Biblioteca.
- [`archive/CHECKLIST_TESTES_BIBLIOTECA-2026-02-02.md`](archive/CHECKLIST_TESTES_BIBLIOTECA-2026-02-02.md): checklist manual historico associado a entrega.
- [`archive/visual-guidelines.local-backup-20260420-165809.md`](archive/visual-guidelines.local-backup-20260420-165809.md): backup visual local mantido apenas para consulta historica.

## Regras de manutencao

1. Nao criar outro roadmap geral; atualizar `product/roadmap.md`.
2. Documento de produto explica comportamento e fronteiras permanentes.
3. Plano de execucao explica como uma iniciativa ativa sera entregue.
4. Evite duplicar regras; documentos detalhados devem apontar para o roadmap canonico.
5. Atualize este indice quando uma fonte de verdade for criada, substituida ou removida.
6. Arquivos de backup local nao devem ser versionados na raiz de `docs/`.
7. Planos concluidos nao devem permanecer descritos como trabalho futuro dentro de `execution-plans/active/`.
8. Remocoes documentais amplas exigem revisao propria de referencias, links e conteudo permanente.
9. Execute `pnpm docs:check` depois de reorganizar documentacao.
