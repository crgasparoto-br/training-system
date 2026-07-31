# Issue #246 — remediação A-246-04 e A-246-05

## Identidade final

- base: `develop` (`1d9eda62bfba73caf10dc7e32767f4769fd4bb66`)
- branch: `feat/246-adipometry-foundation`
- head: `fe62d058b27d5f4c2543c74d483f89e64f69d745`
- merge preview: `e7132ebfabe4773c2d21e37235427aba23408173`

## A-246-04 — ator e autoridade temporal

- o serviço vincula `app.adipometry_actor_user_id` à conta autenticada dentro da transação;
- a role de aplicação não pode persistir designação, aprovação, revogação ou encerramento sem contexto autenticado;
- o ator informado precisa corresponder ao contexto transacional;
- `designatedAt`, `effectiveFrom`, `approvedAt`, `revokedAt`, `endedAt` e `effectiveTo` são substituídos pelo tempo do banco;
- aprovação retrodatada por responsável já encerrado é rejeitada.

## A-246-05 — identidade clínica

- depois da primeira aprovação contratual, a identidade clínica do protocolo é congelada;
- código, versão, nome, referência e `definitionSnapshot` não podem mudar sob a mesma versão;
- mudança material exige nova versão e nova aprovação;
- conclusão exige aprovação ativa cujo hash corresponda à definição clínica corrente.

## Controle adversarial

`scripts/verify-adipometry-temporal-authority.sh` executa com role PostgreSQL não-superuser e verifica:

- ausência de contexto autenticado;
- impersonação de ator elegível;
- tentativa de timestamps retroativos;
- revogação por ator divergente;
- aprovação por ex-responsável usando janela histórica;
- mutação da versão depois de aprovação.

## Validações do SHA final

- `Validate PR` — execução `30670576417`: success;
- `Issue 275 Pre-registration QA` — execução `30670576399`: success;
- migrations em banco vazio, existente e cadeia legada: success;
- controles ADPT e fronteiras de persistência: success;
- lifecycle, type-check, lint, testes, build, arquitetura, acesso e documentação: success;
- E2E, autorização, privacidade, acessibilidade, performance e rollout: success.

## Disposição

A passagem controller-adversarial resultou em `INTERNALLY_APPROVED`. Essa disposição é interna e provisória; não autoriza merge nem substitui auditoria independente.
