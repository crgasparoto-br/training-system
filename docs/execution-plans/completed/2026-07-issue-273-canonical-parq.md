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
- PRNT mantém um único include tipado para histórico, acompanhamentos e snapshots, evitando leituras parciais divergentes;
- revisão cadastral resolve o tenant diretamente por `Aluno.contractId`, sem fallback para professor ou contrato financeiro;
- interface pública responsiva e acessível;
- documentação de produto e runbook de operação.

## Decisões permanentes

- `q8` não é uma pergunta clínica atual; no legado conhecido ela representa declaração e não é carregada para `responses`.
- resposta negativa não equivale a liberação médica.
- análise profissional não altera histórico.
- projeções administrativas não são fontes concorrentes de escrita.
- compatibilidades legadas permanecem somente leitura até o encerramento do rollout #275.
- rotas com permissão apenas administrativa recebem `ParqAdministrativeSummaryDTO`; respostas clínicas exigem bloco de saúde.
- contratos públicos de criação e edição de aluno não expõem `intakeForm.parqResponses`.
- payload legado direto ou aninhado é rejeitado na fronteira HTTP com 410 e `LEGACY_WRITE_DISABLED`.
- workflows de validação são somente leitura e nunca fazem commit ou push.

## Validação versionada

- `scripts/verify-issue-273-parq-migration.sh`: banco pré-cutover com fonte canônica, fontes isoladas, equivalência, divergência, conjunto incompleto, ausência de data e rerun idempotente;
- `apps/api/scripts/verify-issue-273-parq.ts`: runtime real com PostgreSQL para autenticação, rascunho, retomada, concorrência, idempotência, nova submissão histórica, isolamento de tenant e análise profissional;
- `apps/api/scripts/visual-audit-issue-273.mjs`: formulário, retomada, `NEEDS_REPEAT`, conclusão com alerta e conclusão sem alerta em desktop, mobile e desktop de baixa altura;
- `.github/workflows/issue-273-regression.yml`: produz attestation e logs de migration, contratos HTTP, runtime, rerun, web e type-check;
- `.github/workflows/issue-273-runtime-diagnostic.yml`: compila pacotes compartilhados, executa o verificador PostgreSQL com falha propagada e publica o log apenas como artifact;
- `pnpm validate`: validações gerais do repositório, migrations, tipos, lint, testes, build, arquitetura, catálogo de acessos e documentação.

O handoff registra o SHA final, a base observada, o merge preview e os workflows executados. Toda validação deste ciclo é pré-auditoria interna; a aprovação final exige nova conversa e auditoria independente no SHA congelado.

## Ciclos de remediação da auditoria

A primeira passagem adversarial identificou e corrigiu replay idempotente inexato, corrida entre sessões novas, projeção de revisão baseada apenas na última submissão, consentimento sem revogação persistente e reconciliação legada insuficiente.

A auditoria independente seguinte identificou quatro lacunas remanescentes, tratadas no mesmo PR:

1. respostas clínicas presentes no detalhe genérico e no resumo administrativo: foi criada uma fronteira de saída sanitizada, montada antes das rotas legadas, com testes discriminantes para permissões de resumo e saúde;
2. precedência divergente entre respostas canônicas e campos legados: a saída de saúde substitui qualquer representação anterior pela última submissão retornada pelo serviço canônico;
3. escrita legada terminando em HTTP 500 e contrato compartilhado ainda expondo o campo: a fronteira bruta retorna 410 para forma direta ou aninhada e `@corrida/utils` exporta schemas sem `parqResponses`;
4. workflows mutáveis ou mascarando falhas: ambos usam `contents: read`, checkout do merge preview, compilação dos pacotes compartilhados e propagação do exit code; o diagnóstico antigo versionado foi removido.

A validação final deve ocorrer nos workflows somente leitura do SHA final. O contexto de implementação pode produzir apenas pré-auditoria; o parecer final requer nova auditoria independente.
