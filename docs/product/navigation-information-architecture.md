# Produto: arquitetura de informacao e navegacao

Este documento registra a descoberta e a proposta de navegacao para o epic #149 e as issues #150 a #157.

A mudanca e intencionalmente incremental. O objetivo desta primeira entrega e criar uma base revisavel antes de alterar menu, rotas, hubs, dashboards ou permissoes sensiveis em codigo.

## Escopo desta entrega

- Mapear a navegacao atual observada em `develop`.
- Definir arquitetura proposta por hubs.
- Definir destino de menu, rotas, abas internas, blocos e atalhos.
- Definir o padrao de telas longas.
- Definir a estrutura-alvo do `Aluno 360`.
- Definir o conteudo inicial por perfil.
- Registrar matriz de permissao e escopo para a nova navegacao.
- Planejar rollout incremental e checklist de validacao.

## Fontes revisadas

- `apps/web/src/App.tsx`: rotas protegidas e redirecionamentos principais.
- `apps/web/src/navigation/sidebarMenu.ts`: menu lateral atual e arvore usada por permissoes.
- `apps/web/src/layouts/DashboardLayout.tsx`: aplicacao do menu filtrado por permissao.
- `apps/web/src/access/access-control.ts`: filtros de tela, bloco e escopo no frontend.
- `apps/web/src/components/alunos/AlunoDetailsTabs.tsx`: abas e grupos atuais do aluno selecionado.
- `packages/types/access-control.ts`: catalogo compartilhado de `screenKey`, `blockKey` e defaults por perfil.
- `docs/architecture/auth-and-access-control.md` e `docs/product/access-control.md`: regras de autorizacao.
- `docs/product/integrated-prescription-control.md`: fluxo integrado de aluno, prontuario, avaliacao, prescricao e treino.

## Mapa atual da navegacao

### Rotas protegidas principais

| Area atual | Rotas principais | Permissao de tela |
| --- | --- | --- |
| Alunos | `/alunos`, `/alunos/new`, `/alunos/:id`, `/alunos/:id/edit`, `/consultas/alunos` | `students.registration`, `students.consultation`, `students.details` |
| Contratos do aluno | `/alunos/:id/contracts`, assinatura publica por token | `students.registration` para gestao interna |
| Colaboradores | `/professores`, `/professores/new`, `/consultas/colaboradores` | `collaborators.registration`, `collaborators.consultation` |
| Avaliacao fisica | `/protocolo-avaliacao-fisica/*` | `physicalAssessment.protocol` |
| Treinamento | `/plans`, `/plans/new`, `/plans/:id`, Workout Builder, `/library`, `/executions` | `plans`, `library`, `executions` |
| Agenda | `/agenda` | `agenda` |
| Relatorios | `/reports` | `reports` |
| Configuracoes | `/settings/*`, `/cadastros/valores-hora-aula` | chaves `settings.*` e `hourlyRateLevels.registration` |

### Menu lateral atual

| Grupo atual | Conteudo | Observacao |
| --- | --- | --- |
| Atendimento | Cadastros e consultas de alunos/colaboradores, incluindo acesso dos alunos | Mistura entrada operacional, cadastro e configuracao de acesso. |
| Treinamento | Planos, agenda, biblioteca e execucoes | Agenda aparece junto de treino, mas tambem e rotina operacional propria. |
| Gestao | Contratos, empresa/prestador, servicos, valores, bancos e funcoes | Mistura gestao operacional com configuracoes administrativas. |
| Avaliacao fisica | Protocolos e medidas | Hub funcional claro, mas precisa conviver com acesso via Aluno 360. |
| Relatorios | Pagina em desenvolvimento | Pode virar parte de Gestao ou Inicio, conforme maturidade. |
| Configuracoes | Parametros, escalas, manual, tabela de referencia e tipos de avaliacao | Deve concentrar configuracoes e modelos, evitando rotina diaria. |

### Aluno selecionado atual

