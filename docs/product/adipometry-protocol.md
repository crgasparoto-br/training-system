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

- `schemaVersion` igual ou superior a `2`;
- população com idade mínima e máxima, critérios de sexo e maturação;
- exatamente as cinco dobras ADPT documentadas;
- unidades explícitas de cada entrada e saída;
- três equações identificadas e executáveis para percentual, gordura absoluta e massa magra;
- limites de bloqueio por entrada e uma coleção explícita de alertas;
- precisão de medidas, resultados e cálculo interno;
- modo e estágio de arredondamento;
- comportamento estruturado para dado ausente e perfil incompatível;
- no mínimo dois vetores distintos, com entradas completas, resultados esperados e tolerâncias não negativas e não superiores à menor unidade da precisão de resultado;
- registro de aprovação clínica com aprovador, instante, identificador e SHA-256 do artefato aprovado;
- referência bibliográfica rastreável.

A persistência rejeita estado `approved` quando o contrato estiver ausente ou incompleto, usar dobras diferentes, não trouxer as três saídas, possuir vetores duplicados ou quando qualquer vetor não reproduzir os resultados declarados. Objetos genéricos, expressões textuais e placeholders não satisfazem o gate.

Fixtures estruturais usadas pelo CI existem somente durante os testes, obedecem ao mesmo formato executável e não são seed de produto nem aprovação clínica real.

## Linguagem executável de equações

Equações aprovadas não são strings livres. Cada expressão é uma árvore JSON restrita e determinística. Os operadores aceitos são:

- `constant`: número literal;
- `variable`: entrada, idade ou resultado intermediário disponível;
- `add` e `multiply`: coleção com pelo menos dois argumentos;
- `subtract`, `divide` e `power`: operadores binários;
- `negate`: inversão de sinal;
- `ifEquals`: seleção determinística por um campo de `profileCriteria`.

O total das cinco dobras é calculado pela persistência e disponibilizado como `skinfoldTotalMm`. As equações são avaliadas na ordem obrigatória: percentual de gordura, gordura absoluta e massa magra. Todas as ramificações da árvore são validadas estruturalmente, mesmo quando nenhum vetor seleciona determinada ramificação. Somente variáveis canônicas já disponíveis podem ser referenciadas. Referência a variável ausente, operador desconhecido, divisão por zero, saída repetida, chave inesperada ou estrutura incompleta invalida a aprovação.

Antes de aceitar `approved`, a persistência executa todos os vetores contra a árvore de equações e compara cada resultado com sua tolerância, limitada à menor unidade declarada para os resultados. Assim, texto descritivo, resultado inventado ou vetor incompatível não pode ser usado como evidência de fórmula clínica.

## Aprovação e tempo

`clinicalApproval.approvedAt` deve ser um instante ISO-8601 com `Z` ou offset numérico explícito. A comparação com a coluna histórica é normalizada para UTC, sem depender do `TimeZone` da sessão PostgreSQL. Datas sem fuso são rejeitadas.

O aprovador no JSON deve coincidir com `approvedByUserId`; o instante deve coincidir com `approvedAt`; o identificador do registro e o SHA-256 do artefato são obrigatórios.

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
7. referência, árvore de equações, precisão, arredondamento e vetores estão registrados e reproduzidos.

Dados ausentes ou incompatíveis retornam motivo estruturado e impedem conclusão. Resultados derivados nunca são aceitos como autoridade do frontend.

## Precisão e arredondamento

Enquanto não houver aprovação clínica:

- medidas usam capacidade de persistência `Decimal(8,2)`;
- resultados usam capacidade de persistência `Decimal(8,4)`;
- nenhum arredondamento clínico é presumido;
- protocolos `draft` e `disabled` não produzem resultado final.

A regra aprovada deverá definir precisão interna, casas exibidas e modo de arredondamento, acompanhados de vetores independentes.

## Rascunho, conclusão, ator e correção

- Um rascunho pode existir incompleto e ser retomado.
- Resultados derivados e snapshot não são persistidos em rascunho.
- A conclusão exige protocolo aprovado, entradas compatíveis e resultados calculados pelo backend.
- Uma avaliação concluída é imutável pelo fluxo comum e não pode ser excluída fisicamente.
- Correção cria nova versão vinculada à vigente, com motivo e autor obrigatórios.
- A versão anterior permanece concluída e auditável; a nova aponta `correctsAssessmentId` e a anterior recebe `correctedByAssessmentId` atomicamente.
- `correctedByAssessmentId` é gerenciado exclusivamente pelo trigger de vínculo recíproco.
- Comparações e Central do Aluno usam a versão corrente da cadeia. Versões substituídas permanecem disponíveis para auditoria.
- Criações, atualizações persistidas, conclusões e correções geram eventos append-only no banco.

O ator da auditoria é o usuário autenticado que executou a operação, não o professor responsável pela avaliação. A API deve informar o ator em contexto transacional local ou usar a sobrecarga explícita de `createAdipometryDraft`. O frontend nunca controla esse identificador. Papéis de aplicação sem ator válido são bloqueados. As sobrecargas legadas sem ator não possuem `EXECUTE` para `PUBLIC` nem para o papel proprietário; somente superusuários do harness de migration podem atravessar esse caminho histórico.

Tentativas bloqueadas e decisões de autorização serão auditadas pela API da issue #247, fora da transação rejeitada.

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
- equações executáveis, limites, precisão e arredondamento;
- resultados persistidos;
- versão da implementação do cálculo;
- timestamp do cálculo.

A persistência verifica a estrutura e a igualdade entre protocolo, data, entradas e resultados do snapshot e as colunas históricas.

## Vetores de teste

Não há vetor clínico aprovado nesta versão. Portanto, nenhum protocolo de produto está habilitado para conclusão. A inclusão de uma versão `approved` exige no mínimo dois vetores distintos com entradas, resultados intermediários, resultados finais esperados e tolerâncias, além de aprovador identificado, instante com fuso, registro de aprovação e hash do artefato clínico.
