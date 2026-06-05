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
- `UPLOAD_STORAGE_ROOT`: caminho absoluto no host da API para armazenamento persistente de uploads. Em Render, deve apontar para o mount path do Persistent Disk.
- `ASSET_BASE_URL`: URL publica preferencial para servir assets enviados, como logos, avatares e contratos assinados. Em producao, deve apontar para storage/CDN persistente quando houver provider configurado.
- `API_PUBLIC_URL`: URL publica da API usada como fallback para montar URLs de uploads quando `ASSET_BASE_URL` nao estiver configurada.

## Variaveis esperadas do frontend

- `VITE_API_URL`

## Uploads e assets persistentes

O fluxo de uploads grava arquivos na raiz configurada por `UPLOAD_STORAGE_ROOT` (ou `./uploads` por padrao) e monta a URL publica com `ASSET_BASE_URL`, `API_PUBLIC_URL` ou headers da requisicao.

Para producao em Render, o modo recomendado e:

- provisionar um Persistent Disk;
- montar o disco no servico da API (ex.: `/var/data`);
- configurar `UPLOAD_STORAGE_ROOT` para `${mountPath}/uploads` (ex.: `/var/data/uploads`);
- configurar `ASSET_BASE_URL` para o host publico que serve `/uploads`;
- manter `API_PUBLIC_URL` como fallback coerente com o host da API.

Alternativamente, pode-se usar storage externo (R2/S3/Supabase Storage), mantendo `ASSET_BASE_URL` apontando para o host/CDN correto.

Antes de publicar, valide:

- reinicio do servico preserva arquivos enviados;
- redeploy preserva logo de contrato, avatar de aluno e avatar de colaborador;
- URLs antigas com `/api/v1/uploads/...` e `/uploads/...` continuam resolvendo quando o arquivo existir no storage.

`ASSET_BASE_URL` e `API_PUBLIC_URL` estabilizam a URL gravada/retornada, mas nao recuperam arquivos perdidos quando o storage fisico e efemero.

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
