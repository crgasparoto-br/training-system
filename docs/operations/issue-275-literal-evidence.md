# Evidências literais da Issue 275

Este documento complementa o runbook de rollout da pré-matrícula e define evidências que não podem ser substituídas por sondas, checklists ou sessões injetadas.

## Compatibilidade com a web anterior

A afirmação “API nova compatível com a web anterior” exige a execução de um consumidor anterior real.

A evidência deve registrar:

- SHA exato do commit anterior;
- SHA atual da API, diferente do SHA anterior;
- checkout separado e imutável do commit anterior;
- digest SHA-256 do diretório `apps/web/dist` produzido nesse checkout;
- execução do bundle anterior contra a API atual;
- consumidor público tokenizado renderizado;
- consumidor autenticado carregando e salvando uma etapa;
- consumidor administrativo carregando a listagem real.

Não constituem evidência suficiente:

- `GET /api/v1` retornando `200`;
- inspeção estática das rotas;
- execução do bundle atual com uma variável chamada “previous”;
- descrição de PR ou booleano de completude.

O controle negativo deve reprovar quando o SHA anterior for igual ao SHA atual, quando não houver digest do bundle ou quando qualquer uma das três audiências não for executada.

## Retomada após nova autenticação

O cenário de retomada entre dispositivos exige um segundo contexto de navegador limpo.

A evidência deve confirmar:

1. o primeiro contexto autenticado salva parcialmente uma etapa;
2. o primeiro contexto é encerrado;
3. o segundo contexto inicia sem `token` e sem `user` em `localStorage`;
4. ocorre exatamente um `POST /api/v1/auth/login` no segundo contexto;
5. a resposta de login é `200`;
6. o navegador retorna para `/pre-cadastro`;
7. a etapa persistida é retomada;
8. o token bruto do convite não aparece na URL, no `localStorage` nem no `sessionStorage`.

Inserir diretamente token e usuário no armazenamento do segundo contexto não comprova autenticação e deve fazer o gate falhar.

## Gate automatizado

O workflow `.github/workflows/issue-275-audit-escape-regressions.yml`:

- faz checkout completo do repositório;
- cria um `git worktree` no SHA base da PR;
- instala e compila a web anterior nesse worktree;
- executa testes de contrato que rejeitam as evidências substitutas;
- executa Chrome real com a web atual, a web anterior, a API atual e PostgreSQL;
- publica `artifacts/issue-275/literal-scenarios.json` e capturas anonimizadas.

Em execução manual, `previous_web_sha` é obrigatório e deve identificar uma versão anterior realmente suportada.

## Campos mínimos do artefato

`literal-scenarios.json` deve conter:

- `headSha`;
- `previousWebSha`;
- `previousWebDistDigest`;
- resultados dos consumidores público, autenticado e administrativo da web anterior;
- confirmação de contexto limpo no segundo dispositivo;
- quantidade e status da chamada real de login;
- etapa retomada;
- ausência do token do convite na URL e nos armazenamentos.
