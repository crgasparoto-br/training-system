# Deduplicação, revisão e conversão da pré-matrícula

## Objetivo

O ciclo comercial e cadastral usa um único `Aluno.id` desde o lead até `ACTIVE_STUDENT`. A confirmação de matrícula altera o estado do mesmo registro; não copia a pessoa e não cria outro aluno.

## Detector canônico

A mesma função de domínio é executada antes de criar lead, vincular conta/convite, aceitar alteração de identificadores, salvar identificação ou contato no pré-cadastro público, marcar `READY_FOR_ENROLLMENT` e confirmar `ACTIVE_STUDENT`.

Normalizações:

- CPF sem máscara e somente quando os 11 dígitos e os dois verificadores forem válidos; CPF inválido não participa como evidência bloqueante;
- e-mail com trim e sem distinção de maiúsculas e minúsculas;
- telefone em dígitos internacionais: para números nacionais, `55 + DDD + número`; prefixos `+`/`00` explícitos são preservados e número sem DDD não participa como identificador canônico;
- nome sem acentos e espaços redundantes, ignorando partículas portuguesas comuns e usando a semelhança apenas como evidência auxiliar;
- data civil de nascimento, sem deslocamento de fuso.

Classificações:

- `BLOCKING`: mesmo CPF válido, conta já vinculada ou combinação de identidade forte com contas incompatíveis;
- `REVIEW_REQUIRED`: mesmo e-mail, mesmo telefone ou mesmo nome e data de nascimento;
- `INFORMATIONAL`: nome semelhante isoladamente;
- `NONE`: sem evidência material.

O fluxo público devolve somente uma mensagem genérica de revisão. A tela administrativa exibe dados mascarados apenas para candidatos incluídos no escopo de dados do usuário autenticado. A existência de candidatos restritos pode ser informada por contagem, sem revelar identidade, contato ou identificador.

## Decisões administrativas

### Confirmar pessoas diferentes

Disponível somente para ocorrências `REVIEW_REQUIRED`. A decisão exige motivo, ator, fingerprint das evidências, versão revisada e validade de 30 dias. CPF ou conta incompatível não podem ser liberados por esta opção.

Na criação de um novo lead, a confirmação de falso positivo e seu motivo são revalidados e gravados na mesma transação serializável da criação. A decisão só pode ser concluída quando o usuário possui escopo para revisar todos os candidatos relacionados; uma confirmação enviada apenas pelo frontend não é suficiente.

### Usar cadastro existente

O administrador escolhe explicitamente o canônico, dentro do mesmo contrato e do próprio escopo de dados, e decide cada diferença. Valores existentes no canônico não são sobrescritos automaticamente; campos vazios podem ser preenchidos apenas mediante escolha explícita.

O registro duplicado permanece no banco, é marcado `DISCARDED`, tem convite ativo revogado e recebe `canonicalAlunoId` apontando para um canônico do mesmo tenant. Registros com esse vínculo deixam de ser candidatos em novas detecções, evitando que a origem já resolvida bloqueie o destino. A origem e o canônico recebem auditorias próprias; a auditoria do destino usa fingerprint e versão recalculados após a consolidação. Não existe exclusão física.

Se o duplicado possuir Anamnese, PAR-Q, prontuário ou outro registro clínico, a consolidação é bloqueada com `CLINICAL_REASSOCIATION_REQUIRED`. Nenhum dado é movido por heurística ou perdido.

### Cancelar

Cancela a tentativa sem alteração de estado ou dados.

## Revisão e matrícula

`READY_FOR_ENROLLMENT` exige:

- `PRE_REGISTRATION_COMPLETED`;
- campos obrigatórios e consentimento vigentes;
- ausência de conflito bloqueante;
- decisão vigente para duplicidade revisável;
- `StudentOnboardingProcess.version` igual à versão revisada.

Alterações de nome, CPF, contatos ou nascimento após a conclusão incrementam a versão e invalidam a revisão anterior. Nas etapas públicas de identificação e contato, a verificação ocorre dentro da mesma transação, após autorização e bloqueio do processo e antes da persistência da identidade.

A confirmação da matrícula ocorre em transação serializável, recarrega e bloqueia o registro, reexecuta a deduplicação, rejeita revisão desatualizada, revoga convite ativo e altera o mesmo ID para `ACTIVE_STUDENT`. Repetição após sucesso devolve resultado idempotente e não duplica auditoria.

## Fora de escopo automático

A confirmação não cria nem ativa contrato, plano, cobrança, financeiro, professor responsável, agenda, avaliação física ou permissões clínicas. A tela mostra esses domínios como `não configurado`.

Anamnese pendente, PAR-Q pendente e alerta positivo de PAR-Q não bloqueiam a matrícula e não são encerrados automaticamente.
