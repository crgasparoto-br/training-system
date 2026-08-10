# Contrato visual e de acessibilidade — Issue 274

## Rota

- **Rota:** `/pre-matriculas/:id`
- **Superfície:** revisão de identidade e confirmação da pré-matrícula
- **Componente principal:** `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx`
- **Componente de remediação:** `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetailRemediated.tsx`
- **Seletor de prontidão:** texto `Identidade e duplicidades`

## Validação permanente

### Contrato principal

- **Validador:** `apps/api/scripts/issue-274-visual-evidence.mjs`
- **Workflow:** `.github/workflows/issue-274-visual-evidence.yml`
- **Métricas:** `artifacts/issue-274-visual/visual-metrics.json`
- **Relatório:** `artifacts/issue-274-visual/visual-report.json`
- **Árvore de acessibilidade:** `artifacts/issue-274-visual/accessibility-tree.json`

### Remediações AUD-274-17 a AUD-274-19

- **Validador:** `apps/api/scripts/issue-274-remediation-visual-evidence.mjs`
- **Workflow:** `.github/workflows/issue-274-remediation-evidence.yml`
- **Relatório:** `artifacts/issue-274-remediation-visual/remediation-visual-report.json`
- **Cenários:** pendências bloqueantes e informativas, revisão sem duplicidade, confirmação explícita em `READY_FOR_ENROLLMENT` e erro de concorrência sanitizado.

Os validadores usam a aplicação Vite real, a rota real e respostas HTTP controladas. Não renderizam uma réplica estática do componente.

## Viewports e conteúdo extremo

- desktop: `1440x900`;
- tablet: `1024x768`;
- mobile: `390x844`;
- nome e observações extensos para validar quebra de linha e ausência de overflow;
- estados de erro e concorrência em mobile;
- screenshots full-page em todos os cenários;
- confirmação explícita exercitada por clique antes de validar a habilitação da ação final.

## Matriz de cenários

| Cenário | Estado | Evidência obrigatória |
|---|---|---|
| Duplicidade bloqueante | `PRE_REGISTRATION_COMPLETED` | candidato mascarado, decisão por campo e restrição de escopo |
| Pendências cadastrais | `PRE_REGISTRATION_COMPLETED` | lista de itens, distinção bloqueante/informativa e acesso à edição |
| Revisão limpa | `PRE_REGISTRATION_COMPLETED` | ausência de candidatos e ação de prontidão visível |
| Confirmação | `READY_FOR_ENROLLMENT` | checkbox explícito e botão habilitado somente após aceite |
| Concorrência | erro `CONCURRENT_MODIFICATION` | mensagem funcional sem `P2034`, Prisma ou SQL interno |

## Controles

| Nome | Seletor do validador | Papel | Teclas obrigatórias |
|---|---|---|---|
| Atualizar revisão | `[data-visual-control="refresh"]` | `button` | Enter, Espaço |
| Voltar para lista | `[data-visual-control="back"]` | `link` | Enter |
| Selecionar candidato | `[data-visual-control="candidate"]` | `radio` | Espaço |
| Decisão por campo | `[data-visual-control^="decision-"]` | `combobox` | Seta para baixo, Enter |
| Motivo | `[data-visual-control="reason"]` | `textbox` | Tab, entrada de texto |
| Confirmação da matrícula | `input[type="checkbox"]` | `checkbox` | Espaço |

Os atributos `data-visual-control` são adicionados somente pelo validador em runtime e não alteram o código de produção.

## Superfícies dinâmicas

- aviso de cadastros fora do escopo, `role="status"`;
- erro de carregamento ou concorrência, `role="alert"`;
- região `Pendências para matrícula`, com rótulo acessível;
- carregamento inicial textual antes da resposta da API.

Os escritores são os estados locais `notice`, `error`, `loading` e `pendencies` dos componentes. Não há tabela semântica nem diálogo modal nesta rota.

## Critérios

1. Nenhum viewport apresenta overflow horizontal.
2. Seções de identificação, duplicidade, histórico e pós-matrícula permanecem visíveis.
3. Aviso de escopo restrito, pendências e alerta de PAR-Q permanecem legíveis.
4. Todos os controles listados respondem às teclas definidas.
5. A árvore de acessibilidade é capturada e não fica vazia.
6. O estado de erro oferece `Tentar novamente` sem overflow e sem detalhes internos do banco.
7. A confirmação da matrícula permanece desabilitada até o aceite explícito.
8. O artefato principal contém `orquestrador-artifact.json` schema 2 com hashes, comandos, códigos de saída e ligações bidirecionais entre checks e resultados.
9. O artefato de remediação registra SHA do HEAD, rota, viewport, asserções e SHA-256 de cada screenshot.
