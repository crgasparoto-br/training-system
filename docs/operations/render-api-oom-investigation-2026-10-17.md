# Render API: incident investigation (2026-10-17)

Production service: `sistema-acesso-api` (`srv-d7nskff7f7vs73812lu0`).

## Confirmed evidence

- Render reported OOM kills with a 512 MiB memory limit on October 13 and October 17.
- Memory usage reached approximately 526,921,730 bytes before the October 17 OOM event.
- The October 17 deploy of commit `e3c817b` built and started successfully; Prisma reported 152 migrations with none pending.
- Earlier application logs show `Unable to start a transaction in the given time` and interactive transaction expiry (5,000 ms budget versus 20,193 ms elapsed).
- The contract lifecycle scheduler runs every 15 minutes.

## Remediation in this branch

Reuse the application's canonical `prismaRuntimeClient` in the contract lifecycle and bank services instead of allocating additional `PrismaClient` instances, reducing redundant connection pools and native resource overhead. This is a bounded resource-management improvement, **not proof** that all OOM events or database timeouts have been resolved.

## Follow-up verification before release

1. Run `pnpm --filter @corrida/api type-check`, `pnpm --filter @corrida/api test`, and repository architectural checks.
2. Run contract lifecycle and bank API integration tests against a disposable test database.
3. Confirm the actual Prisma connection-pool configuration and inspect open connections and slow queries on the production database without exposing secrets.
4. After an approved deployment, observe Render memory, OOM events, restarts, request latency, and Prisma transaction failures under realistic load. Do not assume a successful build proves runtime stability.
5. Profile memory and investigate other long-lived clients and scheduled work if memory continues to approach the 512 MiB cap. Consider increasing Render capacity only when sizing data supports it.

Avoid increasing transaction timeouts or Node heap caps blindly; neither addresses the verified memory pressure by itself.

## Investigacao complementar (2026-10-18)

O Render confirmou cinco eventos `oomKilled` de 512 MiB em 13 e 17 de outubro (dois em 13/10; tres em 17/10). Foi identificado uso de `new PrismaClient()` em seis modulos de runtime adicionais, incluindo autenticacao/middleware, planos, biblioteca, agenda e auditoria cadastral. Estes modulos foram alinhados ao `prismaRuntimeClient` canonico na PR #514 para reduzir pools redundantes. A relacao causal isolada nao esta comprovada.

Instrumentacao adicional na PR #514: sinais de `memory-pressure` quando RSS ultrapassa limiar configuravel e avisos de encerramento de requisicao antes de resposta (`request-aborted`), sem parametros, caminhos brutos nem dados pessoais. Observabilidade depende de ativacao e deploy controlado; nao constitue prova de estabilidade.

Para validar: executar `pnpm validate` e testes de integracao; repetir jornadas autenticadas de login, central do aluno, agenda, planos e biblioteca em homologacao; medir RSS/heap/external, conexoes e latencia Prisma; comparar com eventos de falha no Render. Um limite de warning nao modifica capacidade nem evita OOM por si so.
