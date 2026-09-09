# Ciclo único lead -> aluno: identidade e propriedade dos dados (issue #268)

Este documento define a única fronteira de escrita dos dados pessoais no ciclo
`LEAD` até `ACTIVE_STUDENT`. O identificador de `Aluno` permanece estável em
todo o processo; conta, onboarding e auditoria são associações desse mesmo
registro, não pessoas paralelas.

## Representação canônica

- `User` e `Profile` representam a conta global de autenticação e sua projeção
  de acesso.
- `Aluno` representa a participação operacional da pessoa em um `contractId`.
- `StudentProfile.identificationData` é a fonte canônica tenant-scoped de
  identificação, contato, endereço e responsável.
- `StudentProfile.preferenceData` é a fonte canônica tenant-scoped das
  preferências e consentimentos administrativos do aluno.
- `StudentFinancialProfile` guarda os dados financeiros administrativos que não
  pertencem ao ciclo de vida do contrato; serviço vigente continua sendo
  derivado de `StudentContract`.
- `Aluno.lead*`, `Aluno.birthDate` e `Aluno.age` são projeções derivadas para
  busca, constraints e compatibilidade. Não são uma segunda API de escrita.
- `StudentOnboardingProcess` contém somente estado do processo, versões,
  consentimento, progresso e timestamps. Não armazena respostas cadastrais ou
  clínicas.

Toda escrita de identidade do domínio do aluno passa por
`student-identity.service.ts#upsertStudentIdentity`. Os fluxos administrativos
legados, o aplicativo do aluno e a revisão cadastral também usam essa mesma
fronteira. Durante o rollout, o service atualiza `Profile` como projeção de
compatibilidade somente quando a conta possui um único vínculo de aluno; contas
compartilhadas entre tenants nunca recebem sobrescrita por dados tenant-scoped; nenhum consumidor do domínio do
aluno deve escrever os mesmos campos diretamente em `Profile`.

## Matriz de propriedade

| Dado | Fonte canônica | Projeção/legado | Regra |
| --- | --- | --- | --- |
| nome | `StudentProfile.identificationData.name` | `Aluno.leadName`, `Profile.name` | `Profile` é projeção temporária da conta; leitura do domínio usa `StudentProfile` |
| CPF/documento | `StudentProfile.identificationData.cpf` | `Aluno.leadCpf` e normalizado, `Profile.cpf` | CPF normalizado é bloqueante somente dentro do tenant; `Profile.cpf` não possui unicidade global |
| RG | `StudentProfile.identificationData.rg` | `Profile.rg` | cadastro administrativo preserva dígito verificador alfanumérico e não cria um segundo writer |
| estado civil | `StudentProfile.identificationData.maritalStatus` | `Profile.maritalStatus` e `AlunoIntakeForm.formResponses.identification` somente como fallback de leitura | valor canônico prevalece; valor legado não reconhecido permanece visível até alteração explícita |
| rede social | `StudentProfile.identificationData.socialNetwork` + `socialAccount` | `AlunoIntakeForm.formResponses.identification.instagram` e `Profile.instagramHandle` somente como fallback | `Profile.instagramHandle` é projeção/fallback exclusivo de Instagram e nunca armazena conta de outra rede |
| contato de emergência | campos `emergencyContact*` de `StudentProfile.identificationData` | `AlunoIntakeForm.formResponses.identification` somente como fallback de leitura | relações personalizadas são preservadas literalmente; escrita passa pelo writer canônico de identidade |
| e-mail de contato | `StudentProfile.identificationData.email` | `Aluno.leadEmail` e normalizado | Pode ser diferente do e-mail de login e não bloqueia sozinho a criação |
| e-mail de login | `User.email` | nenhuma | Globalmente único e usado apenas para autenticação |
| telefone | `StudentProfile.identificationData.phone` | `Aluno.leadPhone` e normalizado, `Profile.phone` | Duplicidade exige revisão; não há unicidade de telefone |
| nascimento | `StudentProfile.identificationData.birthDate` | `Aluno.birthDate`, `Profile.birthDate` | `Aluno.age` é derivada por `deriveAgeFromBirthDate`; fluxos novos não inventam idade |
| endereço | campos `address*` de `StudentProfile.identificationData` | `Profile.address*` | Persistido no registro tenant-scoped mesmo antes de haver conta |
| responsável | campos `guardian*` de `StudentProfile.identificationData` | sem legado canônico | Não é copiado para onboarding nem logs |
| preferências administrativas | `StudentProfile.preferenceData` | `AlunoIntakeForm.formResponses.preferences` somente como fallback de leitura | novas alterações não fazem dual-write no intake legado |
| dados financeiros administrativos | `StudentFinancialProfile` | `AlunoIntakeForm.formResponses.financial` somente como fallback de leitura | `currentServiceName` é sincronizado pelo ciclo de `StudentContract`; payload do navegador não é autoridade |
| avatar | `Profile.avatar` | nenhuma | Atributo da conta, não da identidade operacional tenant-scoped |

