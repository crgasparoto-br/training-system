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
      canônica, com visão do aluno/professor, rastreabilidade visível, testes e documentação.
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

## Remediação da auditoria da PR #533

- [x] A-002: mostrar origem, unidade, data/hora de atualização e detalhe técnico do professor na interface, sem expor IDs ao aluno; manter indicador na semana histórica.
- [x] A-001: remover o conflito de adições no final da documentação canônica, reposicionando a seção #405 para próximo da evolução do aluno, sem descartar as atualizações da `develop` e sem merge da PR.
- [x] Revalidar CI no HEAD reconciliado anterior (`0a50e482`): execução #42609345271 aprovada.
- [x] A-003: segregar `ruleVersion`, `source`, `formula` e IDs no campo `technical` só do professor,
      mantendo fonte legível e contagens na resposta do aluno; adicionar testes de serviço e HTTP.
- [x] Validar o HEAD da remediação A-003 (`5a266789`, CI #42619866441); auditoria independente identificou A-004.
- [x] A-004: preservar o status de sessões legadas concluídas na aderência,
      dar precedência à execução canônica, recuperar data de atualização legada
      e cobrir perfil aluno/professor, histórico e ausência de liberação em testes.
- [ ] Confirmar CI no HEAD da remediação A-004 e obter nova auditoria independente.

## Remediação dos achados da auditoria #405 — PR #547

- [x] A-001: preservar o contexto da unidade de treino (catálogo, seção, posição,
      sistema, blocos e grupo) extraído do snapshot da execução; séries ambíguas
      permanecem isoladas, sem média ou tendência fictícia.
- [x] A-002: separar o pace pelo método e topologia cíclica registrados no snapshot
      imutável; ausência de ambos impede comparabilidade.
- [x] A-003: rejeitar modalidade desconhecida/inválida como evidência de compatibilidade;
      manter leituras rastreáveis e isoladas sem soma enganosa.
- [x] Incluir controles negativos e regressões nas suítes de domínio, serviço e interface;
      sincronizar a documentação funcional da regra.
- [x] A-004 (auditoria 13/11): modalidade de execução histórica deriva do
      snapshot vinculado e não muda com alterações posteriores do WorkoutDay;
      snapshot ausente/inválido mantém medições isoladas.
- [x] A-005 (auditoria 13/11): somente séries confirmadas compõem tonelagem,
      carga e repetições; rascunho em sessão parcial fica fora do cálculo.
- [x] A-006 (auditoria 13/11): distância e ritmo usam método/topologia do
      snapshot para agrupar tipo cíclico; corrida, ciclismo e tipo desconhecido
      não geram evolução cruzada.
- [x] Adicionar regressões adversariais de domínio e serviço e sincronizar as
      regras documentadas no produto.
- [ ] Revalidar `pnpm validate` no CI do HEAD material exato e obter auditoria
      independente da PR corrigida antes de marcar a issue como encerrada.

## Validação manual

Consultar uma semana com sessões completas, parciais, não realizadas e futuras
liberadas; trocar de aluno/contrato; verificar semana sem sessões e níveis de
detalhe do aluno/professor. Validar feedback e comparação sem mutação do plano.

## Decisões e pendências

A primeira implementação é incremental e **não encerra a epic nem a #405**.
Não realizar merge ou encerramento de issues antes da implementação integral,
CI e auditoria independente. Nenhuma regra clínica indefinida será inferida.
