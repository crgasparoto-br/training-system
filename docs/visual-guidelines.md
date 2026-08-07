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

**Status de migração:** as classes utilitárias legadas `ts-tab-button` / `ts-tab-button-active` / `ts-tab-button-inactive`, além da regra genérica `[role='tablist'] > [role='tab']` (`apps/web/src/index.css`), ainda usam o padrão antigo (borda + fundo sólido `bg-primary` no estado ativo). Esse padrão é considerado legado: novas telas não devem usá-lo.

- ✅ Migrado: `apps/web/src/pages/AlunoForm.tsx` (guias do cadastro do aluno, `/alunos/new` e `/alunos/:id/edit`). Como a regra genérica `[role='tablist'] > [role='tab']` tem especificidade maior que utilitárias Tailwind de uma classe só (ex.: `bg-primary/10`), a migração precisou de um seletor com especificidade equivalente para vencer o cascade: `#aluno-form-tablist > [role='tab']` em `index.css`, escopado pelo `id="aluno-form-tablist"` do contêiner `role="tablist"`. Esse é o padrão a repetir ao migrar as demais telas.
- ⏳ Pendente: `CollaboratorFunctions.tsx`, `ServicesCatalog.tsx`, `WorkoutBuilder/index.tsx`, `PublicPreRegistration.tsx`, `CapacityPrescriptionScreen.tsx` — ainda no padrão legado.

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
