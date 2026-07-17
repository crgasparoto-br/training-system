# Roadmap de evolucoes futuras centrado no aluno

Este documento evolui o recorte originalmente registrado na issue #139 e reorganiza as prioridades futuras do Sistema ACESSO pelo valor entregue ao aluno.

A fonte de verdade detalhada para treinamento e `docs/product/student-centered-training-experience.md`.

## Direcao de produto

O foco central do Sistema ACESSO e o aluno.

A evolucao deve permitir que o aluno:

1. compreenda sua situacao atual;
2. saiba o que precisa fazer hoje e na semana;
3. execute com orientacao simples e segura;
4. registre o que realmente aconteceu;
5. receba acompanhamento do professor;
6. visualize sua evolucao e proxima acao.

Configuracoes gerais, catalogos, templates e parametros continuam fora da Central do Aluno. A Central deve mostrar o resultado individual aplicado, o historico, os alertas e as acoes contextuais.

## Principios de priorizacao

1. Priorizar valor direto e frequente para o aluno antes de integracoes externas.
2. Concluir fundacoes de historico, permissao e rastreabilidade antes de indicadores ou automacoes.
3. Preservar a separacao entre visao pratica do aluno e visao tecnica do professor.
4. Manter planejado e executado como dados distintos e comparaveis.
5. Usar templates como ponto de partida, nunca como prescricao automatica.
6. Exigir validacao do professor para progressao, regressao, troca, suspensao ou nova prescricao.
7. Evitar telas gigantes: administracao geral configura; Central do Aluno aplica e acompanha.
8. Nenhuma fase depende de Garmin, Strava, TrainingPeaks ou outro provedor externo.

## Nucleo preservado

O nucleo atual deve continuar preservando:

- cadastro de alunos, colaboradores, contratos, servicos e agenda;
- Central do Aluno como ponto principal para trabalhar com um aluno selecionado;
- PRNT e avaliacao fisica como fontes tecnicas historicas;
- prescricao por capacidades fisicas;
- Montagem Consolidada como filtro obrigatorio antes da saida operacional;
- Treino de hoje como experiencia pratica de execucao;
- feedback pos-treino e decisao sugerida como evidencia para revisao;
- validacao final do professor;
- permissoes, escopos, `contractId`, origem, versao e responsavel;
- biblioteca, planos, templates, periodizacao, Workout Builder e execucoes existentes ate haver migracao explicita.

Nenhuma evolucao futura deve remover ou substituir esse nucleo sem issue propria, compatibilidade, migration quando aplicavel, testes e validacao manual.

## Resultado-alvo da jornada

```text
Central do Aluno
  -> situacao e objetivo atual
  -> rotina semanal
  -> check-in pre-treino
  -> Treino de hoje
  -> execucao planejado versus realizado
  -> feedback pos-treino
  -> historico e indicadores individuais
  -> decisao sugerida
  -> validacao do professor
  -> nova versao da prescricao
```

## Horizonte 0 - confianca nos dados do aluno

Objetivo: concluir as fundacoes que tornam o acompanhamento confiavel.

Inclui:

- entrada inicial e revisao periodica do cadastro;
- PRNT historico e completo;
- ciclo de vida das avaliacoes;
- Antropometria com conclusao, comparacao, permissao e rastreabilidade;
- Adipometria por meio da epic #245 e subissues #246 a #249;
- historico unificado com origem, data, responsavel e visibilidade por perfil;
- isolamento por `contractId` e testes de acesso.

Valor para o aluno:

- nao repetir informacoes sem necessidade;
- ter historico preservado;
- receber orientacoes baseadas em dados identificaveis e atuais;
- visualizar evolucao sem misturar rascunhos, registros antigos ou tipos de avaliacao.

Gate para avancar:

- ciclos de vida e registros vigentes definidos;
- rascunhos separados de dados concluidos;
- historico e permissoes testados;
- nenhuma avaliacao altera treino automaticamente.

## Horizonte 1 - experiencia diaria de treinamento

Objetivo: fazer da Central do Aluno o ponto principal para acompanhar e executar o treino.

Entregas:

