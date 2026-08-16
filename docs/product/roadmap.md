# Roadmap do Sistema ACESSO

## Status do documento

- Fonte de verdade para estado funcional, prioridades e evolucao do produto.
- Estado revisado em 2026-08-16 no contexto das issues #341 a #345, consolidando o fluxo web de revisao cadastral e a entrega externa opcional de notificacoes, alem do candidato de liberacao operacional da Montagem Consolidada.
- Issues e PRs continuam sendo a fonte de execucao.
- Codigo, migrations e testes definem o comportamento efetivamente entregue.
- Documentos detalhados de produto e planos ativos complementam este roadmap; nao devem competir com ele como roadmap geral.

## Objetivo

Organizar a evolucao do Sistema ACESSO em torno do aluno, distinguindo claramente:

- o que esta apenas documentado;
- o que possui fundacao tecnica;
- o que esta implementado no produto;
- o que foi validado de ponta a ponta;
- o que permanece como evolucao futura.

A pergunta central do produto e:

> O que este aluno precisa fazer agora, como executa com seguranca, como registra o que aconteceu e como professor e aluno acompanham a evolucao?

O fluxo esperado e:

```text
Cadastro e vinculos
  -> Prontuario / Avaliacao Fisica
  -> Prescricao por capacidades
  -> Montagem Consolidada
  -> Rotina semanal / Treino de hoje
  -> Check-in, execucao e feedback
  -> Evolucao e decisao sugerida
  -> Ajuste validado pelo professor
```

## Fontes funcionais

O roadmap consolida requisitos e decisoes provenientes de:

- `Sistema ACESSO - comunicacao Claudinei/Leandro`;
- `Modelo Avaliacao Fisica v.4.10.12`;
- `Ideias e estruturacao - Professor`;
- `ModeloTreinamento Combinado v.3.12.8`;
- benchmark publico do Grit Run para experiencia operacional de professor e aluno;
- issues, PRs, documentacao versionada e implementacao atual do `training-system`.

Planilhas e benchmarks sao referencias de produto. Regras criticas somente passam a valer quando estiverem documentadas, implementadas em camada testavel, persistidas quando aplicavel e protegidas por permissao e `contractId`.

## Niveis de maturidade

| Nivel | Significado |
| --- | --- |
| Documentado | Requisito e fronteiras definidos, sem garantia de fluxo funcional. |
| Fundacao tecnica | Tipos, contratos ou services existem, mas ainda nao formam fluxo persistente e integrado. |
| Implementado | API, persistencia e interface ou consumo real estao conectados. |
| Validado | Fluxo integrado, permissoes, escopo, estados de erro e testes foram comprovados. |

Uma issue fechada nao torna automaticamente o modulo `Implementado` ou `Validado`.

## Principios consolidados

1. O aluno e o centro da experiencia, mesmo quando a decisao tecnica pertence ao professor.
2. A Central do Aluno e o ponto principal para trabalhar com um aluno especifico.
3. Cadastro, contrato, agenda, avaliacao, prescricao e treino permanecem dominios separados.
4. PRNT e Avaliacao Fisica sao fontes historicas anteriores a prescricao.
5. A prescricao e modular por Resistido, Flexibilidade, Ciclico e Equilibrio.
6. Nenhuma capacidade publica diretamente o Treino de hoje.
7. A Montagem Consolidada e o filtro final antes da saida operacional.
8. O aluno recebe linguagem pratica e segura; o professor recebe contexto tecnico e rastreabilidade.
9. Planejado e executado permanecem separados e comparaveis.
10. Feedback e regras podem sugerir decisoes, mas a validacao final e sempre do professor.
11. Biblioteca, parametros e templates gerais pertencem a administracao; a Central mostra o que foi aplicado ao aluno.
12. Dados sensiveis exigem permissao, escopo efetivo, `contractId`, origem, data e responsavel.
13. O sistema deve funcionar plenamente sem integracoes externas.
14. Conteudo de terceiros nao deve ser copiado ou importado sem licenca e rastreabilidade.

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
- preservacao de rotas anteriores por compatibilidade;
- solicitacao manual de revisao cadastral com feedback de criacao, reutilizacao de pendencia e entrega de notificacao.

