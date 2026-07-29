# Contrato de audiência no rollout da pré-matrícula

Este documento complementa o runbook de rollout e define a mensagem de indisponibilidade esperada em cada superfície quando a web foi construída com a pré-matrícula habilitada, mas a API responde `503 PRE_REGISTRATION_DISABLED`.

## Audiências

| Audiência | Rota representativa | Contexto | Mensagem obrigatória | Conteúdo proibido |
|---|---|---|---|---|
| Pública | `/pre-cadastro/:token` | Abertura inicial do convite compartilhado | Informar que o link não pode ser utilizado temporariamente e orientar contato com a academia | Código técnico, pedido de novo convite, afirmação de progresso autenticado |
| Autenticada | `/pre-cadastro` | Retomada com conta já autenticada | Informar indisponibilidade temporária e que o progresso permanece salvo | Referência a “este link”, pedido de novo convite ou mensagem administrativa de ambiente |
| Administrativa | `/pre-matriculas` e rotas filhas | Gestão interna de leads e convites | Informar que o fluxo está desabilitado e que cadastros e convites não foram apagados | Referência a link público ou afirmação sobre progresso do aluno |

A classificação deve ser explícita na rota. Não inferir que a retomada autenticada pertence à audiência pública apenas porque utiliza o mesmo componente funcional do pré-cadastro.

## Modos de implantação obrigatórios

A fronteira de disponibilidade deve sondar `GET /api/v1/pre-registration/availability` antes de montar o consumidor em todos os modos suportados:

- origem explícita, quando `VITE_API_URL` aponta para a API;
- same-origin, quando `VITE_API_URL` está ausente ou vazia e o cliente resolve a API em `/api/v1`.

Não é permitido marcar a funcionalidade como habilitada apenas porque `VITE_API_URL` está vazia. Enquanto a sonda estiver pendente, formulários, filtros, listagens, detalhes e ações da pré-matrícula permanecem desmontados. Falha transitória não deve ser confundida com `PRE_REGISTRATION_DISABLED`, mas um `503` deliberadamente atrasado deve impedir qualquer exposição parcial anterior.

## Evidência obrigatória

O gate de navegador deve executar as três rotas no mesmo build e na mesma API desabilitada. Para cada superfície, deve registrar:

- nome da superfície, rota, audiência e viewport;
- modo de implantação exercitado;
- observação da fronteira `checking` antes da resposta atrasada da API;
- ausência do conteúdo protegido durante a sonda;
- ausência de `PRE_REGISTRATION_DISABLED` e da orientação para solicitar novo convite;
- presença da mensagem da audiência correta;
- ausência das mensagens das duas audiências irmãs;
- screenshot contextualizada.

O relatório `rollout-consumer-browser.json` deve mapear exatamente:

- `public-token-route` → `public`;
- `authenticated-resume` → `authenticated`;
- `administrative-list` → `administrative`.

Um teste que apenas encontra uma frase comum, como “entre em contato com a academia”, não comprova a audiência correta. Um teste que usa somente origem explícita também não comprova o modo same-origin suportado pelo cliente.

## Controles adversariais reutilizáveis

### `rollout-audience-cross-copy`

Implementação plausível e incorreta: reutilizar a audiência pública para a rota de retomada autenticada. O caminho feliz ainda exibe uma tela de indisponibilidade e pode passar em testes genéricos.

O controle deve falhar quando:

- `/pre-cadastro` autenticado exibir “O link não pode ser utilizado”;
- a evidência registrar `authenticated-resume` como `public`;
- qualquer superfície aceitar simultaneamente as mensagens de duas audiências.

Casos irmãos: rota administrativa usando copy pública; convite público usando copy administrativa; build com flag desabilitada renderizando copy diferente da fronteira de runtime.

### `rollout-same-origin-pre-render`

Implementação plausível e incorreta: pular a sonda quando `VITE_API_URL` está vazia, renderizar o consumidor e depender da primeira chamada funcional para substituir a tela por indisponibilidade.

O controle deve usar build same-origin, resposta `503` atrasada e falhar quando:

- a fronteira `checking` não for observada antes da resposta;
- qualquer conteúdo protegido surgir durante o atraso;
- a sonda não for enviada para `/api/v1/pre-registration/availability`;
- somente o modo com origem explícita tiver sido exercitado.

Casos irmãos: listagem administrativa visível antes do `503`; formulário de criação editável durante a sonda; detalhe ou edição montados antes da decisão de rollout; retomada autenticada exibindo estado interno antes da indisponibilidade.
