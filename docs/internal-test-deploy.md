# Publicacao Para Testes Internos

> Documento complementar de orientacao rapida para testes internos.
>
> Fontes de verdade atuais:
>
> - `docs/architecture/deployment.md`
> - `docs/quality/validation.md`
> - `docs/operations/api-scripts.md`
>
> Use este arquivo como apoio historico/operacional e revise ambientes, variaveis e passos finais contra as fontes acima antes de publicar.

Este projeto ja esta organizado como:

- `apps/web`: frontend React/Vite
- `apps/api`: backend Node/Express
- PostgreSQL: banco principal
- Redis: cache/filas

## Recomendacao de URL

Para esse sistema, o caminho mais simples e usar **subdominios**, nao subpasta.

Sugestao:

- `acesso.solveritconsultoria.com.br` para o frontend
- `api-acesso.solveritconsultoria.com.br` para a API

Motivo:

- o frontend e SPA em Vite/React;
- a API precisa de dominio proprio para CORS e chamadas HTTP;
- subdominio evita retrabalho com proxy de rota em `/acesso`.

## Arquitetura recomendada para teste interno

Use 4 servicos:

1. frontend publicado em HTTPS
2. API publicada em HTTPS
3. PostgreSQL ativo 24h
4. Redis ativo 24h

## Variaveis de ambiente sugeridas

### API

```env
NODE_ENV=production
API_PORT=3000
DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO?sslmode=require"
REDIS_URL="redis://HOST:6379"
JWT_SECRET="troque-por-um-segredo-forte"
FRONTEND_URL="https://acesso.solveritconsultoria.com.br"
MOBILE_URL=""
CORS_ORIGINS="https://acesso.solveritconsultoria.com.br"
```

### Frontend

```env
VITE_API_URL="https://api-acesso.solveritconsultoria.com.br"
```

## Passo a passo enxuto

1. Suba o repositorio para o GitHub.
2. Publique `apps/api` em um servico Node.
3. Publique `apps/web` como site estatico.
4. Crie um PostgreSQL de producao ou homologacao.
5. Crie um Redis acessivel pela API.
6. Configure o dominio do frontend.
7. Configure o dominio da API.
8. Rode as migrations:

```bash
cd apps/api
pnpm db:migrate:prod
```

9. Se precisar de dados iniciais, rode seed:

```bash
cd apps/api
pnpm db:seed
```

## DNS

No provedor DNS de `solveritconsultoria.com.br`, crie:

- `acesso` apontando para o servico do frontend
- `api-acesso` apontando para o servico da API

## Checklist para varios usuarios testando de lugares diferentes

- HTTPS ativo nos dois dominios
- banco em servidor/cloud publico, nao local
- backup diario do PostgreSQL
- senha forte no banco e no JWT
- usuarios de teste separados dos usuarios reais
- ambiente de teste separado do ambiente oficial
- monitorar CPU, memoria e espaco do banco

## Observacoes importantes deste projeto

- A API agora aceita CORS por variavel de ambiente via `CORS_ORIGINS`.
- O frontend depende de `VITE_API_URL`.
- Se quiser publicar em `/acesso` em vez de subdominio, sera preciso ajustar base path do Vite e rewrite do servidor web.

## Topologia sugerida

### Opcao simples

- frontend em plataforma estatica
- API em plataforma Node
- PostgreSQL gerenciado
- Redis gerenciado

### Opcao em um unico VPS

- Nginx
- Node API com PM2 ou Docker
- frontend buildado servido pelo Nginx
- PostgreSQL
- Redis

Essa opcao funciona, mas exige mais manutencao.
