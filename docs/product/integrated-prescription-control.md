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

## Governanca da Fase 0

Esta fase consolida documentacao e limites de dominio. Ela nao cria banco, API, frontend, rotas, modelos, migrations nem comportamento novo.

### Fontes rastreadas

- `Ideias e estruturacao - Professor`: fonte de requisitos para avaliacao comparativa, prescricao por capacidades, montagem final, feedback pos-treino, smartwatch, indicadores de gestao e visoes separadas professor/aluno.
- `Sistema ACESSO - comunicacao Claudinei/Leandro`: fonte historica para proximas acoes, cadastro do aluno, cadastro de professores, Manual do Professor, Prof-PRNT, Prof-ANTR, Prof-ADPT e Catalogo.
- `ModeloTreinamento Combinado v. 3.12.8`: fonte de regras e estruturas de migracao do fluxo atual de treino, com 15 abas revisadas e mapeadas abaixo.
- Issues #132 a #139: fonte de fases, dependencias, criterios de aceite e limites de escopo.
- `docs/architecture/auth-and-access-control.md` e `docs/product/access-control.md`: fonte de controle por `screenKey`, `blockKey`, `dataScope` e `contractId`.

### Separacao obrigatoria de dominios

Cadastro, contrato, agenda, manual, avaliacao, prescricao e treino sao dominios relacionados, mas nao devem virar uma unica entidade ou tela gigante. Cada fase deve respeitar o limite abaixo.

| Dominio | Funcao no sistema | Nao deve virar |
| --- | --- | --- |
| Cadastro do aluno | Identificacao, contato, responsaveis, revisao periodica e dados administrativos do aluno. | Fonte tecnica de prescricao ou historico de avaliacao sobrescrito. |
| Contrato e servico vigente | Define plano, valor, regras comerciais, pagamento e escopo contratado. | Regra tecnica de treino ou permissao implicita para dado de saude. |
| Agenda e rotina | Contextualiza disponibilidade, rotina externa, sessoes e alocacao operacional. | Origem automatica de treino sem prescricao validada. |
| Manual do Professor | Conteudo de conduta, checklist, orientacao e operacao interna. | Motor de regra de negocio escondido ou substituto de validacao tecnica. |
| Prontuario e avaliacao | Fonte tecnica historica antes da prescricao. | Campos soltos sobrescritos no cadastro do aluno. |
| Prescricao por capacidade | Planejamento tecnico modular por Resistido, Flexibilidade, Ciclico e Equilibrio. | Treino de hoje publicado diretamente ao aluno. |
| Montagem Consolidada | Camada-mae que valida, combina e libera saida operacional. | Copia direta da aba `Montagem` sem conflito, versao ou professor responsavel. |
| Treino de hoje | Saida operacional segura e pratica para execucao. | Origem tecnica de prescricao, justificativa completa ou calculo oculto. |
| Feedback e decisao sugerida | Evidencia para proxima decisao, sempre validada pelo professor. | Alteracao automatica de prescricao ou treino liberado. |

### Privacidade, LGPD e dados sensiveis

Toda evolucao funcional futura deve aplicar minimizacao de dados, finalidade clara, rastreabilidade, permissao por bloco e filtro por contrato. Exemplos reais com dados pessoais nao devem ser copiados para fixtures, seeds, prints ou documentacao publica.

