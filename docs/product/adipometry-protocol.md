# Adipometria (ADPT) — protocolos e política histórica

## Status deste documento

Esta é a fonte canônica dos protocolos ADPT. Nenhum protocolo pode produzir uma avaliação concluída enquanto não estiver com estado `approved` e todos os campos clínicos desta fonte estiverem preenchidos e formalmente aprovados.

Responsável técnico pelo documento: equipe do Sistema ACESSO.
Responsável pela aprovação clínica: **pendente**.
Data da aprovação clínica: **pendente**.

A fundação estrutural pode ser implantada, mas a issue #246 permanece aberta até existir ao menos um protocolo clínico completo, aprovado e testável.

## Fronteira do domínio

`AdipometryAssessment` é o histórico próprio da ADPT. Categorias genéricas chamadas “adipometria” em registros de avaliação ou em snapshots de prescrição por capacidades são consumidores auxiliares e não autorizam conclusão ADPT, não aprovam protocolo e não substituem esta fonte canônica.

## Estados de protocolo

- `draft`: definição incompleta ou ainda não aprovada; pode aparecer somente como indisponível.
- `approved`: fórmula, população, critérios, limites, arredondamento, referência e vetores completos e aprovados.
- `disabled`: versão anteriormente aprovada ou protocolo conhecido, indisponível para novos cálculos.

A definição clínica de uma versão aprovada é imutável. Alteração de fórmula ou regra cria nova versão. A disponibilidade operacional pode transicionar uma única vez de `approved` para `disabled`, sem modificar definição, referência ou aprovação. Uma versão `disabled` não pode ser reativada; uma nova disponibilização exige nova versão e nova aprovação.

Uma avaliação concluída preserva `protocolCode`, `protocolVersion` e snapshot integral; desativação ou versões futuras não recalculam registros antigos.

## Conteúdo obrigatório para aprovação

O snapshot de definição de uma versão aprovada usa contrato versionado e contém, no mínimo:

- `schemaVersion` positiva;
- população com idade mínima e máxima, critérios de sexo e maturação;
- exatamente as cinco dobras ADPT documentadas;
- unidades explícitas de cada entrada e saída;
- equações identificadas, com expressão, variáveis e saídas de percentual, gordura absoluta e massa magra;
- limites de bloqueio por entrada e uma coleção explícita de alertas;
- precisão de medidas, resultados e cálculo interno;
- modo e estágio de arredondamento;
- comportamento estruturado para dado ausente e perfil incompatível;
- no mínimo dois vetores com entradas completas, resultados esperados e tolerâncias;
- registro de aprovação clínica com aprovador, data, identificador e SHA-256 do artefato aprovado;
- referência bibliográfica rastreável.

A persistência rejeita estado `approved` quando o contrato estiver ausente, incompleto, usar dobras diferentes, não trouxer equações para todas as saídas, possuir menos de dois vetores ou quando o registro de aprovação divergir das colunas históricas. Objetos genéricos como `{ "fixture": true }` não satisfazem o gate.

Fixtures estruturais usadas pelo CI existem somente durante os testes, obedecem ao mesmo formato completo e não são seed de produto nem aprovação clínica real.

## Catálogo inicial

### GUEDES_ADULT_V1

- Nome: Guedes — adultos.
- Versão interna: `1`.
- Estado: `draft`.
- Referência bibliográfica: pendente de aprovação clínica.
- População aplicável: adultos; faixa etária, critérios de sexo e demais restrições pendentes.
- Idade: calculada em anos completos na data da avaliação.
- Dobras previstas pela documentação funcional: tricipital, subescapular, suprailíaca, abdominal e coxa, em milímetros.
- Equação: não registrada porque ainda não foi aprovada.
- Entradas, limites, alertas, bloqueios, precisão e arredondamento: pendentes.
- Saídas esperadas: percentual de gordura, gordura absoluta em kg e massa magra em kg.
- Vetores de teste: pendentes.
- Aprovador e data: pendentes.

