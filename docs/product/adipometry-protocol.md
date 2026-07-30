# Protocolos canônicos de Adipometria (ADPT)

Este documento é a fonte canônica para disponibilidade clínica, versionamento, entradas, resultados, precisão e política histórica da Adipometria. Planilhas, telas e código consumidor não podem habilitar protocolo, completar equação ou alterar critério clínico fora desta fonte.

## Estado atual

Nenhum protocolo está aprovado para cálculo final. A fundação estrutural permite rascunhos e preserva o histórico, mas a API deve bloquear prévia conclusiva e finalização enquanto não existir protocolo `approved` com todos os itens do gate clínico.

| Código interno | Nome | Versão | Estado | Motivo |
| --- | --- | --- | --- | --- |
| `GUEDES-ADULT` | Guedes para adultos | `0.1-draft` | `draft` | A fonte funcional cita Guedes, mas fórmula, referência, população, critérios, limites, arredondamento, vetores e aprovador ainda não foram formalmente aprovados. |
| `SLAUGHTER` | Slaughter | `0.1-disabled` | `disabled` | Variantes, critérios de sexo/idade/maturação, equações, mapeamento de dobras e vetores estão incompletos. |

`draft` não pode produzir resultado final. `disabled` não pode ser selecionado para cálculo nem finalização. Não existe fallback entre protocolos.

## Gate obrigatório para aprovação

Uma nova versão somente pode mudar para `approved` quando o mesmo registro versionado contiver:

- referência bibliográfica rastreável;
- população aplicável e critérios explícitos de sexo, idade e maturação;
- idade calculada na data da avaliação;
- dobras exigidas e mapeamento inequívoco dos pontos;
- unidades de entrada e saída;
- equações completas, incluindo transformações intermediárias;
- limites por campo, classificados em alerta ou bloqueio;
- precisão de cálculo e regra de arredondamento por saída;
- comportamento para perfil ou medida ausente/incompatível;
- vetores de teste com entradas e resultados esperados;
- data e responsável pela aprovação clínica.

A aprovação deve gerar uma nova versão imutável. Alterar fórmula, faixa, arredondamento ou critério exige outra versão; avaliações concluídas continuam vinculadas à versão e ao snapshot originais.

## Contrato de entradas e saídas

A coleta estrutural da primeira versão usa:

- peso em quilogramas (`kg`);
- dobras tricipital, subescapular, suprailíaca, abdominal e da coxa em milímetros (`mm`);
- total das cinco dobras em milímetros (`mm`);
- percentual de gordura em porcentagem (`%`);
- gordura absoluta e massa magra em quilogramas (`kg`).

Essas cinco dobras são o conjunto de coleta do produto, não uma autorização para presumir que todas participam de uma equação. Cada protocolo aprovado deve declarar exatamente quais pontos utiliza e como os mapeia.

Persistência estrutural:

- peso: `DECIMAL(6,3)`;
- dobras e total: `DECIMAL(6,2)` e `DECIMAL(7,2)`;
- percentual de gordura: `DECIMAL(5,2)`;
- massas derivadas: `DECIMAL(7,3)`.

A precisão clínica e o arredondamento continuam pendentes por protocolo. A API não deve inferi-los a partir da escala do banco.

## Definição por protocolo

### `GUEDES-ADULT` versão `0.1-draft`

- **Estado:** `draft`.
- **Referência bibliográfica:** pendente de aprovação formal.
- **População:** pendente; a descrição “adultos” não define faixa etária, sexo ou demais critérios.
- **Idade:** deve ser calculada na data da avaliação quando a versão aprovada exigir idade.
- **Dobras exigidas:** pendente de mapeamento clínico aprovado.
- **Equações:** não registradas nesta versão; nenhuma implementação pode completá-las por memória ou fonte não aprovada.
- **Limites e alertas:** pendentes.
- **Precisão e arredondamento:** pendentes.
- **Dados ausentes/incompatíveis:** salvar rascunho é permitido; cálculo conclusivo e finalização são bloqueados com `protocol_not_approved` ou razão mais específica disponível.
- **Vetores de teste:** ausentes; esta ausência impede aprovação.
- **Aprovação:** sem data e sem responsável.

