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
