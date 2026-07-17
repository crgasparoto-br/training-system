# Roadmap do Sistema ACESSO

## Status do documento

- Fonte de verdade para estado funcional, prioridades e evolucoes do produto.
- Estado revisado em 2026-07-17 sobre a branch `develop`.
- Este documento substitui roadmaps gerais, planos de entrega ja concluidos e levantamentos pontuais que duplicavam o mesmo conteudo.
- Issues e PRs continuam sendo a fonte de execucao. O codigo, as migrations e os testes definem o comportamento efetivamente entregue.

## Objetivo

Organizar a evolucao do Sistema ACESSO a partir de um unico roadmap, separando claramente:

- o que esta apenas documentado;
- o que possui fundacao tecnica;
- o que esta integrado ao produto;
- o que foi validado de ponta a ponta;
- o que permanece como evolucao futura.

O fluxo de produto esperado e:

```text
Cadastro e vinculos
  -> Prontuario / Avaliacao Fisica
  -> Prescricao por capacidades
  -> Montagem Consolidada
  -> Treino de hoje
  -> Execucao e feedback
  -> Decisao sugerida
  -> Ajuste validado pelo professor
```

## Fontes funcionais

O roadmap consolida os requisitos extraidos das seguintes fontes:

- `Sistema ACESSO - comunicacao Claudinei/Leandro`;
- `Modelo Avaliacao Fisica v.4.10.12`;
- `Ideias e estruturacao - Professor`;
- `ModeloTreinamento Combinado v.3.12.8`;
- benchmark publico do Grit Run (`https://gritrun.io/`) para experiencia operacional de treinador e aluno;
- documentacao publica oficial do Garmin Connect Developer Program e do FIT SDK para integracao futura;
- issues, PRs, documentacao versionada e implementacao atual do `training-system`.

As planilhas sao referencias de produto. Regras criticas somente passam a valer no sistema quando estiverem documentadas, implementadas em camada testavel, persistidas quando aplicavel e protegidas por permissao e `contractId`.

O Grit Run e tratado somente como benchmark publico de experiencia e operacao. Nenhuma regra tecnica, formula, identidade visual ou comportamento nao comprovado deve ser copiado. As decisoes do Sistema ACESSO continuam subordinadas ao seu proprio prontuario, avaliacao, governanca, seguranca e validacao profissional.

## Niveis de maturidade

| Nivel | Significado |
| --- | --- |
| Documentado | Requisito e fronteiras definidos, sem garantia de codigo funcional. |
| Fundacao tecnica | Tipos, contratos ou services iniciais existem, mas ainda nao formam fluxo persistente e integrado. |
| Implementado | API, persistencia e interface ou consumo real estao conectados ao produto. |
| Validado | Fluxo integrado, permissoes, escopo, estados de erro e testes foram comprovados. |

Uma issue fechada nao torna automaticamente o modulo `Implementado` ou `Validado`.

## Decisoes consolidadas de produto

- A Central do Aluno e o eixo principal para trabalhar com um aluno especifico.
- Cadastro, contrato, agenda, manual, avaliacao, prescricao e treino permanecem dominios separados.
- PRNT e Avaliacao Fisica sao fontes historicas anteriores a prescricao.
- Prescricao e separada em Resistido, Flexibilidade, Ciclico e Equilibrio.
- Nenhuma capacidade publica diretamente o Treino de hoje.
- A Montagem Consolidada e o filtro final antes da saida operacional.
- Feedback e regras sugerem decisoes, mas a validacao final e sempre do professor.
- O aluno recebe linguagem pratica e segura; o professor recebe contexto tecnico e rastreabilidade.
- Dados sensiveis exigem permissao, escopo efetivo, `contractId`, origem, data e responsavel.
- A complexidade tecnica deve permanecer disponivel ao professor sem tornar a operacao diaria complexa.
- O treinador deve conseguir trabalhar a partir de uma linha do tempo unica do aluno, sem navegar por varias telas para executar uma tarefa simples.
- A experiencia do aluno deve ser centrada em `Treino de hoje`, calendario, execucao e feedback curto.
- Zonas e intensidades relativas podem ser transformadas em alvos individuais somente quando houver metodologia, origem, versao e dados-base validos.
- Operacoes em massa devem individualizar os dados por aluno, destacar excecoes e exigir revisao antes da publicacao.

