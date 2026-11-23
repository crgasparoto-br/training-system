# Homologação operacional — decisão profissional pós-treino (Issue #406 / PR #548)

## Natureza e estado

Este roteiro prepara o aceite operacional de **decisões pós-treino** em dispositivos físicos reais. Não é um registro de testes já executados, nem uma certificação de auditoria independente. **Estado da homologação física: PENDENTE**. Nenhum resultado pode ser convertido em aprovado usando apenas CI, Vitest, simulação, captura sintética ou checklist preenchido pelo implementador.

As superfícies auditadas são a Montagem Consolidada (`/central-do-aluno/:alunoId/montagem-consolidada`, acordeão **4. Alertas e conflitos**, painel **Decisões pós-treino**) e a visão do aluno (`/student/training`, **Orientações do professor**). A aplicação persiste orientação futura versionada, **não** altera treino já liberado nem substitui nova edição/liberação operacional de prescrição.

## Preparação segura de infraestrutura (issue #549)

O Blueprint versionado [`infra/issue-406/render.yaml`](../../infra/issue-406/render.yaml)
**prepara** API e PostgreSQL exclusivos para a #406, sem provisionar recursos por
si só: branch da PR, `autoDeployTrigger: off`, `previews.generation: off`, duas
URLs de banco vinculadas a um PostgreSQL exclusivo e segredo JWT gerado pelo
Render. `FRONTEND_URL` e `CORS_ORIGINS` ficam deliberadamente sem valor até a
URL do preview isolado ser verificada. O plano `free` deve ser conferido quanto à
elegibilidade/expiração antes de selecionar o Blueprint.

Sequência obrigatória, sem atingir produção:

1. Confirmar o workspace Render com seu responsável. Escolher **explicitamente**
   `infra/issue-406/render.yaml` ao criar um novo Blueprint, com Auto Sync
   desabilitado. Conferir previamente recursos, plano e ausência de vínculos
   com `sistema-acesso-api`, `controle-calorias-api` ou banco compartilhado.
2. Validar a configuração Render e provisionar API/banco não produtivos; manter
   deploy automático desligado. Configurar `FRONTEND_URL` e `CORS_ORIGINS` apenas
   após identificar a URL do preview Web isolado. Executar migrations somente
   com o banco da #406 e verificar logs sem segredos.
3. Antes de criar o preview Web, conferir o root efetivo do projeto Vercel e
   os rewrites. O `vercel.json` da raiz atualmente possui rewrite de `/api/*`
   destinado a **outro sistema** e bloqueio de deploy das branches diferentes
   de `main`. Não habilitar a branch no projeto produtivo sem prova do
   roteamento e da separação de ambientes. Preferir projeto exclusivo de
   homologação, sem domínio, credenciais ou variáveis produtivas.
4. Configurar `VITE_API_URL` da branch da PR **somente** para
   `https://training-system-issue406-homolog-api.onrender.com`, validar a
   origem real no Render e publicar preview do **SHA material exato**.
   O build executa `scripts/verify-preview-api-target.cjs` e recusa API de
   produção, URL ausente e, nesta branch, API de outra homologação.
5. Confirmar por evidência independente: origem HTTPS da Web, saída do build,
   deploy da API no mesmo SHA, banco e `CORS_ORIGINS` isolados, teste negativo
   de chamadas para API/credenciais reais e somente dados fictícios. Um nome
   de host com `homolog` **não prova** isolamento por si só.
6. Somente então habilitar as observações manuais H406-01..14 em desktop e
   telefone físicos, com 28 `PASS` reais e aprovação responsável. Nunca
   transformar validações estruturais em homologação clínica ou de dispositivos.

**Situação:** Blueprint e testes de preflight são preparação técnica; enquanto
não houver deploys e observações autenticadas, A-005 e #549 continuam abertas.

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

## Verificação estrutural do pacote privado de homologação

A validação automatizada do **formato dos registros** está em
[`scripts/verify-issue-406-homologation.mjs`](../../scripts/verify-issue-406-homologation.mjs),
com controles positivos e negativos em
[`scripts/verify-issue-406-homologation.test.mjs`](../../scripts/verify-issue-406-homologation.test.mjs).
Ela não cria observações de dispositivos, não faz login no ambiente, não autentica
links/assinaturas e **não pode transformar testes sintéticos em homologação**.

Para preparar os 28 campos sem inserir resultados presumidos, o operador pode
criar **um modelo vazio** (nunca versionar ou anexar este arquivo ao Git):

```bash
node scripts/create-issue-406-homologation-template.mjs --head "$(git rev-parse HEAD)" > /caminho/privado/issue-406-evidence.json
```

