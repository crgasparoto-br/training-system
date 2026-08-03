# Adipometria (ADPT) — contrato operacional da API

A API da adipometria é montada em `/api/v1/adipometry` e depende da fundação clínica e histórica descrita em `adipometry-protocol.md`.

## Autorização

Todas as rotas exigem autenticação de professor e acesso à tela `physicalAssessment.protocol`.

| Capacidade | Permissão |
|---|---|
| Consultar protocolos, histórico, detalhe, última avaliação, comparação e antropometria de apoio | `physicalAssessment.adpt.view` |
| Criar, editar, calcular e concluir rascunhos | `physicalAssessment.adpt.actions.manage` |
| Iniciar ou cancelar correção de avaliação concluída | `physicalAssessment.adpt.actions.correctCompleted` |

O contrato, o usuário e o professor ator são derivados do token. Nenhum endpoint aceita `contractId`, autor ou professor no corpo da requisição.

## Endpoints

- `GET /protocols/available?alunoId={id}&assessmentDate=AAAA-MM-DD`
- `GET /alunos/:alunoId/assessments`
- `GET /alunos/:alunoId/assessments/last`
- `GET /alunos/:alunoId/anthropometry-support?assessmentDate=AAAA-MM-DD&anthropometryAssessmentId={id}`
- `POST /alunos/:alunoId/assessments`
- `GET /assessments/:id`
- `PUT /assessments/:id`
- `POST /assessments/:id/calculate`
- `POST /assessments/:id/finalize`
- `POST /assessments/:id/corrections`
- `POST /assessments/:id/correction/cancel`
- `GET /alunos/:alunoId/compare?assessmentIds={id1,id2}`

## Rascunho e prévia

A criação usa a função transacional de numeração da fundação ADPT, garantindo código `ADPT-###` único por aluno e contrato sob concorrência. A numeração não é limitada a três dígitos; após `ADPT-999`, o próximo código é `ADPT-1000`.

O cálculo de prévia:

1. lê somente as entradas persistidas no rascunho;
2. valida aprovação clínica ativa, idade, decisão de sexo, precisão, limites e dobras obrigatórias;
3. recalcula os resultados no backend;
4. devolve `inputFingerprint`, que inclui entradas, protocolo, versão, aprovação e confirmação operacional;
5. não persiste resultados derivados.

Quando uma dobra estiver entre `45,1` e `80,0 mm`, o profissional precisa confirmar o alerta. A confirmação é persistida com autoria antes de a prévia ser considerada apta à conclusão.

## Conclusão

A conclusão ocorre em transação serializável. A API bloqueia o rascunho e a aprovação clínica ativa, recalcula os resultados e persiste o snapshot final na mesma transação.

Quando fornecido, `inputFingerprint` deve coincidir com a prévia atual. Alteração de medida, data, decisão de sexo, protocolo, versão, aprovação ou confirmação invalida a prévia anterior.

Repetir a conclusão da mesma revisão já finalizada devolve o registro existente sem produzir outra avaliação.

## Correção

Avaliações concluídas não são editadas diretamente. A correção cria uma nova revisão ligada à cadeia original, com categoria e motivo obrigatórios.

Mudança de protocolo só é permitida na categoria `PROTOCOL_SELECTION_ERROR`, mediante confirmação explícita. Ao concluir a correção, a revisão anterior torna-se `SUPERSEDED`; cancelar o rascunho preserva-o como `CANCELLED` sem alterar a revisão vigente.

## Histórico e comparação

As consultas operacionais retornam somente revisões atuais. O detalhe inclui a cadeia de revisões e os eventos de auditoria do registro consultado.

A comparação utiliza uma ou duas avaliações concluídas atuais, apresenta deltas neutros e emite alerta quando os protocolos ou versões forem diferentes. A API não classifica variações como melhora ou piora.

## Antropometria de apoio

O vínculo é opcional. Quando informado, o registro precisa:

- pertencer ao mesmo contrato;
- pertencer ao mesmo aluno;
- possuir data igual ou anterior à ADPT.

A ausência de antropometria não bloqueia a ADPT. O endpoint de apoio informa a avaliação elegível mais recente e, quando solicitada, a avaliação selecionada. Cada registro inclui código, data, observações gerais e as medidas ordenadas, com nome do segmento, tipo, descrição técnica, orientação de fórmula, valor, unidade e observação.

Essas informações apoiam conferência e reaproveitamento consciente pela interface. A ADPT continua responsável por persistir suas próprias entradas; nenhum resultado derivado da antropometria é copiado automaticamente.

## Erros públicos

As respostas seguem o envelope padrão de `sendSuccess` e `sendError`.

- `400`: payload, data, precisão ou regra de entrada inválida;
- `401`: autenticação ausente ou inválida;
- `403`: tela ou bloco de acesso negado;
- `404`: recurso inexistente ou pertencente a outro contrato, sem distinção observável;
- `409`: estado concorrente, prévia invalidada, aprovação ausente/revogada ou transição histórica inválida;
- `500`: falha inesperada sanitizada, com `correlationId` quando disponível.

Mensagens brutas do PostgreSQL ou Prisma não são devolvidas ao consumidor.