## Estado funcional atual

### 1. Central do Aluno

**Maturidade: Implementado, com validacao complementar pendente.**

Entregue:

- busca e selecao de aluno;
- ficha centralizada e resumo do Aluno 360;
- cards contextuais;
- historico unificado;
- acoes contextuais;
- estados de vazio, carregamento e erro;
- preservacao de rotas anteriores por compatibilidade.

Pendente:

- regressao manual completa por perfil e escopo;
- confirmacao da atualizacao imediata de todos os cards apos alteracoes;
- verificacao de preservacao do aluno selecionado em todos os fluxos;
- linha do tempo operacional unificando treinos, execucoes, feedbacks, reavaliacoes e eventos relevantes.

### 2. Cadastro, servicos, contratos e vinculos

**Maturidade: Implementado parcialmente.**

Existem cadastros de alunos e colaboradores, catalogo comercial, contratos, funcoes, valores e permissoes. Permanecem pendentes:

- consolidacao do onboarding e revisao periodica do aluno;
- separacao definitiva entre cadastro e dados de avaliacao;
- resumos administrativos consistentes na Central;
- historico e autoridade unica para servico e contrato vigente;
- validacao completa dos fluxos administrativos e financeiros;
- modelos versionados de questionarios iniciais, revisoes periodicas, retorno apos afastamento e prontidao para exercicio;
- carteira de alunos por profissional, substituicao e acesso temporario conforme permissao.

### 3. PRNT

**Maturidade: Implementado parcialmente, em estado avancado.**

Entregue:

- resumo tecnico na Central;
- PAR-Q/AHA e acompanhamentos;
- objetivos;
- historico de atividades;
- medicamentos e procedimentos;
- dores, desconfortos, mapa corporal e acompanhamentos;
- encerramento sem apagar o historico;
- controle por blocos de acesso.

Pendente:

- ciclo completo de objetivos, com taxonomia, revisao e encerramento explicito;
- historicos proprios de medicamentos, cirurgias, restricoes e observacoes categorizadas;
- agenda e rotina semanal dentro do contexto do PRNT;
- garantia de todos os eventos no historico unificado;
- testes completos de permissao e isolamento por contrato;
- receber respostas de questionarios versionados como eventos rastreaveis, sem sobrescrever historico.

### 4. Avaliacao Fisica

**Maturidade: Antropometria implementada parcialmente; dominio completo ainda nao implementado.**

Antropometria entregue:

- aluno, data e professor responsavel;
- codigo sequencial;
- segmentos principais, opcionais e configuraveis;
- descricao tecnica e videos;
- historico e comparacao lado a lado;
- observacoes importaveis;
- entrada contextual pela Central do Aluno.

Pendente para concluir Antropometria:

- estados formais de rascunho e concluida;
- medidas obrigatorias por protocolo;
- imutabilidade ou correcao auditada apos conclusao;
- diferencas absolutas e percentuais;
- graficos de evolucao;
- evento garantido na timeline;
- testes de permissao e `contractId`;
- contrato de dados para laudos.

Protocolos ainda nao completos:

- adipometria;
- bioimpedancia;
- ultrassonografia;
- baropodometria;
- ventilometria e avaliacao metabolica;
- flexibilidade estruturada;
- testes fisicos;
- avaliacao postural;
- plano de acao e laudo integrado.

### 5. Treinamento operacional existente

**Maturidade: Modulos operacionais existentes; integracao com o fluxo-alvo pendente.**