Pendente:

- regressao manual completa por perfil e escopo;
- atualizacao imediata de todos os cards apos alteracoes;
- preservacao do aluno selecionado em todos os fluxos;
- linha do tempo operacional reunindo treinos, execucoes, feedbacks, avaliacoes e pendencias.

### 2. Cadastro, servicos, contratos e vinculos

**Maturidade: Revisao cadastral web implementada e validada de forma integrada; demais vinculos implementados parcialmente.**

Entregue:

- revisao cadastral periodica com solicitacao manual por professor/gestor e reutilizacao idempotente da pendencia;
- sinalizacao da pendencia no inicio do aluno e fluxo responsivo em `/student/profile-review`;
- conclusao sem alteracoes, aplicacao direta de campos nao sensiveis e aprovacao/rejeicao profissional de campos sensiveis;
- persistencia canonica, auditoria e proxima revisao sem depender de provider externo;
- notificacao in-app e entrega opcional por email/WhatsApp com estado de envio observavel e degradacao segura;
- isolamento por usuario, vinculo ativo e `contractId`, inclusive quando a mesma conta participa de mais de um contrato;
- matriz de regressao em `docs/profile-review-e2e-validation.md` e contrato de cliente em `docs/student-app-data-contract.md`.

Pendente:

- manter dados de avaliacao fora do cadastro administrativo;
- garantir autoridade unica para servico e contrato vigentes;
- exibir resumos administrativos consistentes na Central;
- versionar questionarios iniciais alem dos fluxos ja migrados;
- organizar carteira de alunos, substituicao e acesso temporario conforme permissao;
- app mobile nativo, se priorizado, reutilizando o contrato `student/me` existente.

### 3. PRNT

**Maturidade: Implementado parcialmente, em estado avancado.**

Entregue:

- resumo tecnico na Central;
- PAR-Q/AHA;
- objetivos;
- historico de atividades;
- medicamentos e procedimentos;
- dores, desconfortos e acompanhamentos;
- encerramento sem apagar historico;
- controle por blocos de acesso;
- classificacao dos objetivos para capacidades, avaliacao e plano de acao no fluxo da prescricao.

Pendente:

- ciclo completo e historico dos objetivos;
- historicos proprios para medicamentos, cirurgias, restricoes e observacoes;
- integracao da rotina semanal;
- garantia de eventos no historico unificado;
- testes completos de permissao e isolamento por contrato;
- questionarios versionados como eventos rastreaveis.

### 4. Avaliacao Fisica

**Maturidade: Antropometria implementada parcialmente; demais protocolos em evolucao.**

Antropometria entregue:

- aluno, data, professor e codigo sequencial;
- segmentos configuraveis;
- descricao tecnica e videos;
- historico e comparacao;
- observacoes importaveis;
- entrada contextual pela Central.

Pendente para concluir Antropometria:

- rascunho e concluida como estados formais;
- medidas obrigatorias por protocolo;
- imutabilidade ou correcao auditada;
- variacoes absolutas e percentuais;
- graficos de evolucao;
- evento garantido na timeline;
- testes de permissao e `contractId`;
- contrato para laudos.

Adipometria:

- epic #245 criada;
- #246 formaliza protocolo, modelo historico e persistencia;
- #247 implementa API, calculos, autorizacao e auditoria;
- #248 cria o fluxo guiado do professor;
- #249 integra historico e comparacao a Central do Aluno;
- calculo e finalizacao dependem de protocolo clinico completo, aprovado e testavel.

Outros protocolos futuros:

