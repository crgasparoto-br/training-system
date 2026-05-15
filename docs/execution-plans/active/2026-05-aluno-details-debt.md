# Plano: divida tecnica da tela AlunoDetails

## Objetivo

Reduzir complexidade da tela `AlunoDetails` sem alterar comportamento funcional, separando responsabilidades, preservando permissoes e melhorando testabilidade.

## Contexto

Arquivo principal:

- `apps/web/src/pages/AlunoDetails.tsx`

Sinais encontrados:

- Tela concentra muitos estados, efeitos, permissoes, dados financeiros, avaliacoes, revisoes cadastrais, guias e historico.
- Mistura carregamento de dados, regras de permissao, UI, modais, feedbacks e handlers de mutacao.
- Ja existem componentes de abas, mas a tela ainda orquestra muitas responsabilidades.
- A tela possui alta criticidade por lidar com dados pessoais, saude, financeiro, avaliacoes e contratos.

## Fora de escopo

- Alterar regras de negocio.
- Alterar schema Prisma.
- Alterar permissoes sem atualizar catalogo.
- Trocar UX inteira da tela.

## Arquivos e modulos principais

- `apps/web/src/pages/AlunoDetails.tsx`
- `apps/web/src/components/alunos/*`
- `apps/web/src/services/aluno.service.ts`
- `apps/web/src/services/assessment.service.ts`
- `apps/web/src/services/plan.service.ts`
- `apps/web/src/access/access-control.ts`
- `packages/types/access-control.ts`

## Riscos

- Quebrar visibilidade por `blockKey`.
- Expor dados financeiros para perfil sem permissao.
- Quebrar upload/historico de avaliacoes.
- Gerar regressao em revisao cadastral ou contratos.

## Sequencia recomendada de PRs

### PR A - Inventario de responsabilidades

- Listar todos os blocos funcionais da tela.
- Mapear quais dados cada aba precisa.
- Mapear `screenKey` e `blockKey` usados.
- Identificar handlers que podem virar hooks.

### PR B - Extrair hooks de carregamento

- Criar hook para carregar dados principais do aluno.
- Criar hook para avaliacoes e resumo.
- Criar hook para contratos financeiros, preservando permissao.
- Manter output equivalente ao estado atual.

### PR C - Extrair handlers de avaliacoes

- Mover upload, edicao, historico e feedback para hook/modulo especifico.
- Preservar checklist e guia de primeira avaliacao.
- Adicionar testes unitarios para transformacoes e validacoes puras.

### PR D - Separar financeiro/contratos

- Garantir que chamadas financeiras so ocorram quando `canViewFinancialData` for true.
- Centralizar regras de permissao de contrato.
- Validar UI com perfis professor, manager, administrative e master.

### PR E - Limpeza visual e estados globais

- Trocar alerts por feedback padronizado se ainda existirem.
- Reduzir props longas entre componentes.
- Consolidar textos em `ptBR.ts` quando fizer sentido.

## Criterios de aceite

- Nenhuma permissao removida ou relaxada.
- Dados financeiros continuam protegidos por permissao.
- Avaliacoes continuam com upload, historico e resumo funcionando.
- Tela continua carregando para usuarios autorizados.
- `pnpm validate` passa.

## Validacao manual

- Abrir aluno com usuario master.
- Abrir aluno com professor comum.
- Validar abas visiveis por permissao.
- Validar ausencia de dados financeiros para perfil sem permissao.
- Subir avaliacao em ambiente de teste.
- Editar historico de avaliacao, se permitido.
- Resetar senha apenas com permissao adequada.
