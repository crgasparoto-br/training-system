# Montagem Consolidada da Prescrição

Este documento é a fonte de verdade do domínio persistente e do workflow backend da Montagem Consolidada da Prescrição. A persistência base foi introduzida pela issue #316 e o workflow autoritativo até `approved` foi concluído pela issue #317.

## Papel no fluxo integrado

```text
PRNT / Avaliação Física
  -> Prescrição por capacidades
  -> Montagem Consolidada da Prescrição
  -> Treino de hoje
  -> Feedback pós-treino
```

A Montagem Consolidada é a fronteira persistente entre planejamento técnico e a futura saída operacional. Ela **não** publica `Treino de hoje` diretamente. A transição `approved -> released` e a geração operacional pertencem à #320.

## Autoridades

- `contractId` e professor ator vêm exclusivamente do contexto autenticado do backend;
- `alunoId` é resolvido no contrato autenticado e também respeita o `dataScope` de `plans`;
- o professor responsável técnico precisa pertencer ao mesmo contrato;
- versão corrente, estado resultante, atores e timestamps de revisão/aprovação/bloqueio são definidos pelo backend;
- o cliente referencia capacidades somente por `CapacityPrescriptionVersion.id`;
- criação/edição não aceitam `status`, `version`, `contractId`, ator/timestamp de aprovação ou `released` como autoridade do cliente;
- payloads HTTP são estritos: campos de autoridade desconhecidos são rejeitados.

## Agregado, histórico e concorrência

Existe no máximo uma cadeia lógica por `(contractId, alunoId)`.

`ConsolidatedPrescription` guarda a identidade do agregado e `currentVersion`. `ConsolidatedPrescriptionVersion` é append-only: toda mutação material cria uma nova versão, preserva `previousVersionId` e nunca reescreve o histórico anterior.

A API mantém contratos distintos para coleção e detalhe. `GET /alunos/:alunoId/assemblies` sempre devolve uma coleção e, pela cardinalidade atual do domínio, contém zero ou uma montagem. `GET /alunos/:alunoId` continua sendo a consulta da montagem corrente/detalhe. Essa separação preserva um contrato de listagem explícito sem criar uma segunda cadeia para o mesmo aluno.

Todas as mutações recebem `expectedCurrentVersion` depois da criação inicial. A implementação combina `SELECT ... FOR UPDATE` com CAS no `UPDATE`; duas escritas baseadas na mesma versão não podem avançar silenciosamente. O conflito retorna HTTP `409` e a transação não deixa versão ou relações parciais.

## Estados e workflow desta fase

Estados persistidos:

- `draft`;
- `ready_for_review`;
- `approved`;
- `released`;
- `blocked`;
- `archived`.

Transições operacionais implementadas pela #317:

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
| `approved` | liberar | `released` | **não implementado**; reservado para #320 |

Editar uma montagem `approved` exige antes criar uma revisão explícita. `released` e `archived` não recebem comandos de alteração nesta fase.

## Referências às capacidades

A composição continua exigindo exatamente uma versão para cada capacidade canônica:

- `resisted`;
- `flexibility`;
- `cyclic`;
- `balance`.

Na criação/edição, cada referência precisa pertencer ao mesmo `contractId + alunoId`, estar com status `active` e corresponder à versão corrente do agregado de capacidade. Versão substituída, suspensa, inexistente, cross-tenant ou de outro aluno não é elegível.

No histórico consolidado, o vínculo é imutável e mantém a `CapacityPrescriptionVersion` original. Se uma capacidade selecionada deixar de ser corrente depois, a revalidação produz conflito `critical`; ela não altera retroativamente versões já aprovadas.

## Motor de conflitos

O motor autoritativo usa **somente dados estruturados persistidos**.

Fontes atualmente usadas:

- presença das quatro capacidades obrigatórias;
- justificativa profissional obrigatória;
- elegibilidade/vigência da versão selecionada;
- `CapacityPrescriptionAlert` persistido, preservando `info`, `warning` ou `critical`.

Texto livre de `technicalJustification`, `professorSummary`, `studentMessage`, justificativa da montagem ou observações **nunca** cria, remove ou aumenta severidade de conflito. Portanto frases como “dor intensa”, “joelho”, “agachamento forte” ou “alta intensidade” não são evidência autoritativa por si só.

