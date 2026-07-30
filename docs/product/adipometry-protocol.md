# Adipometria (ADPT) — protocolos e política histórica

## Status deste documento

Esta é a fonte canônica dos protocolos ADPT. Nenhum protocolo pode produzir uma avaliação concluída enquanto não estiver com estado `approved` e todos os campos clínicos abaixo estiverem preenchidos e aprovados.

Responsável técnico pelo documento: equipe do Sistema ACESSO.
Responsável pela aprovação clínica: **pendente**.
Data da aprovação clínica: **pendente**.

## Estados de protocolo

- `draft`: definição incompleta ou ainda não aprovada; pode ser exibida apenas como indisponível.
- `approved`: fórmula, população, critérios, limites, arredondamento, referência e vetores aprovados.
- `disabled`: protocolo anteriormente conhecido, mas explicitamente indisponível para novos cálculos.

Uma avaliação concluída preserva `protocolCode`, `protocolVersion` e um snapshot integral. Alterações futuras não recalculam registros antigos.

## Catálogo inicial

### GUEDES_ADULT_V1

- Nome: Guedes — adultos.
- Versão interna: `1`.
- Estado: `draft`.
- Referência bibliográfica: pendente de aprovação clínica.
- População aplicável: adultos; faixa etária, critérios de sexo e demais restrições pendentes.
- Idade: calculada em anos completos na data da avaliação.
- Dobras previstas pela documentação funcional: tricipital, subescapular, suprailíaca, abdominal e coxa, em milímetros.
- Equação: não registrada neste documento porque ainda não foi aprovada.
- Entradas, limites, alertas, bloqueios, precisão e arredondamento: pendentes.
- Saídas esperadas: percentual de gordura, gordura absoluta em kg e massa magra em kg.
- Vetores de teste: pendentes.
- Aprovador e data: pendentes.

**Regra:** permanece indisponível para finalização até que todos os itens pendentes sejam preenchidos, revisados e aprovados.

### SLAUGHTER_V1

- Nome: Slaughter.
- Versão interna: `1`.
- Estado: `disabled`.
- Referência, variantes, população, critérios de sexo/idade/maturação, equações e vetores: incompletos.

**Regra:** não pode ser selecionado para cálculo ou finalização. Sua presença no catálogo serve apenas para registrar a incompatibilidade da documentação funcional atual.

## Pontos de medida ADPT v1

| Código | Nome | Unidade |
|---|---|---|
| `TRICEPS` | Tricipital | mm |
| `SUBSCAPULAR` | Subescapular | mm |
| `SUPRAILIAC` | Suprailíaca | mm |
| `ABDOMINAL` | Abdominal | mm |
| `THIGH` | Coxa | mm |

A primeira versão armazena um único valor consolidado por ponto. Leituras repetidas e médias estão fora do escopo.

## Regras de disponibilidade

Um protocolo só é compatível quando:

1. está `approved`;
2. a versão solicitada existe e está ativa;
3. data de nascimento, sexo e maturação exigidos estão disponíveis;
4. idade na data da avaliação pertence à população aprovada;
5. todas as dobras exigidas estão presentes e dentro dos limites de bloqueio;
6. alertas foram apresentados sem transformar alerta em bloqueio;
7. referência, fórmula, precisão, arredondamento e vetores estão registrados.

Dados ausentes ou incompatíveis retornam motivo estruturado e impedem a conclusão. Resultados derivados nunca são aceitos como autoridade do frontend.

## Precisão e arredondamento

Enquanto não houver aprovação clínica:

- medidas são persistidas em `Decimal(8,2)`;
- resultados são persistidos em `Decimal(8,4)`;
- nenhum arredondamento clínico é presumido;
- protocolos `draft` e `disabled` não produzem resultado final.

A regra aprovada deverá definir cálculo interno, casas exibidas e modo de arredondamento, acompanhados de vetores de teste.

## Rascunho, conclusão e correção

- Um rascunho pode existir incompleto e ser retomado.
- A conclusão exige protocolo aprovado, entradas compatíveis e resultados calculados pelo backend.
- Uma avaliação concluída é imutável pelo fluxo comum e não pode ser excluída fisicamente.
- Correção cria nova versão vinculada à original, com motivo e autor obrigatórios.
- O registro anterior permanece concluído e auditável; a nova versão aponta `correctsAssessmentId` e a anterior aponta `correctedByAssessmentId`.
- Comparações e Central do Aluno usam a versão corrente: a avaliação concluída mais recente da cadeia de correção. Versões substituídas permanecem disponíveis para auditoria.
- Toda conclusão, tentativa bloqueada, correção e mudança sensível gera evento de auditoria com valores antes/depois quando aplicável.

## Código sequencial e concorrência

A sequência é independente por `contractId` e `alunoId`. A criação deve ocorrer em transação, bloqueando a linha de sequência e incrementando-a junto com a avaliação. A restrição única é `(contractId, alunoId, sequenceNumber)`.

A apresentação usa `ADPT-` mais o número com no mínimo três dígitos:

- 1 → `ADPT-001`;
- 999 → `ADPT-999`;
- 1000 → `ADPT-1000`.

Não existe limite funcional em 999.

## Snapshot reproduzível

Ao concluir, `calculationSnapshot` deve conter, no mínimo:

- entradas normalizadas e unidades;
- idade calculada na data da avaliação;
- atributos demográficos usados;
- código e versão do protocolo;
- referência bibliográfica e equações aprovadas;
- limites, alertas, bloqueios, precisão e arredondamento;
- resultados não arredondados e persistidos;
- versão da implementação do cálculo;
- timestamp do cálculo.

## Vetores de teste

Não há vetor aprovado nesta versão. Portanto, nenhum protocolo está habilitado para conclusão. A inclusão de um protocolo `approved` exige vetores com entradas, resultados intermediários e resultados finais esperados.