### `SLAUGHTER` versão `0.1-disabled`

- **Estado:** `disabled`.
- **Referência bibliográfica:** pendente de aprovação formal da variante aplicável.
- **População:** incompleta; faltam critérios de sexo, idade e maturação.
- **Dobras exigidas:** incompletas e sem mapeamento inequívoco.
- **Equações:** incompletas.
- **Limites, precisão e arredondamento:** pendentes.
- **Dados ausentes/incompatíveis:** não oferecer o protocolo; caso recebido por chamada direta, retornar incompatibilidade `protocol_disabled`.
- **Vetores de teste:** ausentes; esta ausência impede habilitação.
- **Aprovação:** sem data e sem responsável.

## Snapshot reproduzível

Toda avaliação concluída deve persistir `protocolCode`, `protocolVersion` e `calculationSnapshot`. O snapshot deve ser JSON e conter, no mínimo:

```json
{
  "schemaVersion": 1,
  "protocol": { "code": "...", "version": "..." },
  "assessmentDate": "YYYY-MM-DD",
  "ageAtAssessment": null,
  "profileCriteria": {},
  "inputs": {
    "weightKg": 0,
    "tricepsMm": 0,
    "subscapularMm": 0,
    "suprailiacMm": 0,
    "abdominalMm": 0,
    "thighMm": 0
  },
  "rules": {
    "equations": [],
    "limits": {},
    "precision": {},
    "rounding": {}
  },
  "intermediateValues": {},
  "results": {
    "sumSkinfoldsMm": 0,
    "bodyFatPercentage": 0,
    "fatMassKg": 0,
    "leanMassKg": 0
  }
}
```

Valores ilustrativos não são vetores clínicos. A avaliação somente pode ser concluída quando o snapshot refletir uma versão aprovada e reproduzir exatamente os valores persistidos.

## Histórico, conclusão e correção

- Rascunhos podem ser criados incompletos e retomados.
- Resultados derivados e snapshot não são persistidos em rascunhos; a prévia é resposta calculada pelo backend.
- A conclusão grava entradas, resultados, protocolo, versão, snapshot e auditoria na mesma transação.
- Avaliação concluída é imutável e não pode ser excluída fisicamente pelo fluxo comum.
- Correção cria uma nova avaliação concluída com novo código, `correctionOfId`, motivo obrigatório, autor e data. O registro original permanece intacto.
- Uma avaliação pode ser corrigida uma única vez diretamente. Nova correção deve partir da versão corrente; a API deve rejeitar cadeia ambígua ou alvo que já possua uma correção sucessora.
- Histórico exibe original e correção com vínculo explícito. Resumo evolutivo e comparação usam a versão corrente e não tratam rascunhos como indicador.
- Comparações entre protocolos ou versões diferentes devem alertar que os resultados podem não ser diretamente equivalentes.

## Código sequencial e concorrência

O código é reservado por contrato e aluno usando `reserve_adipometry_code(contractId, alunoId)` dentro da mesma transação que cria a avaliação. A tabela de sequência usa chave única `(contractId, alunoId)` e `INSERT ... ON CONFLICT DO UPDATE`, impedindo duplicidade concorrente.

A largura mínima é três dígitos, sem limite em 999:

- `1` -> `ADPT-001`;
- `999` -> `ADPT-999`;
- `1000` -> `ADPT-1000`.

Rollback da transação desfaz também a reserva. Consumidores não podem calcular o próximo código por contagem, último registro ou frontend.

## Fronteiras

- ADPT é domínio histórico próprio.
- `ProgressMetric`, cadastro do aluno e Anamnese Inicial não são fontes primárias.
- Antropometria pode ser referência opcional somente quando pertence ao mesmo contrato e aluno.
- Resultados derivados nunca são aceitos como autoridade em payloads do frontend.
- Endpoints, autorização e cálculo executável pertencem à issue #247.
- Tela guiada e mídias de apoio pertencem à issue #248.
- Central do Aluno e comparação visual pertencem à issue #249.
