# Arquivo historico: checklist manual da Biblioteca de Exercicios

> Este documento foi preservado em `docs/archive/` durante a faxina tecnica de documentacao.
>
> O caminho anterior era `docs/CHECKLIST_TESTES_BIBLIOTECA.md`.
>
> Fontes de verdade atuais:
>
> - `docs/execution-plans/active/2026-05-library-module-debt.md`
> - `docs/quality/validation.md`
> - `docs/architecture/web.md`

---

# Checklist de Testes - Biblioteca de Exercicios

> Documento complementar de checklist manual.
>
> Fontes de verdade atuais:
>
> - `docs/execution-plans/active/2026-05-library-module-debt.md`
> - `docs/quality/validation.md`
> - `docs/architecture/web.md`
>
> Use este arquivo como apoio de validacao manual para a tela de Biblioteca. Para criterios atuais de PR e comandos obrigatorios, prefira as fontes acima.

## Objetivo
Validar todas as funcionalidades implementadas na tela de Biblioteca de Exercicios.

---

## Testes Funcionais

### 1. Filtros

#### 1.1 Filtro por Busca
- [ ] Buscar por nome de exercicio
- [ ] Buscar por grupo muscular
- [ ] Verificar resultados em tempo real
- [ ] Testar com termos parciais
- [ ] Testar com termos inexistentes

#### 1.2 Filtro por Categoria
- [ ] Filtrar por MOBILIDADE
- [ ] Filtrar por RESISTIDO
- [ ] Filtrar por CICLICO
- [ ] Verificar opcao "Todas"

#### 1.3 Filtro por Grupo Muscular (NOVO)
- [ ] Filtrar por cada um dos 16 grupos musculares
- [ ] Verificar opcao "Todos"
- [ ] Validar lista ordenada alfabeticamente

#### 1.4 Filtro por Tipo de Carga
- [ ] Filtrar por Halteres (H)
- [ ] Filtrar por Corporal (C)
- [ ] Filtrar por Elasticos (E)
- [ ] Filtrar por Aerobicos (A)
- [ ] Filtrar por P.S. (P)
- [ ] Filtrar por Outros (O)

#### 1.5 Filtro por Movimento
- [ ] Filtrar por Unilateral (U)
- [ ] Filtrar por Isolado (I)
- [ ] Filtrar por Outros/Bilateral (O)

#### 1.6 Filtro por Contagem
- [ ] Filtrar por Isometria (I)
- [ ] Filtrar por Tempo (T)
- [ ] Filtrar por Repeticoes (R)

#### 1.7 Combinacao de Filtros
- [ ] Aplicar 2 filtros simultaneamente
- [ ] Aplicar 3+ filtros simultaneamente
- [ ] Verificar resultados corretos

#### 1.8 Gerenciamento de Filtros (NOVO)
- [ ] Verificar contador de filtros ativos no badge
- [ ] Clicar em "Limpar Filtros"
- [ ] Validar que todos os filtros foram removidos
- [ ] Verificar que botao "Limpar" desaparece quando nao ha filtros

---

### 2. Painel de Estatisticas (NOVO)

#### 2.1 Cards de Metricas
- [ ] Verificar "Total de Exercicios" correto
- [ ] Verificar "Com Video" correto
- [ ] Verificar percentual de videos correto
- [ ] Verificar "Sem Video" correto
- [ ] Verificar "Grupos Musculares" correto

#### 2.2 Grafico de Distribuicao por Categoria
- [ ] Verificar barras de progresso renderizadas
- [ ] Validar percentuais corretos
- [ ] Verificar cores diferenciadas por categoria
- [ ] Testar com filtros aplicados

#### 2.3 Grafico Top 5 Grupos Musculares
- [ ] Verificar top 5 grupos corretos
- [ ] Validar ordem decrescente
- [ ] Verificar percentuais corretos
- [ ] Verificar cores em gradiente

#### 2.4 Atualizacao Dinamica
- [ ] Aplicar filtro e verificar atualizacao das estatisticas
- [ ] Remover filtro e verificar retorno aos valores totais
- [ ] Testar com diferentes combinacoes de filtros

---

### 3. Visualizacao de Videos (NOVO)

#### 3.1 Formatos de URL Suportados
- [ ] Testar URL: `https://www.youtube.com/watch?v=VIDEO_ID`
- [ ] Testar URL: `https://youtu.be/VIDEO_ID`
- [ ] Testar URL: `https://www.youtube.com/embed/VIDEO_ID`
- [ ] Testar URL: `https://www.youtube.com/shorts/VIDEO_ID`

#### 3.2 Validacao de URL
- [ ] Testar URL invalida (nao YouTube)
- [ ] Testar URL vazia
- [ ] Verificar mensagem de erro apropriada

#### 3.3 Preview no Modal
- [ ] Abrir modal em modo "Criar" e adicionar URL
- [ ] Verificar preview instantaneo
- [ ] Abrir modal em modo "Editar" com video existente
- [ ] Verificar preview carregado
- [ ] Abrir modal em modo "Visualizar"
- [ ] Verificar video exibido corretamente

#### 3.4 Player de Video
- [ ] Verificar aspect ratio 16:9
- [ ] Testar play/pause
- [ ] Testar controles do YouTube
- [ ] Verificar responsividade

---

### 4. CRUD de Exercicios

#### 4.1 Criar Exercicio
- [ ] Clicar em "Novo Exercicio"
- [ ] Preencher nome (obrigatorio)
- [ ] Adicionar URL de video
- [ ] Selecionar categoria
- [ ] Preencher grupo muscular
- [ ] Selecionar tipo de carga
- [ ] Selecionar tipo de movimento
- [ ] Selecionar tipo de contagem
- [ ] Adicionar observacoes
- [ ] Salvar e verificar na lista