- bioimpedancia;
- ultrassonografia;
- baropodometria;
- ventilometria e avaliacao metabolica;
- flexibilidade estruturada;
- testes fisicos;
- avaliacao postural;
- laudo integrado.

### 5. Treinamento operacional existente

**Maturidade: Modulos operacionais existentes e publicacao controlada pela Montagem Consolidada implementada; experiencia diaria integrada ainda parcial.**

Entregue:

- planos, periodizacao, templates, dias, exercicios, biblioteca, Workout Builder e execucoes permanecem como o grafo operacional canonico;
- uma versao aprovada da Montagem Consolidada pode ser liberada de forma controlada no grafo `TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise`;
- o release preserva vinculo relacional append-only, ator, timestamp e rastreabilidade ate a versao consolidada, capacidades e fontes;
- treino iniciado/executado e planejamento ja liberado sao protegidos contra sobrescrita silenciosa.

Pendente:

- completar a experiencia de rotina semanal e `Treino de hoje` na Central consumindo a saida operacional ja ligada a Prescricao/Montagem Consolidada;
- acoes para copiar, mover, revisar e publicar sem perder o aluno selecionado;
- planejado versus executado;
- provas-alvo e eventos esportivos;
- videos e orientacoes vinculados ao treino;
- aplicacao em massa com individualizacao, excecoes e revisao antes de publicar.

### 6. Prescricao por capacidades

**Maturidade: Implementado funcionalmente na PR #285; validacao independente do SHA final pendente.**

Entregue:

- persistencia e migrations para capacidade atual, versoes imutaveis, origens, alertas, objetivos e parametros;
- API autenticada para criacao, consulta e historico;
- contrato publico serializado com `sourceRefs` e `linkedProntuarioGoalIds`;
- filtros reais por aluno, contrato e permissoes de leitura/escrita;
- concorrencia otimista e historico imutavel;
- planejamento versionado de macrociclo, mesociclo e microciclo;
- catalogo tecnico versionado por contrato para ambientes, grupos musculares, siglas, estimulos, metodos, exercicios, cargas, articulacoes, divisoes e zonas de repeticao;
- seed idempotente cobrindo as quatro capacidades, ADP, ORD, CHO, REG, metodos e estimulos iniciais das planilhas;
- classificacao de objetivos do PRNT para Resistido, Flexibilidade, Ciclico, Equilibrio, avaliacao e plano de acao;
- derivacao backend de alertas e condicionantes a partir de PRNT, preferencias e avaliacoes;
- calculo testavel de zonas de frequencia cardiaca no backend;
- interface do professor em camadas separadas para as quatro capacidades;
- selecao articular por checkbox, com angulo, deficit, prioridade e prescricao sugerida;
- estados de vazio, carregamento, erro e falta de permissao;
- bloqueio estrutural e contratual de publicacao direta de `Treino de hoje`;
- consumo das quatro capacidades pela Montagem Consolidada, preservando IDs e versoes canônicas.

Pendente:

- validacao visual e manual completa por perfis e viewports;
- nova auditoria independente do SHA final;
- alertas de dados insuficientes ou avaliacao vencida;
- exportacao para smartwatch, feedback pos-treino e decisao sugerida, pertencentes a fases posteriores.

### 7. Montagem Consolidada

**Maturidade: Implementado ate a liberacao operacional controlada; validacao visual/manual complementar pendente.**

Entregue:

