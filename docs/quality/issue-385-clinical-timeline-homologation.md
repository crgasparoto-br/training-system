# Homologação da timeline clínica — Issue #385

## Objetivo e fronteira

Verificar PRNT, Anamnese Inicial, PAR-Q, Antropometria e Adipometria na Central do Aluno sem criar uma segunda fonte de verdade e sem revelar informações clínicas a perfis não autorizados.

Esta especificação distingue **validação automatizada** (CI com PostgreSQL descartável) de **homologação visual/operacional** (navegador real com perfis e dados de teste). Nenhuma etapa manual pode ser assinalada como concluída por inferência da CI.

## Gate automatizado

- No `Validate PR` classificado como CRITICAL, PostgreSQL 16 é iniciado e `prisma migrate deploy` é executado.
- `RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @corrida/api test` inclui `student-clinical-timeline-postgres.integration.test.ts`; o runner principal `pnpm test` executa o mesmo gate na CI.
- A suíte isola contratos, usuários e alunos, verifica versões PRNT/Anamnese/PAR-Q, conclusão e correção da ADPT, autoria finalizadora, duplicação antropométrica, cursores e ausência de snapshots sensíveis.
- `student-clinical-timeline.service.test.ts` verifica paginação em lotes de até 200 registros, sem `skip`, em históricos repetidos e com timestamps iguais.
- `student-timeline-pagination.test.ts` e `AlunoHistoricoTab.test.ts` verificam deduplicação da interface e URLs de origem.
- `pnpm validate`, `pnpm access:check` e `pnpm docs:check` permanecem obrigatórios. Registrar **SHA exato** e link do workflow em cada execução.

**Segurança:** usar apenas banco descartável e usuários fictícios na CI. Não utilizar credenciais de produção nem executar migrations de teste sobre bases compartilhadas.

## Checklist manual em homologação (ainda requer execução)

| Cenário | Ação em navegador autenticado | Aceite |
| --- | --- | --- |
| PRNT versionado | Abrir Histórico → evento de objetivo atualizado → Abrir registro original | Abre registro, entidade e versão correspondentes, sem exibir outra revisão |
| Anamnese Inicial | Abrir evento de revisão da Anamnese | Painel original abre a revisão indicada |
| PAR-Q | Abrir evento de submissão PAR-Q | Abre exatamente a submissão selecionada |
| Antropometria | Abrir eventos concluído e corrigido | Mostra avaliação e correção correspondentes; não duplica conclusão anterior |
| Adipometria | Concluir R1, realizar correção R2 com outro finalizador e voltar à timeline | R1 e R2 permanecem presentes, com datas e autores corretos |
| Perfil com somente Audit | Negar blocos clínicos e financeiro; abrir Histórico | Não recebe dados ou links clínicos/financeiros, inclusive pela API |
| Permissão parcial | Conceder apenas um bloco PRNT, negar os demais | Só eventos da categoria permitida são carregados |
| Anamnese permitida, PAR-Q negado | Permitir somente Anamnese e negar PAR-Q, abrir Histórico e conferir requisições da API | O snapshot normal e a recuperação degradada não consultam `parqSubmissions`, não retornam respostas PAR-Q e preservam os demais eventos permitidos |
| Cross-tenant | Autenticar em contrato B e tentar acessar histórico do aluno A | API não retorna eventos do outro contrato |
| Histórico extenso | Gerar mais de 200 eventos, navegar repetidamente em Carregar eventos anteriores | Sem lacunas nem duplicatas; tempo de resposta observado e registrado |
| Falha localizada | Em homologação, indisponibilizar uma fonte controladamente | Demais domínios continuam carregando; aviso parcial e Tentar novamente funcionam |
| Navegação acessível | Testar teclado, zoom 200% e viewport estreita | Histórico e links navegáveis e legíveis |

**Preview da Issue #385:** o alias Vercel de branch pode ser truncado como
`training-system-web-git-feat-38-...-crgasparoto-brs-projects.vercel.app`, sem
as palavras `staging` ou `preview` no host. O coletor reconhece somente esse
padrão de projeto/equipe/branch quando `deploymentEvidenceUrl` é a página do
deployment no projeto Vercel correto. O operador ainda deve **confirmar no
provedor** que o SHA de frontend e API coincide com o HEAD da PR; o alias
sozinho não comprova SHA. Domínios de produção seguem bloqueados. Se o login
redirecionar ao SSO produtivo da Vercel, interromper a execução e prover um
mecanismo de autenticação isolado, sem ampliar a allowlist para produção.

