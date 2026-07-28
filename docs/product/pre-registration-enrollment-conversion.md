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

Classificação, fingerprint, autorização e bloqueio consideram todos os candidatos encontrados; a interface não trunca silenciosamente a decisão. O claim e o salvamento público executam a detecção dentro da própria transação, mas não devolvem código, corpo, status, mensagem ou aviso diferente em razão da classificação encontrada. A decisão permanece para a revisão administrativa. O rate limit executa antes da rota pública. A tela administrativa exibe dados mascarados apenas para candidatos incluídos no escopo de dados do usuário autenticado. A existência de candidatos restritos pode ser informada por contagem, sem revelar identidade, contato ou identificador.

## Preservação pública sem enumeração

Ao salvar identificação ou contato com conflito, o sistema preserva o trabalho sem confirmar a identidade como válida:

- a resposta continua sendo `Etapa salva`, com a mesma sessão usada quando não há conflito;
- CPF, e-mail, telefone, candidato, classificação e fingerprint não aparecem na resposta pública;
- `duplicateWarnings` é sempre removido da sessão exposta ao aluno ou responsável;
- os campos seguros são gravados normalmente;
- um CPF bloqueante fica como valor bruto pendente, sem ocupar a projeção normalizada única;
- o snapshot completo fica em revisão privada, com versão e auditoria;
- endereço, responsável e privacidade podem continuar sendo preenchidos sem apagar a pendência;
- corrigir o identificador para um valor não conflitante encerra a pendência preservando o histórico;
- concluir o pré-cadastro não libera a matrícula: o detector administrativo ainda encontra o valor bruto e impede `READY_FOR_ENROLLMENT`.

## Decisões administrativas

### Confirmar pessoas diferentes

Disponível somente para ocorrências `REVIEW_REQUIRED`. A decisão exige motivo, ator, fingerprint das evidências, versão revisada e validade de 30 dias. CPF ou conta incompatível não podem ser liberados por esta opção.

Na criação de um novo lead e na edição de dados comerciais, a confirmação de falso positivo, a versão, o fingerprint e o motivo são revalidados e gravados na mesma transação serializável da mutação. A edição apresenta preflight mascarado, exige confirmação explícita e reabre a verificação quando nome ou identificadores mudam. A decisão só pode ser concluída quando o usuário possui escopo para revisar todos os candidatos relacionados; uma confirmação enviada apenas pelo frontend não é suficiente.

### Usar cadastro existente

O administrador escolhe explicitamente o canônico, dentro do mesmo contrato e do próprio escopo de dados, e decide cada diferença. Valores existentes no canônico não são sobrescritos automaticamente; campos vazios podem ser preenchidos apenas mediante escolha explícita.

O registro duplicado permanece no banco, é marcado `DISCARDED`, tem convite ativo revogado e recebe `canonicalAlunoId` apontando para um canônico do mesmo tenant. Registros com esse vínculo deixam de ser candidatos em novas detecções, evitando que a origem já resolvida bloqueie o destino. A origem e o canônico recebem auditorias próprias; a auditoria do destino usa fingerprint e versão recalculados após a consolidação. Não existe exclusão física.

Quando a origem possui conta e o canônico ainda não possui, a transferência só ocorre após validar a conta contra a identidade final do canônico; incompatibilidade de nome, CPF, telefone ou nascimento bloqueia toda a consolidação sem desvincular a origem.

A consolidação é bloqueada com `CLINICAL_REASSOCIATION_REQUIRED` quando a origem ainda possui dados owned por outro domínio que exigiriam reassociação: Anamnese, PAR-Q, prontuário, avaliações, antropometria, treino e execuções, agenda, contratos, financeiro, integrações, métricas ou nutrição. Nenhum dado é movido por heurística ou deixado preso em uma origem encerrada.

O inventário bloqueante e a lista explícita de relações de processo/auditoria preservadas na origem ficam em `pre-registration-clinical-ownership.service.ts`. O preflight devolve o erro de domínio no caminho normal e a migration `20260728081500_issue_274_clinical_ownership_guard` instala um trigger no PostgreSQL para impedir o descarte por duplicidade quando uma escrita concorrente ou chamada direta encontrar qualquer relação bloqueante.

### Cancelar

Cancela a tentativa sem alteração de estado ou dados.

## Revisão e matrícula

`READY_FOR_ENROLLMENT` exige:

- `PRE_REGISTRATION_COMPLETED`;
- campos obrigatórios e versão do consentimento igual à política vigente;
- ausência de conflito bloqueante;
- decisão vigente para duplicidade revisável;
- `StudentOnboardingProcess.version` igual à versão revisada.

Alterações de nome, CPF, contatos, nascimento, origem, responsável comercial, unidade ou observações após a conclusão incrementam a versão e invalidam a revisão anterior. Nas etapas públicas de identificação e contato, a verificação ocorre dentro da mesma transação, após autorização e bloqueio do processo e antes da persistência da identidade.

A invalidação de origem/responsável em `Aluno` e de unidade/observações em `StudentProfile` compartilha um marcador transacional por aluno. Assim, alterações exclusivamente comerciais invalidam a versão mesmo antes da primeira revisão (`reviewedAt` ainda nulo), enquanto uma edição combinada nas duas projeções incrementa `version` exatamente uma vez.

A confirmação da matrícula ocorre em transação serializável, recarrega e bloqueia o registro, revalida permissão, escopo e tenant, reexecuta a deduplicação, rejeita revisão desatualizada, revoga convite ativo e altera o mesmo ID para `ACTIVE_STUDENT`. Repetição após sucesso devolve resultado idempotente e não duplica auditoria.

A criação administrativa reconsulta a tela, o bloco `students.preRegistration.create`, o tenant, o data scope e a visibilidade do responsável dentro da mesma transação que deduplica e grava o lead. A autorização observada apenas no middleware nunca é suficiente para o commit.

### Concorrência observável na API

Falhas de serialização ou deadlock detectadas pelo Prisma/PostgreSQL durante decisão de duplicidade, consolidação, renovação da revisão ou confirmação da matrícula são convertidas para o erro de domínio `CONCURRENT_MODIFICATION`. A API responde `409` com orientação para recarregar e refazer a revisão, sem expor `P2034`, SQLSTATE, mensagem do PostgreSQL ou detalhes internos do Prisma. O rollback transacional permanece obrigatório.

## Revisão e pós-ativação

A revisão apresenta identificação e contatos conforme permissão, normalização, origem, responsável, unidade, observações, datas do processo, consentimento, histórico, status de Anamnese/PAR-Q e domínios posteriores. O acesso à área clínica só aparece para quem possui a permissão específica.

Pendências obrigatórias são exibidas em uma região própria, distinguindo itens bloqueantes de avisos informativos. O bloqueio não deve aparecer apenas como botão desabilitado: a interface informa qual requisito precisa ser corrigido e oferece acesso à edição administrativa quando aplicável.

Depois da ativação, a Central do Aluno mantém uma confirmação recarregável na URL e oferece próximas ações conforme as permissões vigentes. A visão padrão de leads continua excluindo alunos ativos, mas o filtro `Convertido` localiza `ACTIVE_STUDENT`.

## Fora de escopo automático

A confirmação não cria nem ativa contrato, plano, cobrança, financeiro, professor responsável, agenda, avaliação física ou permissões clínicas. A tela mostra esses domínios como `não configurado`.

Anamnese pendente, PAR-Q pendente e alerta positivo de PAR-Q não bloqueiam a matrícula e não são encerrados automaticamente.