`AlunoDetailsTabs.tsx` ja possui grupos internos:

| Grupo atual | Abas | Leitura para Aluno 360 |
| --- | --- | --- |
| Operacao do acompanhamento | Resumo, Treinos / Planos | Base inicial do hub operacional do aluno. |
| Fluxo tecnico | Prontuario, Avaliacao Fisica, Plano de Avaliacoes, Historico / Evolucao | Deve manter separacao entre dado tecnico e visao pratica. |
| Cadastro e vinculos | Cadastro, Financeiro / Contrato, Revisoes Cadastrais | Deve preservar permissoes por bloco e dados sensiveis. |
| Conexoes | Integracoes | Evidencia externa, nunca fonte tecnica automatica. |

## Jornadas criticas atuais

### Professor

| Jornada | Caminho atual | Friccao principal | Risco |
| --- | --- | --- | --- |
| Preparar atendimento do aluno | Consultar alunos -> aluno -> abas internas -> planos/avaliacoes/agendas externas | Alternancia entre detalhe do aluno e modulos isolados. | Medio: contexto do aluno pode se perder. |
| Revisar prontuario e avaliacao | Aluno -> Prontuario/Avaliacao ou Avaliacao fisica global | Existem duas entradas legitimas; falta regra clara de prioridade. | Alto: dados de saude exigem bloco e escopo. |
| Ajustar treino | Aluno -> Treinos / Planos -> Planos -> Workout Builder | Rotas de treino ficam fora do aluno selecionado. | Medio: risco de editar fora do contexto pretendido. |
| Acompanhar execucao | Treinamento -> Execucoes, ou aluno -> historico | Execucao nao fica claramente conectada ao aluno no menu. | Medio: precisa rastreabilidade. |

### Administrativo

| Jornada | Caminho atual | Friccao principal | Risco |
| --- | --- | --- | --- |
| Cadastrar aluno e revisar dados | Atendimento -> Cadastros -> Alunos -> Novo aluno | Entrada clara, mas revisoes cadastrais ficam dentro do detalhe do aluno. | Baixo. |
| Conferir contrato/financeiro | Aluno -> Financeiro / Contrato, Gestao -> Contratos, Settings de contrato | Contrato, modelo e empresa/prestador se misturam. | Alto: financeiro exige permissao especifica. |
| Gerir acesso do aluno | Atendimento -> Cadastros -> Alunos -> Acesso dos alunos | E uma configuracao, mas aparece como rotina de cadastro. | Medio. |

### Gestor

| Jornada | Caminho atual | Friccao principal | Risco |
| --- | --- | --- | --- |
| Ver operacao do dia | Agenda, alunos, execucoes e relatorios separados | Falta inicio por perfil com pendencias e atalhos. | Medio. |
| Gerir equipe | Atendimento -> colaboradores, Gestao -> funcoes | Cadastro, consulta e funcao ficam em grupos diferentes. | Alto: depende de `dataScope` em colaboradores. |
| Gerir comercial e contrato | Gestao e Configuracoes | Algumas configuracoes aparecem como gestao diaria. | Medio. |

## Problemas priorizados

| Prioridade | Tipo | Problema | Impacto | Issue relacionada |
| --- | --- | --- | --- | --- |
| Alta | Arquitetura de informacao | Atendimento mistura cadastro, consulta e configuracao de acesso. | Dificulta encontrar rotinas e revisar permissoes. | #151, #152, #156 |
| Alta | Permissao | Hubs podem juntar saude, financeiro, contrato e auditoria na mesma tela. | Risco de exposicao indevida se blocos nao forem mapeados. | #153, #156 |
| Alta | Contexto | Professor alterna entre aluno, planos, avaliacoes e execucoes. | Perda de contexto do aluno selecionado. | #153 |
| Media | Menu | Agenda fica dentro de Treinamento. | Agenda e rotina operacional transversal. | #152 |
| Media | Layout | Telas longas dependem de abas e blocos extensos. | Fica dificil revisar, validar e testar estados vazios. | #154 |
| Media | Inicio | Rota inicial escolhe primeira permissao disponivel, nao rotina do perfil. | Usuario comeca em tela permitida, mas nem sempre util. | #155 |
| Media | Compatibilidade | Rotas atuais precisam continuar funcionando. | Links salvos e fluxos existentes nao podem quebrar. | #157 |