## Evidência obrigatória para fechamento da homologação

1. URL da execução de CI no último HEAD, com todos os checks obrigatórios verdes.
2. Relatório de execução real do checklist: ambiente, data, identificadores **fictícios**, perfil/permissões, resultado de cada cenário e capturas sem dados sensíveis.
3. Medição do tempo de resposta das páginas 1, intermediária e profunda em um conjunto de histórico volumoso, sem confundir tempo de UI com tempo de banco.
4. Lista de falhas, correções e repetição de testes afetados, caso qualquer cenário reprove.

**Estado:** roteiro e regressões automatizadas implementados. Homologação manual/visual não executada por este documento; a aprovação operacional depende das evidências acima.

## Situação da remediação TL-385-019 / TL-385-020 (14/10/2026)

- **TL-385-019 — correção de código:** na projeção legada, `parqSubmissions` exige o grant conjunto de Anamnese e PAR-Q, sem herdar a autorização de Anamnese. A recuperação degradada usa uma leitura PAR-Q separada com os mesmos gates; sem o grant, não consulta nem reutiliza o relacionamento. Três cenários de regressão no serviço cobrem leitura negada, permitida e falha do snapshot agregado.
- **TL-385-020 — gate operacional:** o checklist acima continua **não executado em navegador autenticado de homologação**. A CI ou testes com mocks não comprovam capturas de interface, perfil real, carga de mais de 200 eventos, acessibilidade ou tempos reais de resposta. Registrar ambiente, perfis fictícios, horários, requisições, capturas e medições antes de declarar o gate concluído.
- **Critério de fechamento:** revalidar o commit mais recente da PR #510 com `CRITICAL validation` e `Validate repository`, executar todos os cenários manuais (incluindo o novo controle negativo PAR-Q), registrar evidências sanitizadas e solicitar auditoria independente do mesmo HEAD. **Não declarar homologação concluída apenas por esta atualização.**

## Coletor operacional da TL-385-020 (14/10/2026)

O repositorio inclui `scripts/verify-issue-385-operational.cjs`. Ele **nao simula** backend,
nao instala identidade de professor e nao substitui a observacao humana: abre Chromium
real e guia os 12 cenarios deste checklist, com captura por cenario, resultado informado
pelo operador e telemetria resumida de requisicoes reais da timeline (status, tempo de
resposta, quantidade de eventos, estado parcial e duplicatas de origem). Capturas,
relatorio e medidas ficam apenas em `reports/issue-385-operational/`, ignorado pelo Git.
Nao armazena corpos de eventos clinicos, tokens, cabecalhos de autenticacao ou cookies.

### Pre-condicoes obrigatorias

1. Provisionar **ambiente de homologacao isolado** com frontend e API da mesma PR no
   **SHA exato**, banco de testes e alunos/professores ficticios. Nunca apontar
   esse coletor para `sistema-acesso.solveritconsultoria.com.br`, para a Vercel
   de `main` ou para APIs/bancos de producao.
2. Disponibilizar os perfis ficticios e permissões de cada cenario, duas empresas,
   historicos de mais de 200 eventos e mecanismo controlado para falha localizada.
   Somente completar avaliacao/adipometria de teste, nunca dados clinicos reais.
3. Confirmar na plataforma a identidade do deployment e guardar a URL de evidencia.
   A digitacao do SHA pelo operador e pre-condicao defensiva, **nao** prova automatica
   de origem do deployment.
4. Executar em maquina com Chrome/Chromium, ambiente grafico, Node e dependencias
   do repositório instaladas. O coletor usa Puppeteer da `apps/api`.
5. Manter o arquivo de configuracao fora do Git (por exemplo, `/tmp/issue-385-homolog.json`):

```json
{
  "baseUrl": "https://homolog.example.test",
  "apiOrigin": "https://api-homolog.example.test",
  "authOrigin": "https://auth-homolog.example.test",
  "entryPath": "/alunos/ALUNO_FICTICIO",
  "expectedHeadSha": "SUBSTITUIR_PELO_SHA_COMPLETO_DA_PR",
  "deploymentEvidenceUrl": "https://URL_DO_DEPLOYMENT_NAO_PRODUTIVO",
  "syntheticData": true,
  "fixtureDescription": "alunos ficticios em banco isolado"
}
```

