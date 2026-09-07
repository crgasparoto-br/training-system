# Deploy e ambientes

Este documento registra as regras minimas para publicar o Sistema Acesso.

## Principios

- A branch de desenvolvimento deve validar build, testes e regras estruturais antes de chegar em producao.
- Segredos ficam no provedor de deploy ou no GitHub Secrets, nunca no repositorio.
- Variaveis novas devem ser documentadas em `.env.example` e neste arquivo.
- Deploy deve ser reprodutivel por workflow ou comando documentado.

## Variaveis esperadas da API

- `DATABASE_URL`: conexao usada pela API em execucao. Em producao, use uma credencial de aplicacao e, quando disponivel, o endpoint com pool do provedor.
- `MIGRATION_DATABASE_URL`: conexao direta/privilegiada usada somente pelo `prisma migrate deploy` durante o start. E opcional para compatibilidade, mas recomendada em producao.
- `PRISMA_CONNECTION_LIMIT`: limite por instancia de `PrismaClient`. Quando a URL nao possui `connection_limit`, o runtime produtivo usa `1` por padrao.
- `PRISMA_POOL_TIMEOUT_SECONDS`: tempo maximo de espera por uma conexao livre. Quando a URL nao possui `pool_timeout`, o runtime produtivo usa `15` segundos.
- `NODE_ENV`: use `production` no ambiente produtivo.
- `FRONTEND_URL`: origem publica do frontend usada em links seguros enviados ao aluno.
- `CORS_ORIGINS`: obrigatoria em producao e deve listar somente origins produtivas explicitamente permitidas. Origins locais nao sao incluidas por padrao em `NODE_ENV=production`.
- `JWT_SECRET`: obrigatoria em producao. Nao use placeholders como `dev-secret` ou `your-super-secret-jwt-key-change-in-production`.
- `SENDGRID_API_KEY`: credencial opcional para email transacional da revisao cadastral.
- `SENDGRID_FROM_EMAIL`: remetente verificado usado pelo SendGrid.
- `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`: chave publica usada para validar callbacks assinados de entrega do SendGrid. Sem confirmacao configurada, o canal fica `not_configured` e nao e marcado como entregue.
- `TWILIO_ACCOUNT_SID`: conta Twilio usada pelo canal WhatsApp opcional.
- `TWILIO_AUTH_TOKEN`: segredo Twilio usado no envio e na validacao do callback de status.
- `TWILIO_WHATSAPP_NUMBER`: numero remetente habilitado para WhatsApp no formato esperado pela Twilio.
- `TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID`: `ContentSid` de template Utility aprovado especificamente para revisao cadastral. Nao existe fallback para `Body` livre.
- `NOTIFICATION_CALLBACK_BASE_URL`: URL publica HTTPS da API usada para callbacks de status de SendGrid/Twilio. Nao pode conter credenciais embutidas, query ou fragmento.
- `PRE_REGISTRATION_ENABLED`: gate global das rotas publicas, autenticadas e administrativas de pre-matricula. Em producao, ausencia ou valor invalido significa desabilitado.
- `PRE_REGISTRATION_TELEMETRY_ENABLED`: habilita a metrica HTTP tecnica agregada da pre-matricula. Nao autoriza registrar path, token, payload, usuario, tenant ou dados pessoais.
- `PRE_REGISTRATION_INVITE_TTL_DAYS`: validade dos convites publicos de pre-cadastro em dias. Usa `30` quando ausente ou invalida; configure o mesmo valor em todas as replicas da API.
- `PRIVACY_NOTICE_URL`: URL publica do aviso de privacidade vigente apresentado na landing e no consentimento do pre-cadastro. Deve usar HTTPS em producao e permanecer acessivel sem autenticacao.
- `PRIVACY_NOTICE_VERSION`: identificador imutavel da versao vigente do aviso, persistido junto ao aceite. Atualize quando o conteudo juridicamente relevante mudar; nao reutilize uma versao antiga para um documento diferente.
- `UPLOAD_STORAGE_ROOT`: caminho absoluto no host da API para armazenamento persistente de uploads locais. Em Render, deve apontar para o mount path do Persistent Disk quando o provider de assets for `local`.
- `ASSET_BASE_URL`: URL publica preferencial para servir assets gravados no storage local/persistente.
- `API_PUBLIC_URL`: URL publica da API usada como fallback para montar URLs de uploads locais quando `ASSET_BASE_URL` nao estiver configurada.
- `ASSET_STORAGE_PROVIDER`: provider dos assets publicos de logo/avatar. Use `local` para filesystem persistente, `supabase` para Supabase Storage ou `r2` para Cloudflare R2.
- `SUPABASE_URL`: URL raiz do projeto Supabase, sem `/rest/v1/`. Obrigatoria quando `ASSET_STORAGE_PROVIDER=supabase`.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key usada somente pela API/backend. Nunca configure no frontend.
- `SUPABASE_STORAGE_BUCKET`: bucket usado para assets publicos de logo/avatar, por exemplo `sistema-acesso-assets`.
- `ASSET_PUBLIC_BASE_URL`: URL publica do bucket Supabase, por exemplo `https://<projeto>.supabase.co/storage/v1/object/public/sistema-acesso-assets`.
- `R2_ACCOUNT_ID`: account id da conta Cloudflare. Obrigatoria quando `ASSET_STORAGE_PROVIDER=r2`.
- `R2_BUCKET`: bucket R2 usado para assets publicos de logo/avatar, por exemplo `sistema-acesso-assets`.
- `R2_ACCESS_KEY_ID`: access key id do token R2 usada somente pela API/backend.
- `R2_SECRET_ACCESS_KEY`: secret access key do token R2 usada somente pela API/backend.
- `R2_PUBLIC_BASE_URL`: URL publica de leitura do bucket R2, preferencialmente um dominio customizado como `https://assets.seu-dominio.com`.

