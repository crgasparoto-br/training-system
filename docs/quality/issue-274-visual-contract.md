# Contrato visual e de acessibilidade — Issue 274

## Rota

- **Rota:** `/pre-matriculas/:id`
- **Superfície:** revisão de identidade e confirmação da pré-matrícula
- **Componente:** `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx`
- **Seletor de prontidão:** texto `Identidade e duplicidades`

## Validação permanente

- **Validador:** `apps/api/scripts/issue-274-visual-evidence.mjs`
- **Workflow:** `.github/workflows/issue-274-visual-evidence.yml`
- **Métricas:** `artifacts/issue-274-visual/visual-metrics.json`
- **Relatório:** `artifacts/issue-274-visual/visual-report.json`
- **Árvore de acessibilidade:** `artifacts/issue-274-visual/accessibility-tree.json`

O validador usa a aplicação Vite real, a rota real e respostas HTTP controladas. Não renderiza uma réplica estática do componente.

## Viewports e conteúdo extremo

- desktop: `1440x900`;
- tablet: `1024x768`;
- mobile: `390x844`;
- nome e observações extensos para validar quebra de linha e ausência de overflow;
- estado de erro em mobile;
- screenshots full-page em todos os cenários.

## Controles

| Nome | Seletor do validador | Papel | Teclas obrigatórias |
|---|---|---|---|
| Atualizar revisão | `[data-visual-control="refresh"]` | `button` | Enter, Espaço |
| Voltar para lista | `[data-visual-control="back"]` | `link` | Enter |
| Selecionar candidato | `[data-visual-control="candidate"]` | `radio` | Espaço |
| Decisão por campo | `[data-visual-control^="decision-"]` | `combobox` | Seta para baixo, Enter |
| Motivo | `[data-visual-control="reason"]` | `textbox` | Tab, entrada de texto |

Os atributos `data-visual-control` são adicionados somente pelo validador em runtime e não alteram o código de produção.

## Superfícies dinâmicas

- aviso de cadastros fora do escopo, `role="status"`;
- erro de carregamento, `role="alert"`;
- carregamento inicial textual antes da resposta da API.

Os escritores são os estados locais `notice`, `error` e `loading` do componente. Não há tabela semântica nem diálogo modal nesta rota.

## Critérios

1. Nenhum viewport apresenta overflow horizontal.
2. Seções de identificação, duplicidade, histórico e pós-matrícula permanecem visíveis.
3. Aviso de escopo restrito e alerta de PAR-Q permanecem legíveis.
4. Todos os controles listados respondem às teclas definidas.
5. A árvore de acessibilidade é capturada e não fica vazia.
6. O estado de erro oferece `Tentar novamente` sem overflow.
7. O artefato contém `orquestrador-artifact.json` schema 2 com hashes, comandos, códigos de saída e ligações bidirecionais entre checks e resultados.
