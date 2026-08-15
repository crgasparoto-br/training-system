# Entrega de notificações da revisão cadastral

A solicitação manual mantém a revisão cadastral como operação principal. Falhas de SendGrid ou Twilio não desfazem uma revisão criada nem tornam indisponível a notificação interna.

## Fluxo

1. A API procura uma revisão pendente do aluno. Se já existir, ela é reutilizada; nenhuma nova revisão é criada.
2. Quando não existe pendência, a criação ocorre com isolamento serializável para reduzir duplicidade em solicitações concorrentes.
3. `notificationService.create` registra a notificação in-app e aplica a deduplicação existente.
4. Para `profile_review_requested`, a entrega externa é habilitada explicitamente.
5. As preferências `emailEnabled` e `whatsappEnabled` determinam quais canais serão tentados.
6. O resultado físico é persistido em `Notification.emailSent`, `Notification.whatsappSent`, `Notification.emailError` e `Notification.whatsappError`.
7. A API devolve `reviewCreated`, `requestAction`, `notification.persisted`, `notification.deduplicated` e o resultado individual de `email`/`whatsapp`.
8. A interface diferencia revisão criada, revisão já pendente, notificação interna e resultado dos canais externos.

## Conteúdo externo

E-mail e WhatsApp usam uma mensagem mínima que identifica o Sistema ACESSO, informa que há revisão pendente e orienta o aluno a entrar na conta. O conteúdo não inclui respostas clínicas, campos alterados ou dados pessoais da revisão. Um link só é incluído quando `FRONTEND_URL` é HTTPS válida; busca e fragmento são removidos e nenhum token persistente é anexado.

## Variáveis de ambiente

As variáveis já presentes em `.env.example` são obrigatórias apenas para os canais habilitados:

- `SENDGRID_API_KEY` e `SENDGRID_FROM_EMAIL` para e-mail;
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_WHATSAPP_NUMBER` para WhatsApp;
- `FRONTEND_URL` para o link web opcional HTTPS.

## Estados retornados por canal

- `sent`: o provedor aceitou o envio;
- `failed`: houve falha de destinatário, comunicação ou resposta do provedor;
- `not_configured`: o canal está habilitado, mas a configuração do provedor está ausente;
- `skipped`: o canal está desabilitado nas preferências do usuário.

A revisão permanece utilizável em todos os estados de entrega externa. Diagnósticos persistidos são técnicos e não incluem conteúdo clínico ou dados pessoais do aluno.

## Repetição da solicitação

Se já existe revisão `pending`, o serviço reutiliza a revisão existente. A notificação pode ser deduplicada pela janela de 30 minutos; fora dessa janela, uma nova notificação da mesma revisão pode ser registrada e os canais externos podem ser tentados novamente. O retorno deixa explícito que nenhuma nova revisão foi criada.

## Validação

- `notification-delivery.service.test.ts`: sucesso de e-mail/WhatsApp, falha parcial, canais desabilitados e provedor não configurado;
- `profile-review-request.service.test.ts`: criação sem pendência, reutilização da pendência e recuperação de conflito serializável concorrente.