## Notificacoes de revisao cadastral

A revisao cadastral sempre persiste a pendencia e a notificacao in-app antes de depender de canal externo. Email e WhatsApp sao complementares e opcionais: ausencia de configuracao ou falha de provider nao invalida a solicitacao nem o fluxo do aluno.

Configuracao minima por canal:

- Email: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` e `NOTIFICATION_CALLBACK_BASE_URL`.
- WhatsApp: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID` e `NOTIFICATION_CALLBACK_BASE_URL`.
- Links ao aluno usam `FRONTEND_URL` e devem apontar para a experiencia autenticada, sem transportar dado sensivel no texto da notificacao.

O aceite sincrono de um provider nao equivale a entrega final. O backend so consolida `sent`/entregue quando o provider confirma um estado terminal positivo por resultado sincrono suportado ou callback validado. Falha, callback invalido ou confirmacao ausente permanecem observaveis e recuperaveis.

Em CI e testes deterministas, nao configure credenciais reais: os adapters exercitam SendGrid/Twilio com transporte HTTP simulado somente na fronteira externa. Para contratos de payload, idempotencia, callbacks, estados e troubleshooting, consulte [`../profile-review-notification-delivery.md`](../profile-review-notification-delivery.md). A matriz integrada da revisao esta em [`../profile-review-e2e-validation.md`](../profile-review-e2e-validation.md).

## Banco no Render

Configuracao recomendada para evitar que a API consuma o limite da conta de migration:

1. Em `DATABASE_URL`, configure a URL de runtime/pool e um usuario de aplicacao com apenas os privilegios necessarios para operar o sistema.
2. Em `MIGRATION_DATABASE_URL`, configure a URL direta e o usuario autorizado a aplicar migrations.
3. Configure `PRISMA_CONNECTION_LIMIT=1` inicialmente. Aumente somente com base no limite real do banco, numero de instancias da API e metricas de fila/latencia.
4. Configure `PRISMA_POOL_TIMEOUT_SECONDS=15`.
5. Reinicie ou redeploy a API para encerrar pools antigos e aplicar as novas variaveis.

O comando `pnpm start` executa as migrations com `MIGRATION_DATABASE_URL` e inicia a API novamente com a `DATABASE_URL` original. Quando `MIGRATION_DATABASE_URL` nao existe, o start usa `DATABASE_URL` para manter compatibilidade com ambientes antigos.

### Recuperacao da migration transacional de adipometria

O erro Prisma `P3009` para a migration
`20260730170000_remediate_issue_246_audit_round_2` significa que o banco possui
uma tentativa falha em `_prisma_migrations`. Novos deploys permanecem bloqueados
ate essa tentativa ser resolvida; reiniciar o Render nao corrige o historico.

