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
- `Aluno.lead*`, `Aluno.birthDate` e `Aluno.age` são projeções derivadas para
  busca, constraints e compatibilidade. Não são uma segunda API de escrita.
- `StudentOnboardingProcess` contém somente estado do processo, versões,
  consentimento, progresso e timestamps. Não armazena respostas cadastrais ou
  clínicas.

Toda escrita do domínio do aluno passa por
`student-identity.service.ts#upsertStudentIdentity`. Os fluxos administrativos
legados, o aplicativo do aluno e a revisão cadastral também usam essa mesma
fronteira. Durante o rollout, o service atualiza `Profile` como projeção de
compatibilidade quando há conta vinculada; nenhum consumidor do domínio do
aluno deve escrever os mesmos campos diretamente em `Profile`.

## Matriz de propriedade

| Dado | Fonte canônica | Projeção/legado | Regra |
| --- | --- | --- | --- |
| nome | `StudentProfile.identificationData.name` | `Aluno.leadName`, `Profile.name` | `Profile` é projeção temporária da conta; leitura do domínio usa `StudentProfile` |
| CPF/documento | `StudentProfile.identificationData.cpf` | `Aluno.leadCpf` e normalizado, `Profile.cpf` | CPF normalizado é bloqueante somente dentro do tenant por `@@unique([contractId, leadCpfNormalized])` |
| e-mail de contato | `StudentProfile.identificationData.email` | `Aluno.leadEmail` e normalizado | Pode ser diferente do e-mail de login e não bloqueia sozinho a criação |
| e-mail de login | `User.email` | nenhuma | Globalmente único e usado apenas para autenticação |
| telefone | `StudentProfile.identificationData.phone` | `Aluno.leadPhone` e normalizado, `Profile.phone` | Duplicidade exige revisão; não há unicidade de telefone |
| nascimento | `StudentProfile.identificationData.birthDate` | `Aluno.birthDate`, `Profile.birthDate` | `Aluno.age` é derivada por `deriveAgeFromBirthDate`; fluxos novos não inventam idade |
| endereço | campos `address*` de `StudentProfile.identificationData` | `Profile.address*` | Persistido no registro tenant-scoped mesmo antes de haver conta |
| responsável | campos `guardian*` de `StudentProfile.identificationData` | sem legado canônico | Não é copiado para onboarding nem logs |
| avatar | `Profile.avatar` | nenhuma | Atributo da conta, não da identidade operacional tenant-scoped |

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
   `ACCOUNT_DATA_MISMATCH` quando há divergência, sem reconciliar
   silenciosamente;
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
- qualquer aluno sem tenant derivável interrompe a migration explicitamente.

Para rollback temporário da aplicação, um trigger anterior ao insert/update
deriva `contractId` de `professorId` e classifica como `ACTIVE_STUDENT` o
cadastro completo produzido pela versão antiga. O rollout não exige remover os
dados novos nem reverter a migration. O trigger e a projeção de `Profile`
devem ser removidos pela #275 após o encerramento da janela de rollback e a
confirmação de convergência dos consumidores.

## Compatibilidade dos módulos

Listagens administrativas, agenda, contratos, PRNT, avaliação, antropometria,
relatórios e treino devem:

- filtrar `ACTIVE_STUDENT` quando a tela representa alunos ativos;
- usar `Aluno.contractId` como barreira tenant-scoped;
- aceitar relações opcionais antes da ativação;
- negar de forma explícita operações que exigem conta/professor/dados completos;
- nunca escolher um vínculo de contrato por ordem acidental.