- persistencia versionada e historico append-only por aluno/contrato;
- API autenticada para criacao, edicao, consulta, conflitos, historico e workflow;
- fluxo `draft -> ready_for_review -> approved`, com bloqueio estruturado, remediacao ainda bloqueada e desbloqueio explicito, mais comando backend separado para `approved -> released`;
- revalidacao de conflitos estruturados sem heuristica de texto livre;
- concorrencia otimista por `expectedCurrentVersion`, row lock e CAS;
- permissoes separadas `view`, `manage`, `approve` e `release`, combinadas com `dataScope` e isolamento por `contractId`;
- auditoria derivada da cadeia imutavel de versoes;
- integracao com as versoes persistidas de Resistido, Flexibilidade, Ciclico e Equilibrio;
- liberacao transacional e idempotente no grafo existente `TrainingPlan -> WorkoutTemplate -> WorkoutDay -> WorkoutExercise`, sem arvore paralela de `Treino de hoje`;
- vinculo relacional append-only e consulta de rastreabilidade por IDs ate `ConsolidatedPrescriptionVersion`, `CapacityPrescriptionVersion` e fontes preservadas;
- representacao operacional estruturada e versionada de Flexibilidade/Equilibrio no `WorkoutDay`, sem perda semantica;
- protecao historica de template, dias, exercicios e blocos estruturados depois do release, preservando apenas lifecycle/feedback de execucao permitido;
- interface contextual pela Central do Aluno, mantendo `alunoId` na rota;
- tela em oito secoes colapsaveis para dados gerais, capacidades, origens, conflitos, composicao, mensagem ao aluno, revisao e historico;
- apresentacao distinta de `info`, `warning` e `critical` sem depender apenas de cor;
- correcao de composicao em estado `blocked`, reavaliacao no servidor e desbloqueio explicito somente quando o relatorio vigente retorna `canUnblock=true`;
- aprovacao apenas apos confirmacao do backend e nova revisao explicita apos `approved` ou `released`;
- tratamento de `409` preservando edicao local e exigindo reconciliacao explicita;
- historico de versoes em modo somente leitura;
- capacidades isoladas continuam bloqueadas de publicar `Treino de hoje`; a liberacao operacional parte exclusivamente da Montagem Consolidada aprovada.

Pendente:

- validacao visual/manual em navegador real para desktop, mobile, teclado e leitor de tela;
- auditoria independente do SHA final da entrega consolidada;
- UI especifica do comando de liberacao no contexto da Central/`Treino de hoje`;
- rastreabilidade ate a execucao e comparacao planejado versus executado;
- relatorio de excecoes antes da publicacao e aplicacao em massa somente quando houver fluxo revisavel proprio.

### 8. Execucao, feedback e decisao sugerida

**Maturidade: Fundacao tecnica e estruturas operacionais parciais.**

Pendente:

- check-in pre-treino;
- inicio, pausa, conclusao e impossibilidade;
- valores executados por etapa, exercicio, bloco ou serie;
- PSE, PSR, dor, dificuldade, fadiga e observacoes;
- comparacao planejado versus executado;
- persistencia e API para feedback e decisao;
- aprovacao, rejeicao e aplicacao pelo professor;
- atualizacao da timeline e do PRNT;
- nova versao da prescricao quando validada.

### 9. Agenda, frequencia e operacao

**Maturidade: Parcial.**

Pendente:

- agenda e frequencia dentro da Central;
- proximos atendimentos e reavaliacoes;
- faltas e reagendamentos;
- alertas de baixa frequencia;
- disponibilidade de colaboradores;
- lotacao por horario, ambiente e servico;
- substituicao de professor;
- materiais e recursos de sala.

### 10. Relatorios e comunicacao

**Maturidade: Roadmap.**

Pendente:

- linha do tempo evolutiva completa;
- indicadores individuais para aluno e tecnicos para professor;
- relatorios de aderencia e retencao;
- notificacoes de treino, feedback, pagamento e reavaliacao;
- mensagens praticas a partir de dados validados;
- laudos e PDFs somente apos dados historicos confiaveis.

## Experiencia de treinamento centrada no aluno

A fonte detalhada e `docs/product/student-centered-training-experience.md`.

### Jornada minima

