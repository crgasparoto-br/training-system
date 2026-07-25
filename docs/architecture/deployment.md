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
- `FRONTEND_URL`
- `CORS_ORIGINS`: obrigatoria em producao e deve listar somente origins produtivas explicitamente permitidas. Origins locais nao sao incluidas por padrao em `NODE_ENV=production`.
- `JWT_SECRET`: obrigatoria em producao. Nao use placeholders como `dev-secret` ou `your-super-secret-jwt-key-change-in-production`.
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

## Banco no Render

Configuracao recomendada para evitar que a API consuma o limite da conta de migration:

1. Em `DATABASE_URL`, configure a URL de runtime/pool e um usuario de aplicacao com apenas os privilegios necessarios para operar o sistema.
2. Em `MIGRATION_DATABASE_URL`, configure a URL direta e o usuario autorizado a aplicar migrations.
3. Configure `PRISMA_CONNECTION_LIMIT=1` inicialmente. Aumente somente com base no limite real do banco, numero de instancias da API e metricas de fila/latencia.
4. Configure `PRISMA_POOL_TIMEOUT_SECONDS=15`.
5. Reinicie ou redeploy a API para encerrar pools antigos e aplicar as novas variaveis.

O comando `pnpm start` executa as migrations com `MIGRATION_DATABASE_URL` e inicia a API novamente com a `DATABASE_URL` original. Quando `MIGRATION_DATABASE_URL` nao existe, o start usa `DATABASE_URL` para manter compatibilidade com ambientes antigos.

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