Essa migration e integralmente transacional. Para recuperar somente essa falha,
execute no ambiente de migration (por exemplo, um Shell/Job do Render):

```bash
pnpm --filter @corrida/api db:recover:issue-246-migration
```

O recuperador usa `MIGRATION_DATABASE_URL` quando configurada e, por
compatibilidade, recorre a `DATABASE_URL`. Antes de executar `prisma migrate
resolve --rolled-back`, ele recusa a operacao se:

- nao existir uma tentativa falha ativa com esse nome;
- o checksum do banco divergir do arquivo versionado;
- o arquivo nao estiver protegido integralmente por `BEGIN`/`COMMIT`;
- alguma das funcoes novas da migration existir, indicando efeito parcial ou
  alteracao manual.

Depois das verificacoes, o comando marca apenas a tentativa falha como revertida
e executa `prisma migrate deploy` novamente. Nao use `prisma db push`, nao marque
a migration como aplicada e nao edite `_prisma_migrations` manualmente.

O workflow de producao executa primeiro o deploy normal das migrations. Somente
se ele falhar, chama esse recuperador restrito; qualquer outra migration falha ou
qualquer divergencia nas verificacoes continua bloqueando a publicacao.

Quando `_prisma_migrations.logs` estiver vazio e o Prisma mostrar somente o erro
secundario `current transaction is aborted`, execute manualmente o workflow
`Diagnose Production Adipometry Migration`. Ele exige a tentativa falha ativa e
o checksum conhecido, testa cada instrucao da migration separadamente e omite o
`COMMIT` externo. A transacao de diagnostico sempre e revertida, inclusive quando
todas as instrucoes passam, e o log do job identifica a primeira instrucao que o
banco recusou. O workflow nao resolve nem reaplica migrations.

### Recuperacao de conexoes esgotadas

Quando os logs mostrarem `too many connections`:

1. interrompa novos deploys concorrentes;
2. confirme se ha mais de uma instancia antiga da API ainda ativa;
3. reinicie a API para liberar pools pertencentes ao processo anterior;
4. confirme que `DATABASE_URL` nao usa a conta reservada para migrations;
5. confirme o limite efetivo na URL e nas variaveis `PRISMA_*`;
6. somente depois reabra `Configurações > Serviços` e valide catálogo, auditoria e combinações.

A API converte esgotamento/timeout do pool em HTTP `503` com mensagem segura. Detalhes do papel, host e erro do Prisma devem permanecer apenas nos logs.

## Variaveis esperadas do frontend

- `VITE_API_URL`
- `VITE_PRE_REGISTRATION_ENABLED`: gate compilado da navegacao e das rotas de pre-matricula. Em build de producao, ausencia ou valor invalido significa desabilitado. Deve permanecer alinhado ao estado da API.

## Rollout controlado da pre-matricula

A ordem segura e:

1. aplicar migrations e publicar a API com `PRE_REGISTRATION_ENABLED=false`;
2. validar health, migrations e smoke sem expor o fluxo;
3. publicar o frontend com `VITE_PRE_REGISTRATION_ENABLED=false`;
4. habilitar a API e confirmar resposta das fronteiras;
5. publicar o frontend habilitado para o ambiente piloto;
6. executar o checklist E2E e observar a telemetria;
7. ampliar o uso somente depois do go/no-go.

No desligamento emergencial, desabilite primeiro a API e depois o frontend. O gate retorna `503 PRE_REGISTRATION_DISABLED` e preserva convites, rascunhos, consentimentos, submissões e auditoria. Consulte [`../operations/pre-registration-rollout-and-qa.md`](../operations/pre-registration-rollout-and-qa.md).

## Uploads e assets persistentes

O fluxo local de uploads grava arquivos na raiz configurada por `UPLOAD_STORAGE_ROOT` (ou `./uploads` por padrao) e monta a URL publica com `ASSET_BASE_URL`, `API_PUBLIC_URL` ou headers da requisicao.

Para producao em Render com storage local, o modo recomendado e:

- provisionar um Persistent Disk;
- montar o disco no servico da API (ex.: `/var/data`);
- configurar `UPLOAD_STORAGE_ROOT` para `${mountPath}/uploads` (ex.: `/var/data/uploads`);
- configurar `ASSET_BASE_URL` para o host publico que serve `/uploads`;
- manter `API_PUBLIC_URL` como fallback coerente com o host da API.