## Cadastro administrativo e compatibilidade de leitura (#422)

As rotas de criação e edição de aluno continuam aceitando o formato histórico de
`intakeForm.formResponses` na borda para não quebrar o cliente atual, mas esse
objeto deixou de ser uma fronteira de persistência. O adapter
`student-administrative-form-responses.service.ts` separa o payload por ownership:

- identificação, documentação, endereço, rede social e contato de emergência
  são convertidos para nomes canônicos e enviados a `upsertStudentIdentity`;
- preferências são gravadas em `StudentProfile.preferenceData`;
- dados financeiros administrativos são gravados em `StudentFinancialProfile`;
- `financial.currentService` enviado pelo navegador é descartado como fonte de
  escrita; o serviço vigente continua vindo do ciclo de `StudentContract`;
- `parqResponses` não pertence a esse adapter e permanece na fronteira própria
  de `StudentParqSubmission`.

`AlunoIntakeForm.formResponses` é somente fallback de leitura. Nenhum fluxo da
#422 pode executar `INSERT` ou `UPDATE` nesse JSON. Na leitura administrativa, a
resposta compatível é reconstruída com precedência determinística:

1. valor existente no modelo canônico segmentado;
2. valor histórico de `AlunoIntakeForm.formResponses` quando ainda não existe
   valor canônico;
3. para conta social antiga sem rede registrada, `Profile.instagramHandle` pode
   ser exposto como Instagram somente como fallback.

O campo histórico `instagram` do formulário web é convertido em
`StudentProfile.identificationData.socialAccount` na escrita. O alias pode ser
reexposto no read model enquanto o cliente antigo ainda o consumir, sem voltar a
ser uma fonte canônica.

Quando a tela seleciona um contrato, perfil administrativo e vínculo contratual
são persistidos pelo endpoint atômico de `student-financial-contract.service.ts`.
Criação/edição do aluno e `prepareOrActivateStudentContractInTransaction` usam a
mesma transação Prisma: falha no contrato aborta também as alterações cadastrais.
A lógica de status, ativação e serviço do vínculo continua pertencendo ao domínio
`StudentContract`; o cadastro não duplica essas regras.

## Conta global e vínculos tenant-scoped

A mesma conta global pode estar vinculada simultaneamente a um `Aluno` de
contratos distintos. O banco aplica `@@unique([contractId, userId])`, que
impede duas pessoas operacionais com a mesma conta dentro do mesmo tenant sem
bloquear uso legítimo em outro contrato.

Quando uma conta possui mais de um vínculo ativo, rotas legadas não escolhem
um tenant silenciosamente. O cliente deve enviar `x-contract-id`; ausência de
contexto retorna conflito seguro. Contrato externo retorna a mesma resposta de
recurso inexistente.

CPF, e-mail e telefone de contato podem existir em contratos diferentes sem
consulta ou exposição cross-tenant. Dentro do tenant:

- CPF normalizado idêntico é bloqueado pela constraint;
- telefone/e-mail repetidos permanecem candidatos à revisão da #274;
- nome isolado nunca é chave de unicidade.

## Reivindicação da conta

`claimAccountForStudentLead` executa em transação e:

1. localiza o `Aluno` por `id + contractId`;
2. rejeita conta de tipo incompatível;
3. compara os identificadores disponíveis e retorna
   `ACCOUNT_DATA_MISMATCH` quando nome, telefone, CPF ou nascimento disponíveis
   divergem, sem confundir e-mail de contato com e-mail global de login e sem
   reconciliar silenciosamente;
4. rejeita a mesma conta em outro `Aluno` do mesmo contrato;
5. grava somente quando `userId IS NULL`;
6. trata retry da mesma conta como idempotente;
7. registra um único evento `ACCOUNT_LINKED`.

Duas contas disputando o mesmo lead não podem sobrescrever a vencedora.

## Estados e operações guardadas

Os estados e a matriz pública ficam em
`packages/types/student-lifecycle.ts`. A alteração persistida ocorre apenas em
`student-lifecycle.service.ts`, por operações específicas:

- `recordStudentInvitationCreated`: exige referência do convite e ator válido;
- `claimAccountForStudentLead`: vincula a conta sem mudar identidade;
- `startStudentPreRegistration`: exige conta que reivindicou o processo;
- `completeStudentPreRegistration`: valida e persiste dados/consentimento na
  mesma transação;
- `markStudentReadyForEnrollment`: exige consentimento, dados completos,
  referência de revisão e deduplicação;
- `activateStudentEnrollment`: exige estado pronto, conta e referência de
  ativação;
- `discardStudentLead` e `reopenDiscardedStudentLead`: exigem motivo e ator.

