# Plano: divida tecnica do WorkoutBuilder

## Objetivo

Transformar `WorkoutBuilder` de uma tela com mock/TODO em uma funcionalidade integrada, testavel e segura para montagem de treinos semanais.

## Contexto

Arquivo principal:

- `apps/web/src/pages/WorkoutBuilder/index.tsx`

Sinais encontrados:

- `loadWorkoutData` usa mock temporario.
- `handleSave` apenas mostra alert e nao persiste dados.
- `handleCopyWeek` ainda nao implementa copia real.
- Inputs de duracao, local e metodo apenas fazem `console.log`.
- Secoes de exercicios estao hardcoded e sem integracao com biblioteca.
- Ha hex/classes de cor diretas em alguns blocos, fugindo parcialmente das diretrizes visuais.

## Fora de escopo

- Refatorar periodizacao inteira.
- Criar novos modelos Prisma sem plano especifico.
- Alterar regras de permissao sem atualizar catalogos.

## Arquivos e modulos principais

- `apps/web/src/pages/WorkoutBuilder/index.tsx`
- `apps/web/src/pages/WorkoutBuilder2/*`
- `apps/api/src/modules/library/*`
- `apps/api/src/routes/library.routes.ts`
- `packages/types/*`, se houver contrato compartilhado.

## Riscos

- Persistir treino em modelo ainda instavel.
- Permitir edicao sem permissao de tela/bloco.
- Criar divergencia entre WorkoutBuilder antigo e WorkoutBuilder2.
- Quebrar fluxo de planos existente.

## Sequencia recomendada de PRs

### PR A - Diagnostico funcional e contrato de dados

- Mapear qual builder esta ativo no menu/rotas.
- Definir contrato minimo para template, dias, secoes e exercicios.
- Identificar endpoints existentes ou faltantes.
- Definir `screenKey`/`blockKey` necessarios.

### PR B - Remover mock sem mudar UX

- Criar service frontend para carregar dados reais.
- Substituir mock por estado vazio/erro controlado.
- Remover `console.log` de interacoes.
- Manter layout visual semelhante.

### PR C - Persistencia minima

- Implementar salvar configuracoes do dia.
- Validar payload com Zod ou DTO tipado.
- Adicionar testes de API/service quando aplicavel.

### PR D - Integracao com biblioteca de exercicios

- Conectar botao `Adicionar Exercicio` ao seletor/biblioteca.
- Respeitar contrato e permissoes.
- Atualizar resumo semanal com total real de exercicios.

### PR E - Copia de semana

- Implementar copia real com confirmacao clara.
- Proteger contra sobrescrita acidental.
- Criar testes para copia sem duplicidade indevida.

## Criterios de aceite

- Sem dados mockados em fluxo principal.
- Sem `console.log` em handlers de usuario.
- Salvar, carregar e copiar possuem feedback de erro/sucesso padronizado.
- API valida `contractId` e permissao.
- Frontend respeita `screenKey`/`blockKey`.
- `pnpm validate` passa.

## Validacao manual

- Abrir plano existente.
- Editar duracao/local/metodo de um dia.
- Adicionar exercicio.
- Salvar e recarregar pagina.
- Copiar semana e validar que dados foram copiados corretamente.
- Testar usuario sem permissao adequada.