| Classe de dado | Exemplos | Regra documental para futuras fases |
| --- | --- | --- |
| Dados pessoais do aluno | Nome, documento, contato, nascimento, responsaveis, endereco, emergencia. | Usar apenas quando necessario para atendimento; proteger por `contractId`, escopo e permissao de cadastro. |
| Dados de saude | PAR-Q, AHA, anamnese, historico clinico, laudos, avaliacao fisica. | Tratar como sensivel; exigir `blockKey`, escopo efetivo, auditoria e separacao entre visao professor/aluno. |
| Medicamentos, cirurgias, dores e desconfortos | Medicacao, procedimento, intensidade de dor, mapa corporal, acompanhamento. | Manter historico por data e responsavel; nao sobrescrever versoes nem expor detalhe tecnico ao aluno sem finalidade pratica. |
| Dados financeiros e contrato | Valor, vencimento, pagamento, condicao especial, servico vigente, contrato. | Separar de prescricao tecnica; liberar somente para funcoes administrativas/gestao autorizadas. |
| Dados bancarios | Banco, agencia, conta, chave, comprovantes. | Proteger com permissao especifica, evitar duplicacao e nunca usar como criterio tecnico de treino. |
| Documentos do professor | CREF, contrato assinado, documentos profissionais, curriculo, foto. | Restringir por funcao; nao misturar com visao operacional do aluno. |
| Dados de treino e execucao | Carga, reps, PSE, PSR, aderencia, tonelagem, calorias, sessoes. | Usar como evidencia tecnica rastreavel; calculos criticos devem ficar em services/backend testaveis. |
| Dados externos e smartwatch | FC, pace, zonas, sono, estresse, recuperacao. | Entrar como evidencia importada com origem, data, consentimento/contrato e validacao tecnica antes de afetar decisao. |

### Formularios externos

Formularios externos atuais podem ser usados como referencia historica ou transicao operacional. Quando migrarem para o Sistema Acesso, devem virar fluxo interno com origem, aceite/assinatura quando aplicavel, data, responsavel, contrato, revisao periodica e auditoria. Eles nao devem continuar como fonte final sem rastreabilidade.

### Nucleo atual, backlog operacional e roadmap

| Categoria | Conteudo | Regra de evolucao |
| --- | --- | --- |
| Nucleo atual preservado | Cadastro de alunos e colaboradores, contratos, avaliacoes fisicas atuais, PRNT, planos, templates, Workout Builder, biblioteca, agenda, execucoes e permissoes. | Nao remover nem substituir sem migracao explicita, compatibilidade e criterio de aceite. |
| Backlog operacional | Revisao periodica de cadastro, PAR-Q/AHA internos, catalogo comercial, disponibilidade de colaboradores, materiais de sala, cobranca/notificacoes e Manual do Professor no app. | Criar issues proprias; nao misturar com prescricao tecnica quando o objetivo for administrativo ou operacional. |
| Roadmap | Smartwatch, WhatsApp/mensagens praticas, relatorios evolutivos, indicadores clinicos, integracoes externas e decisoes mais avancadas. | Preparar rastreabilidade agora, mas implementar apenas com issue propria e validacao de seguranca. |

## Recomendacoes complementares da planilha

A planilha `Ideias e estruturacao - Professor` trouxe itens que complementam o fluxo principal. Eles devem ser considerados como requisitos ou subissues nas fases correspondentes, evitando que o nucleo seja implementado de forma limitada demais.

### Avaliacao fisica avancada

- Baropodometria, ultrassom e ventilometria devem permitir comparacao pre e pos, com dados, imagens e laudos importaveis/configuraveis.
- Ventilometria deve ser preparada para gerar protocolo exportavel para smartwatch em etapa futura.
- Avaliacao fisica deve ser a fonte oficial dos dados-base usados pela prescricao, evitando digitacao duplicada.
- Flexibilidade deve alimentar a prescricao por articulacao, incluindo angulos, deficits, prioridades e sugestoes por pescoço, ombro, cotovelo, punho, dedos, quadril e joelho.

### Prescricao tecnica

- Prescricao ciclica deve considerar capacidade fisica, reversibilidade do estimulo e dados como LAn/%VO2max quando disponiveis.
- Sessoes devem permitir PSE esperado pelo professor.
- A montagem deve avaliar CIT alto ou relacao agudo/cronico elevada quando houver dados suficientes.
- A montagem deve priorizar seguranca diante de dor relevante, tontura, fadiga excessiva, queda de performance ou alerta vermelho.
- A prescricao validada deve poder gerar mensagem pratica para WhatsApp, sem transformar o WhatsApp em fonte tecnica do sistema.

### Smartwatch e dados externos

- O sistema deve ser preparado para exportar treino, principalmente aerobico, para smartwatch.
- Em etapa futura, deve importar execucao real: distancia, pace, FC media, FC maxima, tempo em zona, sono, estresse e recuperacao.
- Dados importados devem virar evidencia para feedback e decisao sugerida, mantendo validacao final do professor.

