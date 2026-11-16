# Homologação operacional — decisão profissional pós-treino (Issue #406 / PR #548)

## Natureza e estado

Este roteiro prepara o aceite operacional de **decisões pós-treino** em dispositivos físicos reais. Não é um registro de testes já executados, nem uma certificação de auditoria independente. **Estado da homologação física: PENDENTE**. Nenhum resultado pode ser convertido em aprovado usando apenas CI, Vitest, simulação, captura sintética ou checklist preenchido pelo implementador.

As superfícies auditadas são a Montagem Consolidada (`/central-do-aluno/:alunoId/montagem-consolidada`, acordeão **4. Alertas e conflitos**, painel **Decisões pós-treino**) e a visão do aluno (`/student/training`, **Orientações do professor**). A aplicação persiste orientação futura versionada, **não** altera treino já liberado nem substitui nova edição/liberação operacional de prescrição.

## Precondições de execução

1. Usar exclusivamente homologação isolada: frontend, API, banco PostgreSQL e login não produtivos. Conferir na plataforma de deploy o mesmo SHA material da PR #548 para frontend e API; registrar URL do deploy e identificador verificável. **Não utilizar produção, dados clínicos reais nem contas de clientes reais.**
2. Preparar dois contratos fictícios A/B, alunos fictícios A1/A2/B1, professor autorizado, professor sem `trainingDecisions.apply`, perfil de aluno e perfil sem `postWorkoutFeedback`. Prover ao menos duas decisões simultâneas, revisões de feedback da sessão, plano com vigência futura, um treino liberado e histórico com mais de 100 decisões/fontes.
3. Executar cada cenário em **desktop físico** (mouse e teclado; registrar SO, navegador e versão) e **telefone físico** (toque; registrar SO, navegador, modelo e versão). Viewports em emulação, Puppeteer e screenshots do CI são controles auxiliares, não substituem os dois dispositivos.
4. Executar com consentimento e responsável designado em ambiente de teste. Registrar resultado por cenário e dispositivo: `PASS`, `FAIL` ou `BLOCKED`; `BLOCKED` exige motivo e não aprova o gate. Capturas, logs e IDs devem ser desidentificados; nunca guardar cookies, tokens, cabeçalhos de autenticação ou respostas clínicas completas.
5. Executar primeiro os controles automáticos do SHA exato. A conferência final requer `Validate repository=success` e `CRITICAL validation=success` para o **HEAD atual**, sem reutilizar run de commit anterior.

## Matriz de cenários manuais obrigatórios

| ID | Ação (desktop e telefone físico) | Aceite e controle negativo |
| --- | --- | --- |
| H406-01 | Entrar como professor autorizado e abrir a Montagem Consolidada de A1, acordeão 4 | Painel aparece com fonte e histórico corretos, campos acessíveis por teclado/toque, sem erros de console |
| H406-02 | Criar sugestão com fonte canônica, justificativa e mensagem opcional; recarregar | Sugestão `suggested` v1 rastreável; nenhum efeito no planejamento ou treino liberado; aluno não vê orientação pendente |
| H406-03 | Aprovar uma sugestão e rejeitar outra com motivo distinto | Uma decisão `approved` v2 e outra `rejected` v2; rejeição sem motivo é negada; nenhuma justificativa de outra decisão é enviada |
| H406-04 | Aplicar uma aprovada com data futura dentro da vigência e instrução; reabrir a página | Decisão `applied` v3, exatamente uma versão de orientação futura e evento; treino liberado original preservado |
| H406-05 | Tentar aplicar decisão sugerida/rejeitada ou início fora da vigência | Operação negada, sem efeito parcial, versão ou timeline duplicada |
| H406-06 | Em duas abas, aprovar/aplicar simultaneamente a mesma decisão/mesmo plano; repetir mesma chave após perda de resposta simulada | Somente um efeito lógico; operação concorrente obsoleta retorna conflito 409 ou replay idempotente; refresh exibe estado persistido |
| H406-07 | Preencher motivos, datas e instruções de duas decisões; submeter apenas uma | Rascunho da outra permanece íntegro, sem troca de ID, justificativa, data ou instrução |
| H406-08 | Trocar rapidamente entre A1, A2 e B1 durante carregamento lento, inclusive com requisição anterior pendente | Não reaparece histórico da pessoa/contrato anterior; chamada direta à API de outro contrato retorna negação sem detalhes clínicos |
| H406-09 | Revogar `.view`, `.approve`, `.apply` e grant `postWorkoutFeedback` com tela aberta e com requisição pendente | Dados locais são ocultados após atualização da autorização; backend impede novas leituras/mutações não autorizadas; revogação concorrente respeita a ordem transacional |
| H406-10 | Cortar rede durante GET, durante POST e imediatamente após envio; restaurar e repetir ação | Mensagem segura, nenhuma informação de outro contexto, retry com chave idempotente, ausência de duplicidade e recuperação por Atualizar |
| H406-11 | Entrar como aluno A1; comparar antes/depois da aplicação com `exposeToStudent=true` e com `false` | Só mensagem prática aplicada e explicitamente exposta; nunca enviar snapshot, motivo, sugestão pendente ou rejeitada |
| H406-12 | Carregar mais de 100 decisões e fontes históricas em múltiplas páginas | Sem perda, duplicação nem misturar contratos; cursores inválidos retornam erro seguro |
| H406-13 | Testar zoom 200%, leitura, teclado, foco, orientação/reflow e alvos de toque | Sem conteúdo cortado ou rolagem horizontal involuntária; controles operáveis em desktop e telefone físico |
| H406-14 | Reabrir timeline clínica após cada transição; inspecionar origem do evento | Estados e versões corretos, evento único por transição; detalhes sensíveis não estão no resumo da timeline |

