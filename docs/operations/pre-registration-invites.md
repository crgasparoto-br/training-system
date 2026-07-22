# Convites de pré-cadastro (issue #269)

## Domínio próprio

O convite de pré-cadastro (finalidade `PRE_REGISTRATION`) tem tabela, token,
hash, status e rotas próprios. Ele **não reutiliza** token, hash, endpoint,
status ou tabela de contrato (`Contract`/`ContractDocument`), mesmo
compartilhando a inspiração de rota pública.

- Persistência: `PreRegistrationInvite` e `PreRegistrationInviteEvent`.
- Contratos compartilhados: `packages/types/pre-registration-invite.ts`.
- Serviço e rotas: `apps/api/src/modules/pre-registration-invites/`.
- Geração e hash: `pre-registration-invite-token.ts`.
- Sanitização e redação de auditoria: `pre-registration-invite-audit.ts`.
- Rate limit público: `pre-registration-invite-rate-limit.middleware.ts`.

## Token

- Gerado com `crypto.randomBytes(32)` e codificado em base64url.
- Somente o hash SHA-256 é persistido.
- O token bruto é retornado apenas na geração ou regeneração.
- Não existe endpoint para recuperar token ou link posteriormente.
- A comparação do hash usa `crypto.timingSafeEqual`.
- URLs, User-Agent e textos administrativos passam por redação antes de serem
  persistidos. Tokens base64url e segmentos `/pre-cadastro/:token` são
  substituídos por `[REDACTED]`.

## Validade

- Padrão de 30 dias, configurável por
  `PRE_REGISTRATION_INVITE_TTL_DAYS`.
- A expiração é calculada no backend.
- O convite deixa de ser utilizável quando `expiresAt <= now`.
- Resumo, histórico, ações permitidas, geração, regeneração e revogação
  reconhecem a expiração sem depender de scheduler.
- A consolidação administrativa registra o usuário e o professor autenticados.
  Quando uma execução interna não possui ator, o evento é identificado como
  ator de sistema nos metadados.

## Estados e concorrência

`ACTIVE` pode evoluir para `EXPIRED`, `REVOKED`, `SUPERSEDED` ou `COMPLETED`.

- O índice único parcial
  `PreRegistrationInvite_active_person_purpose_key` impede mais de um convite
  `ACTIVE` por pessoa e finalidade.
- Geração inicial e transição `LEAD -> INVITED` usam a mesma transação.
- A regeneração marca o anterior como `SUPERSEDED` e cria o novo na mesma
  transação. Falha na criação preserva o anterior.
- A criação é confirmada após o commit antes de token e URL serem devolvidos.
- O primeiro acesso usa atualização condicional de `firstAccessedAt = null`.
- Acessos posteriores adquirem bloqueio de linha no convite antes de consultar
  e criar o evento `ACCESSED`. Assim, transações simultâneas não criam mais de
  um evento dentro da janela de cinco minutos.

## Revogação

A rota recebe obrigatoriamente:

```json
{
  "inviteId": "identificador-da-versao-alvo",
  "reason": "motivo administrativo"
}
```

O `inviteId` evita que a repetição de uma requisição antiga revogue uma versão
nova criada posteriormente.

- O motivo é obrigatório e possui limite de 500 caracteres após normalização e
  redação de tokens/links.
- Revogar novamente o mesmo `inviteId` já `REVOKED` retorna a mesma versão sem
  criar outro evento.
- Uma versão `EXPIRED`, `SUPERSEDED` ou `COMPLETED` não é apresentada como
  revogada; a API retorna conflito de concorrência.
- A compatibilidade interna com a assinatura antiga é limitada a históricos
  com somente uma versão. Havendo mais de uma versão, a chamada é recusada e o
  consumidor deve informar o `inviteId`.
- O motivo é armazenado uma única vez em `revocationReason`; o evento registra
  a ação e o ator sem duplicar o texto.

## Abertura pública

Rota própria: `GET /api/v1/pre-cadastro/:token`.

- Não exige autenticação para apresentar a resposta inicial segura.
- Token inexistente, alterado, expirado, revogado ou substituído produz o mesmo
  erro genérico HTTP 404.
- A resposta contém apenas `purpose` e `expiresAt`.
- Todas as respostas aplicam `Cache-Control: no-store, private` e
  `Referrer-Policy: no-referrer`.
- O primeiro acesso registra `FIRST_ACCESSED` uma única vez.
- Acessos posteriores atualizam `lastAccessAt` e geram `ACCESSED` no máximo uma
  vez por janela de cinco minutos.
- IP inválido é descartado. User-Agent tem controles removidos, espaços
  normalizados, limite de tamanho e redação do token antes da persistência.

## Rate limit

A resolução pública possui rate limit dedicado por IP, com:

- janela padrão de 60 segundos;
- até 20 requisições por janela;
- limpeza periódica de janelas expiradas;
- limite padrão de 10.000 chaves em memória;
- falha fechada com HTTP 429 quando a capacidade é atingida.

Em múltiplas réplicas, cada processo mantém sua própria contagem. Escala
horizontal exige contador compartilhado, como Redis, sem alteração do contrato
HTTP.

## Operações administrativas

Todas exigem professor autenticado, `contractId` da sessão e o bloco
`students.actions.manageEnrollmentInvite`.

- `POST /api/v1/alunos/:alunoId/pre-registration-invites`
- `POST /api/v1/alunos/:alunoId/pre-registration-invites/regenerate`
- `POST /api/v1/alunos/:alunoId/pre-registration-invites/revoke`
- `GET /api/v1/alunos/:alunoId/pre-registration-invites/summary`
- `GET /api/v1/alunos/:alunoId/pre-registration-invites/history`
- `GET /api/v1/alunos/:alunoId/pre-registration-invites/allowed-actions`

As leituras também encaminham o ator autenticado, pois podem consolidar uma
expiração e gerar auditoria.

## Auditoria

`PreRegistrationInviteEvent` registra `CREATED`, `SUPERSEDED`, `REVOKED`,
`FIRST_ACCESSED`, `ACCESSED`, `EXPIRED_ON_READ` e `COMPLETED`.

- Eventos administrativos registram `actorUserId` e `actorProfessorId` quando
  a operação vem de rota autenticada.
- Eventos públicos usam `actorIsPublic: true`.
- Token bruto, URL completa com token e conteúdo de formulários não são
  persistidos.
- Motivos e User-Agent são normalizados e redigidos antes da gravação.

## Fora de escopo

Permanecem fora desta issue a tela completa de leads, envio automático,
reivindicação autenticada, cadastro retomável, Anamnese, PAR-Q, conversão em
aluno ativo e assinatura pública de contratos. O compartilhamento do link
permanece manual.
