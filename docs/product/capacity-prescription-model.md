# Prescrição por capacidades físicas

Este documento define a Fase 3 do fluxo integrado. A prescrição por capacidade é uma camada técnica anterior à Montagem Consolidada e nunca publica `Treino de hoje` diretamente.

## Capacidades iniciais

- Resistido.
- Flexibilidade.
- Cíclico.
- Equilíbrio.

A interface do professor apresenta essas capacidades em camadas distintas. A visão técnica contém justificativa, fontes, parâmetros, status e histórico; a mensagem do aluno permanece prática, segura e sem exposição desnecessária de dados sensíveis.

## Entidades persistentes

### Prescrição atual e versões imutáveis

`CapacityPrescription` identifica uma capacidade por `contractId + alunoId + capacity`. Cada gravação cria uma `CapacityPrescriptionVersion` contendo:

- aluno, contrato e professor responsável;
- capacidade, status e versão sequencial;
- origens técnicas e objetivos PRNT usados;
- justificativa técnica e resumo profissional;
- mensagem prática para aluno ou WhatsApp;
- alertas e condicionantes derivados ou explícitos;
- parâmetros técnicos e conjunto versionado aplicado;
- metodologia e data da versão;
- indicador obrigatório `publishesTodayWorkout = false`.

A escrita usa concorrência otimista por `expectedCurrentVersion`. Uma edição baseada em versão desatualizada retorna conflito e não cria uma versão.

### Fonte canônica dos parâmetros

Uma versão usa exatamente uma das estratégias abaixo:

1. **Um conjunto versionado do contrato:** o frontend envia um único ID em `parameterSetIds`. O backend rejeita cardinalidade maior que um, rejeita parâmetros manuais concorrentes, resolve o conjunto dentro do contrato e da capacidade, deriva a `methodologyVersion` canônica e grava o snapshot imutável em `parameters`.
2. **Configuração manual:** o frontend envia `parameters`, com `parameterSetIds` vazio e sem `methodologyVersion` externa.

A interface carrega os valores do conjunto selecionado para leitura e bloqueia sua edição. Para personalizar, o professor deve trocar para configuração manual. Isso impede que ID, metodologia e conteúdo técnico descrevam fontes diferentes.

### Fontes por capacidade

A seleção de fontes pertence à capacidade ativa, e não ao aluno como um conjunto global. Ao abrir uma prescrição existente:

- cada capacidade restaura somente os `sourceRefs` da própria última versão;
- fontes históricas ainda aparecem mesmo quando deixaram de constar da lista atual;
- novas avaliações, alertas ou preferências não são marcados automaticamente;
- desmarcar uma fonte afeta somente a capacidade ativa;
- uma nova versão preserva exatamente as fontes selecionadas pelo professor.

Ao trocar de aluno, objetivos, fontes, planejamento e rascunhos são limpos antes de carregar o próximo contexto. Respostas atrasadas de uma seleção anterior são descartadas.

### Planejamento macro, meso e micro

`CapacityPlanningCycle` registra planejamento por aluno e contrato em três níveis:

- macrociclo;
- mesociclo, vinculado ao macrociclo;
- microciclo, vinculado ao mesociclo.

Cada versão pode registrar objetivo, período, carga do microciclo, volume, frequência e parâmetros por capacidade. Quando um conjunto versionado estiver selecionado, o planejamento usa o mesmo snapshot canônico. A hierarquia é validada no backend. Os códigos de carga iniciais são `ADP`, `ORD`, `CHO` e `REG`, extraídos da planilha `ModeloTreinamento Combinado v. 3.12.8`.

### Catálogo técnico por contrato

`CapacityTechnicalCatalogItem` mantém itens versionados por contrato para:

- ambientes;
- grupos musculares;
- siglas;
- estímulos cíclicos;
- métodos;
- exercícios;
- cargas de microciclo;
- articulações;
- divisões de treino;
- zonas de repetição.

Somente uma versão fica atual para `contractId + category + code`. O frontend consome o catálogo; não mantém listas técnicas de domínio hardcoded.

### Classificação dos objetivos do PRNT

`ProntuarioGoalCapacityClassification` permite marcar cada objetivo com:

- Resistido;
- Flexibilidade;
- Cíclico;
- Equilíbrio;
- relação com avaliação;
- relação com plano de ação.

A classificação pertence ao mesmo aluno e contrato do objetivo e registra o professor que realizou a atualização.

## Parâmetros por capacidade

### Resistido

Prevê grupos musculares, método, divisão, séries, repetições, carga, reserva de repetições, PSE esperado e restrições do prontuário ou avaliação. A configuração manual expõe as restrições como lista explícita; alertas continuam condicionantes, sem decisão automática.

### Cíclico

