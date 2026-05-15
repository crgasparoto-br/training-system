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

## Variaveis esperadas do frontend

- `VITE_API_URL`

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
