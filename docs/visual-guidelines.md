# Diretrizes visuais — Sistema Acesso

## Stack e abordagem adotada
- **Framework:** React + Vite.
- **Estilo:** Tailwind CSS com tokens centralizados em `apps/web/src/index.css` via CSS variables (HSL).
- **Diretriz:** manter uma única estratégia nativa (Tailwind + variáveis globais), sem misturar bibliotecas de tema.

## Tokens globais criados/consolidados
Arquivo: `apps/web/src/index.css`

- **Cores base da marca**
  - Preto institucional: `#000000`
  - Branco: `#FFFFFF`
  - Fundo global: `#F4F5F7`
  - Cinza de apoio: `#8A8F98`
  - Grafite: `#1B1D21`
- **Cores funcionais**
  - Primário (performance): `#22C55E`
  - Informação/agenda: `#2563EB`
  - Atenção/ocupação: `#F59E0B`
  - Erro/pendência: `#DC2626`
- **Tipografia**
  - Família principal: **Inter**
  - Pesos: 400/500/600/700
- **Sistema visual**
  - Raios (`--radius-*`)
  - Bordas (`--border`, `--input`)
  - Sombras leves (`--shadow-soft`, `--shadow-card`)

## Padrões de uso (reutilização)
- `ts-form-control`: select/input padrão.
- `ts-textarea`: textarea padrão.
- `ts-badge-*`: badges semânticos (`success`, `info`, `warning`, `danger`).
- `ts-page-heading` e `ts-page-description`: cabeçalhos de página.
- `ts-container`: container base com respiro consistente.

## Componentes padronizados
- Botões: `apps/web/src/components/ui/Button.tsx`
- Inputs: `apps/web/src/components/ui/Input.tsx`
- Cards: `apps/web/src/components/ui/Card.tsx`
- Sidebar shell/menu: `apps/web/src/components/ui/Sidebar.tsx`, `apps/web/src/components/sidebar/*`

## Navegação em abas/menu segmentado (padrão vigente)
Referência canônica: `apps/web/src/components/alunos/AlunoDetailsTabs.tsx` (barra "Aluno 360 / Fluxo técnico / Cadastro e vínculos / Conexões" da Central do Aluno). Toda nova navegação em abas ou menu segmentado do projeto deve seguir este padrão de cor e estado, em vez de estilos ad hoc.