Regras clínicas adicionais — por exemplo correlação CIT/ACWR, carga/intensidade versus dor/restrição, anticoagulante versus risco específico, ou volume de membros inferiores — só podem bloquear quando existir regra canônica, estruturada e versionada no domínio correspondente. Enquanto essa fonte não existir, a API devolve a checagem como indisponível em `unavailableChecks`; não simula decisão clínica por heurística textual.

### Severidade

- `info`: informativo; não bloqueia fluxo;
- `warning`: exige atenção profissional; não bloqueia por si só;
- `critical`: impede aprovação e pode colocar a montagem em `blocked`.

Não existe taxonomia paralela de bloqueio. `critical` é a autoridade bloqueadora.

## Bloqueio e desbloqueio

`blocked` não é aprovação negada definitiva nem aprovação implícita. Ele representa impedimento atual.

Enquanto bloqueada, a montagem pode receber uma composição de remediação, mas continua `blocked`. Isso permite substituir uma capacidade que ficou inelegível ou cuja nova versão removeu um alerta crítico. O comando de desbloqueio é separado e obrigatório; ele reavalia as fontes atuais e só avança para `draft` ou `ready_for_review` quando não existe `critical`.

Desbloquear para `ready_for_review` registra nova revisão pelo ator autenticado. Desbloquear nunca preenche `approvedByProfessorId`/`approvedAt`.

## Auditoria

A cadeia `ConsolidatedPrescriptionVersion` é também a fonte auditável canônica. Isso evita duplicar a mesma transição em uma segunda tabela e mantém estado e auditoria atomicamente inseparáveis: se uma nova versão não é persistida por completo, não existe evento auditável correspondente.

A consulta de histórico deriva `auditEvents` deterministicamente da cadeia append-only, usando `previousVersionId`, estados, metadados de decisão e autoria da versão. As ações distinguíveis são:

- `created`;
- `composition_updated`;
- `sent_for_review`;
- `approved`;
- `blocked`;
- `blocked_by_conflict`;
- `unblocked`;
- `revision_created`.

Cada evento derivado expõe:

- ator backend (`createdByProfessorId` da versão materializada pela ação);
- agregado e versão correspondente;
- versão/estado anterior e novo;
- motivo persistido quando a ação possui motivo canônico de bloqueio;
- quantidade de conflitos críticos da versão como detalhe;
- timestamp da versão.

Atores/timestamps específicos de revisão, aprovação e bloqueio continuam persistidos nos campos próprios da versão. Nenhum evento é confiado ao payload do cliente.

## HTTP

Base: `/api/v1/consolidated-prescriptions`.

| Método | Rota | Permissão |
| --- | --- | --- |
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

A listagem usa a mesma autorização de leitura, aplica `contractId` e `dataScope` antes da consulta e não revela a existência do aluno para outro tenant. Não existe endpoint `/release` nesta fase.

## Autorização e privacidade

A API aplica, em conjunto:

1. autenticação e vínculo profissional ativo;
2. tela pai `plans`;
3. bloco específico da operação;
4. `contractId` do ator;
5. `dataScope` da tela `plans` (`self`, `managed`, `contract`);
6. escopo do aluno e responsável atual.

Acesso cross-tenant ou fora do `dataScope` devolve resposta genérica equivalente a recurso inexistente, evitando revelar a existência do aluno ou da montagem.

Defaults: `professor` recebe consulta/gestão e `plans=self`; `manager` recebe consulta/gestão/aprovação e `plans=contract`; `master` segue a regra global de acesso total dentro do contrato. `release` não foi concedido a nenhum perfil nesta issue.

## Dados-base e rastreabilidade

Origens presentes nas versões de capacidade são derivadas pelo backend e persistidas como `capacity_source`. O cliente não pode declarar esse papel.

Referências adicionais continuam limitadas às origens canônicas que o backend consegue revalidar no mesmo contrato/aluno. `manual_observation` é criada pelo backend; tipos sem objeto persistente verificável não são aceitos como autoridade adicional.

## Limites desta fase

Ficam fora da #317:

- tela web da montagem;
- motor clínico baseado em fórmulas ainda não formalizadas;
- criação de novos indicadores sem fonte persistida canônica;
- `approved -> released`;
- geração de `Treino de hoje`;
- feedback pós-treino.