- plano atual e rotina semanal;
- proximo treino e Treino de hoje;
- objetivo pratico, duracao, local e equipamentos;
- check-in pre-treino;
- inicio, pausa, conclusao, execucao parcial e impossibilidade;
- feedback simples com PSE, dor, dificuldade e observacao;
- atualizacao imediata do resumo e historico;
- visao responsiva para aluno e professor.

Valor para o aluno:

- saber o que fazer sem navegar por modulos tecnicos;
- registrar como se sentiu e o que conseguiu executar;
- manter o contexto do proprio acompanhamento.

Fora deste horizonte:

- reestruturacao completa de todos os modelos de treino;
- progressao automatica;
- integracoes externas.

## Horizonte 2 - catalogo interno e aplicacao individual

Objetivo: dar ao professor pontos de partida consistentes sem reduzir a personalizacao do aluno.

Entregas:

- templates internos versionados de corrida, musculacao e treino combinado;
- objetivo, nivel, duracao, frequencia, pre-requisitos e restricoes;
- criterios de progressao e regressao;
- biblioteca de exercicios enriquecida;
- nomes amigaveis para metodos e siglas;
- revisao e aprovacao dos templates;
- copia individual versionada ao aplicar um template ao aluno;
- preservacao do historico quando o template original mudar.

Catalogo inicial recomendado:

- iniciacao corrida/caminhada;
- retorno gradual a corrida;
- base para 5 km;
- 10 km;
- meia maratona;
- full body iniciante;
- superior/inferior;
- forca para corredores;
- duas corridas e dois treinos resistidos;
- tres corridas e dois treinos resistidos.

Valor para o aluno:

- receber plano coerente com objetivo, nivel e restricoes;
- manter personalizacao e rastreabilidade;
- evitar mudancas silenciosas em planos ja liberados.

## Horizonte 3 - representacao estruturada do treino

Objetivo: representar com clareza sessoes que hoje dependem de campos gerais ou texto livre.

### Ciclico

- etapas ordenadas de aquecimento, trabalho, recuperacao, repeticao e desaquecimento;
- duracao por tempo ou distancia;
- alvo por pace, velocidade, FC, zona ou PSE;
- valores minimo e maximo;
- repeticoes;
- planejado versus executado por etapa.

### Resistido

- blocos de aquecimento, tecnica, series principais, complementares e finalizacao;
- series e faixas de repeticao;
- carga, percentual de carga, RIR/RPE, tempo e intervalo;
- planejado versus executado por serie;
- superserie, bi-set, tri-set e circuito;
- substituicao rastreavel.

### Combinado

- distribuicao semanal das capacidades;
- alertas de conflito entre carga resistida, corrida intensa, dor, fadiga e recuperacao;
- sugestao de revisao sem alteracao automatica.

Valor para o aluno:

- entender a sequencia da sessao;
- registrar parcialmente sem perder informacao;
- receber alternativa segura quando previamente aprovada.

## Horizonte 4 - evolucao e revisao validada

Objetivo: transformar execucoes e feedbacks em acompanhamento compreensivel e acionavel.

Entregas:

- indicadores individuais de aderencia e consistencia;
- sessoes prescritas versus realizadas;
- evolucao de tempo, distancia, pace, carga e repeticoes quando comparaveis;
- volume por zona e grupo muscular para o professor;
- alertas recorrentes;
- substituicoes e interrupcoes;
- linha do tempo de mudancas do plano;
- decisoes sugeridas: manter, progredir, reduzir, trocar, suspender ou reavaliar;
- aprovacao, rejeicao e aplicacao pelo professor.

Valor para o aluno:

- visualizar marcos e proxima acao;
- compreender a evolucao sem receber interpretacao tecnica indevida;
- participar do acompanhamento com feedback registrado.

## Horizonte 5 - agenda, frequencia e comunicacao

Objetivo: conectar o acompanhamento do aluno a rotina operacional.

Entregas:

- proximos atendimentos;
- frequencia recente;
- faltas e reagendamentos;
- reavaliacoes previstas;
- lembretes de treino e feedback;
- mensagens praticas aprovadas;
- notificacoes de pendencias administrativas separadas dos dados de saude.

Regras:

- agenda nao cria treino sem prescricao;
- notificacao nao expõe dado sensivel sem finalidade e permissao;
- mensagens ao aluno usam linguagem pratica;
- canal externo nao vira fonte tecnica.

