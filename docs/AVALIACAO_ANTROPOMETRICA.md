# Avaliação Antropométrica

A Avaliação Antropométrica fica em **Avaliação Física > Antropometria** e mantém histórico persistente por aluno e contrato.

## Contrato funcional

- Cada avaliação recebe código sequencial gerado no backend no formato `ANTR-001`, `ANTR-002`, `ANTR-003`.
- O código pertence à avaliação, não ao segmento.
- Uma nova avaliação pode copiar medidas e observações da avaliação anterior conforme a configuração de importação do segmento, sem sobrescrever o histórico.
- Segmentos principais, opcionais e personalizados continuam cadastrados em `AnthropometrySegment`.
- A classificação `principal`, `opcional` ou `personalizado`, as flags de importação e a existência de valores históricos **não definem obrigatoriedade de conclusão**.
- A obrigatoriedade é explícita por segmento e contrato, possui versão e é configurada separadamente em `AnthropometrySegmentCompletionRequirement`.
- Enquanto nenhum segmento estiver explicitamente marcado como obrigatório, o backend permite trabalhar em rascunho, mas bloqueia a conclusão com `COMPLETION_CONFIGURATION_MISSING`.

## Ciclo de vida

A avaliação possui dois estados operacionais persistidos em `AnthropometryAssessmentLifecycle`:

- `DRAFT`: rascunho editável. Medidas, observações, data e responsável podem ser atualizados pelas rotas usuais.
- `COMPLETED`: histórico concluído e imutável pelas rotas usuais. Qualquer correção precisa usar o fluxo auditado.

Avaliações existentes antes da migration da issue #382 são preservadas como `COMPLETED` legado. Esse backfill não fabrica requisitos antigos: o snapshot registra `legacy=true` e mantém a ausência de configuração histórica explícita.

### Conclusão

`POST /api/v1/anthropometry/assessments/:id/complete`:

1. exige que a avaliação ainda esteja em `DRAFT`;
2. lê somente os requisitos explicitamente configurados como obrigatórios para o contrato;
3. bloqueia se não existir configuração obrigatória explícita;
4. exige valor persistido e não vazio para cada segmento obrigatório ativo;
5. grava `completedAt`, responsável e um snapshot da configuração aplicada, incluindo a versão de cada requisito;
6. cria evento canônico na linha do tempo do aluno com `domain=anthropometry` e `action=completed`.

O snapshot torna a conclusão reproduzível. Alterar a configuração futura de obrigatoriedade não invalida avaliações já concluídas.

## Correção auditada

Avaliação `COMPLETED` não volta a ser um rascunho comum. Correção usa `POST /api/v1/anthropometry/assessments/:id/corrections` e exige:

- motivo não vazio;
- permissão `students.actions.manageAssessments` no middleware e revalidada dentro da mesma transação serializável da escrita;
- `contractId` e professor ator derivados da autenticação;
- segmentos pertencentes ao mesmo contrato.

Cada correção grava em `AnthropometryAssessmentCorrection`:

- snapshot completo antes da alteração;
- snapshot completo depois da alteração;
- motivo;
- usuário e professor responsáveis;
- data/hora.

Correção sem mudança efetiva é rejeitada. A correção também gera evento canônico na linha do tempo com chave idempotente própria.

## Comparação e evolução

A tabela comparativa continua sendo a representação principal e acessível do histórico. O backend calcula, a partir dos valores persistidos:

- variação absoluta em relação à avaliação cronologicamente anterior;
- variação percentual quando o valor anterior é diferente de zero.

Regras importantes:

- valor ausente permanece ausente e nunca é convertido em zero;
- unidades diferentes não produzem variação automática;
- valor anterior zero produz variação absoluta, mas percentual fica indisponível;
- a ordem visual solicitada não altera a referência cronológica usada no cálculo.

O gráfico de evolução é complementar. Ele permite escolher um segmento e visualizar a série histórica, mas não substitui a tabela nem cria uma segunda fonte de cálculo.

## Segurança e isolamento

- As rotas exigem autenticação, contexto de professor e acesso à tela `physicalAssessment.protocol`.
- `contractId` vem da sessão autenticada e limita aluno, avaliação, segmento, configuração e auditoria.
- A correção concluída exige adicionalmente `students.actions.manageAssessments` e revalida a capacidade dentro da transação definitiva.
- `physicalAssessment.protocol` não pertence a `ACCESS_DATA_SCOPE_SCREEN_KEYS`; portanto não existe `dataScope` adicional para esta tela. Isso não elimina o isolamento por `contractId` e aluno.
- A UI usa permissões apenas para experiência; a API continua sendo a barreira de segurança.

## Persistência

Modelos Prisma preexistentes:

- `AnthropometryAssessment`
- `AnthropometryAssessmentValue`
- `AnthropometryObservation`
- `AnthropometrySegment`

Tabelas de lifecycle/auditoria implantadas pela migration `20260902010000_issue_382_anthropometry_lifecycle` e acessadas pelo módulo de domínio:

- `AnthropometrySegmentCompletionRequirement`
- `AnthropometryAssessmentLifecycle`
- `AnthropometryAssessmentCorrection`

Essas tabelas preservam `contractId` como barreira multi-tenant e usam FKs para avaliação, segmento, aluno, usuário e professor quando aplicável.

## Rotas principais

- `GET /api/v1/anthropometry/segments`
- `POST /api/v1/anthropometry/segments`
- `PUT /api/v1/anthropometry/segments/:id`
- `POST /api/v1/anthropometry/segments/reorder`
- `GET /api/v1/anthropometry/alunos/:alunoId/assessments`
- `GET /api/v1/anthropometry/alunos/:alunoId/assessments/last`
- `GET /api/v1/anthropometry/assessments/:id`
- `POST /api/v1/anthropometry/alunos/:alunoId/assessments`
- `PUT /api/v1/anthropometry/assessments/:id`
- `PUT /api/v1/anthropometry/assessments/:id/values`
- `PUT /api/v1/anthropometry/assessments/:id/observations`
- `POST /api/v1/anthropometry/assessments/:id/complete`
- `POST /api/v1/anthropometry/assessments/:id/corrections`
- `GET /api/v1/anthropometry/alunos/:alunoId/compare`

## Contrato para relatórios

A issue #382 deixa o histórico pronto para consumo futuro por relatórios por meio de:

- status e data de conclusão;
- snapshot dos requisitos aplicados;
- histórico de valores e observações;
- variações determinísticas;
- correções auditadas;
- eventos canônicos da linha do tempo.

A geração de relatórios não faz parte desta entrega.

## Limites desta entrega

A issue #382 altera apenas o domínio de Antropometria. Integrações ou mudanças de comportamento em Adipometria/ADPT permanecem fora de escopo e conservam o contrato anterior nesta entrega.

## Ativação operacional da conclusão

Antes de concluir a primeira avaliação criada após esta entrega, o contrato deve definir explicitamente quais segmentos são obrigatórios em **Configurações de segmentos**. Não existe preset automático de obrigatoriedade nesta migration.

Essa decisão é intencional: a issue #382 não define uma lista inicial autoritativa, e a implementação não usa a planilha legada, tipo de segmento ou flags de importação como substitutos dessa decisão.
