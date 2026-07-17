# Plano: Central do Aluno e roadmap integrado do Sistema ACESSO

## Objetivo

Consolidar o Sistema ACESSO em torno da Central do Aluno, permitindo que professor, gestor, aluno ou perfil autorizado consulte, compreenda e atualize a jornada tecnica, administrativa e evolutiva sem depender de telas desconectadas.

O foco central do produto e o aluno. A organizacao tecnica, os catalogos e as rotinas administrativas existem para sustentar uma experiencia em que o aluno entende sua situacao, sabe o que fazer, registra o que aconteceu e acompanha sua evolucao.

Este documento registra o estado funcional conhecido da branch `develop` em 2026-07-17. O estado de implementacao abaixo e independente do estado aberto ou fechado das issues no GitHub.

## Fontes relacionadas

- `docs/product/integrated-prescription-control.md`: fluxo tecnico integrado.
- `docs/product/student-centered-training-experience.md`: experiencia-alvo de treinamento centrada no aluno.
- `docs/product/student-central-domain-matrix.md`: fronteira entre Central, administracao geral e funcionalidades hibridas.
- `docs/product/future-evolution-roadmap.md`: ordem futura priorizada por valor ao aluno.

## Decisoes consolidadas

- A Central do Aluno e o eixo principal do produto.
- O aluno e o foco central da experiencia, mesmo quando a decisao tecnica pertence ao professor.
- Informacoes diretamente vinculadas ao aluno devem ser acessiveis a partir da Central conforme permissao.
- O menu lateral continua existindo, mas nao deve ser o caminho principal para trabalhar com um aluno especifico.
- Consulta, historico, acao e proxima decisao devem coexistir no mesmo fluxo.
- Configuracoes gerais, bibliotecas, parametros e templates permanecem fora da Central.
- A Central apresenta o resultado aplicado ao aluno, nao o cadastro administrativo completo.
- Acoes rapidas usam pop-up; formularios medios usam painel lateral; registros complexos usam fluxo guiado.
- Depois de salvar, cancelar ou ocorrer erro, o aluno selecionado deve permanecer no contexto.
- Professor ve contexto tecnico; aluno ve orientacao pratica, segura e compreensivel.
- Dados sensiveis continuam protegidos por perfil, bloco, escopo e `contractId`.
- Nenhuma prescricao, progressao ou regressao ocorre automaticamente sem validacao do professor.
- Integracoes externas nao sao prioridade e nao devem bloquear a evolucao interna.

## Ordem de prioridade do produto

A ordem abaixo considera valor direto para o aluno e dependencias tecnicas:

1. confianca no cadastro, PRNT, avaliacoes e historico;
2. experiencia diaria de treinamento na Central;
3. templates internos e biblioteca curada;
4. execucao estruturada de corrida e musculacao;
5. feedback, indicadores e revisao validada;
6. agenda, frequencia e comunicacao;
7. relatorios e laudos individuais;
8. operacao administrativa e relatorios globais em trilha paralela;
9. integracoes externas somente em roadmap separado.

## Estado atual por fase

### Fase 1 - Central do Aluno

**Situacao: implementada funcionalmente, com validacoes complementares ainda recomendadas.**

Implementado:

- busca e selecao de aluno;
- rota `/central-do-aluno`;
- ficha centralizada por aluno;
- cabecalho e aba Resumo/Aluno 360;
- cards de situacao atual;
- historico unificado;
- acoes contextuais;
- estados vazio, carregamento e erro;
- preservacao das rotas antigas por compatibilidade.

Issues relacionadas: #170, #175, #176, #177 e #178.

Pendencias de fechamento operacional:

- validar manualmente todos os perfis e escopos;
- confirmar atualizacao imediata dos cards apos todas as acoes contextuais;
- revisar se todas as acoes retornam corretamente ao aluno selecionado;
- validar a experiencia do proprio aluno quando a visao self estiver disponivel.

### Fase 2 - Base administrativa e vinculos

**Situacao: parcialmente estruturada.**

Implementado:

- matriz de decisao entre Central do Aluno, administracao geral e fluxos hibridos;
- documentacao de fronteiras para alunos, PRNT, avaliacoes, professores, servicos, contratos, agenda, documentos, relatorios, configuracoes, treinamento e permissoes.

