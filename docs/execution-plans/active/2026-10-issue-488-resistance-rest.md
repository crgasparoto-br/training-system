# Issue #488 — cronômetro e transições de descanso resistido

## Identidade, pré-requisitos e fontes

- Repositório: `crgasparoto-br/training-system`; branch-base: `develop`.
- Entrega vigente: branch `feat/488-resistance-rest-develop-reconciled`, [PR #529](https://github.com/crgasparoto-br/training-system/pull/529) com base `develop`. A CI e a auditoria independente devem ser revalidadas no HEAD exato após qualquer alteração; não realizar merge automático.
- Histórico substituído: branch `feat/488-resistance-rest-timer` e [PR #528](https://github.com/crgasparoto-br/training-system/pull/528), que possuía conflitos com `develop`. Preservar a PR #528 somente como histórico; não integrar ambas as PRs.
- Base: #389 (sessão, pausa, versão e operações), #399 (séries planejadas), #400 (grupos/rodadas) e #487 (conclusão guiada e ordem persistida).
- Não criar árvore paralela de planejamento nem persistir cronômetro no navegador.

## Regra de negócio e fronteiras

1. **Iniciar**: após confirmação transacional de uma série da #487, iniciar `WorkoutSessionResistanceRest` apenas se uma próxima unidade existir e o intervalo efetivo da unidade concluída for um inteiro positivo. Cada descanso é único por sessão e `plannedSetId`. Agrupamentos percorrem todos os membros antes do intervalo de rodada, salvo intervalo intermediário explícito.
2. **Contar**: armazenar `startedAt` e `targetEndsAt`, preservar `plannedSeconds` imutável, adicionar `extensionSeconds` apenas na execução e projetar `serverNow`, `remainingMs` e `elapsedMs` com relógio de servidor. Na apresentação, medir início da requisição e recebimento com `performance.now()`. A API inclui `requestProcessingMs` no snapshot do descanso: descontar do round-trip a duração gasta pelo servidor **antes** da projeção, pois um descanso criado ao fim de um POST lento ainda deve mostrar o intervalo inteiro (60 s, processamento de 40 s = 60 s restantes). O round-trip por si só não permite distinguir 40 s de upload (restante 60 s) de 40 s de resposta (restante 20 s): nunca descontar toda a diferença `RTT - requestProcessingMs` sem comprovação. Uma amostra `serverNow` da projeção guiada anterior, associada ao recebimento monotônico no cliente, comprova limite inferior de idade da nova resposta; a idade projetada é limitada também pelo máximo `RTT - requestProcessingMs`. A API expõe `serverNow` mesmo antes de criar descanso para permitir calibração do primeiro POST. Sem amostra confiável, iniciar pela duração canônica e executar um único GET extra em redes muito lentas; após receber, avançar monotonicamente. Nunca subtrair `Date.now()` de `serverNow`: relógios civis do dispositivo podem estar adiantados ou atrasados. O cálculo da UI jamais autoriza `finish`: o backend continua a única autoridade. O navegador apenas apresenta, jamais decide o avanço.
3. **Operar**: `POST /api/v1/student/me/training-sessions/:sessionId/execution/guided/rest` aceita `operationKey`, `expectedVersion`, `restId` e `action=extend_15|skip|finish`. `extend_15` altera somente o prazo real; `skip` registra duração parcial e libera a próxima série; `finish` exige término do prazo. Mesmo `operationKey` e payload implica replay sem escrita adicional; chave reutilizada com outra intenção ou versão vencida resulta em 409.
4. **Segurança**: comandos autenticados usam `contractId`, aluno, sessão e release conforme #389. Lock por `WorkoutDay`, transação serializável e versão da sessão; SQL protege relação com conjunto concluído e impede regravar o histórico de descanso finalizado. Criar, confirmar, estender, pular e encerrar registram trilha operacional, ator e versão na ledger existente.
5. **Pausa**: não confundir background com pausa explícita. `paused` congela o contador e impede mutações; retomada desloca o prazo pelo tempo de pausa, sem perder saldo. Estado terminal interrompe o descanso ativo e registra realizado sem criar nova execução.
6. **Interface**: o card do aluno evidencia o contador, tempo prescrito e transcorrido, permite `+15 s`/pular, sinaliza pausa, restaura por GET após refresh, foco ou mudança de estado e oferece som/vibração opcionais. Desabilitar próxima série até o descanso sair de `active`. Erro de rede preserva a operação para retry; 409 exige revalidação. A conclusão automática usa uma única requisição pendente por descanso/prazo, mas rearma tentativas com backoff limitado após timeout ou 409 prematuro, sem duplicar comandos, avançar a sessão pausada ou contornar a autoridade do servidor. HTTP 4xx permanente (exceto 429 e 409 tratado à parte) bloqueia novas tentativas automáticas até GET válido; falha transitória de rede ou 5xx continua em backoff e preserva a chave.

## Validações

- Domínio: descanso de 60 segundos, ausência/zero, série final, refresh/background, 60→25→pausa→35 restantes, extensão sem alterar prescrição.
- Integração PostgreSQL: transação de conclusão, grupo bi-set, unicidade, reenvio idempotente, 409 com versão/chave divergente, pausa/retomada, encerramento, concorrência de clientes, tentativa de atravessar `contractId`, adulteração SQL, evento/versionamento.
- Frontend: contagem monotônica com `performance.now()` medida desde o início da requisição (não `Date.now()` versus `serverNow`), pausa não avança, controles por teclado, ação `+15 s`/pular, timeout e retry com mesma chave, recuperação de conflito, ausência de próxima série até o descanso terminar. Regressões: POST com 40 s de upload ou middleware antes da criação do descanso (restante 60 s), POST com 40 s de resposta tardia após snapshot e âncora anterior válida (60 s → 20 s), GET inicial lento sem âncora (sem expiração antecipada e com reconciliação automática), GET com upload atrasado, processamento lento e transporte misto, relógios civis ±5 min e mudança da hora durante descanso, descanso vencido, uma única solicitação `finish` enquanto pendente ou após sucesso, retry após 409/timeout e bloqueio em pausa/terminal.
- Gates: Prisma migrate, `pnpm validate`, testes, type-check, lint, build e CI CRITICAL no SHA final. O navegador autenticado é necessário para comprovar integração real; simulação isolada não comprova essa jornada.
- A aprovação independente é externa à implementação. Nenhuma CI ou comentário do implementador equivale a aprovação independente.

## Remediação do finding A-003 (auditoria independente de 01/11/2026)

- Rejeição de origem: `audit-rejection:d420d451-6237-47e0-844d-2815dd7ed323`; HEAD reprovado: `7cab2f07782c95c780ec852e87f8a38f1d2e2ea7`.
- Causa-raiz: `RTT - requestProcessingMs` confundia upload e middleware antes do snapshot com download após o snapshot, encerrando visualmente o descanso cedo e provocando tentativa prematura de `finish`.
- Correção: campo `GuidedResistanceView.serverNow` (inclusive pré-descanso), amostras consecutivas do mesmo servidor com âncora monotônica, limite inferior comprovável para idade de resposta; sem âncora, exibição conservadora e GET de reconciliação único por descanso/prazo se a incerteza exceder 2 s. Nenhuma decisão temporal persistida migrou para o cliente.
- Provas previstas: resposta lenta após snapshot, requisição e middleware lentos antes do snapshot, processamento longo, transporte misto, ausência de âncora, mudança civil local, pausa, status terminal, idempotência e API real. As validações internas não substituem nova auditoria independente.

## Reclassificação do finding A-004 — contrato HTTP 409

- Auditoria de 01/11/2026, SHA `566f803e558e4876ab6084a0451ea6e40bccb8b0`, rejeição `audit-rejection:9875d7e3-154a-43c3-b6fd-ceacb2ec5444`: **achado inválido**, não defeito da implementação. A auditoria examinou `apps/api/src/common/response.ts`, mas `student.routes.ts` importa `sendError` de `@corrida/utils` (`packages/utils/common.ts`), que serializa o código de erro em `details.code`, exatamente como `GuidedResistanceCard.tsx` já consome. Mudar a leitura para `errors.code` quebraria o fluxo existente.
- Cobertura adicionada: teste HTTP Supertest na rota guiada real (com serviço injetado) valida `details.code` e ausência de `errors`, distinguindo `INVALID_TRANSITION` de `VERSION_CONFLICT`; teste navegador com API/PostgreSQL reais tenta `finish` cedo, recebe 409 e comprova que versão/descanso não mudaram; teste React exercita o mesmo envelope, GET na mesma versão e retry de conclusão. A UI continua sem autoridade temporal.
- Não houve modificação do contrato de produção. A reclassificação é análise técnica e evidência interna; **somente nova auditoria independente** pode emitir aprovação.

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