**Regra:** permanece indisponível para cálculo conclusivo e finalização até que todos os itens pendentes sejam preenchidos, revisados e aprovados.

### SLAUGHTER_V1

- Nome: Slaughter.
- Versão interna: `1`.
- Estado: `disabled`.
- Referência, variantes, população, critérios de sexo/idade/maturação, equações e vetores: incompletos.

**Regra:** não pode ser selecionado para cálculo ou finalização. Sua presença registra a incompatibilidade da documentação funcional atual.

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

Um protocolo somente é compatível quando:

1. está `approved`;
2. a versão solicitada existe;
3. data de nascimento, sexo e maturação exigidos estão disponíveis;
4. idade na data da avaliação pertence à população aprovada;
5. todas as dobras exigidas estão presentes e dentro dos limites de bloqueio;
6. alertas foram apresentados sem serem convertidos silenciosamente em bloqueio;
7. referência, fórmula, precisão, arredondamento e vetores estão registrados.

Dados ausentes ou incompatíveis retornam motivo estruturado e impedem conclusão. Resultados derivados nunca são aceitos como autoridade do frontend.

## Precisão e arredondamento

Enquanto não houver aprovação clínica:

- medidas usam capacidade de persistência `Decimal(8,2)`;
- resultados usam capacidade de persistência `Decimal(8,4)`;
- nenhum arredondamento clínico é presumido;
- protocolos `draft` e `disabled` não produzem resultado final.

A regra aprovada deverá definir precisão interna, casas exibidas e modo de arredondamento, acompanhados de vetores independentes.

## Rascunho, conclusão e correção

- Um rascunho pode existir incompleto e ser retomado.
- Resultados derivados e snapshot não são persistidos em rascunho.
- A conclusão exige protocolo aprovado, entradas compatíveis e resultados calculados pelo backend.
- Uma avaliação concluída é imutável pelo fluxo comum e não pode ser excluída fisicamente.
- Correção cria nova versão vinculada à vigente, com motivo e autor obrigatórios.
- A versão anterior permanece concluída e auditável; a nova aponta `correctsAssessmentId` e a anterior recebe `correctedByAssessmentId` atomicamente.
- `correctedByAssessmentId` é gerenciado exclusivamente pelo trigger de vínculo recíproco. Escrita direta em rascunho, remoção manual do vínculo ou associação sem correção concluída correspondente são rejeitadas.
- Comparações e Central do Aluno usam a versão corrente da cadeia. Versões substituídas permanecem disponíveis para auditoria.
- Criações, atualizações persistidas, conclusões e correções geram eventos append-only no banco.
- Tentativas bloqueadas e decisões de autorização serão auditadas pela API da issue #247, fora da transação rejeitada.

## Código sequencial e concorrência

A sequência é independente por `contractId` e `alunoId`. A criação ocorre em transação e o `UPSERT` do contador serializa concorrência. Falha na criação reverte também o incremento.

A apresentação usa `ADPT-` mais o número com no mínimo três dígitos:

- 1 → `ADPT-001`;
- 999 → `ADPT-999`;
- 1000 → `ADPT-1000`.

Não existe limite funcional em 999.

## Snapshot reproduzível

Ao concluir, `calculationSnapshot` contém, no mínimo:

- entradas normalizadas e unidades;
- idade calculada na data da avaliação;
- atributos demográficos usados;
- código e versão do protocolo;
- equações, limites, precisão e arredondamento;
- resultados persistidos;
- versão da implementação do cálculo;
- timestamp do cálculo.

A persistência verifica a estrutura e a igualdade entre protocolo, data, entradas e resultados do snapshot e as colunas históricas.

## Vetores de teste

Não há vetor clínico aprovado nesta versão. Portanto, nenhum protocolo de produto está habilitado para conclusão. A inclusão de uma versão `approved` exige no mínimo dois vetores com entradas, resultados intermediários, resultados finais esperados e tolerâncias, além de aprovador identificado, data, registro de aprovação e hash do artefato clínico.
