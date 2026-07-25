# Issue 273 — PAR-Q canônico e versionado

## Objetivo concluído

Consolidar o PAR-Q em `StudentParqSubmission`, com catálogo compartilhado e versionado, rascunho retomável, cálculo backend, reconciliação idempotente do legado, pendência profissional e integração segura com pré-matrícula, administração e PRNT.

## Entrega

- catálogo atual `parq-2026-01` com `q1` a `q7` e versão histórica explícita;
- validação de versão, conjunto, tipo e completude no backend;
- rascunho servidor-side com consentimento, versão otimista e retomada;
- conclusão transacional, idempotente e histórica;
- pendência profissional auditável para respostas positivas;
- onboarding apenas com referência e estado resumido;
- corte de escritas em `AlunoIntakeForm` e `StudentHealthIntake`;
- backfill que importa somente legado semanticamente sustentável;
- `NEEDS_REPEAT` para legado incompatível, divergente ou sem evidência;
- PRNT, pré-matrícula e detalhes administrativos no service canônico;
- interface pública responsiva e acessível;
- documentação de produto e runbook de operação.

## Decisões permanentes

- `q8` não é uma pergunta clínica atual; no legado conhecido ela representa declaração e não é carregada para `responses`.
- resposta negativa não equivale a liberação médica.
- análise profissional não altera histórico.
- projeções administrativas não são fontes concorrentes de escrita.
- compatibilidades legadas permanecem somente leitura até o encerramento do rollout #275.

## Validação versionada

- `scripts/verify-issue-273-parq-migration.sh`: banco pré-cutover com fonte canônica, fontes isoladas, equivalência, divergência, conjunto incompleto, ausência de data e rerun idempotente;
- `apps/api/scripts/verify-issue-273-parq.ts`: runtime real com PostgreSQL para autenticação, rascunho, retomada, concorrência, idempotência, nova submissão histórica, isolamento de tenant e análise profissional;
- `apps/api/scripts/visual-audit-issue-273.mjs`: formulário, retomada, `NEEDS_REPEAT`, conclusão com alerta e conclusão sem alerta em desktop, mobile e desktop de baixa altura;
- `.github/workflows/issue-273-regression.yml`: produz logs, screenshots, manifesto de hashes e identidades de head, base e merge preview;
- `pnpm validate`: validações gerais do repositório, migrations, tipos, lint, testes, build, arquitetura, catálogo de acessos e documentação.

O handoff registra o SHA final, a base observada, o merge preview e os workflows executados. Toda validação deste ciclo é pré-auditoria interna; a aprovação final exige nova conversa e auditoria independente no SHA congelado.
