# Entrega de notificações da revisão cadastral

A solicitação manual mantém a revisão cadastral como operação principal. Falhas de SendGrid ou Twilio não desfazem uma revisão criada nem tornam indisponível a notificação interna.

## Fluxo

1. A API procura uma revisão pendente do aluno. Se já existir, ela é reutilizada; nenhuma nova revisão é criada.
2. Quando não existe pendência, a criação ocorre com isolamento serializável para reduzir duplicidade em solicitações concorrentes.
3. `notificationService.create` registra a notificação in-app com deduplicação também executada em transação serializável.
4. Para `profile_review_requested`, a entrega externa é habilitada explicitamente.
5. As preferências `emailEnabled` e `whatsappEnabled` determinam quais canais serão tentados.
6. A aceitação inicial do provider é registrada como `accepted`; ela não é tratada como entrega ao destinatário.
7. SendGrid Event Webhook e Twilio Status Callback confirmam posteriormente `sent` ou `failed` de forma autenticada e idempotente.
8. Somente `sent` (após confirmação de entrega) grava `Notification.emailSent`/`Notification.whatsappSent` e `sentAt`.
9. A API devolve `reviewCreated`, `requestAction`, `notification.persisted`, `notification.deduplicated` e o estado externo conhecido quando ele existe, incluindo `accepted`, `sent`, `failed` e `not_configured`. `accepted` informa somente aceitação pelo provider e nunca produz mensagem de “enviado” ao professor.

## Conteúdo externo

O e-mail usa uma mensagem mínima que identifica o Sistema ACESSO, informa que há revisão pendente e orienta o aluno a entrar na conta. O conteúdo não inclui respostas clínicas, campos alterados ou dados pessoais da revisão. Um link só é incluído quando `FRONTEND_URL` é uma URL HTTPS válida **sem credenciais embutidas em `username`/`password`**; busca e fragmento são removidos e nenhum token persistente é anexado. URLs HTTPS com `userinfo`, inclusive codificado, são rejeitadas e a mensagem segue sem link.

O WhatsApp usa exclusivamente um template Utility aprovado no WhatsApp/Twilio, identificado por `TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID`. A solicitação de revisão é uma mensagem iniciada pela empresa e precisa funcionar também fora da janela de atendimento de 24 horas; por isso o backend envia `ContentSid` e não faz fallback silencioso para `Body`/texto livre. O template configurado deve reproduzir somente a mensagem mínima segura da revisão, sem dados clínicos, dados pessoais, tokens persistentes ou variáveis dinâmicas sensíveis.

## Estados por canal

- `accepted`: o provider aceitou/enfileirou a tentativa; **não comprova entrega ao destinatário**;
- `sent`: callback autenticado confirmou entrega (ou leitura, quando o provider usa esse estado como sucessor de entrega); provider `accepted`/`queued`/`sent` sem confirmação final permanece `accepted`;
- `failed`: falha síncrona, falha segura de preparação da tentativa externa ou callback terminal `bounce`/`dropped`/`failed`/`undelivered`;
- `not_configured`: canal habilitado, mas provider, template proativo aprovado ou confirmação segura de entrega não está configurada;
- `skipped`: canal desabilitado nas preferências do usuário.

A revisão permanece utilizável em todos os estados de entrega externa. Diagnósticos persistidos são técnicos e não incluem conteúdo clínico, corpo da mensagem, e-mail, telefone ou credenciais.

## Confirmação de entrega

### SendGrid

O envio inclui `notificationId` em `custom_args`. O Event Webhook deve apontar para:

`POST /api/v1/notification-delivery/sendgrid-events`

A API valida os headers de assinatura do Event Webhook usando `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`, rejeita payload adulterado ou timestamp fora da janela de cinco minutos e correlaciona o evento pelo `notificationId`.

### Twilio WhatsApp

Crie no Twilio Content Template Builder/Content API um template Utility para a revisão cadastral, submeta-o para aprovação do WhatsApp e configure o respectivo Content SID `HX...` em `TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID`. O backend considera o canal `not_configured` quando o SID está ausente ou malformado e não tenta texto livre como fallback.