Issues relacionadas: #174 e #185.

Pendente:

- criar epic especifica para consolidacao de cadastros, vinculos, servicos, contratos e permissoes base;
- validar na pratica os resumos administrativos exibidos na Central;
- impedir que melhorias administrativas desloquem o fluxo principal do aluno.

### Fase 3 - Entrada inicial do aluno

**Situacao: ainda nao consolidada como fase propria.**

Ja existem cadastros, PAR-Q, AHA e dados iniciais no sistema, porem ainda falta uma epic que organize:

- primeiro cadastro;
- questionarios iniciais;
- dados de emergencia;
- revisao periodica;
- confirmacao ou atualizacao pelo professor;
- pendencias exibidas na Central;
- linguagem adequada para o proprio aluno revisar seus dados quando autorizado.

### Fase 4 - PRNT completo

**Situacao: avancada, mas nao integralmente concluida.**

Implementado:

- resumo tecnico do PRNT na Central;
- estados pendente, parcial e incompleto;
- alertas de PAR-Q/AHA;
- objetivo ativo;
- historico de atividade fisica;
- medicacoes, restricoes, historico medico e observacoes no resumo;
- fluxo de dores, desconfortos e acompanhamentos;
- criacao, acompanhamento e encerramento de desconfortos sem apagar historico;
- card contextual de desconfortos na Central.

Issues relacionadas: #171, #180, #181 e #182.

Pendente:

- consolidar fluxos completos e historicos proprios para anamnese, medicamentos, cirurgias, restricoes, atividade fisica e observacoes categorizadas;
- confirmar integracao de todos esses eventos com o historico unificado;
- ampliar testes especificos de permissao e `contractId`;
- definir o resumo pratico que pode ser mostrado ao aluno sem expor detalhe tecnico indevido.

### Fase 5 - Antropometria

**Situacao: primeiro incremento funcional concluido; fase ainda nao concluida.**

Implementado:

- card de avaliacoes na Central;
- estados inexistente, pendente, em dia e vencida;
- ultima avaliacao, tipo, data, responsavel e proxima reavaliacao;
- historico recente por data, tipo, responsavel, origem e status;
- acao para nova antropometria preservando `alunoId`;
- bloqueio de troca do aluno quando o fluxo parte da Central;
- validacao de aluno, data e professor responsavel;
- criacao e edicao da avaliacao antropometrica atual;
- historico de avaliacoes anteriores em modo somente leitura;
- comparacao lado a lado;
- segmentos configuraveis;
- observacoes gerais e importaveis;
- retorno para a Central.

Issues relacionadas: #172, #183 e #184.

A issue #172 foi encerrada como conclusao do primeiro recorte funcional. A Fase 5 continua aberta porque ainda faltam:

- ciclo de vida formal da avaliacao, incluindo rascunho e concluida;
- criterios de conclusao e medidas obrigatorias por protocolo;
- validacao de permissoes e isolamento por `contractId`;
- garantia de evento no historico unificado apos conclusao;
- comparacao com diferencas absolutas e percentuais;
- graficos de evolucao quando os dados estiverem confiaveis;
- contrato de dados para laudos futuros;
- suite especifica de testes e validacao manual.

Fonte detalhada: `docs/execution-plans/active/2026-07-epic-172-completion-assessment.md`.

### Fase 6 - Adipometria

**Situacao: epic criada e pronta para execucao incremental; implementacao ainda pendente.**

A epic #245 foi criada em 2026-07-17 com as seguintes subissues:

- #246 - protocolos, dominio, persistencia e politica de correcao;
- #247 - API, calculo, historico, autorizacao e auditoria;
- #248 - fluxo guiado do professor;
- #249 - integracao com historico e comparacao da Central do Aluno.

Ordem tecnica:

```text
#246 -> #247 -> #248
          \-------> #249
#248 --------------> #249
```

Regras de prioridade:

- estrutura e persistencia podem avancar antes do protocolo clinico final;
- calculo e finalizacao exigem protocolo completo, aprovado e testavel;
- rascunhos nao entram em indicadores do aluno;
- Adipometria nao altera treino automaticamente;
- a entrega deve retornar ao contexto do aluno na Central.

