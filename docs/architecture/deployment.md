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
- `UPLOAD_STORAGE_ROOT`: diretorio fisico usado pela API para gravar e servir `/uploads`. Em producao no Render, deve apontar para o caminho montado do Persistent Disk.
- `ASSET_BASE_URL`: URL publica preferencial para servir assets enviados, como logos, avatares e contratos assinados. Em producao, deve apontar para storage/CDN persistente quando houver provider configurado.
- `API_PUBLIC_URL`: URL publica da API usada como fallback para montar URLs de uploads quando `ASSET_BASE_URL` nao estiver configurada.

## Variaveis esperadas do frontend

- `VITE_API_URL`

## Uploads e assets persistentes

A API serve arquivos publicos em `/uploads` a partir de `UPLOAD_STORAGE_ROOT`. Quando a variavel nao esta configurada, o fallback local e `./uploads` relativo ao diretorio de execucao da API.

Em ambientes como Render, configure um Persistent Disk e aponte `UPLOAD_STORAGE_ROOT` para o caminho montado desse disco. Sem esse disco, logos, avatares e contratos assinados continuam vulneraveis a perda em redeploy, restart ou troca de instancia.

Para producao, valide uma destas estrategias antes de considerar logos e avatares resilientes a redeploy/restart:

- configurar disco persistente no provedor da API e definir `UPLOAD_STORAGE_ROOT` para o mount path;
- configurar storage externo persistente, como Cloudflare R2, S3 ou Supabase Storage;
- manter `ASSET_BASE_URL` apontando para o host/CDN que realmente serve os arquivos persistidos.

`UPLOAD_STORAGE_ROOT` estabiliza a origem fisica usada por `/uploads`. `ASSET_BASE_URL` e `API_PUBLIC_URL` estabilizam a URL gravada/retornada, mas nao recuperam arquivos ja perdidos quando o storage fisico anterior era efemero.

## Checklist Render para uploads persistentes

1. Criar um Persistent Disk no servico da API.
2. Montar o disco em um caminho estavel, por exemplo `/mnt/render/uploads`.
3. Definir `UPLOAD_STORAGE_ROOT=/mnt/render/uploads` nas variaveis da API.
4. Definir `API_PUBLIC_URL` com a URL publica da API.
5. Definir `ASSET_BASE_URL` somente se houver um host/CDN especifico para servir os assets.
6. Fazer upload de logo e avatares, executar redeploy/restart e confirmar que os arquivos continuam respondendo em `/uploads/...`.

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