Cada mensagem proativa usa `ContentSid`, `To`, `From` e um `StatusCallback` derivado de `NOTIFICATION_CALLBACK_BASE_URL`; `Body` e `ContentVariables` não são enviados. `NOTIFICATION_CALLBACK_BASE_URL` deve ser HTTPS pública **sem `username`/`password` embutidos**. Se a base contiver `userinfo`, o canal degrada para `not_configured` e nenhum provider é acionado. O callback é:

`POST /api/v1/notification-delivery/twilio-status?notificationId=<id>`

A API valida `X-Twilio-Signature` com `TWILIO_AUTH_TOKEN`. `queued`, `sending` e `sent` continuam como `accepted`; apenas `delivered`/`read` confirmam entrega, enquanto `failed`/`undelivered` encerram a tentativa como falha.

Callbacks repetidos são idempotentes. Estados terminais não retrocedem quando um evento atrasado chega fora de ordem.

## Falha depois da persistência interna

A persistência da notificação in-app estabelece um fato durável que não pode ser apagado por etapas externas posteriores. Se a leitura do destinatário ou a preparação/execução do dispatcher externo falhar depois que a notificação foi criada, o serviço preserva a notificação interna no resultado e representa os canais habilitados como `failed`, sem afirmar que o registro interno falhou e sem realizar uma segunda tentativa oculta. Canais desabilitados continuam `skipped`; quando ambos estão desabilitados, não há consulta de destinatário nem outbound.

## Falha depois do outbound

A criação da notificação interna acontece antes do provider. Se a chamada externa produzir um resultado e a atualização posterior da notificação falhar, o serviço não converte esse efeito conhecido em `persisted: false`: ele preserva a notificação interna, não converte aceitação em entrega e permite que callback posterior reconcilie o estado pelo `notificationId`; resultados terminais já conhecidos continuam disponíveis ao professor.

## Repetição e concorrência

Se já existe revisão `pending`, o serviço reutiliza a revisão existente. A deduplicação da notificação roda em transação `Serializable`; conflito concorrente `P2034` faz releitura da janela e reutiliza o registro vencedor antes de qualquer outbound. Assim, duas solicitações concorrentes idênticas não devem gerar duas notificações nem duas tentativas externas.

## Variáveis de ambiente

Os canais só são considerados prontos para entrega rastreável quando a configuração necessária está presente:

- `SENDGRID_API_KEY` e `SENDGRID_FROM_EMAIL` para e-mail;
- `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` para validar confirmação do SendGrid;
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_WHATSAPP_NUMBER` para WhatsApp;
- `TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID` com Content SID `HX...` de template Utility aprovado no WhatsApp para a revisão cadastral;
- `NOTIFICATION_CALLBACK_BASE_URL` com URL HTTPS pública da API para callbacks, sem credenciais embutidas;
- `FRONTEND_URL` para o link web opcional HTTPS enviado por e-mail ao aluno, sem credenciais embutidas.

Nenhum segredo deve ser exposto no frontend ou no corpo das notificações. O Content SID não é tratado como conteúdo livre: o template associado deve ser controlado operacionalmente e manter a cópia mínima segura descrita acima.

## Validação

- `safe-external-url.test.ts`: rejeição de `userinfo` em URLs HTTPS, incluindo credenciais codificadas, e aceitação de HTTPS legítima sem credenciais;
- `notification-delivery.service.test.ts`: template `ContentSid` sem `Body`, aceitação versus entrega, correlação, callback, falha parcial, preferências, configuração incompleta, ausência/má-formação do template e callback com credenciais sem outbound;
- `notification-delivery.routes.test.ts`: assinatura SendGrid, anti-replay e mapeamento de estados SendGrid/Twilio;
- `notification-delivery-status.service.test.ts`: transições idempotentes e proteção contra regressão de estado;
- `notification.service.test.ts`: deduplicação serializável, conflito concorrente sem novo outbound, preservação da notificação após falha de preparação externa, falha de persistência depois do provider e rejeição de `FRONTEND_URL` com credenciais;
- `profile-review-request.service.test.ts`: criação sem pendência, reutilização da pendência e recuperação de conflito serializável concorrente.
