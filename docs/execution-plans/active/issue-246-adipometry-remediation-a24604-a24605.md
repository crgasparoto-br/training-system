# Issue #246 — remediação A-246-04 e A-246-05

## Escopo

- base: `develop`;
- branch: `feat/246-adipometry-foundation`;
- PR: `#290`.

A identidade imutável do candidato e os workflows correspondentes devem ser consultados na PR e nos artefatos do ciclo, evitando registrar neste plano alegações voláteis de SHA ou execução.

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

## Validações obrigatórias

O candidato somente pode receber aprovação interna quando concluir com sucesso:

- `Validate PR`;
- `Issue 275 Pre-registration QA`;
- migrations em banco vazio, existente e cadeia legada;
- controles ADPT e fronteiras de persistência;
- lifecycle, type-check, lint, testes, build, arquitetura, acesso e documentação;
- E2E, autorização, privacidade, acessibilidade, performance e rollout.

## Disposição

A passagem controller-adversarial pode produzir apenas `INTERNALLY_APPROVED`. Essa disposição é interna e provisória; não autoriza merge nem substitui auditoria independente.