## Cloudflare R2 para logo e avatar

Para producao sem depender do filesystem efemero da API e sem usar Supabase Storage, configure logo e avatares publicos no Cloudflare R2:

- criar o bucket `sistema-acesso-assets` no Cloudflare R2;
- criar um token R2 com permissao de leitura e escrita de objetos, restrito ao bucket quando possivel;
- conectar um dominio customizado ao bucket em **R2 > bucket > Settings > Custom Domains**;
- configurar no Render, no servico da API:
  - `ASSET_STORAGE_PROVIDER=r2`;
  - `R2_ACCOUNT_ID=`;
  - `R2_BUCKET=sistema-acesso-assets`;
  - `R2_ACCESS_KEY_ID=`;
  - `R2_SECRET_ACCESS_KEY=`;
  - `R2_PUBLIC_BASE_URL=https://assets.seu-dominio.com`.

O upload autenticado usa o endpoint S3 compativel do R2 em `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`. A URL publica retornada ao frontend vem de `R2_PUBLIC_BASE_URL`, que deve apontar para o dominio publico do bucket, nao para o endpoint S3.

Use `r2.dev` apenas para teste rapido. Em producao, prefira dominio customizado para permitir cache, regras de acesso e controles do Cloudflare.

## Supabase Storage para logo e avatar

Para producao sem depender do filesystem efemero da API, configure logo e avatares publicos no Supabase Storage:

- criar o bucket `sistema-acesso-assets` no Supabase Storage;
- marcar o bucket como publico, pois ele sera usado somente para assets publicos de logo/avatar;
- configurar no Render, no servico da API:
  - `ASSET_STORAGE_PROVIDER=supabase`;
  - `SUPABASE_URL=https://<projeto>.supabase.co`;
  - `SUPABASE_SERVICE_ROLE_KEY=<secret somente no backend>`;
  - `SUPABASE_STORAGE_BUCKET=sistema-acesso-assets`;
  - `ASSET_PUBLIC_BASE_URL=https://<projeto>.supabase.co/storage/v1/object/public/sistema-acesso-assets`.

`SUPABASE_URL` deve ser a URL raiz do projeto e nao deve conter `/rest/v1/`.

O frontend/Vercel nao deve receber `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID` ou `R2_SECRET_ACCESS_KEY`. Esses segredos ficam apenas no ambiente da API.

Os providers externos migram apenas:

- logo do contrato/empresa;
- avatar/foto de aluno;
- avatar/foto de colaborador/professor.

PDFs de contratos assinados, documentos sensiveis e arquivos que exigem autenticacao continuam fora do bucket publico. Eles devem permanecer no fluxo separado ate existir bucket privado, endpoint autenticado ou signed URLs.

Antes de publicar, valide:

- reinicio do servico preserva arquivos enviados;
- redeploy preserva logo de contrato, avatar de aluno e avatar de colaborador;
- URLs antigas com `/api/v1/uploads/...` e `/uploads/...` continuam resolvendo quando o arquivo existir no storage local;
- URLs novas de logo/avatar apontam para `R2_PUBLIC_BASE_URL` quando o provider for `r2`;
- URLs novas de logo/avatar apontam para `ASSET_PUBLIC_BASE_URL` quando o provider for `supabase`.

`ASSET_BASE_URL`, `API_PUBLIC_URL`, `ASSET_PUBLIC_BASE_URL` e `R2_PUBLIC_BASE_URL` estabilizam a URL gravada/retornada, mas nao recuperam arquivos perdidos quando o storage fisico anterior era efemero.

## GitHub Secrets usados em deploy

- `PRODUCTION_DATABASE_URL`
- `RENDER_API_DEPLOY_HOOK_URL`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PRODUCTION_VITE_API_URL`

## Validacoes recomendadas antes de publicar

```bash
pnpm validate
pnpm harness:validate-env
HARNESS_VALIDATE_REAL_ENV=1 NODE_ENV=production pnpm harness:validate-env
```

Use `HARNESS_VALIDATE_REAL_ENV=1` para validar o ambiente real sem fallback de `.env.example`.

## Observacao sobre hooks de deploy

Deploy Hook e segredo operacional. Se for regenerado no Render, atualize o secret correspondente e remova qualquer valor antigo de historicos, prints ou documentacao publica.
