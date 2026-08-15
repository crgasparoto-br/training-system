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

E-mail e WhatsApp usam uma mensagem mínima que:

- identifica o Sistema ACESSO;
- informa que há uma revisão cadastral pendente;
- orienta o aluno a entrar na conta para acessar a revisão;
- não inclui respostas clínicas, campos alterados ou dados pessoais da revisão;
- só inclui link web quando `FRONTEND_URL` é uma origem HTTPS válida; o caminho usado não contém token persistente.

## Variáveis de ambiente

As variáveis já presentes em `.env.example` são obrigatórias apenas para os canais habilitados:

- `SENDGRID_API_KEY`: chave da API do SendGrid.
- `SENDGRID_FROM_EMAIL`: remetente validado no SendGrid.
- `TWILIO_ACCOUNT_SID`: Account SID do Twilio.
- `TWILIO_AUTH_TOKEN`: token de autenticação do Twilio.
- `TWILIO_WHATSAPP_NUMBER`: remetente habilitado para WhatsApp.
- `FRONTEND_URL`: origem web; só é adicionada à mensagem externa quando usa HTTPS.

Quando um canal está habilitado, mas o destinatário ou a configuração necessária não está disponível, a revisão permanece utilizável e o canal é registrado como falha de entrega.

## Estados retornados por canal

- `sent`: o provedor aceitou o envio.
- `failed`: houve erro de configuração, destinatário ou comunicação com o provedor.
- `skipped`: o canal está desabilitado nas preferências do usuário.

## Repetição da solicitação

Se já existe revisão `pending`, o serviço reutiliza a revisão existente. A notificação pode ser deduplicada pela janela de 30 minutos; fora dessa janela, uma nova notificação da mesma revisão pode ser registrada e os canais externos podem ser tentados novamente. O retorno deixa explícito que nenhuma nova revisão foi criada.

## Validação

- `notification-delivery.service.test.ts`: sucesso de e-mail/WhatsApp, falha parcial, canais desabilitados e configuração ausente.
- `profile-review-request.service.test.ts`: criação sem pendência, reutilização da pendência e recuperação de conflito serializável concorrente.