Prevê categoria, princípio de reversibilidade, base das zonas, VO2max, LAn, tempo e distância totais, PSE e uma coleção de zonas. Cada zona pode registrar:

- nome;
- percentual mínimo e máximo;
- volume;
- pace;
- frequência cardíaca alvo.

Quando percentuais e frequência cardíaca máxima estão disponíveis, o backend pode calcular a faixa de FC usando FC máxima ou reserva cardíaca. Valores informados manualmente continuam rastreáveis no snapshot. A exportação para smartwatch não faz parte desta fase.

### Flexibilidade

A interface oferece seleção articular por checkbox. Cada articulação selecionada abre um bloco técnico com ângulo, déficit, prioridade e prescrição sugerida.

### Equilíbrio

Existe como capacidade própria, com foco, apoios, notas de progressão e PSE esperado.

## Fontes, autoria e dados-base

As origens são validadas no backend dentro do mesmo aluno e contrato. Fontes suportadas incluem objetivos e alertas do PRNT, avaliações físicas, antropometria, adipometria, bioimpedância, ultrassonografia, ventilometria, flexibilidade, preferências e notas do professor.

O endpoint `GET /api/v1/capacity-prescriptions/alunos/:alunoId/assessment-sources` projeta fontes de avaliação para a prescrição e exige simultaneamente:

- `plans.capacityPrescriptions.view`;
- `students.details.assessments`.

A projeção inclui:

- tipo e ID persistente da fonte;
- data e versão;
- código/origem;
- professor responsável, derivado de `performedByProfessorId`, `professorId` ou do usuário registrador no mesmo contrato;
- medições úteis para decisão técnica, com rótulo, valor e unidade.

No `POST /alunos/:alunoId`, o backend recalcula a autoria das fontes de avaliação e antropometria. Um `responsibleProfessorId` enviado pelo cliente não substitui o responsável canônico da fonte.

A tela apresenta como fontes selecionáveis, quando disponíveis:

- dores e acompanhamentos ativos ou monitorados;
- medicações e procedimentos;
- último mapa corporal de desconfortos;
- histórico de atividade física do PRNT;
- preferências e restrições do perfil segmentado, somente quando existe `StudentProfile` validável;
- avaliações segmentadas e antropometrias do aluno, com dados-base resumidos.

O backend deriva condicionantes para PRNT, preferências e avaliações. Esses alertas não alteram treino ativo automaticamente. A decisão permanece com o professor.

## Fórmulas versionadas de adipometria

A regra antes existente na planilha `Modelo Avaliação Física v.4.10.12`, aba `Avaliação`, linhas `Total de Dobras`, `% Gordura`, `Gordura Absoluta` e `Massa Magra`, foi formalizada em `capacity-prescription-formulas.ts`.

Versão: `guedes-1985-three-fold-siri-v1`.

Os coeficientes e as combinações de dobras correspondem ao protocolo de Guedes, com conversão da densidade corporal pela equação de Siri.

### Dobras usadas na densidade

- feminino: Subescapular + Suprailíaca + Coxa;
- masculino: Tricipital + Suprailíaca + Abdominal.

### Equações

```text
Densidade feminina = 1,1665 - 0,07063 × log10(soma das três dobras)
Densidade masculina = 1,17136 - 0,06706 × log10(soma das três dobras)
% gordura = (4,95 / densidade - 4,5) × 100
Gordura absoluta = peso × % gordura / 100
Massa magra = peso - gordura absoluta
```

O serviço valida peso e dobras positivas, exige ao menos três dobras e retorna a versão da fórmula junto dos resultados. Testes usam valores deliberadamente diferentes para os protocolos masculino e feminino.

Quando uma adipometria é selecionada como origem, `sourceVersion` guarda um snapshot serializado com data da fonte, entradas, resultados e versão da fórmula. Prescrições históricas não dependem de recalcular o resultado com dados ou código futuros. Avaliações sem sexo, peso ou dobras suficientes exibem `Status do cálculo` e são rejeitadas ao salvar, em vez de falharem silenciosamente.

## Contrato público da API

A API não retorna relações internas do Prisma. As respostas são serializadas para o contrato compartilhado:

- `sourceRefs`, e não `sources`;
- `linkedProntuarioGoalIds`, e não objetos internos de vínculo;
- datas em ISO-8601;
- `publishesTodayWorkout` sempre `false`.

Base: `/api/v1/capacity-prescriptions`