#### 4.2 Visualizar Exercicio
- [ ] Clicar no icone de olho (Eye)
- [ ] Verificar todos os campos exibidos
- [ ] Verificar video exibido (se houver)
- [ ] Verificar campos desabilitados
- [ ] Fechar modal

#### 4.3 Editar Exercicio
- [ ] Clicar no icone de editar (Edit)
- [ ] Modificar nome
- [ ] Modificar URL de video
- [ ] Modificar outros campos
- [ ] Salvar e verificar alteracoes

#### 4.4 Excluir Exercicio
- [ ] Clicar no icone de excluir (Trash2)
- [ ] Verificar mensagem de confirmacao
- [ ] Confirmar exclusao
- [ ] Verificar remocao da lista
- [ ] Testar cancelar exclusao

---

### 5. Melhorias de UX (NOVO)

#### 5.1 Loading States
- [ ] Verificar skeleton durante carregamento inicial
- [ ] Verificar animacao de pulse
- [ ] Verificar transicao suave para conteudo

#### 5.2 Empty States
- [ ] Verificar estado vazio sem filtros
- [ ] Verificar mensagem "Biblioteca vazia"
- [ ] Verificar botao "Adicionar Primeiro Exercicio"
- [ ] Aplicar filtros que nao retornam resultados
- [ ] Verificar mensagem "Nenhum exercicio encontrado"
- [ ] Verificar ausencia do botao de adicionar

#### 5.3 Indicadores Visuais
- [ ] Verificar icone verde de video ao lado dos exercicios
- [ ] Verificar tooltip "Com video"
- [ ] Verificar hover states nas linhas da tabela
- [ ] Verificar transicoes suaves

#### 5.4 Atalhos de Teclado
- [ ] Abrir modal e pressionar ESC
- [ ] Verificar fechamento do modal
- [ ] Abrir modal em modo criar/editar
- [ ] Preencher campos e pressionar Ctrl+S (ou Cmd+S)
- [ ] Verificar salvamento do exercicio
- [ ] Verificar dica visual no header do modal

#### 5.5 Interacoes
- [ ] Clicar fora do modal (no overlay)
- [ ] Verificar fechamento do modal
- [ ] Verificar feedback visual em botoes ao hover
- [ ] Verificar animacoes suaves

---

## Testes de Responsividade

### Desktop (1920x1080)
- [ ] Verificar layout completo
- [ ] Verificar grid de estatisticas (4 colunas)
- [ ] Verificar grid de filtros (5 colunas)
- [ ] Verificar tabela completa

### Tablet (768x1024)
- [ ] Verificar grid de estatisticas (2 colunas)
- [ ] Verificar grid de filtros (3 colunas)
- [ ] Verificar tabela com scroll horizontal

### Mobile (375x667)
- [ ] Verificar grid de estatisticas (1 coluna)
- [ ] Verificar grid de filtros (1 coluna)
- [ ] Verificar tabela com scroll horizontal
- [ ] Verificar modal responsivo
- [ ] Verificar botoes touch-friendly

---

## Testes de Integracao

### API Backend
- [ ] Verificar listagem de exercicios
- [ ] Verificar filtros aplicados na API
- [ ] Verificar criacao de exercicio
- [ ] Verificar atualizacao de exercicio
- [ ] Verificar exclusao de exercicio
- [ ] Verificar tratamento de erros

### Performance
- [ ] Carregar 197 exercicios
- [ ] Verificar tempo de renderizacao
- [ ] Aplicar filtros e medir resposta
- [ ] Verificar uso de memoria
- [ ] Testar scroll suave na tabela

---

## Testes de Edge Cases

### Dados
- [ ] Exercicio sem nome
- [ ] Exercicio sem video
- [ ] Exercicio sem categoria
- [ ] Exercicio sem grupo muscular
- [ ] URL de video malformada
- [ ] Caracteres especiais no nome

### Filtros
- [ ] Busca com caracteres especiais
- [ ] Busca com espacos multiplos
- [ ] Filtros que nao retornam resultados
- [ ] Todos os filtros aplicados simultaneamente

### Modal
- [ ] Abrir modal sem fechar o anterior
- [ ] Tentar salvar sem preencher nome
- [ ] Modificar e tentar fechar sem salvar
- [ ] Pressionar ESC durante salvamento

---

## Checklist de Validacao Final

- [ ] Todas as funcionalidades implementadas estao funcionando
- [ ] Nao ha erros no console do navegador
- [ ] Nao ha warnings de TypeScript
- [ ] Layout responsivo em todas as resolucoes
- [ ] Animacoes suaves e sem travamentos
- [ ] Feedback visual em todas as acoes
- [ ] Tratamento de erros apropriado
- [ ] Codigo commitado e pushed para GitHub
- [ ] Documentacao atualizada

---

## Resultado dos Testes

**Data:** ___/___/______  
**Testador:** _________________  
**Ambiente:** _________________

**Total de Testes:** ___  
**Testes Passados:** ___  
**Testes Falhados:** ___  
**Taxa de Sucesso:** ___%

---

## Bugs Encontrados

| # | Descricao | Severidade | Status |
|---|-----------|------------|--------|
| 1 |           |            |        |
| 2 |           |            |        |
| 3 |           |            |        |

**Severidade:** Critica / Alta / Media / Baixa

---

## Observacoes

_Adicione aqui quaisquer observacoes, sugestoes ou comentarios sobre os testes._

---

**Status Final:** [ ] Aprovado [ ] Reprovado [ ] Aprovado com ressalvas
