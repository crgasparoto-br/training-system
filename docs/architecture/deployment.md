# Deploy e ambientes

Este documento registra as regras minimas para publicar o Sistema Acesso.

## Principios

- A branch de desenvolvimento deve validar build, testes e regras estruturais antes de chegar em producao.
- Segredos ficam no provedor de deploy ou no GitHub Secrets, nunca no repositorio.
- Variaveis novas devem ser documentadas em `.env.example` e neste arquivo.
- Deploy deve ser reprodutivel por workflow ou comando documentado.

## Variaveis esperadas da API

- `DATABASE_URL`
- `NODE_ENV`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `JWT_SECRET`
- `UPLOAD_STORAGE_ROOT`: caminho absoluto no host da API para armazenamento persistente de uploads locais. Em Render, deve apontar para o mount path do Persistent Disk quando o provider de assets for `local`.
- `ASSET_BASE_URL`: URL publica preferencial para servir assets gravados no storage local/persistente.
- `API_PUBLIC_URL`: URL publica da API usada como fallback para montar URLs de uploads locais quando `ASSET_BASE_URL` nao estiver configurada.
- `ASSET_STORAGE_PROVIDER`: provider dos assets publicos de logo/avatar. Use `local` para filesystem persistente ou `supabase` para Supabase Storage.
- `SUPABASE_URL`: URL raiz do projeto Supabase, sem `/rest/v1/`. Obrigatoria quando `ASSET_STORAGE_PROVIDER=supabase`.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key usada somente pela API/backend. Nunca configure no frontend.
- `SUPABASE_STORAGE_BUCKET`: bucket usado para assets publicos de logo/avatar, por exemplo `sistema-acesso-assets`.
- `ASSET_PUBLIC_BASE_URL`: URL publica do bucket, por exemplo `https://<projeto>.supabase.co/storage/v1/object/public/sistema-acesso-assets`.

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

O frontend/Vercel nao deve receber `SUPABASE_SERVICE_ROLE_KEY`. Essa chave fica apenas no ambiente da API.

Esse provider migra apenas:

- logo do contrato/empresa;
- avatar/foto de aluno;
- avatar/foto de colaborador/professor.

PDFs de contratos assinados, documentos sensiveis e arquivos que exigem autenticacao continuam fora do bucket publico. Eles devem permanecer no fluxo separado ate existir bucket privado, endpoint autenticado ou signed URLs.

Antes de publicar, valide:

- reinicio do servico preserva arquivos enviados;
- redeploy preserva logo de contrato, avatar de aluno e avatar de colaborador;
- URLs antigas com `/api/v1/uploads/...` e `/uploads/...` continuam resolvendo quando o arquivo existir no storage local;
- URLs novas de logo/avatar apontam para `ASSET_PUBLIC_BASE_URL` quando o provider for `supabase`.

`ASSET_BASE_URL`, `API_PUBLIC_URL` e `ASSET_PUBLIC_BASE_URL` estabilizam a URL gravada/retornada, mas nao recuperam arquivos perdidos quando o storage fisico anterior era efemero.

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
```

## Observacao sobre hooks de deploy

Deploy Hook e segredo operacional. Se for regenerado no Render, atualize o secret correspondente no GitHub e remova qualquer valor antigo de historicos, prints ou documentacao publica.