### Fase 7 - Experiencia de treinamento do aluno

**Situacao: modulos tecnicos existentes; experiencia integrada e centrada no aluno ainda pendente.**

O sistema ja possui planos, periodizacao, estimulos resistidos e ciclicos, Workout Builder, biblioteca, Treino de hoje e execucoes. A proxima evolucao nao deve substituir esses modulos de forma destrutiva; deve conecta-los a jornada do aluno.

#### Fase 7A - rotina e Treino de hoje

Pendente:

- plano atual e historico dentro da Central;
- rotina semanal;
- proximo treino;
- Treino de hoje com objetivo pratico, duracao, local, equipamento, etapas e exercicios;
- status planejado, iniciado, parcial, concluido, reagendado, perdido ou suspenso;
- proxima acao do aluno e do professor;
- atualizacao do Resumo e Historico sem perder o aluno selecionado.

#### Fase 7B - check-in, execucao e feedback

Pendente:

- recuperacao/PSR, sono, fadiga, dor, motivacao e tempo disponivel antes do treino;
- inicio, pausa, conclusao e impossibilidade;
- planejado versus executado;
- PSE, dor, dificuldade, substituicao e observacoes depois do treino;
- preservacao de dados em falhas recuperaveis;
- alerta sem alteracao automatica da prescricao.

#### Fase 7C - catalogo interno e aplicacao individual

Pendente:

- templates versionados de corrida, musculacao e treino combinado;
- objetivo, nivel, duracao, frequencia, pre-requisitos e restricoes;
- criterios de progressao e regressao;
- biblioteca enriquecida e curadoria;
- nomes amigaveis para metodos e siglas;
- copia individual do template aplicada ao aluno;
- historico preservado quando o template geral mudar.

O catalogo e a biblioteca pertencem a administracao geral. A Central mostra somente o plano, os exercicios e as orientacoes aplicados ao aluno.

#### Fase 7D - treino estruturado

Pendente:

- etapas de aquecimento, trabalho, recuperacao, repeticao e desaquecimento para treino ciclico;
- alvo por tempo, distancia, pace, velocidade, FC, zona ou PSE;
- blocos e series de aquecimento, tecnica, principal, complementar e finalizacao para treino resistido;
- carga, repeticoes, RIR/RPE, tempo e intervalo por bloco ou serie;
- superserie, bi-set, tri-set e circuito;
- valores executados por unidade de treino.

#### Fase 7E - treinamento combinado e substituicoes

Pendente:

- distribuicao conjunta de corrida, musculacao, flexibilidade e equilibrio;
- alertas de conflito entre intensidade, volume, dor, fadiga e recuperacao;
- alternativas aprovadas por padrao de movimento, objetivo, equipamento e restricao;
- motivo e responsavel pela substituicao;
- sugestao de reorganizacao sem mudanca automatica.

#### Fase 7F - evolucao e revisao

Pendente:

- indicadores compreensiveis para o aluno;
- indicadores tecnicos para o professor;
- aderencia e consistencia;
- evolucao de tempo, distancia, pace, carga e repeticoes quando comparaveis;
- alertas recorrentes;
- sugestoes de manter, progredir, reduzir, trocar, suspender ou reavaliar;
- aprovacao, rejeicao e aplicacao pelo professor;
- linha do tempo das decisoes e versoes.

Fonte detalhada: `docs/product/student-centered-training-experience.md`.

### Fase 8 - Agenda, frequencia e comunicacao

**Situacao: pendente como fase integrada.**

Pendente:

- agenda do aluno dentro da Central;
- frequencia recente;
- proximos atendimentos;
- faltas e reagendamentos;
- reavaliacoes agendadas;
- alertas de baixa frequencia;
- lembretes de treino e feedback;
- mensagens praticas com consentimento e finalidade.

A agenda geral deve ser preservada. Agenda nao pode criar treino sem prescricao validada.

### Fase 9 - Contratos, servicos e documentos

**Situacao: parcialmente existente fora da Central.**

Pendente:

- card administrativo do aluno;
- historico de contratos;
- servico ou plano atual;
- documentos e anexos;
- renovacoes;
- situacao administrativa conforme permissao.

