# Rastreabilidade da adipometria na prescrição por capacidades

A prescrição por capacidades usa a composição corporal derivada da planilha `Modelo Avaliação Física v.4.10.12` como dado técnico de apoio, sem transformar esse resultado em decisão automática de treino.

## Metodologia versionada

A equação formalizada no backend é identificada como `guedes-three-fold-siri-v1`.

- masculino: dobra tricipital + suprailíaca + abdominal;
- feminino: dobra subescapular + suprailíaca + coxa;
- conversão da densidade corporal pela equação de Siri.

A identificação metodológica deve acompanhar os coeficientes efetivamente executados. Alterações futuras exigem uma nova versão, sem reinterpretar prescrições históricas.

## Snapshot histórico

Ao selecionar uma avaliação de adipometria como origem de uma prescrição, o backend reconstrói a fonte canônica e grava em `sourceVersion` um snapshot serializado contendo:

- data de atualização da avaliação de origem;
- sexo usado pelo protocolo;
- peso utilizado;
- dobras disponíveis;
- versão da fórmula;
- soma das dobras do protocolo;
- soma total das dobras informadas;
- densidade corporal;
- percentual de gordura;
- gordura absoluta;
- massa magra.

Esse snapshot pertence à versão imutável da prescrição. Consultas históricas não dependem de recalcular a composição com a versão atual do código ou com dados posteriormente alterados.

## Falhas explícitas

A consulta de fontes apresenta `Status do cálculo` quando a avaliação não possui sexo, peso ou dobras suficientes. Uma adipometria sem snapshot calculável não pode ser vinculada a uma nova versão da prescrição e retorna erro de validação ao professor.

O sistema não substitui dados ausentes por valores do cadastro geral nem oculta falhas de cálculo. A avaliação deve conter os dados técnicos usados pelo protocolo para manter a origem reproduzível.
