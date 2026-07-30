# Proveniência canônica das fontes da prescrição

Este documento complementa `capacity-prescription-model.md` para as remediações de proveniência da Issue #136.

## Invariante

O cliente informa somente o tipo e o identificador da fonte que deseja usar. Metadados de rastreabilidade não são autoridade do cliente.

Antes da derivação de alertas e antes da gravação de uma nova versão, o backend reconstrói no mesmo `contractId` e `alunoId`:

- rótulo;
- data da fonte;
- origem;
- versão;
- professor responsável, quando a fonte possuir autoria profissional rastreável.

## Fontes reconstruídas

| Tipo | Fonte canônica | Metadados usados |
| --- | --- | --- |
| `prontuario_goal` | `ProntuarioGoal` e seu `ProntuarioRecord` | título, criação, atualização, código do PRNT e professor do prontuário |
| `prontuario_alert` | dor, acompanhamento de anamnese, medicamento/procedimento ou mapa corporal | descrição do subtipo, data funcional, atualização e professor do prontuário |
| `student_preference` | `StudentProfile` | identificação fixa, atualização, referência de origem e professor correspondente ao usuário registrador |
| avaliações e antropometria | registros segmentados e avaliações antropométricas | dados já reconstruídos pelo fluxo existente |
| histórico de atividade | `ProntuarioActivityHistory` | dados já reconstruídos pelo fluxo existente |

Quando o identificador não pertence ao aluno e ao contrato autenticados, a validação de domínio rejeita a origem técnica. O backend não usa os metadados recebidos para tornar uma origem inexistente válida. Referências malformadas também são rejeitadas com erro de validação antes da canonicalização.

## Identificador da preferência na tela

`GET /api/v1/alunos/:id/profile` consulta o `StudentProfile` no mesmo contrato e devolve `recordId`. A tela usa esse identificador como `sourceRef.id`; o `POST /capacity-prescriptions/alunos/:alunoId` reconstrói novamente a preferência pelo banco antes de persistir. O fixture visual reproduz o mesmo campo público e não constitui a fonte de verdade do identificador.

## Compatibilidade de categorias de avaliação

O endpoint de fontes pode reconhecer categorias descritivas, como `Adipometria 7 dobras`, para apresentação. O contrato público normaliza essas opções para `physical_assessment` quando a categoria armazenada não corresponde exatamente a um alias canônico. A mesma normalização é reaplicada antes da persistência.

Assim, a chave pública usada pela tela e a chave restaurada da versão persistida permanecem idênticas. ID, autoria, data, origem e versão continuam preservados, sem apresentar uma opção que depois falhe ao salvar ou reapareça duplicada no recarregamento.

Tipos específicos continuam sendo preservados para aliases canônicos, incluindo `adipometry`, `adipometria`, `adpt`, `ventilometry`, `ventilometria` e equivalentes documentados no serviço.

## Alertas derivados

Alertas `PRNT_CONDITION` e `STUDENT_PREFERENCE` são derivados somente depois da reconstrução. Assim, a mensagem persistida não pode ser alterada por um rótulo forjado no payload. Avaliações específicas e genéricas continuam gerando `ASSESSMENT_CONTEXT`.

## Testes discriminantes

`capacity-prescription-source-canonicalization.integration.test.ts` envia rótulo, data, origem, versão e professor deliberadamente falsos para objetivo, dor e preferência. O teste verifica:

- resposta HTTP canônica;
- mensagens de alerta canônicas;
- linhas persistidas em `CapacityPrescriptionSource`;
- ausência da versão forjada.

`capacity-prescription-source-integrity.service.test.ts` cobre referências malformadas, todas as categorias canônicas inexistentes, uma avaliação válida e a exceção explícita para anotação técnica manual do professor.

`capacityPrescriptionProfileSource.test.ts` comprova que um `recordId` público do `StudentProfile` produz a referência `student_preference` usada pela tela.

`capacity-prescription-assessment-category.test.ts` verifica aliases canônicos, categorias descritivas e estabilidade da chave entre a projeção pública e a persistência.

## Limites

A remediação não altera a decisão técnica do professor, não publica `Treino de hoje` e não muda os modelos de planos, templates ou execuções.
