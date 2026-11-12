# Arquitetura do frontend web

O frontend web fica em `apps/web`.

## Responsabilidades

- Renderizar telas do Sistema Acesso.
- Consumir a API autenticada.
- Ocultar menus, telas, abas e acoes conforme permissao recebida da API.
- Nunca confiar apenas no frontend para seguranca; a API deve revalidar permissoes.

## Regras para novas telas

- Nova tela deve possuir `screenKey` no catalogo compartilhado quando precisar de permissao.
- Nova aba, bloco ou acao sensivel deve possuir `blockKey` no catalogo compartilhado.
- Menu lateral deve ocultar itens sem permissao.
- Telas longas devem agrupar secoes relacionadas em componentes colapsaveis quando isso melhorar a usabilidade.

## Contrato com a API

O frontend pode usar permissoes para experiencia de usuario, mas a API continua sendo a fonte de seguranca. Nunca exponha dados sensiveis assumindo que ocultar componente e suficiente.

## Fluxo web do aluno: revisao cadastral

A implementacao web responsiva e a experiencia canonica atual para a revisao cadastral do aluno; um futuro app mobile deve reutilizar o mesmo contrato `/api/v1/student/me`, sem criar regras paralelas.

- `/inicio` sinaliza a revisao pendente a partir do resumo autenticado do aluno.
- `/student/profile-review` carrega `GET /api/v1/student/me/profile-review` e `GET /api/v1/student/me/profile`.
- A conclusao usa `POST /api/v1/student/me/profile-reviews/:id/complete`.
- Quando houver contexto contratual selecionado, os requests `student/me` preservam `x-contract-id`; a API continua responsavel por validar vinculo ativo e isolamento multi-tenant.
- Campos nao sensiveis podem ser aplicados diretamente. Campos sensiveis permanecem em analise e a mensagem de sucesso deve refletir a resposta do backend, nunca inferencia local do frontend.
- Falha de carregamento ou submissao deve manter estado recuperavel e nunca exibir conclusao falsa.
- A tela deve funcionar em mobile e desktop, sem overflow horizontal, e manter as acoes principais acessiveis por teclado.