## Arquitetura proposta por hubs

### Hubs principais

| Hub | Objetivo | Publico principal | Conteudo esperado |
| --- | --- | --- | --- |
| Inicio | Comecar a rotina do dia com atalhos, pendencias e indicadores permitidos. | Professor, administrativo, gestor e master. | Cards por permissao efetiva, nao apenas por cargo nominal. |
| Alunos | Entrada para consulta, cadastro e `Aluno 360`. | Professor, administrativo e gestor. | Consultar alunos, novo aluno, aluno selecionado, revisoes e acesso do aluno como atalho permitido. |
| Aluno 360 | Hub operacional do aluno selecionado. | Quem tem acesso ao aluno. | Resumo, treino de hoje, prontuario, avaliacoes, treinos, agenda, contrato, financeiro, auditoria e integracoes conforme permissao. |
| Treinamento | Rotinas de planejamento, biblioteca, Workout Builder e execucao. | Professor e gestor. | Planos, execucoes, biblioteca, builder e futuras prescricoes quando existirem. |
| Agenda | Agenda geral e disponibilidade. | Professor, administrativo e gestor. | Agenda geral, sessoes, compromissos e disponibilidade quando implementada. |
| Avaliacoes | Protocolos e pendencias avaliativas fora de um aluno especifico. | Professor e gestor. | Antropometria, PRNT, adipometria, bioimpedancia, ultrassonografia e futuras avaliacoes avancadas. |
| Gestao | Operacao administrativa, equipe, contrato, comercial, financeiro e relatorios. | Gestor, administrativo e master. | Colaboradores, servicos, contratos, valores, relatorios e indicadores. |
| Configuracoes | Parametros e cadastros de suporte que nao sao rotina diaria. | Master, gestor e perfis autorizados. | Permissoes, parametros, tipos, modelos, bancos, escalas, manual e tabelas. |

### Menu proposto

| Grupo de menu | Itens iniciais | Regra de compatibilidade |
| --- | --- | --- |
| Inicio | Inicio por perfil | Nova rota pode ser `/inicio`; `/` pode redirecionar para ela quando houver permissao. |
| Alunos | Consultar alunos, Novo aluno, Acesso dos alunos | Preservar `/consultas/alunos`, `/alunos/new`, `/settings/aluno-access`. |
| Treinamento | Planos de treino, Execucoes dos alunos, Biblioteca de exercicios | Preservar `/plans`, `/executions`, `/library` e Workout Builder. |
| Agenda | Agenda | Preservar `/agenda`. |
| Avaliacoes | Protocolos de avaliacao fisica | Preservar `/protocolo-avaliacao-fisica/*`. |
| Gestao | Colaboradores, servicos, valores, contratos, relatorios | Preservar rotas atuais; mover itens apenas visualmente no menu primeiro. |
| Configuracoes | Parametros, escalas, tipos, bancos, funcoes, manual, tabela de referencia | Preservar `/settings/*` e `/cadastros/valores-hora-aula` enquanto houver compatibilidade. |

### Classificacao dos itens atuais

