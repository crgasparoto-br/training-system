# Levantamento de conclusão da épica #172

## Objetivo

Registrar o estado real da épica #172 na branch `develop`, separar o que já está implementado do que permanece pendente e definir os recortes necessários para considerar a trilha de avaliações e antropometria efetivamente concluída.

## Fontes verificadas

- issue #172 e subissues #183 e #184;
- PRs #197, #198, #202 e #203;
- `apps/web/src/pages/PhysicalAssessment/AnthropometryScreen.tsx`;
- `apps/web/src/hooks/useAnthropometry.ts`;
- componentes de resumo e histórico da Central do Aluno;
- roadmap da Central do Aluno.

## Estado real em 2026-07-10

A épica foi encerrada no GitHub após a entrega das subissues #183 e #184. O encerramento representa a conclusão do primeiro recorte funcional da Central do Aluno, mas não significa que toda a Fase 5 do roadmap esteja concluída.

### Implementado

- card de avaliações na Central do Aluno;
- estados de avaliação inexistente, pendente, em dia e vencida;
- exibição da última avaliação, tipo, data e responsável quando disponíveis;
- exibição da próxima reavaliação quando disponível;
- histórico recente por data, tipo, responsável, origem e status;
- ação contextual para iniciar nova antropometria mantendo `alunoId`;
- bloqueio de troca acidental do aluno quando o fluxo é iniciado pela Central;
- exigência de aluno, data e professor responsável antes da criação ou gravação;
- criação de avaliação antropométrica sequencial;
- edição da avaliação antropométrica atual;
- histórico de avaliações anteriores em modo somente leitura;
- comparação lado a lado das avaliações antropométricas existentes;
- segmentos antropométricos configuráveis;
- observações gerais e observações importáveis para a próxima avaliação;
- estados de carregamento, ausência de histórico e erro no fluxo de antropometria;
- retorno explícito para a Central do Aluno.

### Implementado parcialmente ou sem comprovação completa

- atualização do card e do histórico após salvar: o fluxo persiste os dados, mas precisa de validação automatizada e manual de atualização imediata em todos os caminhos;
- integração com o histórico unificado: há histórico próprio e resumo na Central, mas deve ser confirmado que cada conclusão relevante gera evento rastreável no endpoint de timeline;
- regra de avaliação em dia ou vencida: existe comportamento visual, porém a regra de negócio precisa ser documentada como fonte de verdade;
- permissões e `contractId`: o sistema possui infraestrutura de acesso, mas não há evidência suficiente nesta trilha de testes específicos de leitura, criação e edição da antropometria por perfil, bloco, escopo e contrato;
- medidas obrigatórias e opcionais: os segmentos são configuráveis, porém ainda falta uma regra explícita de obrigatoriedade por protocolo e validação de conclusão;
- preparação para laudo: os dados históricos existem, mas ainda não há contrato documentado do conjunto mínimo de dados que a futura geração de laudo poderá consumir.

### Não implementado nesta épica

- gráficos de evolução;
- comparação analítica com variação absoluta e percentual por medida;
- protocolo completo de adipometria;
- cálculos de percentual de gordura, gordura absoluta e massa magra;
- laudos finais ou geração de PDF;
- definição formal de rascunho versus avaliação concluída;
- validação completa de protocolo antes de marcar uma avaliação como concluída;
- suíte específica cobrindo permissões, `contractId`, atualização do card e timeline após salvamento.

## Divergência entre issue e roadmap

A issue #172 foi limitada a um recorte incremental e colocou gráficos completos, protocolos completos de adipometria e laudos fora de escopo. Entretanto, o roadmap da Fase 5 descreve uma entrega maior, incluindo formulário completo, medidas obrigatórias e opcionais, gráficos, validações e preparação para laudo.

Portanto:

- a issue #172 pode permanecer encerrada como primeiro incremento funcional;
- a Fase 5 não deve ser marcada como concluída;
- os itens restantes precisam virar novas issues antes de avançar para adipometria ou laudos.

## Trabalho necessário para concluir a Fase 5

### 1. Formalizar o ciclo de vida da avaliação antropométrica

Definir estados como rascunho e concluída, campos mínimos para conclusão, comportamento de edição após conclusão e regra para criação de nova versão sem sobrescrever histórico.

### 2. Definir protocolos e obrigatoriedade das medidas

Documentar quais segmentos são padrão, quais são opcionais, quais são obrigatórios por protocolo e como sexo, idade ou configuração institucional afetam a coleta.

### 3. Fortalecer rastreabilidade e timeline

Garantir que criação, conclusão e alterações relevantes da avaliação registrem aluno, contrato, responsável, data, origem e evento no histórico unificado.

### 4. Validar permissões e escopo de dados

Criar testes para perfis autorizados e não autorizados, leitura e escrita por bloco, isolamento por `contractId` e comportamento de acesso direto às rotas.

### 5. Completar comparação evolutiva

Além da tabela lado a lado, calcular e apresentar diferença absoluta e percentual por medida, mantendo unidade, data, responsável e tratamento de valores ausentes.

### 6. Criar gráficos de evolução

Implementar somente após estabilizar protocolos, valores históricos e comparação. Os gráficos devem preservar datas, unidades e origem dos dados.

### 7. Preparar contrato de dados para laudo

Definir quais dados da antropometria serão consumidos pela futura Fase 10, sem gerar laudo nesta etapa.

### 8. Fechar testes e validação manual

Cobrir ao menos:

- aluno sem avaliação;
- criação a partir da Central;
- salvamento com cabeçalho incompleto;
- múltiplas avaliações e comparação;
- medidas obrigatórias ausentes;
- atualização do card após conclusão;
- criação de evento no histórico unificado;
- permissões e isolamento por contrato;
- estados de carregamento, vazio e erro.

## Subissues recomendadas

1. Definir ciclo de vida e critérios de conclusão da antropometria.
2. Definir protocolos, segmentos obrigatórios e opcionais.
3. Garantir timeline e rastreabilidade de avaliações concluídas.
4. Cobrir permissões e isolamento por `contractId`.
5. Evoluir comparação com diferenças absolutas e percentuais.
6. Criar gráficos históricos de antropometria.
7. Definir contrato de dados da antropometria para laudos futuros.
8. Consolidar testes automatizados e roteiro de validação manual da Fase 5.

## Critério para considerar a Fase 5 concluída

A Fase 5 somente deve ser marcada como concluída quando todas as condições abaixo estiverem atendidas:

- ciclo de vida da avaliação definido;
- protocolos e obrigatoriedade de medidas definidos;
- histórico imutável e rastreável;
- comparação evolutiva completa;
- permissões e `contractId` testados;
- card e timeline atualizados após conclusão;
- gráficos implementados ou formalmente movidos para outra fase por decisão de produto;
- contrato de dados para laudo documentado;
- testes automatizados e validação manual concluídos.
