# Produto: fluxo integrado de prontuario, prescricao e treino

Este documento define a arquitetura-alvo de produto para evoluir o Sistema Acesso de telas isoladas para um fluxo integrado de acompanhamento do aluno.

A proposta parte da leitura da planilha de ideias do professor e do estado atual do sistema. Ela nao autoriza implementacao automatica. O objetivo e orientar planos, issues e PRs pequenos para reduzir retrabalho.

## Objetivo

Transformar o Sistema Acesso em um fluxo continuo:

```text
Prontuario / Avaliacao Fisica
  -> Prescricao por capacidades fisicas
  -> Montagem Consolidada da Prescricao
  -> Treino de hoje
  -> Feedback pos-treino
  -> Regras de decisao sugerida
  -> Nova prescricao ou ajuste validado pelo professor
```

## Referencias de boas praticas aplicadas

Este plano adapta praticas consolidadas de sistemas de controle, seguranca e entrega continua:

- NIST Risk Management Framework: abordagem flexivel, baseada em risco, integrada ao ciclo de vida do sistema, com etapas de preparar, categorizar, selecionar, implementar, avaliar, autorizar e monitorar continuamente controles. Referencia: https://csrc.nist.gov/projects/risk-management/about-rmf
- OWASP ASVS: uso de requisitos verificaveis para controles tecnicos de seguranca em aplicacoes web, especialmente autorizacao, validacao e protecao de dados sensiveis. Referencia: https://owasp.org/www-project-application-security-verification-standard/
- DORA Continuous Delivery: entregas pequenas, testaveis, seguras, com automacao, monitoramento, banco versionado e software sempre em estado implantavel. Referencia: https://dora.dev/capabilities/continuous-delivery/
- GitHub Issues e sub-issues: decompor trabalho grande em tarefas rastreaveis e hierarquicas. Referencia: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues

## Principios de produto

1. O prontuario vem antes da prescricao.
2. A avaliacao fisica e historica e deve alimentar decisoes tecnicas.
3. A prescricao e modular por capacidade fisica.
4. Nenhuma capacidade alimenta diretamente o Treino de hoje.
5. A Montagem Consolidada da Prescricao e a camada-mae que valida e consolida blocos ativos.
6. O Treino de hoje e saida operacional, nao origem tecnica.
7. Feedback pos-treino alimenta a proxima decisao.
8. Regras automatizadas sugerem decisoes, mas a validacao final e sempre do professor.
9. Professor ve a visao tecnica; aluno ve a visao pratica, simples e segura.
10. Qualquer nova entidade sensivel deve respeitar contrato, escopo de dados, auditoria e permissao.

## Fronteiras de dominio

### 1. Aluno selecionado

Contexto central de navegacao. Deve agrupar as abas do aluno sem transformar cada modulo em uma rota isolada desconectada.

Abas-alvo:

- Resumo
- Treino de hoje
- Prontuario
- Prescricao
- Avaliacao Fisica
- Historico / Evolucao
- Cadastro
- Vinculos

### 2. Prontuario

Fonte tecnica primaria antes da prescricao.

Deve conter, no minimo:

- objetivos e metas;
- anamnese;
- historico de atividade;
- medicamentos, procedimentos e cirurgias;
- dores, desconfortos e restricoes;
- observacoes tecnicas;
- status e historico.

### 3. Avaliacao Fisica

Fonte historica de medicoes e testes.

Deve manter historico e expor dados consumiveis pela prescricao, incluindo:

- antropometria;
- adipometria;
- bioimpedancia;
- testes fisicos;
- resumo tecnico por data;
- comparativos evolutivos.

### 4. Prescricao por capacidades fisicas

A prescricao deve ser separada por capacidade:

- Resistido
- Flexibilidade
- Ciclico
- Equilibrio

Cada capacidade deve possuir:

- objetivos vinculados;
- justificativa tecnica;
- resumo para professor;
- plano;
- sessao selecionada;
- status: planejado, ativo, em ajuste, suspenso, finalizado;
- alertas;
- feedback relacionado;
- regra de decisao sugerida;
- mensagem simplificada para aluno;
- criterio de envio para montagem consolidada.

### 5. Montagem Consolidada da Prescricao

Camada-mae e filtro final antes do treino.

Responsabilidades:

- receber blocos ativos e validados das capacidades;
- validar conflitos entre capacidades;
- organizar prioridade, ordem e combinacao;
- gerar versao operacional para o Treino de hoje;
- registrar versao gerada e justificativa;
- impedir que capacidades enviem treino diretamente ao aluno.

Exemplos de conflito:

- dor ativa no joelho + treino intenso de membro inferior;
- fadiga alta + intervalado forte;
- restricao de mobilidade + exercicio com amplitude elevada;
- baixa recuperacao + progressao automatica de carga.

### 6. Treino de hoje

Tela de execucao.

Visao do aluno/professor na operacao:

- ordem de execucao;
- exercicio ou atividade;
- carga, tempo, distancia ou zona alvo;
- esforco alvo;
- observacoes simples;
- alertas de seguranca;
- registro de conclusao e feedback.

Nao deve conter regra tecnica profunda, justificativa completa ou configuracao de prescricao.

### 7. Feedback e regras de decisao