| Item atual | Classificacao | Destino proposto | Decisao |
| --- | --- | --- | --- |
| Consultar alunos | Operacao | Alunos | Mover/realcar. |
| Novo aluno | Operacao/cadastro | Alunos | Manter entrada simples. |
| Acesso dos alunos | Configuracao com impacto operacional | Alunos como atalho e Configuracoes como fonte | Avaliar duplicidade controlada por permissao. |
| Consultar colaboradores | Gestao | Gestao | Mover para equipe/colaboradores. |
| Novo colaborador | Gestao | Gestao | Mover para equipe/colaboradores. |
| Planos de treino | Operacao tecnica | Treinamento | Manter. |
| Agenda | Operacao transversal | Agenda | Separar de Treinamento. |
| Biblioteca | Operacao tecnica/configuracao curada | Treinamento | Manter em Treinamento; configuracoes de tipos ficam em Configuracoes. |
| Execucoes | Operacao | Treinamento | Manter. |
| Protocolos de avaliacao | Operacao tecnica sensivel | Avaliacoes | Manter hub proprio. |
| Relatorios | Gestao/Inicio | Gestao ou Inicio | Manter rota; decidir conteudo confiavel antes de promover. |
| Empresa/prestador | Configuracao contratual | Gestao ou Configuracoes | Manter em Gestao enquanto for rotina administrativa. |
| Modelos de contrato | Configuracao comercial | Configuracoes | Mover visualmente para Configuracoes. |
| Servicos e planos | Gestao comercial | Gestao | Manter. |
| Valores de hora/aula | Gestao financeira | Gestao | Manter com permissao especifica. |
| Bancos | Configuracao financeira | Configuracoes | Mover visualmente. |
| Funcoes de colaboradores | Configuracao de acesso/equipe | Configuracoes | Mover visualmente. |
| Parametros de treino | Configuracao tecnica | Configuracoes | Manter. |
| Escalas PSR e PSE | Configuracao tecnica | Configuracoes | Manter. |
| Manual do professor | Operacao/configuracao de conteudo | Configuracoes com atalhos contextuais | Manter rota e paineis contextuais. |
| Tabela de referencia | Configuracao tecnica | Configuracoes | Manter. |
| Tipos de avaliacao | Configuracao tecnica | Configuracoes | Manter. |

## Aluno 360

`Aluno 360` deve evoluir a tela atual de detalhes do aluno, nao criar uma experiencia paralela sem necessidade. A rota `/alunos/:id` deve continuar sendo a entrada principal.

### Estrutura interna proposta

| Area | Conteudo | Permissao inicial |
| --- | --- | --- |
| Resumo | Status, proximas acoes, alertas permitidos, treino de hoje quando houver, atalhos para rotinas permitidas. | `students.details.summary` |
| Treino de hoje | Saida operacional do treino e disponibilidade por data. | `students.details.trainingPlans` enquanto nao houver chave dedicada. |
| Prontuario | Saude, anamnese, PAR-Q/AHA, dores, medicamentos e observacoes tecnicas. | `students.details.health` e blocos PRNT quando consumir protocolo. |
| Avaliacoes | Historico, linha do tempo e dados-base por data. | `students.details.assessments`, `physicalAssessment.protocol` quando abrir protocolo. |
| Treinos / Planos | Planos, templates e acesso ao builder no contexto do aluno. | `students.details.trainingPlans` e `plans`. |
| Agenda | Sessoes e compromissos ligados ao aluno. | `agenda` quando houver acao; resumo permitido no aluno deve ser minimo. |
| Cadastro | Dados cadastrais e contatos. | `students.details.profile` |
| Contrato / Financeiro | Servico vigente, contrato, condicao comercial e financeiro. | `students.details.financialContract`, `students.financialData`, `students.contracts.*` |
| Revisoes | Historico de confirmacao cadastral. | `students.details.profileReviews` |
| Integracoes | Contas conectadas e dados externos. | `students.details.integrations` |
| Historico / Auditoria | Linha do tempo, evolucao e auditoria. | `students.details.audit` |

### Estados vazios do Aluno 360

