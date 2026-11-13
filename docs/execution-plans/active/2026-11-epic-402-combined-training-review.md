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
- [x] A-007 (auditoria 13/11): método genérico (`CEXT`) ou ambíguo não certifica
      identidade esportiva. Somente indicação inequívoca do esporte no snapshot
      permite séries de distância/pace comparáveis; medições desconhecidas
      ficam isoladas sem herdar modalidade do planejamento mutável.
- [x] A-008 (auditoria 13/11): reconciliar registros explícitos de pais `repeat`
      com seus descendentes pelo grafo histórico de etapas, evitando dupla
      contagem de duração/distância; manter valores somente de pais/filhos,
      zero explícito e estados incomparáveis quando faltar vínculo confiável.
- [x] Incluir controles negativos, positivos, regressão de domínio e cenário
      de serviço com snapshot histórico; preservar separação de permissões.
- [x] Adicionar regressões adversariais de domínio e serviço e sincronizar as
      regras documentadas no produto.
- [x] A-009: última carga/repetições pela cronologia da confirmação (`completedAt`
      ou `finishedAt`), não por ID/data planejada; ausência ou empate isola
      medições sem fabricar uma evolução.
- [x] A-010: topologia cíclica legitimamente vazia difere de grafo histórico
      inválido, órfão ou duplicado; método igual não comprova comparabilidade.
- [x] RISK-001: execução de outra liberação não contamina status, aderência,
      feedback, comparação ou próxima sessão.
- [x] Testes positivos/negativos adicionados no domínio e serviço; documentação
      sincronizada com cronologia, modalidades e origem canônica.
- [x] A-011 (auditoria 13/11): eliminar dupla contagem de substituicoes em pais
      `repeat` quando as etapas filhas registram a mesma substituicao; preservar
      agregado isolado, filhos independentes e ausencia de topologia confiavel.
- [x] A-012 (auditoria 13/11): contar agrupamentos resistidos substituidos,
      conciliando as series/exercicios do snapshot para evitar duplicidade;
      conjuntos sem vinculo historico ficam `incomparable`.
- [x] Cobrir A-011/A-012 em testes de dominio e integracao e atualizar
      regra documentada sem nova persistencia.
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

### #405 — remediação A-013 (13/11/2026)

- Recorte: recuperação das leituras cíclicas confirmadas em `cyclicStages[].paceMinPerKm` e em `items[].durationSec/distanceKm/pace`; conservar dados históricos isolados quando faltar semântica verificável.
- Precedência: totais explícitos da sessão não são somados novamente com medições subordinadas; etapa `repeat` prevalece sobre filhos para o mesmo campo; etapa e item sem total não são combinados em soma fictícia.
- Proveniência e segurança: IDs de etapas, séries e liberações apenas na visão técnica do professor; `contractId`, liberação consolidada, snapshots e permissões existentes sem alteração.
- Cobertura adicionada: regressões A-013 no domínio, serviço e rota para comparabilidade, confirmação, método ambíguo, grafo inválido, zero, ordem de prioridade e duplicidade.
- Critério de conclusão: `pnpm validate` e CI do HEAD material verde, auditoria independente posterior; sem merge ou encerramento automático da issue.
