# Plano: Issue #553 — largura fluida e consistência visual web

## Objetivo
Aproveitar a largura dos monitores em telas densas, manter formulários legíveis e padronizar abas com evidências de quatro resoluções.

## Contexto
- Issue: https://github.com/crgasparoto-br/training-system/issues/553
- Fontes: `docs/visual-guidelines.md` e `design-interface/SKILL.md` no repositório `crgasparoto-br/skill` branch `develop`.
- Base: `develop`; não fazer merge sem autorização.

## Fora de escopo
- Mudar autorização, persistência, APIs, contratos e regras de negócio.
- Expandir formulários estreitos indiscriminadamente ou remover arquivos.
- Declarar auditoria independente no contexto da implementação.

## Arquivos e módulos principais
- `apps/web/src/index.css` e `apps/web/src/layouts/DashboardLayout.tsx`.
- Biblioteca, Workout Builder 2, funções de colaboradores e cinco superfícies de abas documentadas.
- `apps/web/src/utils/tabKeyboard.ts`, testes e `apps/api/scripts/visual-audit-settings-parameters.mjs`.

## Passos de implementação
- [x] Inventariar limites horizontais e conflitos de aba.
- [x] Aplicar largura fluida no shell e nas telas densas mantendo formulários legíveis.
- [x] Migrar os cinco grupos de seleção e criar tratamento de teclado compartilhado.
- [x] Atualizar documentação e ampliar harness para 1920x1080.
- [ ] Obter `pnpm validate`/build verdes na CI para o SHA material.
- [ ] Conferir artefatos reais de navegador para largura, teclado, overflow e estados pertinentes.
- [ ] Obter auditoria independente sobre SHA congelado antes de aprovação operacional.

## Critérios de aceite
Confrontar individualmente AC-01 a AC-07 da issue com prova verificável; marcar cada checkbox somente quando atendido. Verificação estática de classes não prova aparência real da rota.

## Validação manual
Visitar Biblioteca, Montagem de Treinos 2, permissões de colaboradores, Catálogo, cadastro, pré-cadastro e prescrição de capacidades em 390x844, 1366x768, 1440x900 e 1920x1080. Verificar foco e seleção com setas/Home/End, botões, longos conteúdos, modais, rolagem de tabelas e ausência de overflow do documento.

## Decisões e pendências
Preservar a composição própria das telas públicas e a variante em grade de capacidades; apenas o estado visual selecionado é compartilhado. Inspeção visual de rotas autenticadas e aprovação independente são gates distintos dos testes estáticos.
