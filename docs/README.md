# Documentacao do Sistema Acesso

Este diretorio concentra a documentacao versionada do projeto.

## Leitura obrigatoria antes de mudar documentacao ou codigo

Antes de criar, alterar ou revisar qualquer documentacao, plano ou codigo, leia primeiro:

1. [`../AGENTS.md`](../AGENTS.md): mapa curto para agentes e humanos.
2. [`../ARCHITECTURE.md`](../ARCHITECTURE.md): mapa raiz da arquitetura, invariantes e fronteiras principais.
3. Este indice (`docs/README.md`) para localizar a fonte de verdade especifica.

Depois disso, leia os documentos especificos da area afetada. Nao crie nova documentacao ou plano sem conferir se ja existe uma fonte de verdade aplicavel.

## Fontes de verdade

### Para agentes e desenvolvimento

- [`../AGENTS.md`](../AGENTS.md): mapa curto para agentes e humanos.
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md): mapa raiz da arquitetura, invariantes e fronteiras principais.
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
- [`product/integrated-prescription-control.md`](product/integrated-prescription-control.md): arquitetura-alvo do fluxo integrado de prontuario, avaliacao, prescricao, montagem consolidada, treino de hoje, feedback e decisao.
- [`product/navigation-information-architecture.md`](product/navigation-information-architecture.md): mapa atual, arquitetura por hubs, Aluno 360, telas longas, inicio por perfil, permissoes e rollout da nova navegacao.
- [`product/student-central-action-patterns.md`](product/student-central-action-patterns.md): padrao de pop-up, painel lateral e fluxo guiado para acoes contextuais da Central do Aluno.

### Operacao

- [`operations/api-scripts.md`](operations/api-scripts.md): scripts oficiais de manutencao/operacao da API.

### Planos de execucao

- [`execution-plans/TEMPLATE.md`](execution-plans/TEMPLATE.md): template para tarefas grandes.
- [`execution-plans/active/`](execution-plans/active/): planos em andamento.
- [`execution-plans/active/2026-06-integrated-prescription-control.md`](execution-plans/active/2026-06-integrated-prescription-control.md): plano ativo para evolucao do fluxo integrado de prontuario, prescricao e treino.
- [`execution-plans/active/2026-06-navigation-information-architecture.md`](execution-plans/active/2026-06-navigation-information-architecture.md): plano ativo para reorganizacao incremental da navegacao, Aluno 360, inicio por perfil e permissoes.
- [`execution-plans/active/2026-07-student-central-roadmap.md`](execution-plans/active/2026-07-student-central-roadmap.md): plano ativo para Central do Aluno, roadmap integrado, fases, epicos, subissues e controle de avanco.
- [`execution-plans/completed/`](execution-plans/completed/): planos concluidos, quando aplicavel.

## Documentos historicos ou complementares

Documentos antigos que ainda possuem valor historico devem ser movidos para [`archive/`](archive/) ou atualizados para apontar para as fontes de verdade acima.

### Complementares ainda mantidos na raiz de `docs/`

- [`internal-test-deploy.md`](internal-test-deploy.md): orientacao complementar para publicacao de testes internos; conferir sempre `architecture/deployment.md`, `quality/validation.md` e `operations/api-scripts.md`.
- [`BIBLIOTECA_MELHORIAS.md`](BIBLIOTECA_MELHORIAS.md): apontador estavel para o registro historico arquivado da Biblioteca; conferir `archive/BIBLIOTECA_MELHORIAS-2026-02-02.md` e `execution-plans/active/2026-05-library-module-debt.md`.
- [`CHECKLIST_TESTES_BIBLIOTECA.md`](CHECKLIST_TESTES_BIBLIOTECA.md): apontador estavel para o checklist manual historico da Biblioteca; conferir `archive/CHECKLIST_TESTES_BIBLIOTECA-2026-02-02.md`, `quality/validation.md` e o plano do modulo.

### Arquivos historicos arquivados

- [`archive/BIBLIOTECA_MELHORIAS-2026-02-02.md`](archive/BIBLIOTECA_MELHORIAS-2026-02-02.md): registro detalhado da entrega historica de 02/02/2026 da tela de Biblioteca.
- [`archive/CHECKLIST_TESTES_BIBLIOTECA-2026-02-02.md`](archive/CHECKLIST_TESTES_BIBLIOTECA-2026-02-02.md): checklist manual historico associado a essa entrega.
- [`archive/visual-guidelines.local-backup-20260420-165809.md`](archive/visual-guidelines.local-backup-20260420-165809.md): backup visual local mantido apenas para consulta historica.

## Regra de manutencao

Ao adicionar nova documentacao:

1. Leia `../AGENTS.md` e `../ARCHITECTURE.md` antes de criar ou alterar documentos.
2. Prefira criar em `architecture/`, `product/`, `quality`, `operations/` ou `execution-plans/`.
3. Evite duplicar conteudo ja existente.
4. Atualize este indice quando o documento for uma fonte de verdade.
5. Arquivos de backup local nao devem ser versionados na raiz de `docs/`.
6. Quando um documento antigo precisar ser preservado apenas por historico, mova o conteudo para `archive/` e deixe um apontador curto no caminho antigo somente se isso ajudar a manter links estaveis.