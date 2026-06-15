# Plano de execucao: navegacao e arquitetura de informacao

Status: ativo
Data: 2026-06-15
Ponto de partida atual: `develop`
Documento de produto: `docs/product/navigation-information-architecture.md`
Epic: #149
Issues cobertas nesta etapa: #150, #151, #154, #156 e #157
Issues preparadas para implementacao incremental: #152, #153 e #155

## Objetivo

Planejar e orientar a reorganizacao incremental da navegacao do Sistema Acesso, com foco em rotinas reais, hubs, `Aluno 360`, inicio por perfil, telas longas e revisao de permissoes.

Esta etapa nao troca rotas nem remove funcionalidades. Ela cria a base revisavel para que as mudancas de codigo sejam pequenas, seguras e validadas por perfil.

## Contexto

As issues #149 a #157 pedem uma nova organizacao de navegacao, mas varias dependem de descoberta e decisao antes da implementacao. O repositorio em `develop` ja possui:

- rotas protegidas em `apps/web/src/App.tsx`;
- menu lateral filtrado por permissao em `apps/web/src/navigation/sidebarMenu.ts`;
- layout principal em `apps/web/src/layouts/DashboardLayout.tsx`;
- abas do aluno selecionado em `apps/web/src/components/alunos/AlunoDetailsTabs.tsx`;
- catalogo compartilhado de acesso em `packages/types/access-control.ts`.

A decisao desta entrega e tratar a reorganizacao ampla como trilha incremental, preservando rotas atuais e usando `screenKey`, `blockKey`, `dataScope` e `contractId` como invariantes.

## Arquivos e modulos principais

| Arquivo/modulo | Uso nesta trilha |
| --- | --- |
| `docs/product/navigation-information-architecture.md` | Fonte de verdade do mapa atual, proposta por hubs, permissao e rollout. |
| `docs/README.md` | Indice da nova fonte de verdade. |
| `apps/web/src/navigation/sidebarMenu.ts` | Primeira etapa de codigo para reorganizar menu sem trocar rotas. |
| `apps/web/src/App.tsx` | Rotas, redirecionamentos e futura rota de Inicio por perfil. |
| `apps/web/src/components/alunos/AlunoDetailsTabs.tsx` | Base do `Aluno 360` e padrao de abas/telas longas. |
| `apps/web/src/pages/AlunoDetails.tsx` | Hub operacional do aluno e blocos sensiveis. |
| `apps/web/src/access/access-control.ts` | Filtro visual por permissao efetiva. |
| `packages/types/access-control.ts` | Catalogo de telas, blocos e defaults. |
| `apps/api/src/modules/access-control` | Bloqueio equivalente no backend para mudancas sensiveis. |

## Estrategia de implementacao

1. Concluir descoberta e proposta documentada.
2. Reorganizar menu visual mantendo rotas existentes.
3. Aplicar padrao de telas longas no aluno como piloto.
4. Evoluir `Aluno 360` sem remover abas nem fluxos existentes.
5. Criar Inicio por perfil somente com dados confiaveis e destinos permitidos.
6. Revisar permissoes sempre que houver novo hub, bloco, rota ou dado agregado.
7. Validar por perfil antes de liberar em producao.

## Entregas por issue

| Issue | Entrega desta etapa | Proxima acao |
| --- | --- | --- |
| #150 | Mapa atual de rotas, menu, jornadas e friccoes documentado. | Revisao manual do mapa. |
| #151 | Arquitetura proposta por hubs documentada. | Validar nomenclatura e destino final dos itens. |
| #152 | Menu proposto e regras de compatibilidade definidos. | Implementar `sidebarMenu.ts` em PR pequeno. |
| #153 | Estrutura-alvo do `Aluno 360` definida. | Evoluir `/alunos/:id` incrementalmente. |
| #154 | Padrao de telas longas definido. | Aplicar no piloto do aluno e depois expandir. |
| #155 | Conteudo inicial por perfil definido. | Implementar somente com origem de dados confiavel. |
| #156 | Matriz de permissao e riscos definida. | Atualizar catalogos/backend apenas quando houver nova chave real. |
| #157 | Rollout, checklist, compatibilidade e rollback definidos. | Usar como guia dos PRs seguintes. |

## Criterios de aceite

- `docs/product/navigation-information-architecture.md` existe e registra descoberta, proposta e rollout.
- O mapa atual preserva nomes e rotas existentes para comparacao futura.
- A arquitetura por hubs separa operacao, gestao e configuracoes.
- `Aluno 360` fica definido como evolucao de `/alunos/:id`, nao como tela paralela obrigatoria.
- Padrao de telas longas define abas, colapsaveis, resumo, acoes e estados.
- Matriz de permissoes explicita `screenKey`, `blockKey`, `dataScope` e riscos de dados sensiveis.
- Plano de rollout preserva rotas antigas e evita mudanca ampla sem validacao.

## Validacao manual

Para esta etapa documental:

- Revisar links adicionados ao indice de docs.
- Conferir se os caminhos citados existem em `develop`.
- Conferir se os hubs propostos nao criam permissao nova implicita.
- Conferir se as issues #152, #153 e #155 ficam como implementacoes posteriores, pois dependem das decisoes documentadas.

Para as etapas de codigo seguintes:

- Testar menu para professor, administrativo, gestor, master e perfil reduzido.
- Testar acesso direto por URL para rotas sensiveis.
- Testar blocos do aluno com todos visiveis, parcialmente ocultos e nenhum dado.
- Testar desktop e mobile quando houver mudanca visual.

## Validacao automatizada esperada

Para PRs apenas documentais:

```bash
pnpm docs:check
```

Para PRs com codigo ou permissao:

```bash
pnpm validate
pnpm access:check
```

Se o ambiente nao permitir instalar dependencias ou rodar a suite completa, o PR deve registrar o bloqueio e o risco residual.

## Riscos e mitigacoes

| Risco | Mitigacao |
| --- | --- |
| Reorganizar menu antes de validar mapa | Usar esta documentacao como gate da primeira mudanca de codigo. |
| Hub agregar dados sensiveis demais | Exigir `blockKey`, escopo e backend equivalente por bloco. |
| Inicio por perfil virar relatorio sem fonte confiavel | Implementar apenas cards com origem definida e destino permitido. |
| Rotas antigas quebrarem links salvos | Mover primeiro apenas o menu; manter rotas e redirecionamentos. |
| Perfis customizados receberem acesso inesperado | Calcular visibilidade por permissao efetiva e testar perfil reduzido. |

## Pendencias

- Validar com produto se `Avaliacoes` permanece como hub proprio no menu.
- Decidir se `Acesso dos alunos` tera atalho em Alunos e fonte em Configuracoes.
- Confirmar os indicadores confiaveis para a primeira versao do Inicio por perfil.
- Definir se a reorganizacao de menu precisa feature flag ou pode ser liberada diretamente apos regressao manual.