| Area | Estado vazio permitido |
| --- | --- |
| Resumo | Informar que ainda nao ha proximas acoes registradas e sugerir a primeira acao permitida. |
| Treino de hoje | Informar o motivo operacional real quando disponivel: sem treino liberado, fora da data, pendente de validacao ou sem permissao. |
| Prontuario | Orientar criacao ou revisao do registro quando o usuario puder agir; ocultar detalhes quando bloqueado. |
| Avaliacoes | Mostrar que nao ha historico para o aluno e oferecer cadastro quando permitido. |
| Contrato / Financeiro | Omitir bloco para usuario sem permissao; nao mostrar chamada que revele dado financeiro bloqueado. |
| Auditoria | Omitir bloco quando bloqueado; para usuario permitido, mostrar linha do tempo vazia. |

## Padrao para telas longas

### Quando usar abas

Use abas quando a tela reunir dominios ou rotinas principais que podem ser acessados independentemente, por exemplo: cadastro, financeiro, prontuario, avaliacoes, treinos e auditoria.

### Quando usar colapsaveis

Use colapsaveis para secoes longas, avancadas, historicas, opcionais ou tecnicas dentro da mesma aba. Colapsaveis nao devem esconder a acao principal da aba.

### Resumo no topo

Telas centrais devem iniciar com um resumo curto contendo:

- identificacao ou contexto principal;
- status atual;
- proximas acoes permitidas;
- alertas permitidos;
- links para secoes relevantes.

O resumo nao deve duplicar todos os dados das abas.

### Acoes

| Tipo | Posicionamento |
| --- | --- |
| Acao primaria da tela | Proxima ao titulo ou ao resumo do contexto. |
| Acao primaria de uma secao | Dentro da secao, perto do dado alterado. |
| Acoes destrutivas | Separadas, com confirmacao e `blockKey` dedicado quando aplicavel. |
| Acoes secundarias | Dentro de menus, rodapes de secao ou botoes discretos. |

### Blocos sem permissao

- Dados sensiveis devem ser omitidos por padrao.
- Quando fizer sentido mostrar um estado bloqueado, ele deve explicar apenas que a area depende de permissao, sem revelar existencia, valor ou detalhe do dado.
- `blockKey` nao libera conteudo se a tela pai por `screenKey` estiver bloqueada.
- O backend continua sendo a barreira obrigatoria.

### Estados de carregamento e erro

- Carregamento deve ocupar altura estavel para evitar salto visual em telas longas.
- Erro deve informar a acao possivel para o usuario final, sem detalhes tecnicos.
- Estado vazio deve apontar a proxima acao permitida, nao uma acao indisponivel.

### Telas prioritarias para aplicacao inicial

1. `Aluno 360` em `/alunos/:id`.
2. Avaliacao fisica e PRNT em `/protocolo-avaliacao-fisica/*`.
3. Configuracoes com muitos cadastros em `/settings/*`.
4. Planos/Workout Builder quando a prescricao integrada avancar.

## Inicio por perfil

A tela inicial deve ser calculada por permissoes efetivas e pode usar o perfil como desempate. O usuario nao deve ver card, indicador ou atalho sem acesso ao destino.

### Professor

| Bloco | Origem esperada | Destino |
| --- | --- | --- |
| Agenda de hoje | Agenda/sessoes permitidas | `/agenda` |
| Alunos proximos | Alunos sob responsabilidade | `/consultas/alunos` ou `/alunos/:id` |
| Avaliacoes pendentes | Plano de avaliacoes e protocolo | `/protocolo-avaliacao-fisica/*` |
| Treinos a revisar | Planos, execucoes e futuro fluxo de prescricao | `/plans` ou `/executions` |
| Alertas tecnicos permitidos | Prontuario, avaliacao, execucao | `/alunos/:id` |

### Administrativo

| Bloco | Origem esperada | Destino |
| --- | --- | --- |
| Novos cadastros | Alunos e revisoes cadastrais | `/alunos/new`, `/consultas/alunos` |
| Contratos pendentes | Contratos e servicos | `/alunos/:id/contracts` |
| Cobrancas ou dados financeiros | Financeiro permitido | rota existente do aluno/contrato |
| Revisoes cadastrais | `students.profileReview` e blocos do aluno | `/alunos/:id` |
| Acesso do aluno | Configuracao de acesso | `/settings/aluno-access` |

