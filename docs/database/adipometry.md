# Persistência de Adipometria (ADPT)

## Estruturas

- `AdipometryProtocol`: catálogo versionado; somente `APPROVED` pode sustentar conclusão.
- `AdipometrySequence`: contador por contrato e aluno.
- `AdipometryAssessment`: rascunho ou avaliação concluída, com entradas tipadas, resultados e snapshot.
- `AdipometryAuditEvent`: trilha de ações sensíveis com antes/depois.

## Criação concorrente

A criação de rascunho deve chamar `createAdipometryDraft` dentro da transação da operação. O `UPSERT` da linha `(contractId, alunoId)` serializa criações concorrentes. Se o insert da avaliação falhar, o incremento também sofre rollback.

O código é derivado de `sequenceNumber` como `ADPT-` + `lpad(numero, 3, '0')`; números acima de 999 não são truncados.

## Isolamento

Todas as consultas e mutações devem receber `contractId`. Referências à Antropometria e à cadeia de correção usam chaves estrangeiras compostas com `contractId`, impedindo vínculo cross-tenant no banco.

## Conclusão

A restrição de conclusão exige protocolo, versão, snapshot, medidas e resultados. O serviço futuro ainda deverá verificar que o protocolo relacionado está `APPROVED`; os protocolos sem aprovação clínica são semeados apenas como `DRAFT` ou `DISABLED`.

Triggers impedem alteração clínica e exclusão física de registros concluídos. Uma correção cria nova avaliação e pode apenas preencher o vínculo `correctedByAssessmentId` da original.

## Correção auditada

A operação futura deve, em uma única transação:

1. validar contrato e estado `COMPLETED` da avaliação original;
2. criar nova avaliação no mesmo contrato/aluno;
3. exigir motivo não vazio e autor;
4. preencher `correctsAssessmentId` na nova versão;
5. preencher `correctedByAssessmentId` na original;
6. registrar evento com snapshots antes/depois.

## Implantação e rollback

As migrations são aditivas: criam tabelas, índices, funções, triggers e constraints sem modificar dados de Antropometria, cadastro, anamnese ou métricas existentes. O deploy deve executar `prisma migrate deploy` antes de iniciar a API.

Rollback destrutivo não é automatizado porque poderia remover avaliações ADPT já registradas. Em ambiente sem dados ADPT, a reversão operacional deve remover triggers/funções e depois as quatro tabelas, após aprovação e backup.