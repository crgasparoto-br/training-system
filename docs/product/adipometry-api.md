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

A validade criptográfica do token não substitui a elegibilidade atual. Antes de acessar a ADPT, a API revalida que o usuário permanece ativo e que o vínculo do professor não está inativo, desligado ou com data de desligamento já efetiva. Estados legados nulos continuam elegíveis como ativos. Um token emitido antes da desativação deixa de autorizar leituras e escritas imediatamente após a mudança administrativa.

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

Datas no formato `AAAA-MM-DD` são datas civis estritas. Valores que apenas correspondem ao formato, mas não existem no calendário, como `2026-02-31`, são rejeitados com `400`; não há normalização silenciosa para outro dia ou mês.

## Rascunho e prévia

A criação usa a função transacional de numeração da fundação ADPT, garantindo código `ADPT-###` único por aluno e contrato sob concorrência. A numeração não é limitada a três dígitos; após `ADPT-999`, o próximo código é `ADPT-1000`.

O cálculo de prévia:

1. lê somente as entradas persistidas no rascunho;
2. valida aprovação clínica ativa, idade, decisão de sexo, precisão, limites e dobras obrigatórias;
3. executa, na ordem declarada, a AST de equações do snapshot clínico aprovado pelo contrato;
4. aplica a precisão e o arredondamento declarados no protocolo somente aos resultados finais;
5. devolve `usedSkinfolds`, com as dobras efetivamente selecionadas pelo protocolo;
6. devolve `inputFingerprint`, que inclui entradas, protocolo, versão, aprovação, confirmação operacional, data de nascimento, idade na avaliação, sexo cadastral atual e os metadados persistidos da decisão clínica de sexo;
7. não persiste resultados derivados.

O backend não mantém uma fórmula clínica paralela à definição aprovada. Alterar uma equação em uma nova versão aprovada altera o cálculo executado, enquanto avaliações já concluídas continuam preservadas por seu snapshot.

A origem `profile` só é válida quando há sexo cadastral masculino ou feminino e ele coincide exatamente com o sexo de referência do protocolo. Cadastro ausente ou `other` exige `professional_confirmation`; divergência exige `professional_override` com justificativa. Essas regras são reavaliadas em toda prévia e novamente na conclusão.

Alertas de capacidade são determinados pelos limites do protocolo aprovado. Na versão Guedes atual, uma dobra entre `45,1` e `80,0 mm` exige confirmação do profissional. A confirmação e sua autoria são gravadas dentro da mesma transação serializável do cálculo e somente quando não existe outro erro bloqueante. Se o cálculo ou qualquer persistência falhar, a confirmação não permanece registrada.

## Conclusão

A conclusão ocorre em transação serializável. A API bloqueia o rascunho, a aprovação clínica ativa e as fontes cadastrais autoritativas do aluno, executa novamente o contrato clínico aprovado e persiste o snapshot final na mesma transação.

`inputFingerprint` é obrigatório. Ele deve coincidir com a prévia atual; sua ausência retorna `ADIPOMETRY_PREVIEW_REQUIRED`. Alteração de medida, data, decisão de sexo, protocolo, versão, aprovação, confirmação, data de nascimento, idade calculada ou sexo cadastral invalida a prévia anterior e retorna `ADIPOMETRY_PREVIEW_INVALIDATED`.

O snapshot final preserva a autoria, o instante e o sexo cadastral registrados quando a decisão clínica foi confirmada. O profissional que apenas calcula ou conclui posteriormente não substitui o autor original da decisão.

Repetir a conclusão da mesma revisão já finalizada devolve o registro existente sem produzir outra avaliação.

## Correção

Avaliações concluídas não são editadas diretamente. A correção cria uma nova revisão ligada à cadeia original, com categoria e motivo obrigatórios.

Mudança de protocolo só é permitida na categoria `PROTOCOL_SELECTION_ERROR`, mediante confirmação explícita. Ao concluir a correção, a revisão anterior torna-se `SUPERSEDED`; cancelar o rascunho preserva-o como `CANCELLED` sem alterar a revisão vigente.

## Histórico e comparação

As consultas operacionais retornam somente revisões atuais. O detalhe inclui a cadeia de revisões e os eventos de auditoria do registro consultado.

A comparação utiliza uma ou duas avaliações concluídas atuais, apresenta deltas neutros e emite alerta quando os protocolos ou versões forem diferentes. A API não classifica variações como melhora ou piora.

A ordenação é total e determinística: data da avaliação, instante de conclusão e identificador estável. Assim, duas avaliações concluídas no mesmo dia preservam corretamente a relação entre anterior e atual e não invertem o sinal dos deltas.

## Antropometria de apoio

O vínculo é opcional. Quando informado, o registro precisa:

- pertencer ao mesmo contrato;
- pertencer ao mesmo aluno;
- possuir data igual ou anterior à ADPT.

A ausência de antropometria não bloqueia a ADPT. O endpoint de apoio informa a avaliação elegível mais recente e, quando solicitada, a avaliação selecionada. Cada registro inclui código, data, observações gerais e as medidas ordenadas, com nome do segmento, tipo, descrição técnica, orientação de fórmula, valor, unidade e observação.

Essas informações apoiam conferência e reaproveitamento consciente pela interface. A ADPT continua responsável por persistir suas próprias entradas; nenhum resultado derivado da antropometria é copiado automaticamente.

## Erros públicos

As respostas seguem o envelope padrão de `sendSuccess` e `sendError`. Uma fronteira pública montada antes dos middlewares legados normaliza também falhas de autenticação, elegibilidade profissional e controle de acesso, garantindo `details.code` estável sem expor mensagens internas.

- `400`: payload, data, precisão ou regra de entrada inválida;
- `401`: autenticação ausente ou inválida, com `ADIPOMETRY_AUTHENTICATION_REQUIRED`;
- `403`: tela ou bloco de acesso negado, com `ADIPOMETRY_ACCESS_DENIED`;
- `404`: recurso inexistente, pertencente a outro contrato ou ator profissional que deixou de ser elegível, sem distinção observável e com `ADIPOMETRY_RESOURCE_NOT_FOUND`;
- `409`: prévia ausente ou invalidada, estado concorrente, aprovação ausente/revogada ou transição histórica inválida;
- `500`: falha inesperada sanitizada, com `ADIPOMETRY_UNEXPECTED_ERROR` e `correlationId`.

Mensagens brutas do PostgreSQL, Prisma ou middlewares legados não são devolvidas ao consumidor.
