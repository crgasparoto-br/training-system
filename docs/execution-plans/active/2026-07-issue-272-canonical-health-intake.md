# Issue #272 - Anamnese Inicial canônica e retomável

## Contexto

A aplicação possuía respostas de Anamnese distribuídas entre `AlunoIntakeForm`, `StudentHealthIntake` e metadados do onboarding. O fluxo público da #271 já fornece autenticação, claim, isolamento por tenant, autorização de responsável e pré-cadastro básico concluído.

A auditoria independente do ciclo 2 rejeitou o SHA `95124c6e3c550d7c0b83a7f5576991b46a316fa6` por quatro pendências: estado incorreto de registros canônicos preexistentes, possibilidade de alterar uma Anamnese concluída por writers genéricos, evidência visual vinculada a outro preview e testes não discriminantes da migration/fronteira pública.

## Objetivo

Consolidar novas escritas em `StudentHealthIntake`, migrar dados semanticamente equivalentes com precedência determinística e disponibilizar a Anamnese opcional, autenticada, incremental e retomável.

## Escopo

- schema e migrations convergentes;
- corte de dual-write em todos os fluxos administrativos e do aluno;
- API autenticada com consentimento, allowlist, versionamento otimista e conclusão transacional;
- interface pública responsiva e acessível em etapas;
- leitura administrativa canônica, mantendo PAR-Q independente;
- testes executáveis de escrita canônica, migration, autorização, concorrência e retomada;
- documentação de produto, arquitetura e operação;
- evidência remota permanente específica da issue 272.

## Fora de escopo

- implementação do PAR-Q público (#273);
- deduplicação e fila operacional de revisão (#274);
- remoção física de `AlunoIntakeForm` (#275);
- diagnóstico, liberação para treino ou prescrição automática;
- criação do fluxo completo de reabertura de Anamnese concluída; até esse fluxo existir, writers genéricos ficam bloqueados.

## Riscos e controles

| Risco | Controle |
| --- | --- |
| vazamento cross-tenant | reutilização do lock/autorização transacional da #271 e respostas públicas neutras |
| overwrite em duas abas | `expectedVersion` e incremento atômico do registro |
| persistência sem consentimento | bloqueio antes da primeira escrita pública e trilha do aceite |
| dual-write | redirecionamento de todos os writers e trigger read-only no legado |
| migração ambígua | canônico vence, conflito identificado por campo e revisão explícita |
| canônico preexistente marcado como não iniciado | migration complementar calcula `IN_PROGRESS` a partir de conteúdo real sem fabricar consentimento/conclusão |
| alteração pós-conclusão | writer compartilhado rejeita `COMPLETED` antes de qualquer persistência |
| mistura com PAR-Q/avaliação | allowlist estrita e modelos/estados independentes |
| evidência de outro preview | workflow permanente `Issue 272 Regression Evidence` registra head/base/merge preview do run final |

## Remediação da auditoria — ciclo 2

- [x] adicionar migration idempotente para normalizar registros canônicos preexistentes;
- [x] bloquear mutação genérica de Anamnese concluída com erro reconhecível;
- [x] adicionar fixture PostgreSQL discriminante para legado-only, canônico-only, equivalência e divergência;
- [x] adicionar fluxo real de API/DB/browser para consentimento, isolamento, retomada, conflito e conclusão;
- [x] adicionar workflow e artefato permanentes específicos da issue 272;
- [x] atualizar contrato de produto e runbook de cutover;
- [ ] confirmar CI remoto no novo SHA e congelar novo merge preview;
- [ ] executar pré-auditoria adversarial interna;
- [ ] entregar novo handoff para auditoria independente em conversa separada.

## Validação prevista

- `bash scripts/verify-issue-272-health-intake-migration.sh`
- `pnpm type-check`
- `pnpm lint`
- testes unitários e de contrato afetados
- fluxo `apps/api/scripts/verify-issue-272-health-intake.ts` contra API, PostgreSQL e navegador reais
- `pnpm arch:check`
- `pnpm access:check`
- `pnpm docs:check`
- CI remoto no SHA final
- pré-auditoria adversarial no contexto de implementação
- handoff para auditoria independente, sem aprovação pelo contexto implementador

## Rollout

1. aplicar `20260725010000_issue_272_canonical_health_intake` e `20260725123000_issue_272_audit_fixes` antes de servir a nova versão;
2. revisar contagens e divergências conforme `operations/health-intake-cutover.md`;
3. validar salvamento, retomada, conflito, conclusão e bloqueio pós-conclusão em homologação;
4. manter legado e trigger durante a janela definida pela #275;
5. não habilitar correção de Anamnese concluída até existir fluxo dedicado, versionado e auditável.
