# Arquitetura do Sistema Acesso

Este documento e o mapa raiz da arquitetura do `training-system`. Ele existe para dar contexto rapido a humanos e agentes antes de qualquer mudanca no codigo.

Mantenha este arquivo curto, navegavel e atualizado. Detalhes ficam em `docs/`; regras criticas devem ser reforcadas por testes, scripts ou CI.

## Objetivo arquitetural

O Sistema Acesso e um SaaS para gestao de alunos, colaboradores, treinos, agenda, avaliacoes, contratos, financeiro e operacao de assessorias/estudios.

A arquitetura deve proteger quatro propriedades:

1. **Seguranca multi-tenant**: nenhum dado pode escapar do `contractId` do usuario autenticado.
2. **Controle de acesso consistente**: telas, blocos, acoes e escopo de dados precisam ser validados no backend.
3. **Legibilidade para agentes**: o repositorio deve explicar como evoluir o sistema sem depender de contexto externo.
4. **Mudancas pequenas e validaveis**: alteracoes devem ter testes, documentacao e comandos claros de validacao.

## Topologia principal

```text
apps/web  ->  apps/api  ->  Prisma  ->  banco de dados
   |             |
   |             +-> services/modulos de dominio
   |
   +-> UI, rotas, menus, telas, abas e componentes

packages/types      -> contratos, catalogos e tipos compartilhados
packages/utils      -> utilitarios compartilhados
packages/constants  -> constantes compartilhadas

docs/               -> fonte de verdade de produto, arquitetura, qualidade e planos
scripts/            -> validacoes, harness local e automacoes operacionais
```

## Estrutura do monorepo

- `apps/api`: backend Node.js/Express com Prisma. E a barreira de seguranca, autorizacao e persistencia.
- `apps/web`: frontend React/Vite. Renderiza a experiencia do usuario e consome a API autenticada.
- `apps/mobile`: aplicativo mobile quando aplicavel. Deve seguir os mesmos contratos e regras do backend.
- `packages/types`: tipos compartilhados, contratos entre apps e catalogos de permissao.
- `packages/utils`: utilitarios reutilizaveis sem depender de runtime especifico de app.
- `packages/constants`: constantes compartilhadas por API, web e mobile.
- `docs`: documentacao versionada e navegavel.
- `scripts`: checks mecanicos, harness local e scripts operacionais.

## Fontes de verdade

Use esta ordem ao procurar contexto:

1. `AGENTS.md`: entrada curta para humanos e agentes.
2. `ARCHITECTURE.md`: mapa raiz da arquitetura e invariantes.
3. `docs/README.md`: indice da documentacao versionada.
4. `docs/architecture/*`: detalhes por camada.
5. `docs/product/*`: regras de produto.
6. `docs/execution-plans/active/*`: planos de mudancas grandes em andamento.
7. Codigo, testes e scripts: fonte final de comportamento executavel.

Conhecimento importante nao deve ficar apenas em prompts, chats ou memoria pessoal. Quando uma decisao vira regra do projeto, registre em `docs/` e, quando possivel, transforme em validacao automatica.

## Regras de dependencia

### API

A API deve:

- autenticar o usuario antes de rotas privadas;
- aplicar autorizacao por `screenKey`, `blockKey` e `dataScope` quando aplicavel;
- filtrar consultas sensiveis por `contractId`;
- manter regras de negocio em services/modulos, nao em componentes de UI;
- usar Prisma como camada oficial de persistencia;
- validar entradas e saidas relevantes em fronteiras de sistema.

A API nao deve:

- confiar em ocultacao de UI como controle de seguranca;
- retornar dados de outro contrato;
- criar `PrismaClient` avulso em arquivos sem justificativa;
- espalhar regras de permissao fora do modulo/camadas documentadas.

Documento detalhado: `docs/architecture/api.md`.

### Frontend web

O frontend deve:

