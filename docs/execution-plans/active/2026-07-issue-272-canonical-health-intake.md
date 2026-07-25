# Issue #272 - Anamnese Inicial canônica e retomável

## Contexto

A aplicação possuía respostas de Anamnese distribuídas entre `AlunoIntakeForm`, `StudentHealthIntake` e metadados do onboarding. O fluxo público da #271 já fornece autenticação, claim, isolamento por tenant, autorização de responsável e pré-cadastro básico concluído.

## Objetivo

Consolidar novas escritas em `StudentHealthIntake`, migrar dados semanticamente equivalentes com precedência determinística e disponibilizar a Anamnese opcional, autenticada, incremental e retomável.

## Escopo

- schema e migration convergente;
- corte de dual-write em todos os fluxos administrativos e do aluno;
- API autenticada com consentimento, allowlist, versionamento otimista e conclusão transacional;
- interface pública responsiva e acessível em etapas;
- leitura administrativa canônica, mantendo PAR-Q independente;
- testes de contrato de entrada, escrita canônica e migration;
- documentação de produto, arquitetura e operação.

## Fora de escopo

- implementação do PAR-Q público (#273);
- deduplicação e fila operacional de revisão (#274);
- remoção física de `AlunoIntakeForm` (#275);
- diagnóstico, liberação para treino ou prescrição automática.

## Riscos e controles

| Risco | Controle |
| --- | --- |
| vazamento cross-tenant | reutilização do lock/autorização transacional da #271 e respostas públicas neutras |
| overwrite em duas abas | `expectedVersion` e incremento atômico do registro |
| persistência sem consentimento | bloqueio antes da primeira escrita pública e trilha do aceite |
| dual-write | redirecionamento de todos os writers e trigger read-only no legado |
| migração ambígua | canônico vence, conflito identificado por campo e revisão explícita |
| mistura com PAR-Q/avaliação | allowlist estrita e modelos/estados independentes |

## Validação prevista

- `pnpm type-check`
- `pnpm lint`
- testes unitários e de contrato afetados
- `pnpm arch:check`
- `pnpm access:check`
- `pnpm docs:check`
- CI remoto no SHA final
- pré-auditoria adversarial no contexto de implementação
- handoff para auditoria independente, sem aprovação pelo contexto implementador

## Rollout

1. aplicar migration antes de servir a nova versão;
2. revisar contagens e divergências conforme `operations/health-intake-cutover.md`;
3. validar salvamento, retomada, conflito e conclusão em homologação;
4. manter legado e trigger durante a janela definida pela #275.