O gerador em
[`scripts/create-issue-406-homologation-template.mjs`](../../scripts/create-issue-406-homologation-template.mjs)
cria somente os 14 cenários para cada dispositivo, todos com `result=NOT_RUN`,
`physical_device_confirmed=false`, evidências vazias e aprovação ausente.
Ele **deve falhar** no verificador até que o responsável execute cada cenário,
preencha dados verdadeiros e valide as referências externas. Editar um campo
para `PASS` sem observação real não representa homologação. O arquivo deve
permanecer em local privado, fora do repositório, contendo apenas dados de
homologação fictícios e evidências desidentificadas.

Após executar os 28 cenários reais em dispositivos físicos, o responsável deverá
produzir um JSON privado (fora do Git), com `schema_version=1`, `repository`,
`issue=406`, `pr=548`, `head_sha`, `environment` (identificando homologação),
`environment_isolated=true`, `fictitious_data_only=true`,
`frontend_deployment_evidence_url`, `api_deployment_evidence_url` (HTTPS)
e `approval={responsible_person,approved_at_utc,approval_evidence_ref}`.
O campo `records` contém **exatamente 28 registros**; cada registro usa os
campos definidos em **Modelo de registro e critérios de saída**, acrescentando
`physical_device_confirmed=true` e `observed_behavior` (relato separado da
expectativa). `device_kind` aceita `desktop` e `phone`; `scenario_id` aceita
`H406-01` a `H406-14`. `result` deve ser `PASS` em todos os registros. Os campos
`frontend_sha` e `api_sha` de **cada** registro devem coincidir com o HEAD.

O responsável, com acesso a evidências privadas verificáveis, poderá executar:

```bash
node scripts/verify-issue-406-homologation.mjs /caminho/privado/issue-406-evidence.json --head "$(git rev-parse HEAD)"
```

Um resultado válido comprova **apenas a consistência estrutural** do pacote;
antes do aceite é obrigatório confrontar os links com os deploys verdadeiros,
inspecionar as capturas/logs sanitizados, confirmar fisicamente os dois
aparelhos, validar a aprovação profissional e conferir CI exact-SHA.
Não versionar o pacote, dados de identificação, tokens ou capturas clínicas.
O pacote de teste gerado *em memória* pela suíte Node é fictício e nunca
constitui um dos 28 PASS de homologação.

## Cobertura automática disponível e limites

- `apps/api/tests/post-workout-decision.integration.test.ts` (PostgreSQL real via `RUN_DATABASE_INTEGRATION_TESTS=true`) exercita máquina de estados, 409, replay, autorização, escopo, revogação concorrente, histórico, vigência, rollback e guardas SQL.
- `apps/web/src/pages/PostWorkoutDecisionPanel.test.tsx` (Vitest/jsdom) cobre formulário isolado por decisão, paginação, troca de contexto com resposta atrasada, revogação durante carregamento, falha de refresh e repetição da mesma chave de aprovação.
- `apps/web/src/components/training/PostWorkoutDecisionNotice.test.tsx` testa apresentação restrita, troca de contrato e indisponibilidade do endpoint do aluno.

Esses testes são **controles preventivos**, não substituem as observações reais H406-01 a H406-14, teste HTTP público por credenciais reais de homologação nem o parecer independente.

## Gate de auditoria formal da PR

A auditoria de implementação não pode assinar a própria aprovação no mesmo contexto. O revisor deve abrir **contexto realmente separado**, congelar PR #548, issue #406, base `develop`, HEAD e merge preview, observar o run `Validate repository` desse HEAD, confrontar diff, fonte, testes, contrato GitHub-native confiável e ledger de findings A-001/A-002/A-003. Deve comprovar controles negativos e regressões do código atual; uma mensagem de PR ou este documento não são prova suficiente. Seguir o procedimento de `crgasparoto-br/skill` na branch `develop` ([auditar-issue/SKILL.md](https://github.com/crgasparoto-br/skill/blob/develop/auditar-issue/SKILL.md) e [WEB_INDEPENDENT_AUDIT.md](https://github.com/crgasparoto-br/skill/blob/develop/docs/WEB_INDEPENDENT_AUDIT.md)) e publicar recibo/parecer auditável com identidade exata, sem inventar sessões, assinaturas ou dispositivos.

**Estado:** roteiro e controles automatizados preparados. Homologação em dispositivos físicos **não executada**; auditoria independente do **próximo SHA material** **não executada**. A PR deve continuar Draft, sem merge nem fechamento da issue até estes gates serem satisfeitos.

## Rastreamento da remediação — 17/11/2026

A-004 reforça as invariantes de persistência e inclui regressões SQL de operações e eventos ausentes. R-001 inclui regressões de rascunhos por aluno/contrato e requisições POST pendentes após mudança de contexto. Essas correções demandam CI no novo HEAD e auditoria independente posterior.

**A-005 continua PENDENTE:** nenhum cenário físico foi realizado por esta remediação. O aceite exige 28 PASS comprovados nos dois dispositivos com deploys correspondentes ao SHA, credenciais e dados de teste isolados e aprovação do responsável. CI, testes unitários e capturas sintéticas não são substitutos.
