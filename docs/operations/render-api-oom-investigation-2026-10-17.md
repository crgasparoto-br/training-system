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