O sistema preserva planos, templates, dias, exercicios, biblioteca, Workout Builder e execucoes. Ainda falta conectar esse nucleo de ponta a ponta com PRNT, avaliacao, prescricao por capacidades e Montagem Consolidada.

As 15 abas do `ModeloTreinamento Combinado v.3.12.8` permanecem mapeadas como fontes para migracao incremental, incluindo macrociclo, montagem, rascunho, mesociclo, biblioteca, matriz, siglas, alertas, controle de dados e importacao.

Tambem permanecem pendentes:

- calendario ou linha do tempo operacional por aluno;
- acoes para copiar, mover, revisar e publicar sessoes sem perder o contexto do aluno;
- aplicacao de treino, semana ou microciclo para varios alunos com individualizacao e revisao de excecoes;
- visao planejado versus executado;
- provas-alvo e eventos esportivos vinculados ao planejamento;
- conteudos e videos associados diretamente ao treino ou exercicio.

### 6. Prescricao por capacidades

**Maturidade: Fundacao tecnica.**

Existem tipos e services puros para:

- Resistido, Flexibilidade, Ciclico e Equilibrio;
- status, versao e origens tecnicas;
- parametros por capacidade;
- justificativa do professor;
- mensagem pratica para aluno;
- alertas e bloqueio de publicacao direta do Treino de hoje.

Para ser considerada implementada ainda precisa de:

- persistencia e migrations;
- API autenticada;
- filtros reais por aluno, contrato e permissao;
- interface funcional;
- vinculo real com objetivos, PRNT e avaliacoes;
- parametros por contrato;
- integracao com o nucleo atual de treino;
- motor de zonas individualizadas por pace, FC, LAn, VO2max ou PSE;
- versao e validade da metodologia usada para calcular cada zona;
- alerta para teste vencido, dados insuficientes ou ausencia de zona;
- conversao de intensidade relativa em instrucao pratica individual para o aluno.

### 7. Montagem Consolidada

**Maturidade: Fundacao tecnica.**

Existem contratos e regras iniciais para blocos validados, origem, conflitos, versao e aprovacao do professor. Permanecem pendentes:

- persistencia e API;
- interface de montagem;
- integracao com capacidades persistidas;
- integracao com biblioteca e Workout Builder;
- geracao controlada de `WorkoutDay` ou equivalente;
- rastreabilidade real ate a execucao;
- regras completas de seguranca, CIT e carga agudo/cronica;
- aplicacao em massa apenas em estado revisavel, com individualizacao por aluno;
- relatorio de excecoes antes da publicacao, incluindo teste vencido, zona ausente, restricao ativa e conflito de carga.

### 8. Feedback pos-treino e decisao sugerida

**Maturidade: Fundacao tecnica.**

Existem tipos e regras puras para PSE, PSR, dor, dificuldade, fadiga, aderencia, carga, repeticoes e decisao sugerida. Permanecem pendentes:

- persistencia e API;
- vinculo com execucao real e Montagem Consolidada;
- interfaces separadas de aluno e professor;
- aprovacao e rejeicao em fluxo real;
- atualizacao da timeline e dos acompanhamentos do PRNT;
- alimentacao de nova versao da prescricao;
- feedback curto para o aluno: concluiu, PSE, dor/desconforto, dificuldade e observacao opcional;
- comparacao entre planejado e executado;
- associacao controlada entre atividade importada e treino planejado;
- confirmacao manual, atividade livre e prevencao de duplicidade quando a correspondencia nao for segura.

### 9. Agenda, frequencia e operacao

**Maturidade: Parcial.**

A agenda geral deve ser preservada. Evolucoes pendentes:

- agenda e frequencia dentro da Central;
- proximos atendimentos e reavaliacoes;
- alertas de ausencia;
- disponibilidade de colaboradores;
- lotacao por horario, ambiente e servico;
- substituicao de professor;
- materiais e recursos de sala;
- resumo operacional minimo para professor substituto, respeitando permissoes e dados sensiveis.

