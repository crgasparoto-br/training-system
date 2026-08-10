# Montagem Consolidada da Prescrição

Este documento é a fonte de verdade do domínio persistente e do workflow backend da Montagem Consolidada da Prescrição. A persistência base foi introduzida pela issue #316 e o workflow autoritativo até `approved` foi concluído pela issue #317. A issue #318 adiciona o read-model de workspace consumido pela interface web sem alterar a autoridade das transições.

## Papel no fluxo integrado

```text
PRNT / Avaliação Física
  -> Prescrição por capacidades
  -> Montagem Consolidada da Prescrição
  -> Treino de hoje
  -> Feedback pós-treino
```

A Montagem Consolidada é a fronteira persistente entre planejamento técnico e a futura saída operacional. Ela não publica `Treino de hoje` diretamente. A transição `approved -> released` e a geração operacional pertencem à #320.

## Autoridades

- `contractId` e professor ator vêm exclusivamente do contexto autenticado do backend;
- `alunoId` é resolvido no contrato autenticado e respeita o `dataScope` de `plans`;
- o professor responsável técnico precisa pertencer ao mesmo contrato;
- versão corrente, estado resultante, atores e timestamps de revisão/aprovação/bloqueio são definidos pelo backend;
- o cliente referencia capacidades somente por `CapacityPrescriptionVersion.id`;
- criação/edição não aceitam `status`, `version`, `contractId`, ator/timestamp de aprovação ou `released` como autoridade do cliente;
- payloads HTTP são estritos: campos de autoridade desconhecidos são rejeitados.

## Agregado, histórico e concorrência

Existe no máximo uma cadeia lógica por `(contractId, alunoId)`.

`ConsolidatedPrescription` guarda identidade e `currentVersion`. `ConsolidatedPrescriptionVersion` é append-only: toda mutação material cria nova versão, preserva `previousVersionId` e nunca reescreve o histórico anterior.

A API mantém contratos distintos para coleção e detalhe. `GET /alunos/:alunoId/assemblies` devolve uma coleção com zero ou uma montagem. `GET /alunos/:alunoId` devolve a montagem corrente/detalhe.

Todas as mutações recebem `expectedCurrentVersion` depois da criação inicial. A implementação combina row lock com CAS no `UPDATE`; duas escritas baseadas na mesma versão não avançam silenciosamente. Conflito retorna HTTP `409` e a transação não deixa versão ou relações parciais.

## Estados e workflow desta fase

Estados persistidos:

- `draft`;
- `ready_for_review`;
- `approved`;
- `released`;
- `blocked`;
- `archived`.

| Origem | Ação | Destino | Regra |
| --- | --- | --- | --- |
| criação | criar montagem | `draft` | composição completa e referências elegíveis |
| `draft` | enviar para revisão | `ready_for_review` | sem conflito `critical`; registra revisor/data |
| `draft` | enviar/recalcular com `critical` | `blocked` | bloqueio automático estruturado |
| `ready_for_review` | aprovar | `approved` | revalida conflitos e registra ator/data |
| `ready_for_review` | aprovar/recalcular com `critical` | `blocked` | aprovação não ocorre |
| `draft`, `ready_for_review`, `approved` | bloquear explicitamente | `blocked` | exige motivo |
| `blocked` | corrigir composição | `blocked` | permite trocar referências/capacidades sem liberar o estado |
| `blocked` | desbloquear explicitamente | `draft` ou `ready_for_review` | somente após revalidação sem `critical`; nunca autoaprova |
| `approved` | criar nova revisão | `draft` | nova versão na mesma cadeia; aprovação anterior permanece histórica |
| `approved` | liberar | `released` | não implementado; reservado para #320 |
| `released` | criar nova revisão | `draft` | versão liberada permanece histórica; a nova versão volta ao fluxo de revisão/aprovação |

Editar diretamente uma montagem `approved` ou `released` não é permitido. Nos dois estados, qualquer alteração material começa por `POST /revisions`, que cria uma nova versão `draft` e preserva a versão aprovada/liberada anterior. `archived` não recebe comandos de alteração nesta fase.

## Referências às capacidades

A composição exige exatamente uma versão para cada capacidade canônica:

- `resisted`;
- `flexibility`;
- `cyclic`;
- `balance`.

