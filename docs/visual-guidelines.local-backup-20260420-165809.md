# Diretrizes Visuais — Sistema Acesso

> **Marca:** Sistema Acesso Saúde e Performance  
> **Conceito:** Gestão em Movimento  
> **Direção visual:** clean + tecnológico + premium + funcional

---

## 1. Tokens de Design

Todos os tokens ficam em `apps/web/src/index.css` como CSS custom properties e são mapeados em `apps/web/tailwind.config.js`.

### Paleta Principal

| Token | Variável CSS | Cor Hex | Uso |
|---|---|---|---|
| `--background` | `bg-background` | `#F4F5F7` | Fundo geral das páginas |
| `--foreground` | `text-foreground` | `#1B1D21` | Texto principal (grafite profundo) |
| `--card` | `bg-card` | `#FFFFFF` | Cards e superfícies brancas |
| `--primary` | `bg-primary` | `#22C55E` | Botão primário, ações principais (verde performance) |
| `--primary-hover` | `bg-primary-hover` | `#16A34A` | Hover do botão primário |
| `--destructive` | `bg-destructive` | `#DC2626` | Erro, exclusão, pendência |
| `--success` | `bg-success` | `#22C55E` | Sucesso, status ativo |
| `--warning` | `bg-warning` | `#F59E0B` | Atenção, ocupação |
| `--info` | `bg-info` | `#2563EB` | Informativo, agenda, calendário |
| `--muted-foreground` | `text-muted-foreground` | `#8A8F98` | Texto secundário |
| `--sidebar` | `bg-sidebar` | `#1B1D21` | Menu lateral (grafite profundo) |

### Paleta Funcional (semântica)

| Situação | Cor token | Exemplo de classe |
|---|---|---|
| Sucesso / ativo | `success` | `bg-success/10 text-success` |
| Informação / agenda | `info` | `bg-info/10 text-info` |
| Atenção / ocupação | `warning` | `bg-warning/10 text-warning` |
| Erro / pendência | `destructive` | `bg-destructive/10 text-destructive` |

### Bordas, raios e sombras

| Token | Valor | Classe Tailwind |
|---|---|---|
| `--radius` | `0.5rem` (8px) | `rounded-lg` |
| `--border` | `#E3E5E9` | `border-border` |
| `shadow-card` | `0 1px 3px rgba(0,0,0,0.06)` | `shadow-card` |
| `shadow-card-hover` | `0 4px 12px rgba(0,0,0,0.08)` | `shadow-card-hover` |

---

## 2. Tipografia

**Fonte:** Inter (Google Fonts)  
**Carregada em:** `apps/web/index.html` + `body { font-family }` em `index.css`

| Classe utilitária | Tamanho | Peso | Uso |
|---|---|---|---|
| `ts-h1` | 36px | 700 | Títulos de seção grandes |
| `ts-h2` | 30px | 700 | Subtítulos |
| `ts-h3` | 24px | 600 | Headers de card |
| `ts-h4` | 20px | 600 | Subheaders |
| `ts-body` | 16px | 400 | Texto corrido |
| `ts-label` | 14px | 500 | Labels de formulário, menus |
| `ts-meta` | 12px | 400 | Metadados, timestamps |
| `ts-kpi` | 28px | 700 | Números KPI no dashboard |

---

## 3. Componentes Padronizados

Todos em `apps/web/src/components/ui/`:

### Button (`Button.tsx`)

| Variante | Aparência |
|---|---|
| `default` | Fundo verde (primary), texto branco |
| `destructive` | Fundo vermelho, texto branco |
| `success` | Fundo verde, texto branco |
| `outline` | Borda neutra, fundo transparente |
| `secondary` | Fundo cinza claro |
| `ghost` | Transparente, hover sutil |
| `link` | Texto verde, sublinhado no hover |

### Input (`Input.tsx`)

- Altura `h-11`, `rounded-lg`, `border-input`
- Focus: `ring-ring` (verde)
- Error: `border-destructive`
- Disabled: `bg-muted`, `text-muted-foreground`