### 10. Experiencia do aluno

**Maturidade: Contratos e telas previstas; experiencia integrada ainda pendente.**

A primeira entrega deve priorizar uma PWA responsiva antes de exigir aplicativo nativo. O aluno deve ter uma experiencia simples, com:

- Inicio;
- Treino de hoje;
- calendario de treinos e atendimentos;
- registro de execucao;
- feedback curto;
- avaliacoes e proximos vencimentos;
- prova-alvo quando aplicavel;
- videos e orientacoes associados ao treino;
- notificacoes;
- perfil e revisao cadastral.

A visao do aluno nao deve expor justificativas tecnicas completas, dados clinicos sem finalidade pratica nem regras internas de prescricao.

### 11. Relatorios, notificacoes e integracoes futuras

**Maturidade: Roadmap.**

Inclui:

- linha do tempo evolutiva completa;
- relatorios de aderencia, retencao e indicadores clinicos;
- notificacoes de treino, pagamento, feedback e reavaliacao;
- mensagens praticas e WhatsApp a partir de dados validados;
- integracao com Strava e Garmin apos estabilizar execucao e feedback;
- exportacao futura de treino aerobico para smartwatch;
- importacao de pace, FC, zonas, sono, estresse e recuperacao como evidencia;
- integracoes com provedores externos mediante consentimento e auditoria;
- central de conteudo para educativos, demonstracoes e orientacoes, sem priorizar uma plataforma completa de cursos antes do nucleo operacional.

## Decisoes incorporadas do benchmark Grit Run

Foram incorporadas as seguintes ideias por serem coerentes com as planilhas e com a arquitetura atual do Sistema ACESSO:

1. **Linha do tempo operacional do treinador**
   - uma unica superficie por aluno para visualizar e operar treinos, execucoes, feedbacks, provas, reavaliacoes e pendencias;
   - acoes rapidas para criar, copiar, mover, revisar e publicar sessoes;
   - preservacao da Central do Aluno como contexto principal.

2. **Motor de zonas individualizadas**
   - prescricao por intensidade relativa;
   - conversao para pace, FC, LAn, VO2max ou PSE do aluno;
   - metodologia versionada, origem do teste, validade e fallback documentado;
   - alerta quando a zona estiver ausente ou baseada em avaliacao vencida.

3. **Operacao em massa com individualizacao**
   - aplicar sessao, semana ou microciclo a varios alunos;
   - recalcular alvos individualmente;
   - separar alunos prontos de alunos com excecao;
   - exigir revisao e registrar auditoria antes da publicacao.

4. **Experiencia simples do aluno**
   - foco em `Treino de hoje`, calendario, execucao e feedback;
   - linguagem pratica e segura;
   - primeira entrega preferencialmente como PWA responsiva;
   - conteudo e videos vinculados ao treino, sem exigir uma plataforma completa de cursos.

5. **Planejado versus executado**
   - comparar treino prescrito e atividade realizada;
   - permitir correspondencia automatica com nivel de confianca;
   - exigir confirmacao manual quando houver ambiguidade;
   - suportar atividade livre, treino nao realizado e prevencao de duplicidade.

6. **Feedback curto e aderencia**
   - reduzir o formulario do aluno aos dados essenciais;
   - manter a analise tecnica detalhada na visao do professor;
   - alimentar timeline, PRNT e decisao sugerida sem alterar a prescricao automaticamente.

7. **Questionarios e conteudo versionados**
   - modelos configuraveis para anamnese inicial, revisao periodica, pre-prova, retorno apos afastamento e prontidao;
   - respostas entram como eventos rastreaveis no PRNT;
   - videos e orientacoes podem ser vinculados a treino, exercicio, capacidade, avaliacao ou grupo de alunos.