## Horizonte 6 - relatorios e laudos individuais

Objetivo: consolidar historico confiavel em entregaveis para aluno e professor.

Entregas:

- relatorio de evolucao;
- visao resumida para o aluno;
- visao tecnica para o professor;
- laudos de avaliacao quando protocolos e dados-base estiverem concluidos;
- PDF e historico de documentos;
- comparabilidade explicita entre protocolos e versoes.

Gate:

- dados historicos concluidos e rastreaveis;
- regras clinicas aprovadas;
- permissao e auditoria;
- nenhuma interpretacao automatica sem regra formal.

## Trilha operacional paralela

Estas evolucoes continuam importantes, mas nao devem deslocar a experiencia central do aluno:

- cadastro profissional e colaboradores;
- catalogo comercial e planos;
- contratos e documentos;
- cobranca e notificacoes financeiras;
- disponibilidade de equipe;
- ambientes, materiais e equipamentos;
- relatorios gerenciais agregados.

A Central deve mostrar apenas o impacto individual autorizado, como professor responsavel, servico vigente, proximo atendimento ou pendencia relevante.

## Integracoes externas adiadas

Integracoes com smartwatch, Garmin, Strava, TrainingPeaks ou outros provedores nao fazem parte da prioridade atual.

O sistema deve evoluir primeiro para:

- representar internamente treino ciclico e resistido de forma estruturada;
- registrar execucao e feedback sem depender de provedor;
- manter planejado versus executado;
- consolidar historico e revisao do professor.

Qualquer futura integracao deve entrar por issue propria e tratar dados externos apenas como evidencia com origem, consentimento, data, contrato e validacao tecnica.

## Backlog recomendado por ordem de valor ao aluno

Cada item deve virar epic ou issue propria antes da implementacao:

1. Integrar plano atual, rotina semanal e Treino de hoje a Central do Aluno.
2. Implementar check-in pre-treino e feedback pos-treino contextual.
3. Criar catalogo interno de templates versionados e copia individual.
4. Enriquecer biblioteca e criar curadoria de exercicios e substituicoes.
5. Modelar etapas estruturadas para treino ciclico.
6. Modelar blocos, series e agrupamentos para treino resistido.
7. Implementar comparacao planejado versus executado.
8. Criar indicadores individuais e linha do tempo de treinamento.
9. Implementar alertas de conflito do treino combinado.
10. Persistir decisao sugerida com validacao do professor.
11. Integrar agenda, frequencia, reagendamento e reavaliacao a Central.
12. Criar relatorios e laudos individuais quando os dados-base estiverem confiaveis.
13. Evoluir notificacoes e mensagens praticas com consentimento e finalidade.
14. Manter integracoes externas em backlog separado e sem bloquear o nucleo.

## Criterios de priorizacao de novas issues

Uma nova issue deve receber prioridade maior quando:

- resolve uma necessidade frequente do aluno;
- reduz navegacao ou perda de contexto na Central;
- melhora seguranca ou compreensao do Treino de hoje;
- fecha lacuna entre planejado e executado;
- melhora historico e continuidade do acompanhamento;
- reduz risco de decisao com dado incompleto;
- habilita varias entregas futuras sem depender de provedor externo.

Deve receber prioridade menor quando:

- atende apenas conveniencia administrativa sem impacto atual no aluno;
- duplica uma fonte de verdade existente;
- depende de integracao externa antes de o modelo interno estar pronto;
- automatiza decisao que ainda precisa de regra tecnica e aprovacao humana.

## Nao fazer no roadmap atual

- nao priorizar integracoes externas;
- nao copiar planos, textos, imagens ou videos proprietarios;
- nao publicar treino diretamente a partir de template ou capacidade;
- nao alterar prescricao automaticamente com base em check-in ou feedback;
- nao expor justificativa tecnica completa ao aluno;
- nao colocar configuracao geral de biblioteca ou templates dentro da Central;
- nao iniciar laudos ou indicadores avancados sobre dados sem ciclo de vida confiavel;
- nao refatorar destrutivamente planos, templates, execucoes, agenda, contratos ou permissoes.