### Card (`Card.tsx`)

- `rounded-lg`, `border-border`, `shadow-card`
- Fundo branco (`bg-card`)

---

## 4. Layout

### Sidebar (menu lateral)

- **Fundo:** grafite profundo (`bg-sidebar` / `#1B1D21`)
- **Texto:** branco (`text-sidebar-foreground`)
- **Item ativo:** verde (`bg-sidebar-accent`)
- **Hover:** grafite mais claro (`bg-sidebar-muted`)
- **Logo:** posicionado no topo com respiro

### Header/Topbar

- Fundo branco (`bg-card`), borda inferior sutil
- Altura `h-14`
- Perfil do usuário à direita, botão logout

### Área de conteúdo

- Fundo `bg-background` (`#F4F5F7`)
- Padding `px-6 py-6`

---

## 5. Logo

**Arquivo:** `apps/web/public/logo.jpg`  
**Origem:** `logo/Acesso_Consultoria.jpg`

### Uso no sistema

| Local | Tratamento |
|---|---|
| Sidebar | Versão clara (com `brightness-0 invert` se necessário) |
| Login (painel esquerdo) | Versão branca sobre fundo escuro |
| Fundo claro | Versão original (escura) |

**Regras:**
- Não alterar, recortar ou recolorir fora das versões monocromáticas
- Manter área de respiro adequada
- Não criar novo logo

---

## 6. Manutenção Futura

### Para adicionar novas cores

1. Adicione a variável HSL em `:root` no `index.css`
2. Mapeie no `tailwind.config.js` dentro de `theme.extend.colors`
3. Use via classe Tailwind: `bg-nome`, `text-nome`, etc.

### Para novos componentes

1. Crie em `components/ui/`
2. Use tokens existentes (nunca hardcode hex)
3. Use `cn()` para merge de classes
4. Siga o padrão `forwardRef` dos componentes existentes

### Badges de status

```tsx
// Sucesso
<span className="bg-success/10 text-success px-2 py-1 rounded-full text-xs">Ativo</span>

// Informativo
<span className="bg-info/10 text-info px-2 py-1 rounded-full text-xs">Agendado</span>

// Atenção
<span className="bg-warning/10 text-warning px-2 py-1 rounded-full text-xs">Pendente</span>

// Erro
<span className="bg-destructive/10 text-destructive px-2 py-1 rounded-full text-xs">Atrasado</span>
```

### Checklist para novas telas

- [ ] Fundo da página: `bg-background`
- [ ] Cards: componente `<Card>` (não divs soltas)
- [ ] Botões: componente `<Button>` com variante correta
- [ ] Inputs: componente `<Input>` (não `<input>` puro)
- [ ] Status: badges com cores semânticas (success/info/warning/destructive)
- [ ] Texto: `text-foreground` (principal), `text-muted-foreground` (secundário)
- [ ] KPIs: classe `ts-kpi` para números grandes
- [ ] Sem hex hardcoded nas classes

---

## 7. Dark Mode

O sistema mantém suporte a dark mode via classe `.dark` no HTML.  
Os tokens se ajustam automaticamente. Não é necessário usar `dark:` variants para cores dos tokens.

---

## 8. Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/index.css` | CSS variables (design tokens) |
| `apps/web/tailwind.config.js` | Mapeamento Tailwind dos tokens |
| `apps/web/src/components/ui/Button.tsx` | Botão padrão |
| `apps/web/src/components/ui/Input.tsx` | Input padrão |
| `apps/web/src/components/ui/Card.tsx` | Card padrão |
| `apps/web/src/components/ui/Sidebar.tsx` | Shell do sidebar |
| `apps/web/src/components/sidebar/Sidebar.tsx` | AppSidebar com logo |
| `apps/web/src/components/sidebar/SidebarMenuItem.tsx` | Items do menu |
| `apps/web/src/layouts/DashboardLayout.tsx` | Layout principal |
| `apps/web/src/components/auth/AuthCardLayout.tsx` | Layout login/registro |