### Gestor

| Bloco | Origem esperada | Destino |
| --- | --- | --- |
| Pendencias criticas | Agenda, avaliacoes, financeiro e contratos permitidos | rotas especificas |
| Ocupacao e agenda | Agenda e disponibilidade futura | `/agenda` |
| Colaboradores | Cadastro/consulta de colaboradores | `/consultas/colaboradores`, `/professores/new` |
| Indicadores de gestao | Relatorios confiaveis | `/reports` |
| Comercial/servicos | Servicos, valores e contratos | rotas de gestao |

### Master

Master pode ver a composicao mais ampla, mas a tela deve continuar filtrando por permissoes efetivas para manter comportamento consistente com perfis customizados.

## Matriz de permissoes para a nova navegacao

| Hub/bloco | `screenKey` | `blockKey` sugerido/reutilizado | Escopo e cuidado |
| --- | --- | --- | --- |
| Inicio | Nova chave opcional `home.profile` ou fallback por rotas existentes | Cards devem reaproveitar destino permitido | Nao agregar dado sensivel sem permissao do destino. |
| Alunos - consultar | `students.consultation` | N/A | Filtrar por contrato e responsabilidade quando aplicavel. |
| Alunos - novo | `students.registration` | blocos `students.registration.*` | Dado de saude/financeiro por bloco. |
| Aluno 360 | `students.details` | `students.details.*` | Cada aba sensivel precisa de bloco. |
| Prontuario no Aluno 360 | `students.details` e/ou `physicalAssessment.protocol` | `students.details.health`, `physicalAssessment.prnt.*` | Dados de saude devem manter filtro por contrato e aluno. |
| Avaliacoes no Aluno 360 | `students.details`, `physicalAssessment.protocol` | `students.details.assessments` | Historico por data, sem sobrescrever. |
| Treinos do aluno | `students.details`, `plans`, `executions` | `students.details.trainingPlans` | Evitar edicao sem acesso ao modulo de treino. |
| Contrato/financeiro | `students.financialData`, `students.contracts.*` | `students.details.financialContract`, `students.actions.manageFinancialContract` | Omitir para professor sem permissao. |
| Auditoria | `students.details` | `students.details.audit` | Nunca expor ao aluno ou perfil sem bloco. |
| Agenda | `agenda` | futura chave se houver blocos sensiveis | Dados por contrato e responsavel. |
| Avaliacoes | `physicalAssessment.protocol` | `physicalAssessment.prnt.*` | Saude sensivel por bloco. |
| Gestao de colaboradores | `collaborators.registration`, `collaborators.consultation` | `collaborators.*` | `dataScope`: `self`, `managed`, `contract`. |
| Configuracoes | `settings.*` | N/A ou blocos futuros | Alteracoes sensiveis precisam backend equivalente. |

### Novas chaves possiveis

A primeira reorganizacao de menu nao exige novas chaves se apenas mover itens existentes. Novas chaves devem ser avaliadas quando houver:

- rota real de Inicio por perfil;
- blocos de dashboard com dados agregados;
- agenda dentro do Aluno 360 com acoes proprias;
- prescricao integrada ou treino de hoje como modulo sensivel proprio;
- relatorios com dados financeiros, saude ou indicadores clinicos.

## Plano de rollout

