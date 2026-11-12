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
  validação transacional e trigger de identidade.
- [x] A-404-007: delimitar a projeção somente leitura versus endpoints
  explícitos de criação e revisão.
- [x] A-404-008: integração explícita do substituto na execução guiada;
  `guided/complete` persiste resultado, ID e observação em uma única transação,
  sem selecionar pré-aprovações automaticamente.
- [x] Gates de validação equivalentes a `pnpm validate` na CI `Validate PR`
  para o SHA funcional `72ada5852d88d881b6b943f05186aa314f525875`.
- [x] Ressalva documental do parecer de 12/11/2026: reconciliar status de CI,
  histórico de remediações e evidência exata de execução.
- [ ] Certificação formal da auditoria independente sobre o HEAD final e
  homologação funcional/operacional; CI aprovada não substitui essas etapas.

## Evidências de validação técnica — 12/11/2026

- **Identidade funcional validada:** PR #541, base `develop@2b25442860339c257522ccd83947bcffd53ace2a`,
  HEAD `72ada5852d88d881b6b943f05186aa314f525875`.
- **GitHub Actions (pull_request):** [Validate PR #43209020937](https://github.com/crgasparoto-br/training-system/actions/runs/43209020937),
  `completed/success` para o HEAD acima. Os jobs `Repository CI risk`,
  `Merge preview compatibility`, `CRITICAL validation` e `Validate repository`
  terminaram em `success`.
- **GitHub Actions (push):** [Validate PR #43209010006](https://github.com/crgasparoto-br/training-system/actions/runs/43209010006),
  `completed/success` no mesmo SHA.
- **Escopo alcançado pelo job CRITICAL:** PostgreSQL e migrações, geração Prisma,
  type-check, lint, testes completos, jornada real Chrome/API/PostgreSQL #404,
  build e verificações de arquitetura, acesso, documentação e provas de fonte.
- **Evidência autenticada:** artefato `validate-pr-critical-72ada5852d88d881b6b943f05186aa314f525875`
  (ID `13943530765`, digest ZIP `sha256:eeb5b2c7cb071a0ca8ef22634b1715801421a9eed7b108e75ba2c40ad8dfe1ff`),
  e bundle Git de auditoria `audit-git-bundle-72ada5852d88d881b6b943f05186aa314f525875`
  (ID `13941964113`, digest ZIP `sha256:a8116b2864b69a0631a1134fa11502d05076dec1b3c4ef2bdf155ca0ae2c2ebf`).
- **Execução local:** `pnpm validate` não foi executado no ambiente implementador
  por ausência de `pnpm` e checkout/dependências; as etapas aplicáveis foram
  executadas remotamente pelo workflow oficial, não por uma chamada local.
- **Fronteira do atestado:** o sucesso acima comprova somente o SHA
  `72ada5852d88d881b6b943f05186aa314f525875`. Este ajuste documental
  gera um novo HEAD; ele exige sua própria CI terminal verde e posterior
  auditoria independente, sem transportar automaticamente a aprovação anterior.
  O estado corrente do novo HEAD deve ser consultado no GitHub Actions, sem
  registrar no plano um status dinâmico que ficaria obsoleto após novo commit.

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
- Validação local indisponível: resolução DNS de github.com e `pnpm` ausente no
  ambiente de trabalho; testes/build da implementação comprovados nos runs
  exact-SHA identificados em **Evidências de validação técnica**.
- PR: https://github.com/crgasparoto-br/training-system/pull/541
- Remediação inicial da auditoria de 11/11/2026: `A-001`, `A-002` e `REC-001`.
- Remediações anteriores: `A-404-001`, `RISK-001`, `REC-404-001`, com controles
  de permissão independente, revogação e revisão histórica. A-404-006/007
  introduzem o vínculo efetivo no registro de execução e corrigem a documentação.
  Evidências de SHAs anteriores não certificam automaticamente novos commits.
- Não fazer merge sem autorização explícita.
