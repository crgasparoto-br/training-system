# Convites de pré-cadastro (issue #269)

## Domínio próprio

O convite de pré-cadastro (finalidade `PRE_REGISTRATION`) tem tabela, token,
hash, status e rotas próprios. Ele **não reutiliza** token, hash, endpoint,
status ou tabela de contrato (`Contract`/`ContractDocument`), mesmo
compartilhando a inspiração de rota pública.

- Persistência: `PreRegistrationInvite` (convite) e
  `PreRegistrationInviteEvent` (auditoria), em
  `apps/api/prisma/schema.prisma`.
- Contratos compartilhados de API/frontend: `packages/types/pre-registration-invite.ts`.
- Domínio/serviço: `apps/api/src/modules/pre-registration-invites/`.
- Geração/hash de token: `pre-registration-invite-token.ts`.
- Rotas administrativas (autenticadas) e pública:
  `pre-registration-invite.routes.ts`.
- Rate limit dedicado da rota pública: `pre-registration-invite-rate-limit.middleware.ts`.

## Token

- Gerado com `crypto.randomBytes(32)` (256 bits de entropia), codificado em
  base64url (URL-safe).
- Somente o hash SHA-256 do token é persistido (`PreRegistrationInvite.tokenHash`).
- O token bruto é retornado apenas na resposta de criação/regeneração
  (`PreRegistrationInviteCreationResultDTO.token`) e nunca pode ser
  recuperado posteriormente - não existe endpoint para isso.
- A comparação de hash na abertura pública usa `crypto.timingSafeEqual`.

## Validade

- Padrão de 30 dias, configurável pela variável de ambiente
  `PRE_REGISTRATION_INVITE_TTL_DAYS` (ver `.env.example`).
- A expiração é calculada no backend (`computeInviteExpiresAt`) no momento da
  criação e **reconhecida na leitura**: `openPublicInvite` marca o convite
  como `EXPIRED` ao detectar `expiresAt < now`, sem depender de nenhum job.

## Estados

`ACTIVE` → `EXPIRED` | `REVOKED` | `SUPERSEDED` | `COMPLETED`.

- No máximo um convite `ACTIVE` por pessoa (`alunoId`) e finalidade
  (`purpose`) ao mesmo tempo - garantido por índice único parcial no banco
  (`PreRegistrationInvite_active_person_purpose_key`, criado via SQL na
  migration porque o Prisma não expressa índice parcial na DSL).
- Regenerar cria o novo convite e marca o anterior como `SUPERSEDED` na
  mesma transação; se a criação do novo falhar, a transação inteira é
  revertida e o convite anterior permanece `ACTIVE` e utilizável.
- Revogar exige motivo (até 500 caracteres) e é idempotente: revogar um
  convite que já não está mais ativo apenas retorna o estado atual, sem erro.

## Abertura pública

Rota pública própria: `GET /api/v1/pre-cadastro/:token` (sem autenticação).

- Respostas de token inexistente, hash divergente, expirado, revogado,
  substituído ou de outro tenant são **indistinguíveis**: sempre o mesmo
  erro genérico HTTP 404 (`PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR`).
- Cabeçalhos aplicados em toda resposta da rota pública:
  `Cache-Control: no-store, private` e `Referrer-Policy: no-referrer`.
- Rate limit dedicado por IP (`preRegistrationInviteRateLimit`), **em memória
  por processo**. Limitação conhecida: em uma implantação com múltiplas
  réplicas da API, cada réplica mantém sua própria contagem, então o limite
  efetivo se multiplica pelo número de réplicas. O projeto não possui hoje
  um cliente Redis integrado e em uso (existe apenas o serviço `redis` no
  `docker-compose.yml` e a dependência `redis` no `package.json`, sem
  nenhuma integração real no código-fonte); introduzir essa integração do
  zero está fora do escopo da issue #269. Fica registrado como limitação
  conhecida a ser resolvida quando houver necessidade real de múltiplas
  réplicas (migrar para um contador compartilhado, ex.: Redis).
- Primeiro acesso é registrado uma única vez (`firstAccessedAt` +
  evento `FIRST_ACCESSED`); acessos subsequentes atualizam `lastAccessAt`
  mas só geram novo evento de auditoria fora de uma janela de throttle de 5
  minutos, para não gerar spam de auditoria.
- A resposta pública contém **apenas** `purpose` e `expiresAt` - nunca
  `alunoId`, `contractId` ou qualquer outro identificador interno, dado
  clínico, histórico comercial, contrato, observação administrativa ou o
  hash do token.

## Operações administrativas

Todas exigem `authMiddleware` + `professorMiddleware`, escopadas ao
`contractId` do professor autenticado (tentativa cross-tenant responde como
recurso inexistente, sem vazar existência em outro tenant):

- `POST /api/v1/alunos/:alunoId/pre-registration-invites` - gera o primeiro
  convite; exige que a pessoa esteja em um estado compatível do ciclo
  (`LEAD`, `INVITED` ou `PRE_REGISTRATION_IN_PROGRESS`), que exista ao menos
  um canal de contato e que não haja convite ativo. Quando o lead está em
  `LEAD`, a criação também move o ciclo para `INVITED`
  (`recordStudentInvitationCreated`, issue #268).
- `POST /api/v1/alunos/:alunoId/pre-registration-invites/regenerate` - invalida
  o convite ativo (`SUPERSEDED`) e cria um novo, atomicamente.
- `POST /api/v1/alunos/:alunoId/pre-registration-invites/revoke` - revoga o
  convite ativo (motivo obrigatório no corpo `{ reason }`).
- `GET /api/v1/alunos/:alunoId/pre-registration-invites/summary` - resumo do
  convite mais recente (nunca inclui hash do token).
- `GET /api/v1/alunos/:alunoId/pre-registration-invites/history` - histórico
  completo, do mais recente ao mais antigo.
- `GET /api/v1/alunos/:alunoId/pre-registration-invites/allowed-actions` -
  ações atualmente permitidas (`canGenerateFirst`/`canRegenerate`/`canRevoke`).

Todas as seis rotas administrativas acima (as três mutações e as três
consultas) exigem o bloco de acesso `students.actions.manageEnrollmentInvite`
(`packages/types/access-control.ts`), por consistência - autenticação de
professor do tenant sozinha não é suficiente para nenhuma rota do módulo.

## Auditoria

`PreRegistrationInviteEvent` registra `CREATED`, `SUPERSEDED`, `REVOKED`,
`FIRST_ACCESSED`, `ACCESSED`, `EXPIRED_ON_READ` e `COMPLETED`. Eventos
administrativos carregam `actorUserId`/`actorProfessorId`; eventos públicos
usam `actorIsPublic: true` e nunca armazenam token bruto ou conteúdo de
formulários.

## Fora de escopo

Tela administrativa completa de leads, envio automático de
WhatsApp/e-mail/SMS, criação de conta e preenchimento do cadastro, Anamnese e
PAR-Q, conversão em aluno ativo e reutilização da assinatura pública de
contratos. O compartilhamento do link permanece manual (issue #269).