| Momento | Resposta esperada do sistema |
| --- | --- |
| Inicio da semana | Calendario simples, objetivos praticos, duracao estimada e recuperacao |
| Antes do treino | Check-in de recuperacao, sono, fadiga, dor, motivacao e tempo disponivel |
| Durante o treino | Ordem, etapas, exercicios, series, carga, tempo, distancia, zona e orientacoes |
| Diante de dificuldade | Alerta, alternativa previamente aprovada, interrupcao ou pedido de ajuda |
| Depois do treino | Conclusao, valores executados, PSE, dor, dificuldade e observacoes |
| Entre treinos | Aderencia, consistencia, marcos e proxima acao validada |
| Na revisao | Resumo compreensivel e decisao validada pelo professor |

### Catalogo interno

Templates internos devem ser versionados e aprovados pela equipe da Acesso.

Catalogo inicial recomendado:

- corrida/caminhada para iniciantes;
- retorno gradual a corrida;
- base aerobica;
- 5 km, 10 km e meia maratona;
- manutencao, limiar e VO2max;
- adaptacao anatomica;
- full body duas ou tres vezes por semana;
- superior/inferior;
- resistencia, hipertrofia e forca;
- forca para corredores;
- treino para pessoas idosas;
- treino combinado com corrida, musculacao, mobilidade e equilibrio.

Ao aplicar um template, o sistema cria uma copia individual versionada. Alterar o template geral nao modifica silenciosamente planos ja aplicados.

### Treino ciclico estruturado

Deve representar etapas ordenadas:

- aquecimento;
- trabalho;
- recuperacao;
- repeticao;
- desaquecimento.

Cada etapa pode usar tempo, distancia, pace, velocidade, FC, zona ou PSE, preservando planejado e executado.

### Treino resistido estruturado

Deve permitir:

- blocos de aquecimento, tecnica, principal, complementar e finalizacao;
- series e faixas de repeticoes;
- carga ou percentual de carga;
- RIR/RPE;
- tempo de execucao;
- intervalo;
- superserie, bi-set, tri-set e circuito;
- valores executados por bloco ou serie.

### Biblioteca e substituicoes

A biblioteca deve evoluir com:

- equipamento, grupos musculares e padrao de movimento;
- articulacoes, lateralidade e dificuldade;
- instrucoes e erros comuns;
- regressoes, progressoes e alternativas;
- restricoes e alertas;
- midia propria ou licenciada;
- autor, revisor, versao e status de curadoria.

Substituicoes devem considerar objetivo, padrao de movimento, equipamento, nivel e restricao, registrando motivo e responsavel.

### Treinamento combinado

A Montagem Consolidada deve detectar conflitos como:

- treino intenso de membros inferiores antes de intervalado forte;
- longao seguido de forca pesada;
- dois estimulos intensos consecutivos;
- baixa recuperacao antes de alta intensidade;
- dor ativa incompatível com exercicio ou volume;
- aumento relevante de carga sem justificativa.

O sistema sugere revisao ou reorganizacao, mas nao altera automaticamente a prescricao. Nesta fase, somente regras estruturadas e persistidas podem bloquear; correlacoes clinicas ainda nao formalizadas permanecem evolucao futura, sem inferencia por texto livre.

## Decisoes aproveitadas de benchmarks

Ideias compativeis com o Sistema ACESSO:

1. linha do tempo operacional unica por aluno;
2. zonas individualizadas com metodologia, origem, versao e validade;
3. aplicacao em massa com individualizacao e relatorio de excecoes;
4. experiencia simples centrada em Treino de hoje, calendario e feedback curto;
5. visao planejado versus executado;
6. provas-alvo e eventos vinculados ao planejamento;
7. videos e orientacoes associados ao treino;
8. questionarios versionados alimentando o PRNT;
9. carteira de alunos, substituicao e acesso temporario por profissional.

Nao incorporar:

- identidade visual ou copia de interface de terceiros;
- automacao de prescricao sem professor;
- dados externos como verdade tecnica automatica;
- aplicativo nativo como pre-requisito do primeiro incremento.

## Ordem priorizada de evolucao

### Prioridade 0 - confiabilidade e governanca