O campo `apiOrigin` é obrigatório e deve apontar exclusivamente para API isolada de homologação. `authOrigin` é opcional e só deve ser informado quando o login usar um provedor **também isolado em homologação**. Todas as requisições do navegador (documentos, navegação, iframes, scripts, imagens e fetch/XHR) são limitadas às origens explicitamente aprovadas; um redirect para login de produção ou CDN não permitido bloqueia a execução. Nunca autorizar um IdP real apenas para contornar o bloqueio. O navegador **bloqueia solicitações fetch/XHR fora das origens web/API configuradas**, inclusive caso um frontend de staging esteja compilado contra backend produtivo. O valor de `expectedHeadSha` deve ser um hexadecimal real de 40 caracteres
na execucao, e o hostname externo deve identificar claramente homologacao, staging
ou preview.

### Executar e verificar evidencias

```bash
node --test scripts/verify-issue-385-operational.test.cjs
node scripts/verify-issue-385-operational.cjs /tmp/issue-385-homolog.json --preflight
ISSUE385_FICTITIOUS_ONLY=YES node scripts/verify-issue-385-operational.cjs /tmp/issue-385-homolog.json
```

O navegador pede autenticação interativa com contas ficticias. Antes de cada cenario,
o operador ajusta o perfil/fixture correspondente, realiza a navegacao e informa
`pass`, `fail` ou `blocked` com justificativa sanitizada. O coletor recusa
aprovar se nao observar requisicao de timeline; verifica algumas condicoes negativas
automaticamente (evento clinico para Audit-only, PAR-Q negado, cross-tenant e repeticao
em historico extenso). Isso e auxiliar, **nao** prova completa de autorizacao:
revisar o comportamento e as requisicoes da API no ambiente homologado.

Para fechar o gate, anexar o `report.json`, a proveniencia do deployment,
as capturas de dados **apenas ficticios** e as medições das paginas inicial,
intermediaria e profunda, identificando o operador e data. Revalidar em separado
os testes de API/CI no mesmo SHA e solicitar reauditoria independente.

### Estado na data do registro

**Coletor implementado; homologacao nao executada.** Na verificacao de 14/10/2026,
nao havia deployment de preview para `feat/385-canonical-clinical-timeline`
no projeto Vercel `training-system-web`; os deployments consultados eram de
`main`. A verificacao automatizada anterior da PR foi verde no SHA
`768f2debbd6cd5d04e503a49557c7bf5a1d9d665`, mas qualquer commit novo
requer consulta de checks no novo HEAD. Enquanto o ambiente isolado, os perfis,
a execucao em browser e as evidencias nao existirem, **TL-385-020 continua aberta**.


## Revisão do coletor e condições externas — 14/10/2026

- A coleta agora bloqueia **todas** as solicitações para origens não configuradas, inclusive redirecionamentos e navegações; o bloqueio anterior restrito a fetch/XHR permitia sair do staging por um link ou documento.
- O controle Audit-only identifica dados clínicos também pelos tipos legados `intake_*` e `assessment_*` e reprova exposição de eventos financeiros `financial_*`, mesmo quando `sourceType` é genérico. O controle cross-tenant reprova HTTP 2xx mesmo com lista vazia e só aceita a fronteira pública 403/404.
- Os testes automáticos desses guardrails verificam **o coletor**, não os 12 cenários da aplicação. Capturas e métricas continuam não produzidas; não declarar TL-385-020 concluída.
- Consulta ao projeto Vercel `training-system-web`: não há deployment da branch `feat/385-canonical-clinical-timeline`; `VITE_API_URL` aparece configurada apenas para produção. Não habilitar preview usando fallback para API de produção. Primeiro provisionar API e banco de homologação isolados, perfis e dados fictícios; então configurar a URL da API **somente na preview**, implantar frontend no SHA da PR, registrar proveniência do deploy e executar o roteiro completo.
- Não executar `verify-issue-385-operational.cjs` em produção ou contra um backend compartilhado. A pendência é de ambiente/evidência operacional e requer execução real em sessão autenticada de teste.


