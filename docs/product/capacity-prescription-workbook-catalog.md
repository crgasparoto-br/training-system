# Catálogo técnico equivalente à planilha de treinamento

## Fonte funcional

A fonte é `ModeloTreinamento Combinado v. 3.12.8`, aba `Siglas e ambiente`.

O seed executado por `pnpm --filter @corrida/api db:seed-capacity-prescriptions` mantém os itens genéricos existentes e acrescenta códigos canônicos da planilha por contrato, de forma idempotente. Cada item importado registra em `metadata` o workbook, a aba e a seção de origem.

## Ambiente

| Código | Nome |
| --- | --- |
| BOSFIT | BOSFit |

## Grupos musculares

| Código | Nome |
| --- | --- |
| PT | Peitoral |
| TB | Tríceps Braquial |
| DR | Dorsais |
| BB | Bíceps Braquial |
| DA | Deltoide anterior |
| DM | Deltoide Medial |
| DP | Deltoide Posterior |
| TP | Trapézio Fibras superiores |
| GM | Glúteo Máximo |
| AQ | Abdutores de quadril |
| AD | Adutores de quadril |
| QD | Quadríceps |
| PC | Posterior de Coxa |
| ABS | Abdomen |
| AO | Oblíquos |
| LEC | Lombar e eretores da coluna |
| TS | Triceps Sural |
| MR | Manguito Rotador |
| FP | Flexores de punho |
| EP | Extensores de punho |
| TA | Tibial anterior |
| G1 | Grupo Muscular 1 |
| G2 | Grupo Muscular 2 |

## Estímulos cíclicos

| Código | Nome |
| --- | --- |
| CEXT | Contínuo Extensivo |
| CINT | Contínuo Intensivo |
| IEXT | Intervalado Extensivo |
| IINT | Intervalado Intensivo |
| FLEK | FartLek |

As cinco modalidades permanecem distintas. O catálogo não reduz `CEXT` e `CINT` a um único item contínuo, nem `IEXT` e `IINT` a um único item intervalado.

## Movimentos e siglas

| Código | Nome |
| --- | --- |
| FLQ | Flexão de quadril |
| EXQ | Extensão de quadril |
| ABQ | Abdução de quadril |
| REQ | Rotação Externa de quadril |
| AHO | Abdução Horizontal de ombro |
| FLC | Flexão de coluna |
| DSF | Dorsiflexão |
| MA1 | Movimento articular 1 |
| MA2 | Movimento articular 2 |
| MA3 | Movimento articular 3 |
| MA4 | Movimento articular 4 |
| MA5 | Movimento articular 5 |

Essas entradas usam a categoria `acronym` e mantêm o rótulo exibido na planilha. A normalização do código é apenas técnica e não altera o significado funcional.

## Coluna Exercícios

A coluna `Exercícios` contém 39 seletores usados pela montagem da planilha, incluindo siglas simples e combinações de grupos ou movimentos, por exemplo `AbQ`, `ABS + AO`, `DR + BB + DP`, `GM + QD`, `PT + TB + DA` e `TB + BB + DA + DM + TP + MR`.

Cada seletor é persistido como item da categoria `exercise`:

- o `name` preserva literalmente o valor da planilha;
- o `code` recebe prefixo `WB_EX_` e normalização compatível com o contrato do catálogo;
- `metadata.sourceSection` registra `Exercícios`;
- `metadata.selector = true` diferencia esses seletores de exercícios individuais da biblioteca.

## Implementação e teste

- dados: `capacity-prescription-workbook-catalog.ts`;
- aplicação idempotente: `seed-capacity-prescription-parameters.ts`;
- teste discriminante: `capacity-prescription-workbook-catalog.test.ts`;
- famílias verificadas: ambiente, grupos musculares, estímulos cíclicos, movimentos/siglas e os 39 seletores de exercícios;
- teste de unicidade: nenhuma categoria pode repetir o mesmo código.