- **Contêiner:** `rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]`, com a faixa de itens em `flex flex-wrap items-center gap-1 border-b border-border px-2 py-1`.
- **Item de nível 1 (grupo/aba):** `inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors` + foco `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
  - Inativo: `text-muted-foreground`, hover `hover:bg-accent hover:text-accent-foreground`.
  - Ativo (selecionado, menu fechado): `bg-primary/10 text-foreground` — tom suave da cor primária, **não** preenchimento sólido.
  - Aberto (submenu expandido): `bg-accent text-accent-foreground`.
- **Submenu (quando houver agrupamento):** painel `absolute … rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-card)]`; item selecionado usa o mesmo `bg-primary/10 text-foreground` do nível 1; não selecionado usa `text-popover-foreground` com hover `hover:bg-accent hover:text-accent-foreground`. Indicador de seleção: quadrado `h-5 w-5 rounded border border-border bg-card` com ícone `text-primary` quando marcado.
- **Regra de cor:** estado ativo/selecionado sempre em tom suave (`bg-primary/10`), nunca `bg-primary` sólido com texto invertido, para manter consistência com o padrão desta tela.

**Migração para o padrão vigente (issue #553):**

- `AlunoForm.tsx` e `WorkoutBuilder2/WorkoutBuilderResistance.tsx` continuam usando a variante canônica já aprovada.
- `Settings/CollaboratorFunctions.tsx`, `Settings/ServicesCatalog.tsx` e `WorkoutBuilder/index.tsx` adotaram `ts-tabs-bar`, `ts-tab-button` e as variantes `ts-tab-button-active` / `ts-tab-button-inactive`.
- `PublicPreRegistration/PublicPreRegistration.tsx` usa os mesmos estados na escolha entre entrada e criação de acesso, sem alterar o conteúdo do fluxo público.
- `PhysicalAssessment/CapacityPrescriptionScreen.tsx` adota `ts-tab-tile` e `ts-tab-tile-active`, variante de seleção em grade com textos e status multilinha e fundo primário suave.
- O estilo genérico `[role='tablist'] > [role='tab']` foi removido do CSS global. Não adicionar CSS sem escopo por role: a variante em grade e o pré-cadastro público têm composições próprias.
- Nas abas sequenciais, `ArrowLeft`, `ArrowRight`, `Home` e `End` mudam foco e seleção por `handleTabListKeyDown` em `apps/web/src/utils/tabKeyboard.ts`. Grades com regras específicas preservam seu manipulador próprio.

## Padrão de largura fluida e respiro lateral (issue #553)

- **Shell autenticado:** `ts-container` não tem limite máximo fixo. Mantém margens internas responsivas de **16 px no mobile, 24 px a partir de `sm` e 32 px a partir de `xl`**; menu lateral e `main` usam `min-w-0` para caberem no mesmo fluxo.
- **Consultas e telas densas:** listas, tabelas, painéis analíticos, montagens e editores multicoluna usam `ts-content-fluid` (100% da largura disponível). Não impor `max-w-*` arbitrário só por estética.
- **Formulários de leitura sequencial:** manter limite coerente como `ts-content-readable` (`max-w-5xl`), ou largura menor quando necessário. Essa restrição intencional não deve ser confundida com espaço desperdiçado.
- **Exemplos migrados:** Biblioteca de Exercícios, Montagem de Treinos 2 e editor de permissões de funções de colaboradores aproveitam o espaço disponível; abas de dados/visão continuam em layout responsivo.
- **Tabelas no mobile:** rolagem horizontal, quando inevitável, dentro do contêiner da tabela; não causar rolagem horizontal acidental no documento.
- **Critérios visuais de aceite:** validar mudanças em `390x844`, `1366x768`, `1440x900` e `1920x1080`, incluindo conteúdo longo, hover, foco por teclado, estados selecionado/desabilitado, menus, formulários e diálogos pertinentes.
- **Auditoria:** por critério, registrar rota, estado, SHA, viewport, ação e evidência verificável. Teste estático e CI verde não substituem inspeção visual no navegador quando exigida. Não marcar checkbox de aceite apenas por declaração textual.

## Evidência visual da issue #553 — largura e navegação

A CI CRITICAL executa `apps/web/src/pages/issue-553-visual-browser.test.js` com Chromium real e fixtures de API isoladas, autenticando um professor sintético e mantendo o pré-cadastro como rota pública. O teste coleta as quatro resoluções `390x844`, `1366x768`, `1440x900` e `1920x1080` para Biblioteca (incluindo editor), Funções/Permissões, Catálogo (incluindo criação), pré-cadastro, prescrição por capacidades e Workout Builder legado. O componente legado, que não possui rota ativa em `App.tsx`, é montado em uma fixture Vite exclusiva de testes; nenhuma rota pública é acrescentada à aplicação.

O fluxo de Montagem de Treinos 2 é validado na mesma CI pelo harness existente `issue-399-full-page-browser-evidence.test.js`, ampliado também para 1366 e 1920 pixels. As evidências exatas da issue #553 são publicadas em `artifacts/issue-553/visual-matrix.json` com rota, cenário, SHA do commit, dados sintéticos, viewport, ações de teclado, estados de filtro e captura PNG com SHA-256; o Workout Builder 2 publica adicionalmente `artifacts/issue-399/full-page-browser.json` e as respectivas capturas.

A prova usa UI real do frontend no Vite e simula respostas na fronteira HTTP, portanto **não** comprova integração com a API real nem substitui homologação humana de aparência, contraste e operações persistidas. Falha de renderização, overflow horizontal do documento, navegação, filtros ou erro de JavaScript reprova o teste. É obrigatório conferir o artefato no HEAD da PR antes de marcar AC-04/AC-05.

## Validação permanente — parâmetros de treino

A rota `/settings/parameters` possui um validador permanente em navegador real: `apps/api/scripts/visual-audit-settings-parameters.mjs`. No workflow `.github/workflows/validate-pr.yml`, esse harness roda somente no perfil `CRITICAL`, depois do build e com o Chrome instalado via Puppeteer. Screenshots, árvore de acessibilidade, diagnósticos, `visual-metrics.json` e a evidência exact-head `orquestrador-artifact.json` são publicados juntos no artefato `validate-pr-critical-${head_sha}`; os arquivos visuais ficam sob `artifacts/settings-parameters-visual/**` dentro desse artefato.

O contrato visual da rota cobre:

- viewports `1920x1080`, `1440x900`, `1366x768` e `390x844`;
- conteúdo longo e ausência de overflow horizontal acidental no documento;
- scroll horizontal deliberado restrito ao contêiner da tabela em mobile;
- fluxo de criação e cancelamento de edição por teclado, incluindo restauração lógica de foco;
- validação e foco no primeiro campo obrigatório inválido;
- bloqueio de submissão repetida enquanto o salvamento está em andamento, comprovando exatamente uma chamada de criação;
- Accordion de gestão de categorias recolhido por padrão e operável por teclado;
- captura da árvore de acessibilidade e screenshots dos estados de lista e editor mobile.

Execução local equivalente, com dependências e Chrome disponíveis:

`pnpm --filter @corrida/web build && pnpm --filter @corrida/api exec puppeteer browsers install chrome && pnpm --filter @corrida/api exec node scripts/visual-audit-settings-parameters.mjs`

## Workout Builder — Treinamento Resistido

Componente: `apps/web/src/pages/WorkoutBuilder2/WorkoutBuilderResistance.tsx`.

- Um dia por vez: seletor de dias (Seg–Dom, data, contagem de exercícios e cadeado quando somente leitura) acima das seções Mobilidade, Sessão e Resfriamento empilhadas. O dia escolhido é compartilhado entre as semanas visíveis da página.
- O treino cíclico do dia aparece uma única vez, no cabeçalho do dia.
- Em telas `xl` (≥1280 px) cada exercício ocupa uma linha com cabeçalho de colunas; abaixo disso vira um bloco com rótulos visíveis por campo, sem overflow horizontal no documento.
- Dias fora do período do plano ficam dentro de um `fieldset disabled`, o que bloqueia mouse e teclado; não usar apenas `pointer-events-none`/opacidade para bloquear edição.
- Preenchimento rápido aplica somente os campos preenchidos; campos vazios mantêm o valor atual de cada exercício.
- Zona de repetições da semana aparece como `placeholder` quando o exercício não tem repetições salvas, nunca como valor.
- Excluir exercício pede confirmação.

## Onde trocar o logo
1. Copie o arquivo oficial para:
   - `apps/web/public/brand/acesso-logo.jpg`
2. O logo já está referenciado em:
   - `apps/web/src/components/auth/AuthCardLayout.tsx`

## Como manter consistência nas próximas features
1. Sempre usar tokens e utilitários globais existentes antes de criar classes novas.
2. Evitar hex solto em componente; priorizar variáveis/tokens.
3. Reaproveitar `Button`, `Input`, `Card` e utilitários `ts-*`.
4. Manter textos e labels em pt-BR.
5. Não alterar regras de negócio ao fazer ajustes visuais.
6. Para qualquer navegação em abas/menu segmentado, seguir o padrão descrito em "Navegação em abas/menu segmentado (padrão vigente)", usando `AlunoDetailsTabs.tsx` como referência de cor e estado.
7. Preferir largura fluida para telas de dados densos e largura de leitura para formulários; evitar `max-w-*` desnecessário.
8. Auditar alterações visuais em viewport ampla, desktop comum e mobile, com foco por teclado e evidência do HEAD exato.