Essa fase e importante, mas deve permanecer em trilha operacional paralela e nao substituir a experiencia tecnica e diaria do aluno.

### Fase 10 - Relatorios e laudos

**Situacao: nao iniciar antes da consolidacao dos dados historicos.**

Pendente:

- laudo de antropometria;
- laudo de adipometria;
- relatorio de evolucao;
- visoes tecnica e resumida;
- geracao de PDF;
- historico de laudos;
- linguagem compreensivel para o aluno;
- comparabilidade explicita entre protocolos e versoes.

## Controle de implementacao

| Fase | Issues principais | Estado funcional em `develop` | Proximo passo |
| --- | --- | --- | --- |
| 1. Central do Aluno | #170, #175-#178 | Implementada funcionalmente | Validar perfis, escopos, atualizacao pos-acao e visao self |
| 2. Base administrativa | #174, #185 | Parcial e documentada | Criar epic de consolidacao administrativa sem mover catalogos para a Central |
| 3. Entrada inicial | sem epic propria | Parcialmente existente | Criar epic de onboarding e revisao periodica |
| 4. PRNT | #171, #180-#182 | Avancada | Completar historicos, permissoes e resumo seguro para aluno |
| 5. Antropometria | #172, #183, #184 | Primeiro incremento concluido | Concluir ciclo de vida, rastreabilidade, comparacao e testes |
| 6. Adipometria | #245-#249 | Epic criada; execucao pendente | Iniciar pela #246 e respeitar gate clinico |
| 7. Treinamento do aluno | sem epic propria | Modulos existentes; integracao pendente | Criar epic centrada na jornada definida neste plano |
| 8. Agenda e frequencia | sem epic propria | Integracao pendente | Planejar apos o nucleo diario de treinamento |
| 9. Contratos e documentos | sem epic propria | Parcial fora da Central | Evoluir em trilha operacional paralela |
| 10. Relatorios e laudos | sem epic propria | Nao iniciada | Aguardar dados historicos e protocolos confiaveis |

## Criterios de pronto por modulo

Um modulo ou bloco da Central so deve ser considerado concluido quando tiver:

- modelo ou fonte de dados definida;
- API ou consulta implementada;
- tela ou bloco de consulta;
- acao de criacao ou edicao quando aplicavel;
- historico quando aplicavel;
- permissao por perfil, bloco, escopo e contrato;
- separacao clara entre visao do aluno e visao tecnica;
- validacoes principais;
- estados vazio, carregamento, erro e falha recuperavel;
- atualizacao visual apos salvar;
- preservacao do aluno selecionado;
- testes relevantes;
- documentacao atualizada;
- validacao manual descrita.

Para treinamento, tambem e obrigatorio:

- separar planejado de executado;
- nao alterar prescricao sem validacao do professor;
- mostrar unidade e linguagem compreensivel;
- manter rastreabilidade ate prescricao e montagem;
- registrar feedback e decisao quando aplicavel.

## Proximos passos recomendados

### Trilha imediata de confianca dos dados

1. Executar a epic #245 na ordem de dependencia iniciando pela #246.
2. Concluir as pendencias estruturais da Antropometria que afetam historico, permissao e comparacao.
3. Validar que eventos concluidos alimentam a Central sem misturar rascunhos.

### Proxima grande epic de produto

Criar a epic da Fase 7 - Experiencia de treinamento do aluno, dividida em entregas pequenas:

1. rotina semanal e Treino de hoje na Central;
2. check-in, execucao e feedback;
3. templates internos e biblioteca curada;
4. etapas ciclicas estruturadas;
5. blocos e series resistidas;
6. treino combinado e substituicoes;
7. indicadores e revisao validada.

O planejamento da Fase 7 pode ocorrer enquanto a Fase 6 avanca, mas sua implementacao deve respeitar as fontes de dados, permissoes e contratos ja definidos.

## Nao priorizar agora

- integracoes com Garmin, Strava, TrainingPeaks ou outros provedores;
- sincronizacao em background;
- importacao de planos ou midias proprietarias;
- progressao automatica;
- laudos sobre dados sem ciclo de vida confiavel;
- relatorios gerenciais antes da experiencia individual;
- configuracao completa de templates ou biblioteca dentro da Central do Aluno.