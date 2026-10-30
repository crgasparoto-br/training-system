# Issue #488 — cronômetro e transições de descanso resistido

## Identidade, pré-requisitos e fontes

- Repositório: `crgasparoto-br/training-system`; branch-base: `develop`.
- Entrega: `feat/488-resistance-rest-timer`; PR deve ser auditada sem merge automático.
- Base: #389 (sessão, pausa, versão e operações), #399 (séries planejadas), #400 (grupos/rodadas) e #487 (conclusão guiada e ordem persistida).
- Não criar árvore paralela de planejamento nem persistir cronômetro no navegador.

## Regra de negócio e fronteiras

1. **Iniciar**: após confirmação transacional de uma série da #487, iniciar `WorkoutSessionResistanceRest` apenas se uma próxima unidade existir e o intervalo efetivo da unidade concluída for um inteiro positivo. Cada descanso é único por sessão e `plannedSetId`. Agrupamentos percorrem todos os membros antes do intervalo de rodada, salvo intervalo intermediário explícito.
2. **Contar**: armazenar `startedAt` e `targetEndsAt`, preservar `plannedSeconds` imutável, adicionar `extensionSeconds` apenas na execução e projetar `serverNow`, `remainingMs` e `elapsedMs` com relógio de servidor. Na apresentação, medir início da requisição e recebimento da resposta com `performance.now()`, usar a duração monotônica da requisição como limite superior da idade do snapshot e continuar contando monotonicamente depois de recebê-lo (ex.: 60 s planejados, resposta 40 s depois = 20 s restantes). Nunca subtrair `Date.now()` de `serverNow`: relógios civis do dispositivo podem estar adiantados ou atrasados. A estimativa pode adiantar o display se o servidor demorar a processar a requisição; nesse caso a API recusa o término prematuro e uma nova leitura realinha o contador. O navegador apenas apresenta, jamais decide o avanço.
3. **Operar**: `POST /api/v1/student/me/training-sessions/:sessionId/execution/guided/rest` aceita `operationKey`, `expectedVersion`, `restId` e `action=extend_15|skip|finish`. `extend_15` altera somente o prazo real; `skip` registra duração parcial e libera a próxima série; `finish` exige término do prazo. Mesmo `operationKey` e payload implica replay sem escrita adicional; chave reutilizada com outra intenção ou versão vencida resulta em 409.
4. **Segurança**: comandos autenticados usam `contractId`, aluno, sessão e release conforme #389. Lock por `WorkoutDay`, transação serializável e versão da sessão; SQL protege relação com conjunto concluído e impede regravar o histórico de descanso finalizado. Criar, confirmar, estender, pular e encerrar registram trilha operacional, ator e versão na ledger existente.
5. **Pausa**: não confundir background com pausa explícita. `paused` congela o contador e impede mutações; retomada desloca o prazo pelo tempo de pausa, sem perder saldo. Estado terminal interrompe o descanso ativo e registra realizado sem criar nova execução.
6. **Interface**: o card do aluno evidencia o contador, tempo prescrito e transcorrido, permite `+15 s`/pular, sinaliza pausa, restaura por GET após refresh, foco ou mudança de estado e oferece som/vibração opcionais. Desabilitar próxima série até o descanso sair de `active`. Erro de rede preserva a operação para retry; 409 exige revalidação. A conclusão automática usa uma única requisição pendente por descanso/prazo, mas rearma tentativas com backoff limitado após timeout ou 409 prematuro, sem duplicar comandos, avançar a sessão pausada ou contornar a autoridade do servidor. HTTP 4xx permanente (exceto 429 e 409 tratado à parte) bloqueia novas tentativas automáticas até GET válido; falha transitória de rede ou 5xx continua em backoff e preserva a chave.

## Validações

- Domínio: descanso de 60 segundos, ausência/zero, série final, refresh/background, 60→25→pausa→35 restantes, extensão sem alterar prescrição.
- Integração PostgreSQL: transação de conclusão, grupo bi-set, unicidade, reenvio idempotente, 409 com versão/chave divergente, pausa/retomada, encerramento, concorrência de clientes, tentativa de atravessar `contractId`, adulteração SQL, evento/versionamento.
- Frontend: contagem monotônica com `performance.now()` medida desde o início da requisição (não `Date.now()` versus `serverNow`), pausa não avança, controles por teclado, ação `+15 s`/pular, timeout e retry com mesma chave, recuperação de conflito, ausência de próxima série até o descanso terminar. Regressões: resposta atrasada 40 s (60 s → 20 s), nova leitura atrasada sem salto para trás, relógios civis ±5 min e mudança da hora durante o descanso, descanso vencido, uma única solicitação `finish` enquanto pendente ou após sucesso, retry controlado após 409 prematuro ou timeout, sem retry em pausa/terminal.
- Gates: Prisma migrate, `pnpm validate`, testes, type-check, lint, build e CI CRITICAL no SHA final. O navegador autenticado é necessário para comprovar integração real; simulação isolada não comprova essa jornada.
- A aprovação independente é externa à implementação. Nenhuma CI ou comentário do implementador equivale a aprovação independente.

## Riscos e compatibilidade

- Dados legados e séries sem descanso permanecem executáveis sem descanso sintético.
- Extensões e pausas não reescrevem a prescrição consolidada/liberada.
- Depois de terminal, nenhum temporizador solicita avanço.
- Não fazer merge antes de CI verde e nova auditoria independente do SHA definitivo.

## Fechamento do finding A-002 (auditoria de 30/10/2026)

- Rejeição de origem: `audit-rejection:79866723-414b-45ce-b117-a4690fb77702`; SHA reprovado: `0f69142827bfa9884246afdcad4338ab3cae57b2`.
- Causa: uso de relógio civil local não calibrado e latch de `finish` sem rearmar após falha.
- Remediação: contagem baseada na duração monotônica observada entre requisição/recebimento, sem comparar relógios do servidor e dispositivo; `finish` só é decidido pelo backend, com reconciliação e retry de backoff limitado se houver 409 prematuro/timeout.
- Controle positivo: descanso de 60 s, retorno atrasado 40 s, pausa explícita e recuperação por GET. Controles negativos: relógio ±5 min, alteração da hora enquanto a tela está aberta, 409 prematuro, timeout, operação já pendente e terminal.
- Esta seção descreve o contrato e as regressões esperadas; aprovação independente pertence exclusivamente a contexto separado, no HEAD final de CI verde.