### Gestao operacional

- Gestao de alunos deve considerar status ativo a partir de servico, pagamento e resposta/aderencia do aluno.
- O aluno deve receber notificacao de proximidade de pagamento quando aplicavel.
- Gestores devem acompanhar aderencia: presencas, treinos realizados, feedbacks respondidos, licoes de casa cumpridas e atrasos de pagamento.
- Gestores devem visualizar disponibilidade de colaboradores para lotacao de alunos.
- Gestao de ambiente deve prever cadastro de materiais de sala.

### Relatorios e visao multidisciplinar

- A evolucao do aluno deve ter linha do tempo com avaliacoes, objetivos, ajustes de prescricao, feedbacks relevantes e indicadores.
- Relatorios multidisciplinares devem prever indicadores clinicos e de performance: peso, sono, qualidade do sono, sono REM/leve, exercicio aerobico/resistido, estresse, FC repouso, variabilidade de FC, pressao arterial, LDL, HDL, hemoglobina glicada, VO2max, circunferencia abdominal e percentual de gordura.
- Dados clinicos exigem permissao especifica, escopo por contrato e separacao clara entre visao tecnica e visao do aluno.

### Mapeamento da planilha `ModeloTreinamento Combinado v. 3.12.8`

A leitura completa registrada na issue #132 revisou 15 abas da planilha. Antes de qualquer implementacao funcional baseada nessas regras, cada item deve ser confirmado contra a documentacao da fase correspondente, migrado para services/backend testaveis quando for regra critica e protegido por contrato, auditoria e permissao quando envolver dado sensivel.

| Aba revisada | Dominio do sistema | Entidade/regra provavel | Fase principal | Observacao de governanca |
| --- | --- | --- | --- | --- |
| `Aluno` | Visao operacional do aluno | Contexto do aluno, treino disponivel, calendario/link, dicas e mensagens praticas. | #134 | Nao substituir cadastro atual; usar como referencia de organizacao e colapses. |
| `Macrociclo` | Planejamento tecnico | Planejamento macro/meso/micro, objetivo do mesociclo e parametros de carga. | #136 | Regras devem ser versionadas e validadas pelo professor. |
| `Montagem` | Montagem consolidada | Exercicios, series, repeticoes, carga, UC, metodos e blocos para consolidacao. | #137 | Nao pode gerar `Treino de hoje` diretamente sem camada de consolidacao. |
| `Rascunho rapido` | Apoio operacional de montagem | Copia/montagem rapida em estado de rascunho. | #137 | Deve permanecer como rascunho, sem publicacao sem validacao. |
| `Atualizar mesociclo` | Versionamento tecnico | Changelog de regras, ajustes de ciclo e transicao entre planejamento e montagem. | #136/#137 | Mudancas precisam preservar historico e origem da decisao. |
| `Conversor grupamento muscular` | Cadastro/regra de exercicios | Conversao/troca de grupamentos, presets e substituicoes rastreaveis. | #137 | Nao embutir como formula oculta de frontend. |
| `Biblioteca de Exercícios` | Biblioteca curada | Cadastro de exercicio, video, imagem, grupo muscular e atributos. | #137 | Preservar biblioteca atual e tratar importacoes como evolucao incremental. |
| `Exercícios matriz` | Matriz de exercicios | Base original de exercicios e atributos calculados/importados. | #137 | Migrar como cadastro auditavel quando virar dado operacional. |
| `Exercícios novos` | Curadoria/importacao | Fila de revisao/importacao de exercicios ainda nao consolidados. | #137 | Exigir revisao antes de disponibilizar em montagem/treino. |
| `Siglas e ambiente` | Parametros compartilhados | Parametros de ambiente, grupo muscular, siglas, estimulos e metodos. | #136 | Consolidar nomenclatura em contratos/tipos quando afetar API ou UI. |
| `Anotações gerais e Alertas` | Prontuario/feedback | Agenda semanal, observacoes e alertas tecnicos. | #135/#138 | Dados sensiveis exigem permissao, escopo e historico. |
| `Controle de dados` | Execucao e aderencia | Tonelagem, calorias, sessoes, tempo, constancia, prescritas, realizadas e saldo. | #138 | Usar como evidencia para feedback, nao como automacao sem professor. |
| `calculos externos` | Regras auxiliares | Textos/dicas e parametros auxiliares usados por formulas/mensagens. | #133/#136/#138 | Cada formula critica precisa virar service/backend com testes. |
| `Dados de Base` | Avaliacao/prontuario | Dados antropometricos/fisiologicos, ultima avaliacao e dados-base oficiais. | #135 | Avaliacao/prontuario seguem como fonte anterior a prescricao. |
| `Importar` | Importacao controlada | Ponte entre dados-base, avaliacao, macrociclo e montagem. | #135/#137 | Importacao deve registrar origem, responsavel, versao e contrato. |