## Preparacao de staging iniciada — 14/10/2026 (TL-385-020)

O banco Render isolado `training-system-issue385-homolog-pg` (`dpg-db7vf64s728c73c53m50-a`) foi criado no plano **free**, PostgreSQL 16, regiao Oregon e workspace `tea-d65ov0vgi27c739uq1pg`. Situacao observada: **available**. Expiracao prevista no plano gratuito: **13/11/2026**. Nao ha dados clinicos reais neste banco e ele nao deve receber copia de producao.

O bloqueio permanece: nao foi provisionada API de homologacao com `DATABASE_URL` **interno** desse banco, segredos exclusivos e backend da branch `feat/385-canonical-clinical-timeline`; tampouco ha preview web autenticada da branch com `VITE_API_URL` apontando para essa API. O servico Render `sistema-acesso-api` na `main` permanece **exclusivamente producao** e nao pode ser reutilizado no staging.

### Guard de preview versionado

- `scripts/verify-preview-api-target.cjs` e executado antes do `vite build` do web somente quando `VERCEL_ENV=preview`.
- O build falha sem `VITE_API_URL` ou se a URL apontar para host produtivo, HTTP, destino nao identificado como homologacao, origem nao administrada, credenciais, path ou parametros. Nenhum fallback para URL de producao e permitido.
- `scripts/verify-preview-api-target.test.cjs` cobre casos positivos e negativos em `pnpm test`. Isso protege o deploy, mas nao substitui a homologacao manual.

### Ordem segura para concluir TL-385-020

1. Criar **novo** servico Render de API de staging a partir do SHA da PR (nao copiar variaveis de ambiente de producao); conectar exclusivamente ao PostgreSQL isolado pela URL **interna** do Dashboard, gerar um `JWT_SECRET` novo, definir URL publica e CORS de staging e manter mensageria/Stripe/integrações externas desabilitadas. Guardar segredos somente no provedor, nunca no repositorio ou nos relatorios.
2. Aplicar migrations e seeds **apenas** no banco novo; criar perfis/usuarios e alunos inteiramente ficticios, dois contratos, permissoes distintas, historico com mais de 200 eventos, R1/R2 e um mecanismo controlado de falha por dominio. Validar que API e banco nao apontam para recursos da `main`.
3. Configurar `VITE_API_URL` com **target preview e gitBranch da PR**, apontando exclusivamente para a API isolada; publicar o frontend com a identidade exata do HEAD material e registrar URLs/SHAs de API, frontend e banco.
4. Em um navegador autenticado usando somente as identidades ficticias, executar o coletor e os **12 cenarios**, com relatorio, capturas sanitizadas, tempos de paginas inicial/intermediaria/profunda, teste de navegacao por teclado e zoom. Falha, bloqueio ou cenario nao executado impede aprovacao.
5. Conferir CI e o gate `Validate repository` no **HEAD definitivo** (nao importar runs de SHAs anteriores). Solicitar nova auditoria independente e so entao avaliar merge.

**Estado do gate:** `TL-385-020 = BLOCKED`, por falta de API/frontend de staging e evidencias de navegador autenticado. Banco isolado e guard de preview nao significam homologacao executada.


## Execucao da preparacao de staging em 14/10/2026 (TL-385-020)