Não existe mutação genérica pública de status. Toda atualização usa condição
sobre tenant e estado anterior, impedindo que operações concorrentes avancem
sobre uma versão já alterada.

Anamnese e PAR-Q não participam das pré-condições comerciais.

## Anamnese Inicial e PAR-Q

`StudentHealthIntake` é a fonte canônica da Anamnese Inicial. O registro contém
respostas de saúde, consentimento próprio, versão de concorrência, estado e
timestamps de retomada/conclusão. `StudentOnboardingProcess` guarda apenas
`healthIntakeId`, `healthModuleStatus` e timestamps do processo; nenhuma
resposta clínica é copiada para o onboarding.

`StudentParqSubmission` é a fonte independente e histórica do PAR-Q. O catálogo
compartilhado versionado, o rascunho, a conclusão idempotente e a análise
profissional estão definidos em
[`../product/pre-registration-parq.md`](../product/pre-registration-parq.md).
`StudentOnboardingProcess` guarda somente `parqSubmissionId`, estado e timestamps.
Campos históricos em `AlunoIntakeForm` ou
`StudentHealthIntake.questionnaireParq` são compatibilidade somente leitura e
não recebem novas escritas. A reconciliação e o rollback estão documentados em
[`../operations/parq-cutover.md`](../operations/parq-cutover.md); o corte da
Anamnese permanece em
[`../operations/health-intake-cutover.md`](../operations/health-intake-cutover.md).

O módulo público da Anamnese reutiliza a autorização autenticada e tenant-scoped
do pré-cadastro. Convite não lê nem grava saúde; responsável exige autorização
ativa validada; primeira persistência pública exige consentimento explícito.

## Auditoria

`StudentLifecycleEvent` registra `contractId`, pessoa, ator, timestamp e
metadados seguros. A implementação emite:

- `LEAD_CREATED`;
- `IDENTIFIER_NORMALIZED_CHANGED`;
- `STATUS_CHANGED`;
- `ACCOUNT_LINKED`;
- `PRIVACY_CONSENT_RECORDED`;
- `PRE_REGISTRATION_COMPLETED`;
- `ADMIN_REVIEWED`;
- `DISCARDED`;
- `REOPENED`;
- `CONVERTED_TO_ACTIVE_STUDENT`.

`ACCOUNT_UNLINKED` permanece no contrato compartilhado para o fluxo futuro que
implementar desvínculo autorizado; nenhuma função desta issue permite a ação.

## Migration, backfill e rollback

A migration `20260721120000_student_lifecycle_domain` é convergente e pode ser
reexecutada no mesmo banco:

- criação de enums, colunas, tabelas, índices e constraints possui guarda;
- alunos legados recebem `contractId` derivado do professor e
  `ACTIVE_STUDENT`, preservando `id` e relacionamentos;
- `StudentProfile` é criado somente quando ausente, usando dados inferíveis de
  `User`/`Profile`/`Aluno`;
- origem, consentimento, ator ou fatos históricos desconhecidos não são
  inventados;
- registros de onboarding legados são criados sem simular etapas que não
  ocorreram;
- qualquer aluno sem tenant derivável interrompe a migration explicitamente;
- o CI aplica a migration sobre uma base anterior à #268 populada com vínculos de
  contrato, PRNT, avaliação, agenda, treino, intake e PAR-Q, confirma a preservação
  dos IDs/relacionamentos e reexecuta o SQL para provar convergência.

Para rollback temporário da aplicação, um trigger executado somente em `INSERT`
deriva `contractId` de `professorId` e classifica como `ACTIVE_STUDENT` o
cadastro completo produzido pela versão antiga. O trigger não executa em `UPDATE`
para não interceptar transições explícitas, como reabertura `DISCARDED -> LEAD`,
nem alterar `Aluno.status` fora do serviço de ciclo. O rollout não exige remover os
dados novos nem reverter a migration. O trigger e a projeção de `Profile`
devem ser removidos pela #275 após o encerramento da janela de rollback e a
confirmação de convergência dos consumidores.

## Compatibilidade dos módulos

Listagens administrativas, agenda, contratos, PRNT, avaliação, antropometria,
relatórios e treino devem:

- filtrar `ACTIVE_STUDENT` quando a tela representa alunos ativos;
- usar `Aluno.contractId` diretamente como barreira tenant-scoped, inclusive quando
  o aluno ainda não possui professor responsável;
- usar `Professor.contractId` somente para validar o professor ou recurso que
  efetivamente pertence ao professor, nunca para inferir o tenant do aluno;
- aceitar relações opcionais antes da ativação;
- negar de forma explícita operações que exigem conta/professor/dados completos;
- nunca escolher um vínculo de contrato por ordem acidental.

As rotas segmentadas também passam o `contractId` ao serviço de domínio. O serviço
filtra o registro raiz por `Aluno.id + Aluno.contractId`, de modo que uma chamada
interna ou futura rota não possa depender apenas da autorização feita na borda.