Itens ainda nao transformados em entidade ou regra devem permanecer como documentacao ou subissue. A migracao funcional deve acontecer nas fases filhas, em PRs pequenos contra `develop`, sem reproduzir a planilha como tela gigante.

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
- baropodometria;
- ultrassom;
- ventilometria;
- flexibilidade;
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
- PSE esperado quando aplicavel;
- dados-base usados na prescricao;
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
- avaliar alertas de seguranca, CIT alto e carga agudo/cronica quando houver dados;
- organizar prioridade, ordem e combinacao;
- gerar versao operacional para o Treino de hoje;
- registrar versao gerada e justificativa;
- impedir que capacidades enviem treino diretamente ao aluno.

Exemplos de conflito:

- dor ativa no joelho + treino intenso de membro inferior;
- fadiga alta + intervalado forte;
- restricao de mobilidade + exercicio com amplitude elevada;
- baixa recuperacao + progressao automatica de carga;
- CIT alto ou relacao agudo/cronico elevada + nova carga intensa.

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
- aderencia ao planejado;
- dados externos importados, quando houver integracao validada.

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
            │   ├── Baropodometria
            │   ├── Ultrassom
            │   ├── Ventilometria
            │   ├── Flexibilidade
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
- Incluir dados-base e avaliacoes avancadas como extensoes planejadas.
- Garantir auditoria e escopo de dados.

### Fase 3 - Prescricao por capacidades

- Criar estrutura tecnica para Resistido, Flexibilidade, Ciclico e Equilibrio.
- Criar status por capacidade.
- Vincular objetivos, alertas e feedback.
- Considerar PSE esperado, prescricao ciclica por LAn/%VO2max e flexibilidade por articulacao.
- Ainda nao gerar Treino de hoje diretamente.

### Fase 4 - Montagem Consolidada da Prescricao

- Receber blocos ativos e validados.
- Validar conflitos.
- Avaliar alertas de seguranca, CIT e carga agudo/cronica quando houver dados.
- Gerar versao operacional do Treino de hoje.
- Registrar versao, origem e justificativa.

### Fase 5 - Feedback e decisao sugerida

- Capturar feedback pos-treino.
- Gerar decisao sugerida.
- Exigir validacao final do professor.
- Registrar historico e linha do tempo.
- Preparar entrada futura de dados de smartwatch.

### Fase 6 - Evolucoes futuras

- Integracoes com smartwatch.
- Notificacoes inteligentes.
- Relatorios evolutivos.
- Regras de decisao mais avancadas.
- Mensagens WhatsApp geradas a partir da prescricao validada.
- Indicadores de aderencia e status ativo por pagamento/resposta.
- Painel de disponibilidade de colaboradores e gestao de materiais.
- Relatorios multidisciplinares.

## Criterios globais de aceite

Antes de considerar cada fase pronta:

- `pnpm validate` deve passar ou a issue/PR deve explicar claramente o bloqueio.
- Rotas sensiveis devem validar permissao e `contractId`.
- UI deve ocultar telas, abas, blocos e acoes sem permissao.
- Testes devem cobrir pelo menos um acesso permitido e um negado nos fluxos sensiveis.
- Mudancas de schema devem ter migration nomeada e documentacao atualizada.
- O aluno nao deve ver justificativas tecnicas internas do professor.
- O Treino de hoje deve ser rastreavel ate a Montagem Consolidada que o gerou.
