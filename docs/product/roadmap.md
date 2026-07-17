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
- issues, PRs, documentacao versionada e implementacao atual do `training-system`.

As planilhas sao referencias de produto. Regras criticas somente passam a valer no sistema quando estiverem documentadas, implementadas em camada testavel, persistidas quando aplicavel e protegidas por permissao e `contractId`.

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
- verificacao de preservacao do aluno selecionado em todos os fluxos.

### 2. Cadastro, servicos, contratos e vinculos

**Maturidade: Implementado parcialmente.**

Existem cadastros de alunos e colaboradores, catalogo comercial, contratos, funcoes, valores e permissoes. Permanecem pendentes:

- consolidacao do onboarding e revisao periodica do aluno;
- separacao definitiva entre cadastro e dados de avaliacao;
- resumos administrativos consistentes na Central;
- historico e autoridade unica para servico e contrato vigente;
- validacao completa dos fluxos administrativos e financeiros.

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
- testes completos de permissao e isolamento por contrato.

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
- integracao com o nucleo atual de treino.

### 7. Montagem Consolidada

**Maturidade: Fundacao tecnica.**

Existem contratos e regras iniciais para blocos validados, origem, conflitos, versao e aprovacao do professor. Permanecem pendentes:

- persistencia e API;
- interface de montagem;
- integracao com capacidades persistidas;
- integracao com biblioteca e Workout Builder;
- geracao controlada de `WorkoutDay` ou equivalente;
- rastreabilidade real ate a execucao;
- regras completas de seguranca, CIT e carga agudo/cronica.

### 8. Feedback pos-treino e decisao sugerida

**Maturidade: Fundacao tecnica.**

Existem tipos e regras puras para PSE, PSR, dor, dificuldade, fadiga, aderencia, carga, repeticoes e decisao sugerida. Permanecem pendentes:

- persistencia e API;
- vinculo com execucao real e Montagem Consolidada;
- interfaces separadas de aluno e professor;
- aprovacao e rejeicao em fluxo real;
- atualizacao da timeline e dos acompanhamentos do PRNT;
- alimentacao de nova versao da prescricao.

### 9. Agenda, frequencia e operacao

**Maturidade: Parcial.**

A agenda geral deve ser preservada. Evolucoes pendentes:

- agenda e frequencia dentro da Central;
- proximos atendimentos e reavaliacoes;
- alertas de ausencia;
- disponibilidade de colaboradores;
- lotacao por horario, ambiente e servico;
- substituicao de professor;
- materiais e recursos de sala.

### 10. Relatorios, notificacoes e integracoes futuras

**Maturidade: Roadmap.**

Inclui:

- linha do tempo evolutiva completa;
- relatorios de aderencia, retencao e indicadores clinicos;
- notificacoes de treino, pagamento, feedback e reavaliacao;
- mensagens praticas e WhatsApp a partir de dados validados;
- exportacao futura de treino aerobico para smartwatch;
- importacao de pace, FC, zonas, sono, estresse e recuperacao como evidencia;
- integracoes com provedores externos mediante consentimento e auditoria.

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

### Prioridade 2 - Tornar Prescricao por Capacidades funcional

1. Definir schema e migrations.
2. Criar API e controle de acesso.
3. Criar interface por capacidade.
4. Conectar objetivos, PRNT e avaliacoes.
5. Integrar parametros do ModeloTreinamento Combinado.

### Prioridade 3 - Integrar Montagem Consolidada ao treino atual

1. Persistir montagens e versoes.
2. Integrar blocos validados.
3. Exibir conflitos e alertas.
4. Exigir aprovacao do professor.
5. Gerar saida operacional rastreavel sem substituir o nucleo atual de forma destrutiva.

### Prioridade 4 - Fechar o ciclo de execucao

1. Persistir feedback por sessao e capacidade.
2. Vincular execucao, montagem, aluno e contrato.
3. Implementar aprovacao/rejeicao da decisao.
4. Atualizar timeline e PRNT.
5. Gerar nova proposta de prescricao sem alteracao automatica.

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
- uma nova planilha, issue ou regra alterar as fronteiras do produto.

Nao crie outro roadmap geral. Roadmaps temporarios de uma iniciativa devem existir somente durante a execucao e ser removidos ou consolidados ao termino.