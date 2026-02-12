# Identidade Visual - training_system

Baseado no guia `🎨_Guia_de_Identidade_Visual_-_Sistema_de_Treinos.pdf`.

## Paleta principal

- Primario: `#3b82f6`
- Primario hover: `#2563eb`
- Accent roxo: `#8b5cf6`
- Accent indigo: `#6366f1`

## Cores de feedback

- Sucesso: `#22c55e`
- Sucesso hover: `#16a34a`
- Erro: `#ef4444`
- Erro hover: `#dc2626`
- Warning: `#eab308`
- Info: `#3b82f6`

## Cores de secao

- Mobilidade: `#f5f3ff`
- Sessao: `#f0fdf4`
- Resfriamento: `#eff6ff`

## Componentes

- Botao primario: azul (`#3b82f6`) com hover `#2563eb`
- Botao secundario: fundo `#f1f5f9`, hover `#e2e8f0`
- Botao destrutivo: vermelho (`#ef4444`) com hover `#dc2626`
- Botao sucesso: verde (`#22c55e`) com hover `#16a34a`

- Input normal: borda `#cbd5e1`
- Input com foco: ring azul `#3b82f6` com glow
- Input desabilitado: fundo `#f1f5f9` e texto `#94a3b8`

## Hierarquia tipografica

- 36px Bold: titulos principais
- 30px Bold: titulos de pagina
- 24px Semibold: secoes
- 20px Semibold: subtitulos
- 16px Regular: texto base
- 14px Medium: labels/formularios
- 12px Regular: metadados e ajuda

## Implementacao no frontend

- Tokens globais: `apps/web/src/index.css`
- Botao base: `apps/web/src/components/ui/Button.tsx`
- Input base: `apps/web/src/components/ui/Input.tsx`
- Card base: `apps/web/src/components/ui/Card.tsx`
