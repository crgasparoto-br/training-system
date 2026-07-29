# Contrato de audiência no rollout da pré-matrícula

Este documento complementa o runbook de rollout e define a mensagem de indisponibilidade esperada em cada superfície quando a web foi construída com a pré-matrícula habilitada, mas a API responde `503 PRE_REGISTRATION_DISABLED`.

## Audiências

| Audiência | Rota representativa | Contexto | Mensagem obrigatória | Conteúdo proibido |
|---|---|---|---|---|
| Pública | `/pre-cadastro/:token` | Abertura inicial do convite compartilhado | Informar que o link não pode ser utilizado temporariamente e orientar contato com a academia | Código técnico, pedido de novo convite, afirmação de progresso autenticado |
| Autenticada | `/pre-cadastro` | Retomada com conta já autenticada | Informar indisponibilidade temporária e que o progresso permanece salvo | Referência a “este link”, pedido de novo convite ou mensagem administrativa de ambiente |
| Administrativa | `/pre-matriculas` e rotas filhas | Gestão interna de leads e convites | Informar que o fluxo está desabilitado e que cadastros e convites não foram apagados | Referência a link público ou afirmação sobre progresso do aluno |

A classificação deve ser explícita na rota. Não inferir que a retomada autenticada pertence à audiência pública apenas porque utiliza o mesmo componente funcional do pré-cadastro.

## Evidência obrigatória

O gate de navegador deve executar as três rotas no mesmo build e na mesma API desabilitada. Para cada superfície, deve registrar:

- nome da superfície, rota, audiência e viewport;
- ausência de `PRE_REGISTRATION_DISABLED` e da orientação para solicitar novo convite;
- presença da mensagem da audiência correta;
- ausência das mensagens das duas audiências irmãs;
- screenshot contextualizada.

O relatório `rollout-consumer-browser.json` deve mapear exatamente:

- `public-token-route` → `public`;
- `authenticated-resume` → `authenticated`;
- `administrative-list` → `administrative`.

Um teste que apenas encontra uma frase comum, como “entre em contato com a academia”, não comprova a audiência correta.

## Controle adversarial reutilizável

**ID:** `rollout-audience-cross-copy`

Implementação plausível e incorreta: reutilizar a audiência pública para a rota de retomada autenticada. O caminho feliz ainda exibe uma tela de indisponibilidade e pode passar em testes genéricos.

O controle deve falhar quando:

- `/pre-cadastro` autenticado exibir “O link não pode ser utilizado”;
- a evidência registrar `authenticated-resume` como `public`;
- qualquer superfície aceitar simultaneamente as mensagens de duas audiências.

Casos irmãos: rota administrativa usando copy pública; convite público usando copy administrativa; build com flag desabilitada renderizando copy diferente da fronteira de runtime.
