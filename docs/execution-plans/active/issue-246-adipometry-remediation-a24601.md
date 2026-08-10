# Issue #246 — Remediação A-246-01

## Identidade do candidato

- PR: #290
- base: `develop`
- head: `0c56e7e504c53ba7c10cfed082c73d5fce111b08`
- merge preview validado: `388935111d40d90658d6be5eeeefd340afb921f5`

## Achado remediado

O snapshot persistido de uma avaliação concluída preserva as cinco propriedades de dobras cutâneas, mas as duas dobras não utilizadas pela equação selecionada podem ser `null`. O contrato compartilhado anterior usava `Required<AdipometryMeasurements>` e, portanto, declarava incorretamente todas as dobras como números obrigatórios.

## Solução

- `AdipometryCalculationSnapshot` passou a ser uma união discriminada por `protocolSex`.
- Para `male`, tricipital, suprailíaca e abdominal são obrigatórias; subescapular e coxa aceitam `null`.
- Para `female`, subescapular, suprailíaca e coxa são obrigatórias; tricipital e abdominal aceitam `null`.
- `protocolSexDecision.protocolSex` e `profileCriteria.protocolSex` permanecem correlacionados com a variante de entradas.
- A semântica da definição do protocolo foi explicitada: `requiredSkinfolds` representa o catálogo canônico registrado, enquanto `calculationSkinfoldsBySex` governa a obrigatoriedade e o cálculo da versão.

## Evidência

- teste masculino com subescapular e coxa nulas;
- teste feminino com tricipital e abdominal nulas;
- controle negativo TypeScript rejeitando dobra obrigatória nula;
- workflow `Validate PR` `30659198107`: aprovado;
- workflow `Issue 275 Pre-registration QA` `30659198171`: aprovado.

## Governança

Esta passagem produziu apenas aprovação interna provisória em modo controller-adversarial. A PR permanece em draft, a issue permanece aberta e nenhum merge foi executado.