8. **Operacao de equipe**
   - carteira de alunos por profissional;
   - substituicao, acesso temporario e resumo operacional minimo;
   - disponibilidade e lotacao conectadas a agenda, sem liberar dados sensiveis indevidos.

Nao foram incorporados como requisito imediato:

- copia da identidade visual ou da interface do Grit Run;
- aplicativo nativo como condicao para iniciar a experiencia do aluno;
- cursos completos antes do nucleo de treino e feedback;
- uso de dados externos como verdade tecnica sem confirmacao;
- alteracao automatica da prescricao sem professor;
- bloqueio tecnico de treino exclusivamente por situacao financeira.

## Garmin Connect - integracao futura

**Maturidade: Documentado para implementacao futura. Nao faz parte do foco imediato de entrega.**

A integracao deve usar o Garmin Connect Developer Program, que oferece APIs cloud-to-cloud para receber dados do Garmin Connect e publicar treinos, planos e percursos. O programa e voltado a uso empresarial, utiliza OAuth 2.0 e exige solicitacao e aprovacao da Garmin antes do acesso a referencia tecnica completa, ferramentas e ambiente de avaliacao.

Fontes oficiais publicas:

- visao geral: `https://developer.garmin.com/gc-developer-program/`;
- Training API: `https://developer.garmin.com/gc-developer-program/training-api/`;
- Activity API: `https://developer.garmin.com/gc-developer-program/activity-api/`;
- Health API: `https://developer.garmin.com/gc-developer-program/health-api/`;
- Courses API: `https://developer.garmin.com/gc-developer-program/courses-api/`;
- FAQ do programa: `https://developer.garmin.com/gc-developer-program/program-faq/`;
- FIT SDK: `https://developer.garmin.com/fit/`.

### Escopo futuro por API

1. **Training API - Sistema ACESSO para Garmin**
   - publicar treinos estruturados e planos no calendario Garmin Connect;
   - permitir sincronizacao com relogios e ciclocomputadores compativeis;
   - exportar somente treinos originados de Montagem Consolidada aprovada;
   - mapear aquecimento, blocos, repeticoes, recuperacao, desaquecimento, duracao, distancia, pace, FC e outros alvos suportados;
   - manter identificador externo, versao exportada, status e auditoria.

2. **Activity API - Garmin para Sistema ACESSO**
   - receber atividades apos sincronizacao do dispositivo com Garmin Connect;
   - suportar arquitetura push ou ping/pull conforme a aprovacao e o desenho final;
   - consumir dados detalhados e, quando necessario, arquivos `.FIT`, `.GPX` ou `.TCX`;
   - relacionar atividade importada ao treino planejado com nivel de confianca;
   - permitir confirmacao manual, atividade livre e treino nao realizado;
   - impedir duplicidade, reprocessamento indevido e sobrescrita de historico.

3. **Health API - Garmin para Sistema ACESSO**
   - importar dados como sono, FC, passos, calorias, estresse, Pulse Ox, Body Battery, composicao corporal, respiracao e pressao arterial quando disponiveis e autorizados;
   - registrar origem Garmin, data, dispositivo, consentimento e status de validacao;
   - tratar os dados como evidencia complementar, nunca como avaliacao oficial da Acesso ou decisao automatica;
   - proteger por permissao especifica, finalidade, `contractId`, retencao e revogacao;
   - avaliar custos ou licencas comerciais aplicaveis antes da implementacao.

4. **Courses API - Sistema ACESSO para Garmin**
   - publicar percursos e pontos de percurso para treinos, longoes, provas e trilhas;
   - implementar somente depois de Training API e Activity API estarem estabilizadas.

5. **Women's Health API**
   - considerar apenas em fase futura, com finalidade clinica ou de treinamento claramente aprovada;
   - exigir consentimento explicito, permissao altamente restrita e revisao de LGPD antes de qualquer uso.

### FIT SDK

