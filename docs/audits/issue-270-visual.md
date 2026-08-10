# Auditoria visual — issue 270

Data: 2026-07-22

Branch auditada: `feat/270-pre-registration-admin`

Pull request: #280

Workflow de evidência: `Visual Audit Issue 270`, execução `29965786550`

Artifact: `issue-270-visual-29965786550`

## Superfícies verificadas

Foram renderizadas e inspecionadas as rotas abaixo em `1440 × 900` e `390 × 844`:

- `/pre-matriculas`;
- `/pre-matriculas/nova`;
- `/pre-matriculas/lead-1`;
- `/pre-matriculas/lead-1/editar`.

## Parecer

A interface foi aprovada sem ressalvas visuais bloqueantes.

## Verificações

| Critério | Resultado |
| --- | --- |
| Hierarquia entre título, descrição, filtros, dados e ações | Aprovado |
| Lista compacta no desktop | Aprovado |
| Conversão da tabela em cartões no mobile | Aprovado |
| Leitura dos formulários em uma coluna no mobile | Aprovado |
| Agrupamento de identificação e acompanhamento comercial | Aprovado |
| Destaque da próxima ação | Aprovado |
| Separação entre resumo, convite, progresso, pendências e histórico | Aprovado |
| Legibilidade de status e alertas do PAR-Q | Aprovado |
| Confirmações de ações destrutivas | Aprovado |
| Estados de convite e instrução sobre link não recuperável | Aprovado |
| Uso consistente de componentes e tokens do design system | Aprovado |
| Navegação por teclado e rótulos dos controles principais | Aprovado por inspeção estrutural |
| Overflow horizontal da página | Ausente nas oito capturas |
| Erros no console do navegador | Ausentes nas oito capturas |

## Evidências geradas

- `lista-desktop.png`;
- `lista-mobile.png`;
- `criacao-desktop.png`;
- `criacao-mobile.png`;
- `detalhe-desktop.png`;
- `detalhe-mobile.png`;
- `edicao-desktop.png`;
- `edicao-mobile.png`.

## Conclusão

As quatro superfícies permanecem organizadas e utilizáveis nas larguras verificadas. A implementação está visualmente pronta para revisão da pull request, sem merge automático.