O feedback deve alimentar nova decisao, mas sem automatizar prescricao sem validacao humana.

Dados esperados:

- PSE;
- PSR;
- dor ou desconforto;
- dificuldade;
- carga usada;
- reps executadas;
- observacoes do aluno;
- observacoes do professor;
- aderencia ao planejado.

Decisoes sugeridas:

- manter;
- progredir;
- reduzir;
- trocar;
- suspender;
- reavaliar.

Toda decisao sugerida deve ter status:

- sugerida;
- aprovada;
- rejeitada;
- aplicada.

## Controle de acesso e dados

Toda nova tela, aba, bloco e acao sensivel deve seguir o modelo existente:

- `screenKey` para tela ou capacidade principal;
- `blockKey` para aba, bloco interno ou acao sensivel;
- `dataScope` para limitar registros visiveis.

Regras obrigatorias:

1. Professor acessa apenas alunos sob sua responsabilidade, salvo permissao ampliada.
2. Gestor pode acessar escopo `managed` ou `contract`, conforme configuracao.
3. Aluno acessa somente a propria visao operacional.
4. Dados clinicos, dores, medicamentos e historico tecnico exigem permissao especifica.
5. Backend bloqueia acesso indevido mesmo que o frontend oculte a UI.
6. Toda consulta sensivel deve filtrar `contractId`.

## Arquitetura evolutiva recomendada

Para preparar o sistema para evoluir, novas funcionalidades devem seguir estas regras:

- criar modulos pequenos por dominio, nao telas gigantes;
- versionar decisoes e prescricoes geradas;
- registrar auditoria de decisoes relevantes;
- evitar regras de negocio escondidas apenas no frontend;
- criar services testaveis no backend;
- atualizar contratos compartilhados em `packages/types` quando houver impacto web/API;
- adicionar testes para acesso permitido, negado e escopo de dados;
- preferir entregas pequenas e revisaveis;
- evitar migracoes destrutivas;
- criar seeds/demo quando o fluxo depender de dados de exemplo.

## Arquitetura-alvo de navegacao

```text
Atendimento
└── Alunos
    └── Consultar Aluno
        └── Aluno selecionado
            ├── Resumo
            ├── Treino de hoje
            ├── Prontuario
            │   ├── Objetivos
            │   ├── Anamnese
            │   ├── Historico de atividade
            │   ├── Medicamentos / procedimentos
            │   ├── Dores / desconfortos
            │   └── Agenda / rotina
            ├── Avaliacao Fisica
            │   ├── Antropometria
            │   ├── Adipometria
            │   ├── Bioimpedancia
            │   ├── Testes fisicos
            │   └── Historico
            ├── Prescricao
            │   ├── Resistido
            │   ├── Flexibilidade
            │   ├── Ciclico
            │   ├── Equilibrio
            │   └── Montagem Consolidada
            ├── Historico / Evolucao
            ├── Cadastro
            └── Vinculos
                ├── Professor responsavel
                ├── Servico contratado
                ├── Contrato
                ├── Agenda
                └── Financeiro
```

## Fases recomendadas

### Fase 0 - Governanca e documentacao

- Formalizar este documento.
- Criar plano de execucao ativo.
- Criar issues por fase.
- Nao alterar comportamento do sistema.

### Fase 1 - Navegacao e contexto do aluno

- Criar ou ajustar a experiencia de aluno selecionado.
- Organizar abas principais.
- Aplicar colapses quando a tela ficar longa.
- Garantir permissao por tela, bloco e dados.

### Fase 2 - Prontuario e avaliacao como entrada tecnica

- Consolidar PRNT como fonte antes da prescricao.
- Garantir historico de avaliacao fisica.
- Expor resumos consumiveis pela prescricao.
- Garantir auditoria e escopo de dados.

### Fase 3 - Prescricao por capacidades

- Criar estrutura tecnica para Resistido, Flexibilidade, Ciclico e Equilibrio.
- Criar status por capacidade.
- Vincular objetivos, alertas e feedback.
- Ainda nao gerar Treino de hoje diretamente.

### Fase 4 - Montagem Consolidada da Prescricao

- Receber blocos ativos e validados.
- Validar conflitos.
- Gerar versao operacional do Treino de hoje.
- Registrar versao, origem e justificativa.

### Fase 5 - Feedback e decisao sugerida

- Capturar feedback pos-treino.
- Gerar decisao sugerida.
- Exigir validacao final do professor.
- Registrar historico e linha do tempo.

### Fase 6 - Evolucoes futuras

- Integracoes com smartwatch.
- Notificacoes inteligentes.
- Relatorios evolutivos.
- Regras de decisao mais avancadas.

## Criterios globais de aceite

Antes de considerar cada fase pronta:

- `pnpm validate` deve passar ou a issue/PR deve explicar claramente o bloqueio.
- Rotas sensiveis devem validar permissao e `contractId`.
- UI deve ocultar telas, abas, blocos e acoes sem permissao.
- Testes devem cobrir pelo menos um acesso permitido e um negado nos fluxos sensiveis.
- Mudancas de schema devem ter migration nomeada e documentacao atualizada.
- O aluno nao deve ver justificativas tecnicas internas do professor.
- O Treino de hoje deve ser rastreavel ate a Montagem Consolidada que o gerou.