O FIT SDK pode ser utilizado no backend para codificar ou decodificar arquivos de atividade, treino e percurso. Para a stack Node.js/TypeScript, a opcao oficial e `@garmin/fitsdk`.

O FIT SDK nao substitui o Garmin Connect Developer Program: ele trata o formato dos arquivos, mas nao concede acesso a conta do usuario, nao executa OAuth e nao publica ou recebe dados do Garmin Connect por conta propria.

### Fora do primeiro escopo Garmin

- aplicativo Connect IQ proprio;
- comunicacao direta em tempo real com o relogio;
- uso de dados Garmin para alterar prescricao automaticamente;
- exportacao antes da aprovacao da Montagem Consolidada;
- importacao de todos os indicadores sem finalidade definida;
- dependencia da Garmin para o funcionamento basico do Treino de hoje.

### Pre-condicoes para iniciar a integracao

A integracao Garmin somente deve virar epica de implementacao quando estiverem concluidos ou estabilizados:

1. Montagem Consolidada persistida e aprovada pelo professor;
2. modelo interno versionado de Treino de hoje;
3. execucao e feedback persistidos;
4. comparacao planejado versus executado;
5. modelo de correspondencia de atividades e prevencao de duplicidade;
6. consentimento, revogacao, retencao e exclusao de dados externos;
7. observabilidade, filas de processamento, retry e tratamento de falhas;
8. solicitacao e aprovacao no Garmin Connect Developer Program.

### Sequencia recomendada da futura epica Garmin

1. Solicitar acesso empresarial e validar requisitos comerciais.
2. Criar modelo interno neutro de treino exportavel, sem dependencia direta do payload Garmin.
3. Implementar OAuth 2.0, consentimento, revogacao e armazenamento seguro de tokens.
4. Implementar Training API e homologar exportacao de treinos estruturados.
5. Implementar Activity API e correspondencia planejado versus executado.
6. Integrar FIT SDK para detalhes que exijam processamento de arquivos.
7. Implementar Health API apenas para indicadores com finalidade aprovada.
8. Implementar Courses API quando houver demanda operacional validada.
9. Executar homologacao por modalidade, dispositivo compativel, falhas, reenvio e revogacao.

## Prioridades recomendadas

### Prioridade 0 - Corrigir governanca de conclusao

- Usar os quatro niveis de maturidade deste documento em novas issues e PRs.
- Nao encerrar epic funcional apenas porque tipos ou services puros foram criados.
- Exigir evidencia de persistencia, integracao e validacao quando o escopo prometer funcionalidade de produto.

### Prioridade 1 - Fechar a base historica

1. Concluir ciclo de vida da Antropometria.
2. Completar historicos e permissoes do PRNT.
3. Garantir timeline e origem dos eventos.
4. Separar definitivamente cadastro de aluno e dados de avaliacao.
5. Estruturar questionarios versionados como entrada rastreavel do PRNT.

### Prioridade 2 - Tornar Prescricao por Capacidades funcional

1. Definir schema e migrations.
2. Criar API e controle de acesso.
3. Criar interface por capacidade.
4. Conectar objetivos, PRNT e avaliacoes.
5. Integrar parametros do ModeloTreinamento Combinado.
6. Criar motor de zonas individualizadas, versionadas e vinculadas aos testes.
7. Preparar aplicacao em massa em estado de rascunho, sem publicacao direta.

### Prioridade 3 - Integrar Montagem Consolidada ao treino atual

1. Persistir montagens e versoes.
2. Integrar blocos validados.
3. Exibir conflitos e alertas.
4. Exigir aprovacao do professor.
5. Gerar saida operacional rastreavel sem substituir o nucleo atual de forma destrutiva.
6. Criar linha do tempo operacional do treinador por aluno.
7. Implementar copia, movimentacao e publicacao de sessoes com relatorio de excecoes.

### Prioridade 4 - Fechar o ciclo de execucao e experiencia do aluno