Na criação/edição, cada referência precisa pertencer ao mesmo `contractId + alunoId`, estar com status `active` e corresponder à versão corrente do agregado de capacidade. Versão substituída, suspensa, inexistente, cross-tenant ou de outro aluno não é elegível.

No histórico consolidado, o vínculo é imutável e mantém a `CapacityPrescriptionVersion` original. Se uma capacidade selecionada deixar de ser corrente depois, a revalidação produz conflito `critical`; ela não altera retroativamente versões antigas.

## Read-model do workspace web

`GET /alunos/:alunoId/workspace` existe para a interface da #318 e usa a mesma autorização de leitura e o mesmo `dataScope` de `plans` que protegem a montagem. Ele não reutiliza `GET /alunos/:id` como gate, porque a consulta administrativa do aluno possui política própria e não pode reduzir o escopo autorizado da montagem.

O workspace devolve somente dados necessários ao fluxo:

- aluno (`id`, nome quando disponível);
- professor ator;
- professor atualmente atribuído ao aluno;
- professor responsável pela versão corrente, quando houver;
- quatro candidatos de capacidade, um por capacidade canônica;
- `capacityCandidatesError` quando a montagem do read-model de capacidades falhar de modo recuperável.

Para cada candidato, o backend devolve:

- `prescriptionId` e status persistido da prescrição;
- `capacityPrescriptionVersionId`, número e status da versão corrente;
- `eligible`;
- `reasonCode`;
- `reason` em linguagem operacional;
- `professorSummary`;
- `sourceRefs` da versão candidata.

Códigos iniciais de decisão:

- `eligible`;
- `missing_prescription`;
- `missing_current_version`;
- `prescription_not_active`;
- `version_not_active`.

A UI não deriva elegibilidade a partir desses status. Ela usa `eligible` e `reason` como decisão de apresentação, enquanto create/update continuam revalidando tudo na escrita. Portanto o read-model orienta a interface, mas não substitui o gate transacional.

A falha de candidatos é degradável: se o contexto do aluno for autorizado e carregado, o endpoint pode responder com `capacityCandidates=[]` e `capacityCandidatesError`, permitindo consulta da montagem/histórico sem oferecer novas seleções até nova leitura válida.

O cabeçalho web pode resumir `capacityCandidatesError`, contagem de candidatos `eligible=false` e conflito `critical` já retornado pela API para indicar a situação das origens. Esse resumo é apenas apresentação; o navegador não cria regra técnica nem reclassifica elegibilidade.

## Responsável técnico e referências adicionais

`responsibleProfessorId` representa responsabilidade técnica da versão; `createdByProfessorId`/ator representam quem executou a ação. Essas identidades não são equivalentes.

A interface da #318 preserva o `responsibleProfessorId` corrente em edições comuns. Também reenvia as referências adicionais persistidas (`assessment`, `routine`, `manual_observation`, `exercise_substitution`) quando elas não foram objeto da edição, para que um save de observação/ordem não as apague. Referências `capacity_source` continuam sendo reconstruídas pelo backend a partir das versões de capacidade e não são autoridade do cliente.

## Motor de conflitos

O motor autoritativo usa somente dados estruturados persistidos.

Fontes atualmente usadas:

- presença das quatro capacidades obrigatórias;
- justificativa profissional obrigatória;
- elegibilidade/vigência da versão selecionada;
- `CapacityPrescriptionAlert` persistido, preservando `info`, `warning` ou `critical`.

Texto livre de justificativa, resumo, mensagem ou observação nunca cria, remove ou aumenta severidade de conflito. Regras clínicas adicionais só podem bloquear quando existir regra canônica, estruturada e versionada. Enquanto não existir, a API sinaliza a checagem em `unavailableChecks`.

### Severidade

- `info`: informativo;
- `warning`: exige atenção profissional, não bloqueia por si só;
- `critical`: impede aprovação e pode colocar a montagem em `blocked`.

Não existe taxonomia paralela de bloqueio. `critical` é a autoridade bloqueadora.

## Bloqueio e desbloqueio

`blocked` representa impedimento atual. Enquanto bloqueada, a montagem pode receber uma composição de remediação, mas continua `blocked`. O comando de desbloqueio é separado e obrigatório; ele reavalia as fontes atuais e só avança para `draft` ou `ready_for_review` quando não existe `critical`.

