# Plano: epic #402 — revisão do treinamento combinado

## Objetivo

Evoluir a revisão do treinamento combinado com conflitos e substituições
rastreáveis, indicadores individuais e decisão validada pelo professor, sem
alteração automática de prescrição ou de treino liberado.

## Contexto

Epic #402, subissues #403, #404, #405 e #406.
Fontes canônicas: `docs/product/roadmap.md`,
`docs/product/student-centered-training-experience.md`,
`docs/product/post-workout-feedback-decision.md` e a API de treino/feedback.

Dependências #389, #390 e #401 estão integradas à `develop`.
A #394 (curadoria de catálogo) permanece aberta, assim como a homologação
operacional associada à #385.

## Fora de escopo

IA decisória autônoma, Garmin/Strava, métricas gerenciais, comunicação automática
e heurísticas clínicas sem regra versionada e aprovada.

## Arquivos e módulos principais

- `apps/api/src/modules/workout/`
- `apps/api/src/modules/post-workout-feedback/`
- `apps/web/src/components/training/`
- `packages/types/training-routine.ts`
- `apps/api/prisma/schema.prisma` e migrations espelhadas (quando necessário)
- `docs/product/`

## Regras e restrições

- Isolamento por `contractId` e autorizações reais de professor/aluno.
- Prescrição, Montagem Consolidada e treino liberado não mudam por sugestões.
- Histórico, versões, evidências e decisões profissionais não podem ser apagados.
- Regra clínica sem limiar/operando canônico permanece não ativada.

## Passos de implementação

- [x] Inventariar dependências e estados reais da epic.
- [x] Implementar primeiro indicador de aderência semanal v1 como projeção
      canônica, com visão do aluno/professor, testes e documentação.
- [ ] #403: detector de conflitos com critérios clínicos versionados. Os sete
      parâmetros ainda não definidos na issue impedem ativar suas regras.
- [ ] #404: substituição rastreável vinculada a catálogo elegível e versionado,
      dependente do fluxo de curadoria da #394.
- [ ] #405: completar métricas históricas comparáveis, séries e fontes adicionais;
      a fórmula de consistência continua não definida.
- [ ] #406: workflow transacional sugerir/aprovar/rejeitar/aplicar com efeito no
      domínio alvo, idempotência, autorização e timeline.
- [ ] Validação de ponta a ponta e auditoria independente dos critérios da epic.

## Critérios de aceite

- [ ] Os sete critérios globais da epic estão comprovados por testes e CI.
- [ ] `pnpm validate` passa no HEAD exato e as validações funcionais são registradas.
- [ ] Os bloqueios externos são tratados sem regras inventadas.

## Validação manual

Consultar uma semana com sessões completas, parciais, não realizadas e futuras
liberadas; trocar de aluno/contrato; verificar semana sem sessões e níveis de
detalhe do aluno/professor. Validar feedback e comparação sem mutação do plano.

## Decisões e pendências

A primeira implementação é incremental e **não encerra a epic nem a #405**.
Não realizar merge ou encerramento de issues antes da implementação integral,
CI e auditoria independente. Nenhuma regra clínica indefinida será inferida.
