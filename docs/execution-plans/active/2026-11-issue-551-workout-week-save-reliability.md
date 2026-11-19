# Plano: #551 — confiabilidade do salvamento semanal no Workout Builder

## Objetivo

Eliminar falhas recorrentes de salvamento do treino semanal sem perda de edicoes, preservando conciliacao de versoes.

## Contexto

Incidente em producao em 18/11/2026: `P2028` e timeout de transacao Prisma de 5 segundos no endpoint semanal; tentativas seguintes apresentaram conflito de versao. Fontes: issue #551, `docs/architecture/database.md`, `docs/architecture/web.md`, `apps/api/src/modules/workout/` e `apps/web/src/pages/WorkoutBuilder2/`.

## Fora de escopo

Mudanca de schema, regra clinica, historico de execucao, permissao, merge ou deploy em producao.

## Arquivos e modulos principais

- `apps/api/src/modules/workout/workout-week-structure.service.ts`
- `apps/api/src/modules/workout/workout-planning.helpers.ts`
- `apps/api/src/routes/workout.routes.ts` e `workout-route-guards.ts`
- `apps/web/src/pages/WorkoutBuilder2/index.tsx` e `workout-builder-structure.ts`
- Testes focados e documentacao de arquitetura.

## Regras e restricoes

- `contractId` de origem autenticada permanece verificado.
- Escritas preservam isolamento `Serializable` e locks existentes.
- `baseUpdatedAt` continua bloqueando sobrescritas apos alteracao em outra sessao.
- Erros internos do Prisma nao atravessam a API.
- Rascunhos nao podem ser perdidos em timeout.

## Passos de implementacao

- [x] Diagnosticar stack trace e duracao da transacao nos logs de producao.
- [x] Ajustar timeout especifico do salvamento semanal, sem alterar outros fluxos.
- [x] Eliminar flush redundante e propagar revisao confirmada ao rascunho mais recente.
- [x] Retornar erro recuperavel para timeout sem expor infraestrutura.
- [x] Adicionar testes e atualizar a documentacao.
- [x] Corrigir tipagem circular TS2502 do teste transacional (AUD-552-01).
- [x] Tratar P2024/P2028 no middleware multi-tenant anterior ao handler semanal, sem alterar as demais rotas (AUD-552-02).
- [x] Adicionar controles de falha de escopo, tenant negado, retry de draft e semana com dois dias.
- [x] Corrigir classificacao de risco de guards de autorizacao (A-552-02) com controles positivos e negativos para variantes do nome do arquivo.
- [x] Incluir o comando literal `pnpm validate` no gate `CRITICAL` do GitHub Actions (A-552-01), sem retirar testes de banco, browser ou build.
- [ ] Conferir gates criticos e `pnpm validate` no SHA final e marcar o criterio de aceite da issue somente depois de sucesso verificavel.

## Criterios de aceite

- [x] Testes relevantes foram adicionados ou atualizados.
- [x] Documentacao foi atualizada.
- [ ] `pnpm validate` e build comprovadamente aprovados no SHA material final.
- [ ] CI aplicavel e handoff de auditoria independente realizados.
- [ ] Confirmacao operacional apos release em producao.

## Validacao manual

Em ambiente homologado, salvar semana com varios dias e exercicios; editar novamente durante um envio longo, alternar semanas e repetir o salvamento. Conferir GET posterior, ausencia de duplicacoes, preservacao do rascunho em 503 e bloqueio com 409 apos edicao simultanea em outra sessao.

## Decisoes e pendencias

- Mudanca limitada ao par `maxWait: 15000`/`timeout: 30000` ms na transacao semanal; demais caminhos mantem limites existentes.
- Sem alterar `PRISMA_CONNECTION_LIMIT` ou credenciais de producao.
- As correcoes da auditoria da PR #552 preservam a checagem de contrato antes do handler e somente convertem a indisponibilidade transiente do salvamento semanal em 503; acesso negado continua 404.
- A aprovacao exige validar o SHA material final na CI do GitHub, registrar fechamento dos criterios de aceite na issue e solicitar nova auditoria independente; homologacao operacional depende de release autorizado.
- Auditoria independente de 19/11/2026: A-552-01 exige execucao literal de `pnpm validate`; A-552-02 exige perfil `CRITICAL` para `workout-route-guards.ts`. A remediacao de codigo so sera considerada verificada apos os jobs exatos concluirem com sucesso.