- permissao e isolamento por `contractId`;
- historico, origem, versao e responsavel;
- estados de rascunho, conclusao e correcao;
- checks documentais, testes e validacao manual.

### Prioridade 1 - dados confiaveis do aluno

- concluir Antropometria;
- executar Adipometria pela epic #245;
- consolidar PRNT e objetivos;
- integrar eventos a timeline.

### Prioridade 2 - experiencia diaria do aluno

- rotina semanal;
- Treino de hoje;
- check-in;
- execucao;
- feedback curto;
- retorno ao mesmo aluno na Central.

### Prioridade 3 - catalogo interno e aplicacao individual

- templates versionados;
- biblioteca enriquecida;
- nomes amigaveis para metodos;
- criterios de elegibilidade, progressao e regressao;
- copia individual do template.

### Prioridade 4 - representacao estruturada

- etapas de treino ciclico;
- blocos e series resistidas;
- superseries e circuitos;
- planejado versus executado por unidade de treino.

### Prioridade 5 - treinamento combinado e revisao

- conflitos entre capacidades;
- substituicoes rastreaveis;
- indicadores individuais;
- sugestoes de manter, progredir, reduzir, trocar, suspender ou reavaliar;
- aprovacao ou rejeicao pelo professor.

### Prioridade 6 - agenda, comunicacao e relatorios

- frequencia e reagendamento;
- lembretes;
- mensagens praticas;
- relatorios individuais;
- laudos quando os dados-base estiverem confiaveis.

### Prioridade 7 - integracoes externas

Integracoes com Garmin, Strava ou outros provedores permanecem adiadas. Nao devem bloquear nenhuma prioridade anterior. Email/WhatsApp usados para notificacoes operacionais da revisao cadastral sao canais opcionais de comunicacao e nao alteram essa dependencia funcional.

Pre-condicoes futuras:

- Montagem Consolidada e Treino de hoje estaveis;
- execucao e feedback persistidos;
- prevencao de duplicidade;
- consentimento e revogacao;
- observabilidade e auditoria;
- aprovacao nos programas oficiais quando aplicavel.

## Proximas epics recomendadas

1. Experiencia de treinamento do aluno na Central.
2. Catalogo interno de templates versionados.
3. Sessao ciclica estruturada.
4. Sessao resistida por blocos, series e agrupamentos.
5. Check-in, execucao e feedback persistidos.
6. Treinamento combinado, conflitos e substituicoes.
7. Indicadores individuais e revisao validada.
8. Agenda, frequencia e comunicacao contextual.

Cada epic deve declarar:

- classificacao Central, Administracao ou Hibrida;
- aluno e `contractId`;
- visao do aluno e visao do professor;
- planejado e executado;
- origem, versao e responsavel;
- permissoes;
- estados de erro e falha recuperavel;
- testes e validacao manual;
- atualizacao das fontes de verdade.

## Fora do escopo atual

- integracoes externas de treino/dados como Garmin e Strava;
- sincronizacao em background;
- importacao de planos ou midia proprietaria;
- prescricao ou progressao totalmente automatica;
- diagnostico clinico automatico;
- configuracao completa de catalogos dentro da Central;
- substituicao destrutiva dos modelos atuais sem migracao e compatibilidade;
- exclusao ampla de documentacao historica sem revisao e plano de transicao.

## Criterio de pronto

Uma entrega so pode ser considerada concluida quando:

- parte de um aluno selecionado ou preserva explicitamente seu contexto;
- possui visao pratica para aluno e tecnica para professor;
- separa planejado de executado;
- possui modelo ou fonte de dados definida;
- possui API e interface quando aplicavel;
- registra historico, origem e versao;
- protege dados por permissao e `contractId`;
- nao altera prescricao sem validacao do professor;
- trata vazio, carregamento, erro e falha recuperavel;
- atualiza a Central apos salvar ou concluir;
- possui testes relevantes e validacao manual;
- atualiza documentacao e roadmap.
