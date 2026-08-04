# Arquitetura da API

A API fica em `apps/api`.

## Responsabilidades

- Expor rotas HTTP para o web e mobile.
- Aplicar autenticacao, autorizacao e escopo de dados antes de acessar dados sensiveis.
- Concentrar regras de negocio em services/modulos.
- Usar Prisma como camada de persistencia.

## Regras para novas rotas

- Rotas privadas devem usar middleware de autenticacao.
- Rotas que representam telas devem validar `screenKey` quando aplicavel.
- Acoes internas, abas e blocos devem validar `blockKey` quando aplicavel.
- Consultas multi-tenant devem filtrar por `contractId`.
- Consultas de colaboradores/professores devem aplicar escopo de dados quando a funcao exigir.

## Padrao de implementacao

1. Definir tipos compartilhados em `packages/types` quando o contrato tambem for usado no frontend.
2. Criar ou atualizar service no modulo correspondente.
3. Aplicar middlewares de seguranca na rota.
4. Criar testes unitarios ou de integracao para regras de permissao e dados.
5. Atualizar docs quando a regra de negocio mudar.

## Adipometria (ADPT)

O módulo autoritativo fica em `apps/api/src/modules/adipometry` e é montado em `/api/v1/adipometry`.

Regras de fronteira:

- todas as rotas exigem autenticação de professor e a tela `physicalAssessment.protocol`;
- leitura exige `physicalAssessment.adpt.view`;
- criação, edição, cálculo e conclusão exigem `physicalAssessment.adpt.actions.manage`;
- correção de avaliação concluída exige `physicalAssessment.adpt.actions.correctCompleted`;
- `contractId`, usuário e professor ator são derivados do token e nunca aceitos no body;
- resultados são calculados novamente na conclusão; campos derivados enviados pelo cliente não fazem parte dos schemas HTTP;
- conclusão usa transação serializável, bloqueio do rascunho e bloqueio da aprovação clínica ativa;
- identificadores de outro contrato recebem o mesmo 404 público de um recurso inexistente;
- falhas inesperadas retornam código estável e `correlationId`, sem mensagem bruta do banco.

A API reutiliza as funções e restrições PostgreSQL implantadas pela fundação da issue #246 para numeração, ator de auditoria, imutabilidade e ciclo de revisões.

## Validacoes relacionadas

- `pnpm type-check`
- `pnpm test`
- `pnpm arch:check`
- `pnpm access:check`