| Etapa | Issue | Entrega | Arquivos provaveis | Validacao | Risco |
| --- | --- | --- | --- | --- | --- |
| 1 | #150/#151 | Documentacao de mapa atual e arquitetura por hubs | `docs/product/navigation-information-architecture.md` | Revisao manual e `pnpm docs:check` | Baixo. |
| 2 | #152 | Reorganizar menu visual mantendo rotas | `apps/web/src/navigation/sidebarMenu.ts`, testes de acesso se houver | `pnpm validate`, `pnpm access:check` | Medio: item ativo e links salvos. |
| 3 | #154 | Aplicar padrao de tela longa em piloto | `AlunoDetailsTabs`, componentes do aluno | Teste desktop/mobile e acessibilidade basica | Medio: regressao visual. |
| 4 | #153 | Evoluir Aluno 360 incrementalmente | `AlunoDetails.tsx`, componentes `Aluno*Tab` | Testes de blocos permitidos/bloqueados | Alto: dados sensiveis. |
| 5 | #155 | Criar Inicio por perfil com dados confiaveis | nova page/route, services existentes | Testes por perfil e estado vazio | Alto: agregacao indevida. |
| 6 | #156 | Revisao de permissoes e backend equivalente | `packages/types/access-control.ts`, API, web | `pnpm access:check`, testes permitidos/negados | Alto. |
| 7 | #157 | Rollout e regressao por perfil | docs, PRs pequenos | Checklist manual | Medio. |

### Estrategia de compatibilidade

- Primeiro mover itens no menu sem trocar rotas.
- Manter redirecionamentos atuais: `/alunos`, `/consultas`, `/protocolo-avaliacao-fisica`, `/settings/hourly-rate-levels`.
- So criar redirecionamento novo quando uma rota nova substituir uma entrada antiga.
- Nao remover rota existente sem plano de migracao e criterio de aceite especifico.

### Feature flag e liberacao gradual

- Reorganizacao de menu sem remocao de rotas pode ir sem feature flag se a validacao por perfil passar.
- Inicio por perfil e hubs com dados agregados devem aceitar liberacao gradual quando dependerem de novas consultas ou indicadores.
- Dados sensiveis agregados devem passar por #156 antes de exposicao visual.

### Checklist de regressao por perfil

| Perfil | Verificacoes minimas |
| --- | --- |
| Professor | Ve alunos permitidos, agenda, planos, biblioteca, execucoes e PRNT conforme defaults; nao ve financeiro sem permissao. |
| Administrativo | Ve cadastro, contrato/financeiro permitido e revisoes; nao recebe automaticamente dados tecnicos sensiveis. |
| Gestor | Ve gestao, colaboradores, financeiro e alunos conforme configuracao; respeita `managed` ou `contract`. |
| Master | Ve todos os hubs do contrato e consegue acessar configuracoes; sem vazamento entre contratos. |
| Perfil reduzido | Nao ve item de menu, card ou bloco sem permissao; acesso direto por URL/API e bloqueado. |

### Criterios de liberacao

- Rotas antigas preservadas ou redirecionadas.
- Menu visivel confere com permissoes efetivas.
- Aluno 360 omite dados sensiveis sem permissao.
- Inicio por perfil nao mostra indicador sem origem confiavel.
- Backend bloqueia acesso direto aos dados sensiveis.
- `pnpm validate` passa ou o bloqueio fica documentado no PR.
- `pnpm access:check` passa quando catalogos ou defaults mudarem.

### Rollback ou mitigacao

| Mudanca | Mitigacao |
| --- | --- |
| Menu reorganizado confunde usuarios | Reverter apenas `sidebarMenu.ts` mantendo rotas intactas. |
| Inicio por perfil mostra dados incorretos | Redirecionar `/` para fluxo anterior ate corrigir a origem dos dados. |
| Aluno 360 expande dado sensivel indevido | Ocultar bloco por `blockKey` e corrigir API antes de liberar de novo. |
| Nova chave de permissao quebra perfil | Reverter defaults da chave e rodar `pnpm access:check`. |
| Rota nova quebra link salvo | Restaurar redirecionamento compatível. |

## Decisoes abertas

- Validar se `Avaliacoes` fica como hub proprio no menu ou aparece majoritariamente via Aluno 360 com acesso direto ao protocolo.
- Decidir se `Acesso dos alunos` fica apenas em Configuracoes ou tambem como atalho em Alunos.
- Definir dados realmente confiaveis para o primeiro Inicio por perfil.
- Confirmar se perfis customizados em producao exigem cenarios adicionais alem de professor, administrativo, gestor e master.