Desbloquear para `ready_for_review` registra nova revisão pelo ator autenticado. Desbloquear nunca preenche metadados de aprovação.

## Auditoria

A cadeia `ConsolidatedPrescriptionVersion` é a fonte auditável canônica. A consulta de histórico deriva `auditEvents` deterministicamente usando `previousVersionId`, estados, metadados de decisão e autoria.

Ações distinguíveis:

- `created`;
- `composition_updated`;
- `sent_for_review`;
- `approved`;
- `blocked`;
- `blocked_by_conflict`;
- `unblocked`;
- `revision_created`.

`revision_created` cobre tanto `approved -> draft` quanto `released -> draft`; o `previousStatus` preservado no evento distingue a origem. Cada evento expõe ator backend, agregado/versão, estado anterior/novo, motivo quando aplicável, quantidade de conflitos críticos e timestamp da versão. Nenhum evento é confiado ao payload do cliente.

## HTTP

Base: `/api/v1/consolidated-prescriptions`.

| Método | Rota | Permissão |
| --- | --- | --- |
| `GET` | `/alunos/:alunoId/workspace` | `plans.consolidatedPrescriptions.view` |
| `GET` | `/alunos/:alunoId/assemblies` | `plans.consolidatedPrescriptions.view` |
| `GET` | `/alunos/:alunoId` | `plans.consolidatedPrescriptions.view` |
| `POST` | `/alunos/:alunoId` | `plans.consolidatedPrescriptions.manage` |
| `PATCH` | `/alunos/:alunoId/composition` | `plans.consolidatedPrescriptions.manage` |
| `GET` | `/alunos/:alunoId/conflicts` | `plans.consolidatedPrescriptions.view` |
| `POST` | `/alunos/:alunoId/conflicts/recalculate` | `plans.consolidatedPrescriptions.manage` |
| `POST` | `/alunos/:alunoId/send-for-review` | `plans.consolidatedPrescriptions.manage` |
| `POST` | `/alunos/:alunoId/approve` | `plans.consolidatedPrescriptions.approve` |
| `POST` | `/alunos/:alunoId/block` | `plans.consolidatedPrescriptions.manage` |
| `POST` | `/alunos/:alunoId/unblock` | `plans.consolidatedPrescriptions.manage` |
| `POST` | `/alunos/:alunoId/revisions` | `plans.consolidatedPrescriptions.manage` |
| `GET` | `/alunos/:alunoId/history` | `plans.consolidatedPrescriptions.view` |

Não existe endpoint `/release` nesta fase. O endpoint `/revisions` apenas cria uma nova versão `draft` de uma montagem já `approved` ou `released`; ele não executa nem repete a liberação operacional.

## Autorização e privacidade

A API aplica, em conjunto:

1. autenticação e vínculo profissional ativo;
2. tela pai `plans`;
3. bloco específico da operação;
4. `contractId` do ator;
5. `dataScope` de `plans` (`self`, `managed`, `contract`);
6. escopo do aluno e responsável atual.

Acesso cross-tenant ou fora do `dataScope` devolve resposta genérica equivalente a recurso inexistente. O workspace segue exatamente a mesma regra e não exige permissão administrativa de `students.*` como condição adicional.

Defaults: `professor` recebe consulta/gestão e `plans=self`; `manager` recebe consulta/gestão/aprovação e `plans=contract`; `master` mantém acesso total dentro do contrato. `release` não é concedido nesta fase.

## Dados-base e rastreabilidade

Origens presentes nas versões de capacidade são derivadas pelo backend e persistidas como `capacity_source`. O cliente não pode declarar esse papel.

Referências adicionais permanecem limitadas às origens canônicas que o backend consegue revalidar no mesmo contrato/aluno. `manual_observation` é materializada pelo backend; tipos sem objeto persistente verificável não são autoridade adicional.

## Limites desta fase

Ficam fora:

- motor clínico baseado em fórmulas ainda não formalizadas;
- `approved -> released`;
- geração de `Treino de hoje`;
- feedback pós-treino;
- sessão nativa de leitor de tela automatizada: a evidência web usa Chromium/axe/árvore ARIA, enquanto NVDA/VoiceOver/Orca continua sendo um gate manual da #318.
