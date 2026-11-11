# Plano: Issue #404 — substituições rastreáveis

## Objetivo
Registrar trocas de exercício ou sessão com vínculo imutável e revisão do professor,
sem sobrescrever planejamento nem resultado de execução.

## Contexto
- Issue: https://github.com/crgasparoto-br/training-system/issues/404
- Épica: #402; dependências #389 (execução) e #394 (curadoria).
- Base: `develop`; instruções: `crgasparoto-br/skill`, branch `develop`.
- Fonte Prisma: `apps/api/prisma/schema.prisma`.

## Fora de escopo
Troca automática por IA; importação externa; modificação de prescrições futuras.

## Arquivos e módulos principais
- `apps/api/prisma/schema.prisma` e migration #404.
- `apps/api/src/modules/workout/training-substitution.service.ts`.
- `apps/api/src/routes/training-substitutions.routes.ts`.
- `apps/api/src/modules/workout/training-routine.service.ts` e tipos compartilhados.
- `apps/web/src/components/training/TrainingSubstitutionCard.tsx`.
- `apps/api/tests/training-substitution.integration.test.ts` e teste React.

## Restrições
- O contrato, a identidade da sessão e o vínculo professor/aluno são checados no backend.
- Catálogo ativo e aprovado somente na criação de vínculos; histórico congelado sempre legível.
- Alternativas não equivalem a autorização ou execução confirmada.
- Motivo, autor, data, contexto, versões, aprovação e revisão são auditáveis.
- Repetição de operação com dados diferentes retorna conflito; nenhuma escrita parcial.
- Professor avalia demandas feitas durante a sessão depois do registro.

## Passos de implementação
- [x] Modelo, migration e invariantes de integridade.
- [x] Service de substituição e revisão transacional.
- [x] API autenticada e clientes tipados.
- [x] Integração às rotinas e comparação planejado versus executado.
- [x] Interface aluno/professor e histórico.
- [x] Casos de teste cobrindo cenários principais.
- [x] Documentação funcional, de autenticação e banco.
- [ ] `pnpm validate` e CI completos, sem falhas.
- [ ] Auditoria independente e homologação.

## Validação manual
1. Professor pré-aprova substituto elegível numa sessão não iniciada.
2. Aluno inicia o treino, registra troca com motivo e verifica status pendente.
3. Professor revisa (aprova/rejeita com motivo quando negativo) em sessão concluída.
4. Alterar ou desativar o exercício no catálogo e verificar o histórico congelado.
5. Tentativas cross-tenant, sem papel, duplicadas e com versão defasada devem falhar.
6. Conferir comparação mantendo a origem e sem declarar execução não registrada.

## Decisões e pendências
- Mudança confinada à prescrição liberada atual, sem propagação automática.
- Status do histórico é independente do estado de execução.
- Validação local indisponível: resolução DNS de github.com e pnpm ausente no
  ambiente de trabalho; comprovar testes/build na CI da PR.
- PR: https://github.com/crgasparoto-br/training-system/pull/541
- Não fazer merge sem autorização explícita.
