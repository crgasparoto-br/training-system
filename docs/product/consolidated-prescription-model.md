# Montagem Consolidada da Prescrição

Este documento é a fonte de verdade do domínio persistente da Montagem Consolidada da Prescrição, introduzido pela issue #316 e subordinado ao fluxo integrado definido em `integrated-prescription-control.md`.

## Papel no fluxo integrado

```text
PRNT / Avaliação Física
  -> Prescrição por capacidades
  -> Montagem Consolidada da Prescrição
  -> Treino de hoje
  -> Feedback pós-treino
```

A Montagem Consolidada é a fronteira persistente entre planejamento técnico e futura saída operacional. Ela não publica `Treino de hoje` diretamente nesta fase.

## Autoridades

- `contractId` vem do contexto autenticado do backend.
- `alunoId` é resolvido no contexto do aluno dentro do contrato.
- o professor autor e o professor responsável técnico precisam pertencer ao mesmo contrato;
- versão corrente, estado, atores de revisão/aprovação/bloqueio e timestamps são definidos pelo backend;
- o cliente referencia capacidades somente por `CapacityPrescriptionVersion.id`;
- o cliente não envia `CapacityPrescriptionDraft` como autoridade persistente;
- `released` existe no contrato persistente, mas não possui comando operacional nesta issue; sua transição pertence à #320.

## Agregado e histórico

Existe no máximo uma cadeia lógica de Montagem Consolidada por `(contractId, alunoId)`.

`ConsolidatedPrescription` guarda a identidade do agregado e o ponteiro sequencial `currentVersion`. `ConsolidatedPrescriptionVersion` é append-only: toda gravação material cria uma nova versão e mantém `previousVersionId` apontando para a revisão anterior.

A versão corrente é atualizada por comparação de `expectedCurrentVersion`. A atualização usa CAS no banco; duas escritas baseadas na mesma versão não podem avançar silenciosamente.

Uma nova revisão após `approved` ou, futuramente, `released` continua no mesmo agregado e cria uma nova versão `draft`, sem reescrever o histórico anterior.

## Estados e transições

Estados persistidos:

- `draft`;
- `ready_for_review`;
- `approved`;
- `released`;
- `blocked`;
- `archived`.

Transições operacionais desta fase:

| Origem | Comando | Destino | Regra |
| --- | --- | --- | --- |
| `draft` | enviar para revisão | `ready_for_review` | cria nova versão e registra revisor/data no backend |
| `ready_for_review` | aprovar | `approved` | cria nova versão; conflito crítico impede aprovação |
| `ready_for_review` | bloquear | `blocked` | cria nova versão e exige motivo |
| `draft`, `ready_for_review`, `approved`, `blocked`, `released` | editar composição | `draft` | cria nova revisão na mesma cadeia |
| qualquer | liberar | `released` | fora de escopo da #316; pertence à #320 |
| `archived` | editar/transicionar | — | não permitido nesta fase |

Aprovação e bloqueio nunca são obtidos enviando `status` arbitrário em payload de composição.

## Referências às capacidades

Cada `ConsolidatedPrescriptionCapacityBlock` guarda:

- `capacityPrescriptionVersionId` canônico;
- capacidade resolvida pelo backend;
- número da versão resolvido pelo backend;
- status imutável daquela versão no momento da composição;
- posição do bloco.

O service resolve o ID em `CapacityPrescriptionVersion` filtrando simultaneamente por `contractId` e `alunoId`. A migration instala também um trigger de escopo para impedir vínculo cross-tenant/cross-student por escrita direta.

A FK para `CapacityPrescriptionVersion` usa `ON DELETE RESTRICT`. Alterar, suspender ou substituir uma capacidade posteriormente não modifica montagens históricas.

## Dados-base e rastreabilidade

Origens já preservadas na versão imutável da capacidade são derivadas pelo backend e gravadas como `capacity_source`; o cliente não pode declará-las.

Referências adicionais podem usar papéis:

- `assessment`;
- `routine`;
- `manual_observation`;
- `exercise_substitution`.

Cada referência guarda somente identificação suficiente para auditoria: tipo, ID, rótulo opcional, data, origem, versão e contexto mínimo. Dados clínicos completos não devem ser copiados para a montagem quando a fonte canônica já existir.

## Concorrência e imutabilidade

Toda mutação material recebe `expectedCurrentVersion` depois da criação inicial. O update do agregado é condicionado à versão corrente observada. Se outra escrita avançar primeiro, o service retorna conflito e a transação não persiste uma nova versão.

Versões históricas não são atualizadas. Transições de estado clonam a composição anterior para uma nova versão, adicionando metadados de revisão/aprovação/bloqueio sem modificar a revisão de origem.

## Contratos compartilhados

`packages/types/consolidated-prescription.ts` separa:

- resumo do agregado atual;
- detalhe de versão;
- referência de capacidade por ID persistido;
- referência de dado-base;
- criação de rascunho;
- atualização com `expectedCurrentVersion`;
- comandos de revisão, aprovação e bloqueio;
- histórico;
- conflitos e alertas.

O alias legado `CreateConsolidatedPrescriptionAssemblyPayload` aponta para o novo payload de criação, mas não aceita mais `contractId`, `status`, `version`, ator ou timestamp de aprovação/liberação.

## Persistência

A migration `20260808165000_issue_316_consolidated_prescription_persistence` é aditiva e cria:

- `ConsolidatedPrescription`;
- `ConsolidatedPrescriptionVersion`;
- `ConsolidatedPrescriptionCapacityBlock`;
- `ConsolidatedPrescriptionDataRef`.

Ela não altera nem remove `WorkoutTemplate`, `WorkoutDay`, `WorkoutExercise`, planos ou execuções atuais.

Detalhes de índices, FKs, triggers e isolamento ficam em `../database/consolidated-prescription.md`.

## Limites desta fase

Ficam fora da #316:

- endpoints HTTP completos;
- tela da montagem;
- motor completo de conflitos;
- integração final com Workout Builder;
- geração/liberação de `Treino de hoje`;
- feedback pós-treino;
- comando operacional de `released`.