A matriz de regressao do fluxo esta em `docs/profile-review-e2e-validation.md`. O contrato de payloads e campos permanece em `docs/student-app-data-contract.md`.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm lint`
- `pnpm test`
- `pnpm access:check`

## Treino de hoje e rotina semanal

`components/training/TrainingRoutinePanel.tsx` renderiza a rotina semanal e o Treino de hoje para o aluno (`/student/training`) e para o professor na aba Aluno 360 da Central. O painel recebe a função de carregamento e trata localmente carregamento, vazio, sessão não liberada, permissão negada e erro com nova tentativa, sem derrubar os demais blocos da Central. Na Central ele só consulta a API quando o perfil possui `students.details.trainingPlans`.

A projeção semanal do painel é somente leitura, mas `TrainingSubstitutionCard` realiza comandos explícitos pela API `/api/v1/training-substitutions`. Para professores, as ações de pré-aprovação e revisão só aparecem com `students.actions.manageTrainingSubstitutions`, além de `students.details.trainingPlans`; professores com leitura isolada mantêm o histórico, sem botões de alteração. O backend repete a mesma autorização de escrita dentro da transação; esconder ações na interface não é controle suficiente. Sem `plannedSnapshot`, a comparação antiga exibe apenas valores executados realmente registrados e `historical_unknown` (Cobertura histórica indisponível) para agregados sem denominador histórico comprovável; alterar o plano atual não muda esse resumo. O professor continua vendo as séries e medidas históricas explícitas, enquanto o aluno recebe apenas métricas autorizadas. A evidência autenticada #401 percorre a própria Central do Aluno no desktop e mobile, além do cartão isolado. A rotina semanal permite expandir comparações históricas de sessões já executadas, com dados autorizados na API e chave distinta para cada ocorrência de série. Controles de execução ficam desabilitados enquanto a API declarar `execution.available = false`; não há estado de sessão local nem chamada a endpoints de execução. O card legado baseado em `Microcycle` foi removido da Central.

A execução resistida com resultado `substituted` deve trazer o ID da
substituição explicitamente selecionada e registrada no ledger da #404; não
basta `substitutionNote` livre. No guia de séries, a escolha padrão é executar
o exercício originalmente planejado; quando há pré-aprovação ou solicitação
válida para a unidade atual, o aluno pode escolher o substituto e informar
uma observação obrigatória. A mesma operação `guided/complete` grava o resultado,
`substitutionId`, série, repetições e carga de forma idempotente. A escolha
permanece no rascunho da mesma série ao alternar guia/ficha, mas não passa
para outra série ou sessão. A API revalida catálogo, vínculo, contrato,
revisão e versão na transação. A comparação exibe a unidade original, sua
alternativa e o estado da revisão quando houver vínculo, sem interpretar uma
pré-aprovação como execução confirmada. Etapas cíclicas/agrupamentos com nota
livre são adaptações operacionais distintas, não substituição de exercício.

## Check-in pré-treino

O `TrainingRoutinePanel` projeta o check-in da #388 no mesmo card da sessão. Para o aluno em `not_started`, `PreWorkoutCheckInCard` permite preenchimento parcial e salva pela fronteira `student/me`; depois do início a mesma visão fica somente leitura. Na Central do Aluno, o modo professor só renderiza esse bloco quando a API inclui explicitamente `preWorkoutCheckIn`, o que exige a concessão sensível `students.details.preWorkoutCheckIn`; sem essa concessão o campo e o bloco visual são omitidos.

Em falha recuperável, os campos digitados permanecem no estado local e o mesmo `operationKey` é reutilizado enquanto o payload não mudar. A interface não calcula regra clínica nem score localmente: mensagens e triagem exibidas vêm do snapshot retornado pela API.

O erro canônico usa `error` e `details.code`. HTTP 409 com `PRE_WORKOUT_CHECK_IN_LOCKED` torna o formulário somente leitura mesmo quando a página ainda projeta `not_started`: desabilitar campos, remover envio e identificar o rascunho como não salvo. Essa reconciliação usa a decisão do backend, não inicia nem simula a sessão. `PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT` e outros HTTP 409 não equivalem a treino iniciado. Erros temporários mantêm edição e reenvio seguro. Submissões concorrentes na mesma instância do formulário são evitadas enquanto a primeira chamada está em andamento.

## Mapa corporal de desconforto

`BodyDiscomfortMap` compoe a ilustracao, as areas clicaveis e os marcadores visiveis no mesmo SVG com `viewBox="0 0 400 600"`. Todos escalam juntos; nao posicionar marcadores por pixels de tela ou em uma camada HTML independente. As coordenadas de `bodyRegions.ts` foram calibradas para `body-front.png` e `body-back-clinical.png`; ao trocar uma ilustracao, revisar ambas as vistas em desktop e mobile.

Os IDs das regioes identificam registros existentes e devem permanecer estaveis. Na vista frontal, o lado direito anatomico aparece a esquerda da imagem; na posterior, aparece a direita. A ilustracao posterior usa contornos clinicos sem vestuario para permitir a indicacao de desconforto nas nadegas.

## Execução guiada de etapas cíclicas (#489)

`GuidedCyclicCard` usa o mesmo Treino de hoje para exibir uma etapa por vez (aquecimento, trabalho, recuperação, desaquecimento), incluindo posição, rodada, duração/distância, alvo e próximo passo. O aluno inicia e confirma etapas por comandos `start | complete`; cada resposta vem da API com versão, estágio e relógio canônicos. A duração é projetada apenas por `performance.now()` a partir do tempo restante fornecido pelo servidor; após refresh/foco/retomada ocorre nova leitura. Pausa congela o relógio e bloqueia mutações; sessão terminal mantém histórico.

Para etapas por distância, o formulário pede o realizado em metros; metas de FC/velocidade/ritmo/zona/PSE têm campos opcionais. Desvios ou substituições não alteram o prescrito. Em timeout, a mesma chave de operação é mantida para retry do mesmo payload; após HTTP 409 ou leitura inconsistente, o guia exige recarga canônica antes de novo comando. Plano legado sem estrutura e progresso inconsistente exibem estados distintos, sem criar etapas. A conclusão total na UI confere `completed === total` na API quando existe estrutura; oferece continuar ou conclusão parcial, preservando a regra #389.

## Execução guiada no Treino de hoje (#487)

`GuidedResistanceCard` exibe uma unidade resistida por vez, com prescrição histórica, repetições/carga realizadas separadas, bloco, série, agrupamento e rodada quando existirem. O backend entrega a ordem a partir do grafo persistido #399/#400 e do progresso #389; a UI não usa posição visual como identidade. A ficha completa permanece acessível, e ausência de granularidade libera apenas leitura sem séries fictícias.

Durante falha de rede após POST, valores e chave idempotente são preservados para retry. Após HTTP 409, o guia exige GET de reconciliação: se a leitura falhar, o botão de conclusão permanece bloqueado, sem alegar avanço; somente um GET bem-sucedido libera nova confirmação. O descanso controlado pela #488 é apresentado por `ResistanceRestPanel`: contagem visível baseada em timestamps do servidor, intervalo prescrito separado do realizado, `+15 s`, pular e conclusão canônica ao fim do prazo. Apenas o backend cria, estende ou encerra intervalos e autoriza o próximo registro de série; a UI bloqueia a confirmação seguinte enquanto `rest` estiver ativo. Para evitar erro em celulares com relógio civil desajustado, o guia registra `performance.now()` antes e depois de cada GET/POST de descanso e projeta o tempo restante com essa referência monotônica; `serverNow` é mantido no contrato, mas nunca é subtraído de `Date.now()`. O servidor envia `serverNow` também na projeção guiada sem descanso e `requestProcessingMs` até o snapshot do descanso. O guia conserva uma âncora de horário do servidor associada ao recebimento monotônico da resposta anterior; assim distingue duração antes do snapshot de atraso posterior, sem exigir que o relógio do celular coincida com o servidor. O round-trip menos processamento é apenas limite superior, jamais idade comprovada: sem âncora válida a UI começa pelo saldo canônico (sem antecipar expiração) e faz uma única reconciliação GET se houver incerteza maior que 2 segundos. A API continua sendo autoridade exclusiva para `finish`. Um 409 de prazo ainda não vencido aciona GET de revalidação e pode rearmar a tentativa automática após backoff; timeout usa a mesma chave idempotente. Erros HTTP 4xx permanentes (exceto 429 e os conflitos 409 já tratados) bloqueiam novas tentativas automáticas até uma consulta canônica válida, para não repetir chamadas com acesso revogado. Nunca há duas requisições de conclusão automática simultâneas nem avanço durante pausa, terminal ou bloqueio de reconciliação. Um intervalo intermediário de grupo existe somente quando explicitamente prescrito em #400. A última série não cria descanso fictício. Operação em pausa é bloqueada pela máquina de estados da #389.

O cartão mantém o rascunho de repetições/carga, a operação idempotente pendente e o bloqueio de 409 em uma referência de `TodaySession`, que sobrevive ao comando **Ver ficha completa → Continuar execução guiada**. A chave pendente só é reutilizada para a mesma sessão, série e versão, e é invalidada quando o backend informa uma nova versão. O rascunho é descartado quando a unidade muda e não é persistido em `localStorage`/`sessionStorage`, evitando misturar dados entre sessões/usuários. O descanso entre rodadas nunca aparece depois da rodada final; após a última série confirmada, o cartão não anuncia novo descanso. O teste de navegador da #487 cobre timeout + retorno + retry com a mesma chave, além do término sem descanso fictício.

**Encerramento antecipado (#487/R-001):** ao selecionar **Concluir treino** numa sessão resistida, o painel consulta `GET /execution/guided` e confere o `sessionId`, o status e a versão canônicos antes de enviar a transição `completed` da #389. Com séries estruturadas ainda pendentes, não envia a conclusão: mostra a quantidade faltante e oferece **Voltar às séries** ou a ação já existente **Encerrar como parcial**, que exige motivo. Leitura indisponível, progresso inconsistente ou versão divergente não são tratados como sucesso; a versão divergente pede revalidação. Em treinos legados sem série estruturada, não são inventadas pendências: permanece o fluxo de encerramento anterior. O backend mantém a autoridade de transições/idempotência #389, e o guard é somente UX; não cria status ou armazenamento paralelo.

A conciliacao apos POST tambem aplica o limite monotônico da maior versão já observada no componente ou informada pelo painel pai. Um POST antigo que retorna após a prop de versão avançar não pode substituir a posição atual nem confirmar uma nova série na UI. O guia invalida GETs antigos, bloqueia o botão, inicia nova consulta canônica e somente libera a confirmação ao receber uma projeção atualizada. Falha nessa consulta preserva o rascunho e mantém o bloqueio. Há testes React com GET/POST fora de ordem e jornada Chrome da #487 com atualização concorrente do painel.

### Evidência visual do executor cíclico (#489)

`apps/web/src/pages/issue-489-browser-evidence.test.js` testa a **tela real do aluno** em Chrome autenticado, desktop 1440×900 e mobile 390×844, com HTTP de teste isolado: foco/Enter, botões tocáveis, status/timer acessíveis, ausência de overflow, pausa/retomada, rodadas, metas de velocidade e alternância visual entre trabalho/recuperação. A CI exige que `scripts/verify-issue-489-browser-evidence.mjs` valide SHA exact-head, controles e hashes de todas as capturas PNG antes de liberar o job CRITICAL. Essa simulação UI não substitui os testes com API real/PostgreSQL, executados separadamente.