- renderizar telas, menus, abas, blocos e acoes conforme permissoes vindas da API;
- usar `screenKey` para telas e `blockKey` para abas, blocos internos ou acoes sensiveis;
- manter telas longas organizadas com secoes colapsaveis quando isso melhorar a usabilidade;
- tratar permissoes como experiencia de usuario, nao como unica barreira de seguranca.

O frontend nao deve:

- guardar segredos de backend;
- assumir que esconder um componente protege dados;
- duplicar regra critica sem validacao equivalente no backend.

Documento detalhado: `docs/architecture/web.md`.

### Banco de dados

A persistencia deve:

- evoluir por migrations Prisma;
- preservar `contractId` como barreira multi-tenant;
- acompanhar mudancas de produto com documentacao e testes;
- tratar alteracoes de permissao ou escopo de dados como mudancas sensiveis.

Documento detalhado: `docs/architecture/database.md`.

### Pacotes compartilhados

- `packages/types` concentra contratos compartilhados e catalogos de acesso.
- `packages/utils` deve conter utilitarios genericos e testaveis.
- `packages/constants` deve conter constantes compartilhadas sem dependencia de app.

Evite dependencia circular entre apps e packages. Apps podem depender de packages; packages nao devem depender de `apps/*`.

## Controle de acesso

O modelo de acesso usa tres chaves principais:

- `screenKey`: permissao para visualizar tela ou capacidade principal.
- `blockKey`: permissao para aba, bloco interno ou acao sensivel dentro de uma tela.
- `dataScope`: escopo de dados permitido para telas sensiveis.

Escopos permitidos:

- `self`: usuario acessa somente o proprio cadastro.
- `managed`: usuario acessa o proprio cadastro e colaboradores sob sua gestao.
- `contract`: usuario acessa todos os registros do contrato.

Invariantes obrigatorios:

1. `contractId` sempre limita dados sensiveis.
2. `blockKey` so pode liberar acesso se a tela pai tambem estiver liberada.
3. `dataScope` so pode existir para telas listadas em `ACCESS_DATA_SCOPE_SCREEN_KEYS`.
4. Novas chaves devem ser adicionadas ao catalogo em `packages/types/access-control.ts`.
5. Backend e frontend devem ser atualizados juntos quando uma permissao nova afetar UI e dados.

Documento detalhado: `docs/architecture/auth-and-access-control.md`.

## Deploy e ambientes

- Frontend web: Vercel no cenario atual.
- API: Render no cenario atual.
- Banco: configurado por variaveis de ambiente, com Prisma no backend.
- Segredos devem existir apenas no ambiente apropriado, nunca no navegador.

Novas variaveis de ambiente devem atualizar `.env.example` e `docs/architecture/deployment.md`.

## Planos de execucao

Mudancas grandes ou que cruzam mais de um modulo devem ter plano em `docs/execution-plans/active/` usando `docs/execution-plans/TEMPLATE.md`.

O plano deve registrar:

- objetivo;
- contexto;
- arquivos e modulos principais;
- criterios de aceite;
- validacao manual;
- decisoes e pendencias.

Ao concluir, mova para `docs/execution-plans/completed/` ou mantenha em `active/` com pendencias explicitas.

## Harness e validacao

Antes de abrir PR ou concluir tarefa, rode:

```bash
pnpm validate
```

Esse comando agrupa:

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm arch:check
pnpm access:check
pnpm docs:check
```

Valide tambem comandos especificos quando a mudanca tocar ambiente, dados ou API:

```bash
pnpm harness:validate-env
pnpm harness:smoke-api
```

Se algum comando nao puder ser executado no ambiente local, registre o motivo no PR.

## Como evoluir a arquitetura

Ao identificar uma regra importante:

1. documente a regra no arquivo certo em `docs/`;
2. atualize este `ARCHITECTURE.md` se a regra mudar uma fronteira arquitetural;
3. crie ou ajuste teste, script ou CI quando a regra puder ser verificada mecanicamente;
4. atualize `AGENTS.md` apenas se a entrada de leitura mudar.

A direcao e: documentacao curta como mapa, documentos especificos como fonte de verdade, e checks mecanicos para impedir regressao.