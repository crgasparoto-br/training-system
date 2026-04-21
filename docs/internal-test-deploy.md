# Publicação Para Testes Internos

Este projeto já está organizado como:

- `apps/web`: frontend React/Vite
- `apps/api`: backend Node/Express
- PostgreSQL: banco principal
- Redis: cache/filas

## Recomendação de URL

Para esse sistema, o caminho mais simples é usar **subdomínios**, não subpasta.

Sugestão:

- `acesso.solveritconsultoria.com.br` para o frontend
- `api-acesso.solveritconsultoria.com.br` para a API

Motivo:

- o frontend é SPA em Vite/React;
- a API precisa de domínio próprio para CORS e chamadas HTTP;
- subdomínio evita retrabalho com proxy de rota em `/acesso`.

## Arquitetura recomendada para teste interno

Use 4 serviços:

1. frontend publicado em HTTPS
2. API publicada em HTTPS
3. PostgreSQL ativo 24h
4. Redis ativo 24h

## Variáveis de ambiente sugeridas

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

1. Suba o repositório para o GitHub.
2. Publique `apps/api` em um serviço Node.
3. Publique `apps/web` como site estático.
4. Crie um PostgreSQL de produção ou homologação.
5. Crie um Redis acessível pela API.
6. Configure o domínio do frontend.
7. Configure o domínio da API.
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

- `acesso` apontando para o serviço do frontend
- `api-acesso` apontando para o serviço da API

## Checklist para vários usuários testando de lugares diferentes

- HTTPS ativo nos dois domínios
- banco em servidor/cloud público, não local
- backup diário do PostgreSQL
- senha forte no banco e no JWT
- usuários de teste separados dos usuários reais
- ambiente de teste separado do ambiente oficial
- monitorar CPU, memória e espaço do banco

## Observações importantes deste projeto

- A API agora aceita CORS por variável de ambiente via `CORS_ORIGINS`.
- O frontend depende de `VITE_API_URL`.
- Se quiser publicar em `/acesso` em vez de subdomínio, será preciso ajustar base path do Vite e rewrite do servidor web.

## Topologia sugerida

### Opção simples

- frontend em plataforma estática
- API em plataforma Node
- PostgreSQL gerenciado
- Redis gerenciado

### Opção em um único VPS

- Nginx
- Node API com PM2 ou Docker
- frontend buildado servido pelo Nginx
- PostgreSQL
- Redis

Essa opção funciona, mas exige mais manutenção.
