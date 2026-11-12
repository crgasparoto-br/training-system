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
- `apps/api/src/modules/workout/workout-session-execution-values.ts` e
  `apps/api/tests/workout-session-execution.integration.test.ts` para vínculo de execução.

## Restrições
- O contrato, a identidade da sessão e o vínculo professor/aluno são checados no backend.
- Catálogo ativo e aprovado somente na criação de vínculos; histórico congelado sempre legível.
- Alternativas não equivalem a autorização ou execução confirmada.
- Motivo, autor, data, contexto, versões, aprovação e revisão são auditáveis.
- Repetição de operação com dados diferentes retorna conflito; nenhuma escrita parcial.
- Professor avalia demandas feitas durante a sessão depois do registro.
- Permissão de visualizar treinos não permite aprovar: `students.actions.manageTrainingSubstitutions` é obrigatória para mutações profissionais; seu default é negado a funções não-master até concessão explícita.
- Na revisão de execução histórica, a elegibilidade é capturada na solicitação; a desativação posterior não concede nova autorização nem apaga o fato ocorrido.

## Passos de implementação
- [x] Modelo, migration e invariantes de integridade.
- [x] Service de substituição e revisão transacional.
- [x] API autenticada e clientes tipados.
- [x] Integração às rotinas e comparação planejado versus executado.
- [x] Interface aluno/professor e histórico.
- [x] Casos de teste cobrindo cenários principais.
- [x] Documentação funcional, de autenticação e banco.
- [x] A-001: disponibilizar planejamento/revisão no resumo semanal liberado de sessões futuras.
- [x] A-002: preservar resultado confirmado da mutação após falha de refresh,
  bloquear escrita sobre estado desatualizado e oferecer retry apenas de leitura.
- [x] REC-001: busca no servidor e paginação de alternativas de exercício/sessão.
- [x] A-404-001: separar autorização profissional de escrita da leitura, inclusive na transação e na UI.
- [x] RISK-001: documentar e testar a revisão histórica após desativação do catálogo.
- [x] REC-404-001: atualizar arquitetura web com o endpoint mutável e gate de edição.
- [x] Controles de regressão para leitura sem escrita, revogação, restauração e histórico congelado.
- [x] A-003: validar versão exata selecionada, inclusive para alternativa de sessão;
  rejeitar revisão stale com 409 e sem ledger/evento; incluir versão no fingerprint.
- [x] A-004: Chrome/HTTP/PostgreSQL com falha pós-POST e retry apenas GET,
  atestado na CI do SHA `42de210b576d950ce2432a8ba2ef85fe416e25d8`.
- [x] A-404-006: integrar `substituted` de exercícios à trilha #404 com FK,
  validação transacional e trigger de identidade (aguarda CI do novo SHA).
- [x] A-404-007: delimitar a projeção somente leitura versus endpoints
  explícitos de criação e revisão (aguarda CI do novo SHA).
- [x] A-404-008: integração explícita do substituto na execução guiada;
  `guided/complete` persiste resultado, ID e observação em uma única transação,
  sem selecionar pré-aprovações automaticamente.
- [ ] `pnpm validate` e CI completos no novo SHA, sem falhas.
- [ ] Auditoria independente e homologação.

## Validação manual
1. Professor pré-aprova substituto elegível numa sessão não iniciada.
2. Aluno inicia o treino, registra troca com motivo e verifica status pendente.
3. Professor revisa (aprova/rejeita com motivo quando negativo) em sessão concluída.
4. Alterar ou desativar o exercício no catálogo e verificar o histórico congelado.
5. Tentativas cross-tenant, sem papel, duplicadas e com versão defasada devem falhar.
5a. Professor com `trainingPlans` e sem `manageTrainingSubstitutions` apenas lê; negar POST; após concessão permitir, após revogação negar review, sem modificar ledger; revalidar na transação.
6. Conferir comparação mantendo a origem e sem declarar execução não registrada.
7. Em semana futura, professor abre sessão liberada ainda não iniciada, seleciona
   exercício/sessão e pré-aprova; aluno e sessão concluída não permitem esse caminho.
8. Confirmar POST e provocar falha só no refresh: mostrar sucesso, bloquear nova
   mutação e repetir apenas GET no botão **Atualizar histórico**.
9. Criar mais de 25 alternativas elegíveis, paginar sem duplicar, filtrar por
   nome/alias ou data, rejeitar escopo cruzado e preservar curadoria vigente.
10. Alterar a versão de um substituto mantendo o mesmo ID entre GET/POST; a
    criação deve retornar 409 sem ledger/evento e exigir nova seleção.
11. Em navegador real, concluir POST e falhar exclusivamente o GET de refresh;
    observar confirmação, bloqueio da próxima mutação e retry apenas GET.

## Decisões e pendências
- Mudança confinada à prescrição liberada atual, sem propagação automática.
- Status do histórico é independente do estado de execução.
- A série guiada permite vincular a pré-aprovação ou a solicitação da sessão
  em andamento, com observação obrigatória; vínculo inválido impede a confirmação.
- Execução resistida com `outcome=substituted` exige `substitutionId` real,
  preserva aprovação/solicitação e rejeita string avulsa; etapa cíclica e
  agrupamento registram apenas adaptação operacional, sem inventar catálogo.
- Registros antigos sem o vínculo continuam legíveis, sem backfill enganoso.
- Validação local indisponível: resolução DNS de github.com e pnpm ausente no
  ambiente de trabalho; comprovar testes/build na CI da PR.
- PR: https://github.com/crgasparoto-br/training-system/pull/541
- Remediação inicial da auditoria de 11/11/2026: `A-001`, `A-002` e `REC-001`.
- Remediações anteriores: `A-404-001`, `RISK-001`, `REC-404-001`, com controles
  de permissão independente, revogação e revisão histórica. A-404-006/007
  introduzem o vínculo efetivo no registro de execução e corrigem a documentação.
  A CI do SHA anterior não comprova este novo candidato.
- Não fazer merge sem autorização explícita.