1. Persistir feedback por sessao e capacidade.
2. Vincular execucao, montagem, aluno e contrato.
3. Implementar aprovacao/rejeicao da decisao.
4. Atualizar timeline e PRNT.
5. Gerar nova proposta de prescricao sem alteracao automatica.
6. Entregar PWA inicial com Treino de hoje, calendario, execucao e feedback curto.
7. Implementar planejado versus executado e correspondencia controlada de atividades.

### Prioridade 5 - Expandir Avaliacao Fisica

Apos estabilizar historico, permissoes e protocolos:

- Adipometria;
- Bioimpedancia;
- Ultrassonografia;
- Flexibilidade;
- Ventilometria e metabolismo;
- Baropodometria e postura;
- laudos e comparativos.

### Prioridade 6 - Evolucoes operacionais

- agenda integrada;
- provas-alvo e calendario esportivo;
- conteudos e videos associados ao treino;
- gestao de carteira e substituicao de profissional;
- integracao Strava e Garmin, respeitando as pre-condicoes documentadas;
- relatorios;
- notificacoes;
- WhatsApp;
- smartwatch;
- disponibilidade de colaboradores;
- gestao de ambientes e materiais.

## Definicao de pronto funcional

Um modulo somente pode ser classificado como `Validado` quando possuir, conforme aplicavel:

- fonte de dados e modelo definidos;
- migration e persistencia;
- API autenticada;
- interface ou consumo funcional;
- historico e rastreabilidade;
- permissao por tela, bloco, escopo e contrato;
- estados de vazio, carregamento e erro;
- atualizacao apos salvar;
- testes de acesso permitido e negado;
- validacao manual documentada;
- `pnpm validate` executado ou bloqueio explicitamente registrado.

Para operacoes em massa, integracoes externas e correspondencia de atividades, tambem sao obrigatorios:

- modo de revisao antes da publicacao;
- relatorio de excecoes e itens nao processados;
- idempotencia e prevencao de duplicidade;
- auditoria de origem, responsavel, data e versao;
- possibilidade de correcao sem apagar o historico.

Para integracoes OAuth e dados de dispositivos, tambem sao obrigatorios:

- consentimento explicito e escopos minimos;
- armazenamento seguro e rotacao/revogacao de tokens;
- exclusao ou desvinculacao solicitada pelo usuario;
- tratamento de retry, backfill, eventos fora de ordem e indisponibilidade do provedor;
- registro do identificador externo sem tornar o provedor fonte unica do dominio interno;
- homologacao em ambiente oficial antes da liberacao em producao.

## Planos ativos relacionados

- `docs/execution-plans/active/2026-06-integrated-prescription-control.md`;
- `docs/execution-plans/active/2026-06-navigation-information-architecture.md`;
- `docs/execution-plans/active/2026-05-library-module-debt.md`;
- `docs/execution-plans/active/2026-05-workout-builder-debt.md`;
- `docs/execution-plans/active/2026-05-aluno-details-debt.md`;
- `docs/execution-plans/active/2026-05-periodization-schema-debt.md`;
- `docs/execution-plans/active/2026-07-services-commercial-catalog.md`.

Planos de uma entrega especifica devem ser removidos de `active/` quando a entrega terminar. O resultado permanente deve ser incorporado a uma fonte de verdade de produto, arquitetura, operacao ou qualidade.

## Manutencao

Atualize este roadmap quando:

- uma fundacao tecnica ganhar persistencia, API ou interface;
- um modulo passar de parcial para integrado;
- uma validacao de ponta a ponta for concluida;
- uma prioridade mudar por decisao de produto;
- uma nova planilha, issue, benchmark, integracao ou regra alterar as fronteiras do produto.

Nao crie outro roadmap geral. Roadmaps temporarios de uma iniciativa devem existir somente durante a execucao e ser removidos ou consolidados ao termino.