- `GET /alunos/:alunoId`: lista capacidades atuais.
- `POST /alunos/:alunoId`: cria ou versiona uma capacidade.
- `GET /alunos/:alunoId/assessment-sources`: lista fontes canônicas de avaliação.
- `GET /:id`: consulta uma capacidade.
- `GET /:id/versions`: consulta histórico.
- `GET /parameters`: lista parâmetros por contrato.
- `POST /parameters`: versiona parâmetros.
- `GET /catalog`: lista catálogo técnico.
- `POST /catalog`: versiona item do catálogo.
- `GET /alunos/:alunoId/planning`: lista ciclos.
- `POST /alunos/:alunoId/planning`: versiona ciclo.
- `GET /alunos/:alunoId/goal-classifications`: lista classificações de objetivos.
- `PUT /alunos/:alunoId/goals/:goalId/classification`: atualiza classificação.

Campos desconhecidos são rejeitados. `contractId`, professor ator, metodologia canônica, autoria das fontes e permissões são derivados ou revalidados no backend.

## Seed e equivalência com planilhas

O comando abaixo cria dados idempotentes por contrato:

```bash
pnpm --filter @corrida/api db:seed-capacity-prescriptions
```

O seed cobre bases das quatro capacidades, ADP/ORD/CHO/REG, métodos, divisões, zonas de repetição, estímulos cíclicos, ambientes, grupos musculares, articulações e exercícios de demonstração.

As fontes funcionais são as abas `Macrociclo`, `Siglas e ambiente`, `calculos externos` e `Montagem` do `ModeloTreinamento Combinado v. 3.12.8`, `Ideias e estruturação - Professor`, `Sistema ACESSO - comunicação Claudinei/Leandro` e a fórmula de composição corporal do `Modelo Avaliação Física v.4.10.12`.

## Interface do professor

Rota: `/protocolo-avaliacao-fisica/prescricao-capacidades`.

A tela permite:

- selecionar o aluno, limpando imediatamente o contexto anterior;
- classificar objetivos do PRNT;
- alternar entre as quatro capacidades por clique ou teclado;
- restaurar e editar fontes separadamente por capacidade;
- visualizar dados-base e autoria das avaliações;
- registrar status, justificativa, resumo e mensagem do aluno;
- aplicar um conjunto versionado do contrato como fonte canônica;
- preencher configuração manual quando nenhum conjunto for selecionado;
- editar zonas cíclicas completas;
- registrar restrições resistidas e notas de progressão de equilíbrio;
- selecionar articulações por checkbox;
- versionar macrociclo, mesociclo e microciclo;
- consultar a última versão de cada capacidade ao carregar o aluno.

Estados de carregamento, erro, ausência de objetivos, ausência de fontes e falta de permissão são apresentados explicitamente.

## Autorização e isolamento

Blocos de acesso:

- `plans.capacityPrescriptions.view`;
- `plans.capacityPrescriptions.manage`;
- `settings.parameters.capacityPrescriptions`;
- `students.details.assessments`, adicionalmente para consultar fontes de avaliação.

Aluno, professor, objetivo, parâmetro, catálogo, ciclo e origem são filtrados por `contractId`. Recursos inexistentes e recursos de outro tenant usam resposta genérica quando o sigilo exigir não enumeração.

## Testes discriminantes

Os testes cobrem:

- rejeição de mais de um conjunto versionado por capacidade;
- rejeição de conjunto e parâmetros manuais concorrentes;
- metodologia derivada do conjunto, ignorando valor forjado pelo cliente;
- autoria da avaliação derivada no backend;
- dados-base e unidades na projeção de fontes;
- fórmula de adipometria masculina e feminina;
- atribuição explícita ao protocolo de Guedes/Siri;
- snapshot histórico da adipometria com entradas, resultados e versão;
- erro explícito quando a adipometria não é calculável;
- restauração de fontes por capacidade;
- fonte nova não marcada automaticamente;
- zonas cíclicas com volume, pace e FC;
- restrições resistidas e progressão de equilíbrio;
- troca de aluno sem transporte de dados;
- autorização, isolamento por tenant e bloqueio de publicação direta.

## Limites preservados

- Não substitui `TrainingPlan`, `PeriodizationMatrix`, estímulos, templates, dias, exercícios ou execuções.
- Não implementa Montagem Consolidada.
- Não gera nem libera `Treino de hoje`.
- Não executa progressão automática.
- Não exporta para smartwatch nesta fase.
- Não copia justificativa técnica sensível para a mensagem do aluno.

### Invariantes na fronteira de domínio

- Cada versão referencia no máximo um conjunto técnico versionado por capacidade.
- Um conjunto versionado e parâmetros manuais são mutuamente exclusivos.
- `methodologyVersion` é derivada do conjunto persistido no mesmo contrato e capacidade; o cliente não define esse metadado.
- Conjuntos históricos permanecem disponíveis para leitura e preservação da proveniência de versões anteriores.
- Notas técnicas livres têm autoria e origem normalizadas no backend; fontes persistidas são reconstruídas da respectiva fonte canônica.