- API Render independente criada: `training-system-issue385-homolog-api` (`srv-db809e8n74is73d9l4ng`), na regiao Oregon, plano free, vinculada exclusivamente a `feat/385-canonical-clinical-timeline`, com `autoDeploy=no`. O build do commit `5ebd3346c99b857b624962850347179b5338951f` terminou com sucesso, mas o deploy falhou fechado com `[startup] DATABASE_URL nao configurada`. Essa falha confirma ausencia de conexao ao banco, **nao** homologacao funcional; nenhuma URL produtiva deve ser injetada para contornar o bloqueio.
- PostgreSQL de staging `training-system-issue385-homolog-pg` (`dpg-db7vf64s728c73c53m50-a`) permanece `available`; o conector nao fornece a string interna de conexao/credenciais. Vincular `DATABASE_URL` e, se aplicavel, `MIGRATION_DATABASE_URL` por integracao segura no Dashboard Render; nunca colocar segredos no GitHub ou na documentacao. Usar segredos novos para `JWT_SECRET` e origens CORS exclusivamente de staging.
- Na Vercel `training-system-web`, a variavel `VITE_API_URL` foi criada somente para o target `preview` e branch `feat/385-canonical-clinical-timeline`, apontando a `https://training-system-issue385-homolog-api.onrender.com`. Um deployment nao produtivo do SHA `5ebd3346c99b857b624962850347179b5338951f` foi solicitado: `dpl_AJAWUeGZffQhmAa5cwY9wQv8SDbB`. O estado final deve ser consultado na Vercel; existencia do deployment nao significa backend operacional.
- **Ainda obrigatorio:** conectar backend ao banco de teste sem compartilhamento de segredos, aplicar migrations, criar somente identidades/dados ficticios, verificar origem do deploy de ambos os lados, executar e registrar todos os 12 cenarios com navegador autenticado, capturas sanitizadas e medicoes de desempenho.
- **Gate:** TL-385-020 segue `BLOCKED`. Proibido marcar pass em qualquer cenario sem execucao real. Sem merge e sem deploy em producao.


## Blueprint de staging sem segredos — 17/10/2026 (TL-385-020)

Artefato: [`infra/issue-385/render.yaml`](../../infra/issue-385/render.yaml). Ele declara **somente** os recursos de homologacao ja identificados no workspace Render `tea-d65ov0vgi27c739uq1pg`:

- API `training-system-issue385-homolog-api` (`srv-db809e8n74is73d9l4ng`), plano free, regiao Oregon, branch `feat/385-canonical-clinical-timeline`, auto-deploy desativado;
- PostgreSQL `training-system-issue385-homolog-pg` (`dpg-db7vf64s728c73c53m50-a`), plano free, PostgreSQL 16, regiao Oregon, `ipAllowList: []` (sem conexoes publicas);
- `DATABASE_URL` referenciada **sem expor senha** por `fromDatabase: {name: training-system-issue385-homolog-pg, property: connectionString}`; `JWT_SECRET` gerada e guardada pelo Render se ainda ausente;
- frontend e CORS restritos ao alias Vercel da branch de homologacao; nenhum dominio ou banco produtivo esta declarado.

**Importante — aplicacao ainda nao realizada:** o YAML foi validado sintaticamente, mas nao submetido ao validador com credenciais Render nem sincronizado. Blueprint **nao configura automaticamente** a API apenas porque existe no Git. Para aplicar com seguranca:

1. No Dashboard do workspace correto, conferir se API e PostgreSQL acima nao estao associados a outro Blueprint (nunca gerenciar o mesmo recurso em dois Blueprints).
2. Criar um Blueprint **apenas no branch desta PR**, com **Custom Blueprint Path `infra/issue-385/render.yaml`**, **Auto Sync = No**. Antes da primeira sincronizacao, conferir no diff do provedor que os nomes correspondem **aos recursos existentes**, que nenhuma substituicao ou alteracao de plano/region/database/user/allowlist esta proposta e que nao surgem recursos extras.
3. Executar a validacao Blueprint pela plataforma/CLI e somente aplicar a sincronizacao sem divergencias. Nao sincronizar se houver erro de validacao, custo imprevisto, associacao indevida ou recurso diferente do esperado. O `fromDatabase` deve materializar a URL interna como segredo no proprio Render, sem copiá-la para GitHub ou para o chat.
4. Confirmar `DATABASE_URL`, `JWT_SECRET`, origins e `NODE_ENV` efetivos no servico sem imprimir valores sigilosos; executar deploy da API de **homologacao** no SHA exato e aguardar `live` mais health check. Se for necessario usar `MIGRATION_DATABASE_URL` distinto, configurar credencial isolada apenas neste ambiente.
5. Aplicar migrations e fixtures **somente** ao PostgreSQL de homologacao e, depois, os 12 casos autenticados usando o coletor existente. O deployment web precisa ser novamente publicado e verificado no mesmo SHA da API, inclusive apos commits apenas documentais.

Este Blueprint e um mecanismo de wiring seguro, nao uma evidencia de deploy funcional ou homologacao. Na ultima observacao remota, o deploy da API terminou `update_failed` por `DATABASE_URL nao configurada`. Manter `TL-385-020=blocked` ate obter os 12 cenarios com evidencias sanitizadas.