## Modelo de registro e critérios de saída

Para **cada** linha H406-01 a H406-14 e **cada** dispositivo, registrar em artefato de homologação: `scenario_id`, `device_kind`, `model`, `os_version`, `browser_version`, `tested_at_utc`, `operator`, `environment`, `frontend_sha`, `api_sha`, `deployment_evidence_url`, `result`, `evidence_ref` e `notes`. O registro deve distinguir comportamento observado de expectativa. Não gravar evidências reais neste arquivo normativo ou no Git.

O aceite operacional exige **28 resultados PASS**, zero `FAIL`/`BLOCKED`, correspondência autenticada dos dois deploys com o SHA final, evidências verificáveis e sanitizadas, aprovação do responsável designado, CI verde no mesmo SHA e reexecução após quaisquer correções. Qualquer alteração de código invalida o aceite do SHA anterior. Os artefatos privados podem ficar em repositório de evidências apropriado, referenciados no comentário da PR com hashes, sem divulgação de dados pessoais.

## Cobertura automática disponível e limites

- `apps/api/tests/post-workout-decision.integration.test.ts` (PostgreSQL real via `RUN_DATABASE_INTEGRATION_TESTS=true`) exercita máquina de estados, 409, replay, autorização, escopo, revogação concorrente, histórico, vigência, rollback e guardas SQL.
- `apps/web/src/pages/PostWorkoutDecisionPanel.test.tsx` (Vitest/jsdom) cobre formulário isolado por decisão, paginação, troca de contexto com resposta atrasada, revogação durante carregamento, falha de refresh e repetição da mesma chave de aprovação.
- `apps/web/src/components/training/PostWorkoutDecisionNotice.test.tsx` testa apresentação restrita, troca de contrato e indisponibilidade do endpoint do aluno.

Esses testes são **controles preventivos**, não substituem as observações reais H406-01 a H406-14, teste HTTP público por credenciais reais de homologação nem o parecer independente.

## Gate de auditoria formal da PR

A auditoria de implementação não pode assinar a própria aprovação no mesmo contexto. O revisor deve abrir **contexto realmente separado**, congelar PR #548, issue #406, base `develop`, HEAD e merge preview, observar o run `Validate repository` desse HEAD, confrontar diff, fonte, testes, contrato GitHub-native confiável e ledger de findings A-001/A-002/A-003. Deve comprovar controles negativos e regressões do código atual; uma mensagem de PR ou este documento não são prova suficiente. Seguir o procedimento de `crgasparoto-br/skill` na branch `develop` ([auditar-issue/SKILL.md](https://github.com/crgasparoto-br/skill/blob/develop/auditar-issue/SKILL.md) e [WEB_INDEPENDENT_AUDIT.md](https://github.com/crgasparoto-br/skill/blob/develop/docs/WEB_INDEPENDENT_AUDIT.md)) e publicar recibo/parecer auditável com identidade exata, sem inventar sessões, assinaturas ou dispositivos.

**Estado:** roteiro e controles automatizados preparados. Homologação em dispositivos físicos **não executada**; auditoria independente do **próximo SHA material** **não executada**. A PR deve continuar Draft, sem merge nem fechamento da issue até estes gates serem satisfeitos.
