# Issue #488 — cronômetro e transições de descanso resistido

## Identidade, pré-requisitos e fontes

- Repositório: `crgasparoto-br/training-system`; branch-base: `develop`.
- Entrega: `feat/488-resistance-rest-timer`; PR deve ser auditada sem merge automático.
- Base: #389 (sessão, pausa, versão e operações), #399 (séries planejadas), #400 (grupos/rodadas) e #487 (conclusão guiada e ordem persistida).
- Não criar árvore paralela de planejamento nem persistir cronômetro no navegador.

## Regra de negócio e fronteiras

1. **Iniciar**: após confirmação transacional de uma série da #487, iniciar `WorkoutSessionResistanceRest` apenas se uma próxima unidade existir e o intervalo efetivo da unidade concluída for um inteiro positivo. Cada descanso é único por sessão e `plannedSetId`. Agrupamentos percorrem todos os membros antes do intervalo de rodada, salvo intervalo intermediário explícito.
2. **Contar**: armazenar `startedAt` e `targetEndsAt`, preservar `plannedSeconds` imutável, adicionar `extensionSeconds` apenas na execução e projetar `serverNow`, `remainingMs` e `elapsedMs` com relógio de servidor. Na apresentação, descontar também a idade da resposta desde `serverNow`, sem reiniciar o intervalo ao receber o payload (ex.: 60 s planejados, resposta 40 s depois = 20 s restantes). O navegador apenas apresenta, jamais decide o avanço.
3. **Operar**: `POST /api/v1/student/me/training-sessions/:sessionId/execution/guided/rest` aceita `operationKey`, `expectedVersion`, `restId` e `action=extend_15|skip|finish`. `extend_15` altera somente o prazo real; `skip` registra duração parcial e libera a próxima série; `finish` exige término do prazo. Mesmo `operationKey` e payload implica replay sem escrita adicional; chave reutilizada com outra intenção ou versão vencida resulta em 409.
4. **Segurança**: comandos autenticados usam `contractId`, aluno, sessão e release conforme #389. Lock por `WorkoutDay`, transação serializável e versão da sessão; SQL protege relação com conjunto concluído e impede regravar o histórico de descanso finalizado. Criar, confirmar, estender, pular e encerrar registram trilha operacional, ator e versão na ledger existente.
5. **Pausa**: não confundir background com pausa explícita. `paused` congela o contador e impede mutações; retomada desloca o prazo pelo tempo de pausa, sem perder saldo. Estado terminal interrompe o descanso ativo e registra realizado sem criar nova execução.
6. **Interface**: o card do aluno evidencia o contador, tempo prescrito e transcorrido, permite `+15 s`/pular, sinaliza pausa, restaura por GET após refresh, foco ou mudança de estado e oferece som/vibração opcionais. Desabilitar próxima série até o descanso sair de `active`. Erro de rede preserva a operação para retry; 409 exige revalidação.

## Validações

- Domínio: descanso de 60 segundos, ausência/zero, série final, refresh/background, 60→25→pausa→35 restantes, extensão sem alterar prescrição.
- Integração PostgreSQL: transação de conclusão, grupo bi-set, unicidade, reenvio idempotente, 409 com versão/chave divergente, pausa/retomada, encerramento, concorrência de clientes, tentativa de atravessar `contractId`, adulteração SQL, evento/versionamento.
- Frontend: contagem com `Date.now()` baseada em `serverNow` (e não no recebimento da resposta), pausa não avança, controles por teclado, ação `+15 s`/pular, timeout e retry com mesma chave, recuperação de conflito, ausência de próxima série até o descanso terminar. Regressões obrigatórias: resposta atrasada 40 s (60 s → 20 s), nova leitura atrasada sem salto para trás, descanso já expirado e uma única solicitação automática de `finish` mesmo após refresh/releitura do mesmo descanso.
- Gates: Prisma migrate, `pnpm validate`, testes, type-check, lint, build e CI CRITICAL no SHA final. O navegador autenticado é necessário para comprovar integração real; simulação isolada não comprova essa jornada.
- A aprovação independente é externa à implementação. Nenhuma CI ou comentário do implementador equivale a aprovação independente.

## Riscos e compatibilidade

- Dados legados e séries sem descanso permanecem executáveis sem descanso sintético.
- Extensões e pausas não reescrevem a prescrição consolidada/liberada.
- Depois de terminal, nenhum temporizador solicita avanço.
- Não fazer merge antes de CI verde e nova auditoria independente do SHA definitivo.
