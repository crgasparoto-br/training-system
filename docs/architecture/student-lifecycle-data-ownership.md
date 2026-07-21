# Ciclo único lead -> aluno: propriedade dos dados pessoais (issue #268)

Este documento é a matriz obrigatória de propriedade de dados pessoais exigida
pelo épico #267. Define, para cada dado, qual é a **fonte canônica de
escrita**, a compatibilidade com o modelo legado e a regra de
leitura/migração. Não existem duas fontes canônicas editáveis
simultaneamente para o mesmo dado.

## Identidade canônica

O identificador de `Aluno` é o identificador canônico da pessoa no domínio de
alunos desde `LEAD` até `ACTIVE_STUDENT`. Não existe uma tabela `Lead`
paralela com nome/documento/contato editáveis: o próprio `Aluno` carrega os
campos `lead*` enquanto não houver conta vinculada.

## Matriz de propriedade

| Dado | Fonte canônica de escrita | Compatibilidade legada | Regra de leitura/migração |
| --- | --- | --- | --- |
| nome | `Aluno.leadName` **antes** do vínculo de conta; `Profile.name` **depois** do vínculo (claim) | `Profile.name` para todo aluno já ativo | Ao vincular conta (`claimAccountForStudentLead`), `Aluno.leadName` deixa de ser escrito; leitura de exibição prioriza `Profile.name` quando existir, senão `Aluno.leadName`. Não há dual-write permanente: a cópia para `Profile` acontece uma única vez, no momento do claim, dentro das subissues que implementam o pré-cadastro (#270+) |
| CPF/documento | `Aluno.leadCpf`/`leadCpfNormalized` antes da conta; `Profile.cpf` depois | `Profile.cpf` (`@unique` global, inalterado) | Normalização somente dígitos (`normalizeLeadCpf`). Unicidade do lead é **tenant-scoped** (`@@unique([contractId, leadCpfNormalized])`); `Profile.cpf` continua globalmente único porque representa uma conta de autenticação, não uma pessoa por contrato — ver seção "Conta, tenant e unicidade" |
| e-mail (contato da pessoa) | `Aluno.leadEmail`/`leadEmailNormalized` | `Profile` não tem e-mail próprio hoje (usa `User.email`) | Não confundir com e-mail de login. O lead pode ter e-mail de contato sem nunca ter conta |
| e-mail (conta) | `User.email` | inalterado | Vínculo com a pessoa é sempre via `Aluno.userId` (associação opcional, nunca fabricada) |
| telefone | `Aluno.leadPhone`/`leadPhoneNormalized` antes da conta; `Profile.phone` depois | `Profile.phone` | Normalização somente dígitos (`normalizeLeadPhone`). Unicidade tenant-scoped em `Aluno`, sem constraint equivalente em `Profile` (histórico não normalizado) |
| nascimento | `Aluno.birthDate` (persistido assim que informado, em qualquer estágio) | `Profile.birthDate` / `Aluno.age` (legado) | Idade nunca é persistida como valor livre a partir de #268 nos novos fluxos: `deriveAgeFromBirthDate` calcula a idade sob demanda. `Aluno.age` continua existindo apenas para compatibilidade com alunos já ativos migrados (não é mais escrito por novos fluxos baseados em `birthDate`) |
| endereço | Formulário de pré-cadastro (JSON/DTO `UpdateStudentPreRegistrationDTO`), persistido nas subissues de pré-cadastro (#270) usando `Profile.address*` como destino final pós-claim | `Profile.address*` | Antes do claim, endereço fica apenas no processo de onboarding (não duplicado em `Aluno`); a persistência definitiva ocorre em `Profile` no momento da conclusão do pré-cadastro |
| responsável (menor de idade) | Formulário de pré-cadastro, campos `guardian*` do DTO compartilhado | Não existe hoje no legado | Novo dado; fonte única desde a criação, sem legado a conciliar |

## Regra geral

- Cada atributo tem **uma única fonte canônica editável** em cada momento do
  ciclo (antes/depois do claim). Nunca duas.
- Projeções ou caches (ex.: exibir nome em uma listagem) são sempre
  derivadas e somente leitura — nunca uma segunda fonte de escrita.
- Dual-write só existe como cópia **pontual e não recorrente** no instante do
  claim de conta (`Aluno.lead*` → `Profile.*`), implementada pelas subissues
  de pré-cadastro. Este documento proíbe qualquer dual-write permanente.
- A API antiga (`aluno.service.ts` `create`/`update`) nunca escreve nos
  campos `lead*`: ela sempre cria um aluno já `ACTIVE_STUDENT` com conta e
  perfil completos, preservando o comportamento anterior a #268. Mesmo essa
  criação direta não escreve o literal `'ACTIVE_STUDENT'` livremente: ela
  chama `legacyDirectActiveStudentCreationFields()` (exportado por
  `student-lifecycle.service.ts`), que é o único ponto que decide os campos
  de status/ativação desse fluxo legado — nenhum arquivo fora do service
  escreve `Aluno.status` como literal solto.

## Conta, tenant e unicidade

- **Conta de autenticação (`User`) é global e reutilizável entre contratos.**
  `User.email` permanece `@unique` sem escopo de tenant — uma pessoa com
  conta pode, em tese, estar associada a `Aluno`s de contratos diferentes ao
  longo do tempo (não simultaneamente, pois `Aluno.userId` é `@unique`: uma
  conta só pode estar vinculada a um `Aluno` por vez).
- **O registro comercial/clínico (`Aluno`, `StudentProfile`,
  `StudentHealthIntake`, `StudentOnboardingProcess`) é sempre tenant-scoped
  por `contractId`.** Um mesmo CPF/e-mail/telefone pode existir como leads
  distintos em contratos diferentes sem conflito — a deduplicação
  administrativa (#274) atua **dentro do tenant**, nunca cross-tenant.
- **Mesmo CPF/e-mail/telefone em contratos diferentes:** permitido. Os
  índices únicos (`@@unique([contractId, leadEmailNormalized])` etc.) são
  compostos com `contractId`, então o mesmo identificador em dois contratos
  não colide.
- **Pessoa já ativa em outro contrato:** não impede a criação de um novo
  lead no contrato atual (são registros `Aluno` distintos); a conta de
  autenticação, se reaproveitada, precisa passar pelo fluxo de claim
  (idempotente) no novo `Aluno`.
- **Pessoa já existente no mesmo contrato sem conta vinculada:** é
  justamente o estado `LEAD`/`INVITED` — a claim account associa a conta ao
  registro já existente, sem criar um segundo `Aluno`.
- **Usuário autenticado que reivindica convite de outra pessoa:**
  `claimAccountForStudentLead` rejeita quando `Aluno.userId` já pertence a
  outra conta (`ACCOUNT_ALREADY_LINKED`) e trata corrida concorrente via a
  constraint `@unique` de `Aluno.userId` (P2002 vira o mesmo erro de
  domínio).
- **Tentativa cross-tenant:** toda leitura/mutação de ciclo de vida busca o
  `Aluno` filtrando por `id` **e** `contractId` na mesma query
  (`findAlunoInContractOrThrow`). Se não casar, a resposta é idêntica à de
  "não encontrado" — nunca revela se o registro existe em outro tenant.
- **Vínculo de conta é transacional e idempotente:** `claimAccountForStudentLead`
  roda dentro de `prisma.$transaction`, retorna sem erro se a mesma conta
  reivindicar duas vezes, e rejeita explicitamente uma segunda conta
  diferente.

## Estados e transições

Centralizados em `packages/types/student-lifecycle.ts`
(`STUDENT_LIFECYCLE_TRANSITIONS`) e aplicados exclusivamente por
`apps/api/src/modules/alunos/student-lifecycle.service.ts`. Nenhum outro
ponto do código deve escrever `Aluno.status` diretamente.

```
LEAD -> INVITED -> PRE_REGISTRATION_IN_PROGRESS -> PRE_REGISTRATION_COMPLETED
     -> READY_FOR_ENROLLMENT -> ACTIVE_STUDENT
Qualquer estado (exceto ACTIVE_STUDENT) -> DISCARDED -> LEAD (reabertura explícita)
```

### Persistência do onboarding e auditoria por transição

Cada transição relevante em `transitionStudentLifecycleStatus` também
atualiza `StudentOnboardingProcess` (não apenas cria a linha vazia):
`PRE_REGISTRATION_IN_PROGRESS` grava `startedAt`; `PRE_REGISTRATION_COMPLETED`
grava `completedAt` (junto com `privacyNoticeVersion`/`privacyAcceptedAt`,
gravados por `completeStudentPreRegistration`); `READY_FOR_ENROLLMENT` grava
`reviewedAt`/`reviewedByProfessorId` e emite o evento `ADMIN_REVIEWED`;
`ACTIVE_STUDENT` grava `convertedAt`. `recordStudentOnboardingProgress`
existe para salvamento incremental (`lastSavedAt`/`formVersion`) fora de uma
transição de estado, para uso das telas de pré-cadastro (#270+).

Cobertura de eventos de auditoria nesta issue: `LEAD_CREATED`,
`STATUS_CHANGED`, `ADMIN_REVIEWED`, `CONVERTED_TO_ACTIVE_STUDENT`,
`ACCOUNT_LINKED`, `DISCARDED`, `REOPENED` são emitidos por esta issue.
`IDENTIFIER_NORMALIZED_CHANGED` e `ACCOUNT_UNLINKED` estão definidos no
contrato compartilhado mas **não são emitidos por nenhuma função desta
issue**, porque #268 não implementa edição de identificadores de um lead já
criado nem desvínculo de conta — esses fluxos pertencem às subissues de
pré-cadastro/administração (#270+), que devem emitir esses eventos ao
implementar as respectivas ações.

`ACTIVE_STUDENT` e `DISCARDED` (exceto para reabertura) são estados
terminais nesta issue; a conversão administrativa final e a UI de
reabertura ficam a cargo de #269-#274.

## Migration e rollback

- Migration: `apps/api/prisma/migrations/20260721120000_student_lifecycle_domain/`.
- Backfill: todo `Aluno` existente é classificado `ACTIVE_STUDENT`,
  `contractId` é derivado do `professor.contractId` (que já era
  obrigatório), e `activatedAt` reaproveita `createdAt` — nenhuma data ou
  origem é inventada. Uma guarda (`DO $$ ... RAISE EXCEPTION`) impede a
  migration de seguir se sobrar algum `Aluno` sem `contractId` resolvível.
- Idempotência: a migration só altera linhas cujo `contractId` ainda esteja
  nulo; reexecuções não duplicam nem corrompem dado.
- Rollback de aplicação: como todos os alunos legados viram
  `ACTIVE_STUDENT` e os novos campos são opcionais (exceto `contractId` e
  `status`, que têm default seguro), o código anterior a #268 continua
  funcionando após rollback de aplicação sem precisar reverter a migration
  nem apagar dados gerados por ela.

## Compatibilidade de aplicação

- `aluno.service.ts#create` e `student-financial-contract.service.ts` (fluxo
  comercial legado) continuam criando `Aluno` sempre `ACTIVE_STUDENT`, com
  `contractId` derivado do professor.
- As listagens `findByProfessor`, `findByProfessorIds`, `findByContract` e
  `search` em `aluno.service.ts` agora filtram explicitamente
  `status: 'ACTIVE_STUDENT'` para não exibir leads futuros como alunos
  ativos.
- Módulos que assumiam `Aluno.professor`/`Aluno.user` sempre presentes
  (contratos, prontuário, antropometria, financeiro, rotas `/me`) foram
  ajustados para preferir `Aluno.contractId` direto (tenant-safe mesmo sem
  professor) e para rejeitar explicitamente operações que exigem conta
  (ex.: gerar contrato) quando o registro ainda é um lead incompleto.
