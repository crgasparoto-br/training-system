# Entrega de notificações da revisão cadastral

A criação manual de uma revisão cadastral persiste a revisão antes de qualquer tentativa de entrega externa. Falhas de SendGrid ou Twilio não desfazem a revisão criada.

## Fluxo

1. A revisão cadastral é criada em `StudentProfileReview`.
2. `notificationService.create` registra a notificação in-app e aplica a deduplicação existente.
3. Para `profile_review_requested`, a entrega externa é habilitada explicitamente.
4. As preferências `emailEnabled` e `smsEnabled` determinam quais canais serão tentados.
5. O resultado físico é persistido em `Notification.emailSent`, `Notification.smsSent`, `Notification.emailError` e `Notification.smsError`.
6. A API devolve o resultado da revisão junto com `notification.persisted`, `notification.deduplicated` e o resultado individual de `email`/`sms`.
7. A interface informa separadamente revisão criada, envio concluído e falha de entrega.

## Variáveis de ambiente

As variáveis já presentes em `.env.example` são obrigatórias apenas para os canais habilitados:

- `SENDGRID_API_KEY`: chave da API do SendGrid.
- `SENDGRID_FROM_EMAIL`: remetente validado no SendGrid.
- `TWILIO_ACCOUNT_SID`: Account SID do Twilio.
- `TWILIO_AUTH_TOKEN`: token de autenticação do Twilio.
- `TWILIO_PHONE_NUMBER`: número remetente habilitado para SMS.

Quando um canal está habilitado, mas o destinatário ou a configuração necessária não está disponível, a revisão continua criada e o canal é registrado como falha de entrega.

## Estados retornados por canal

- `sent`: o provedor aceitou o envio.
- `failed`: houve erro de configuração, destinatário ou comunicação com o provedor.
- `skipped`: o canal está desabilitado nas preferências do usuário.

## Validação

Os testes de `notification-delivery.service.test.ts` cobrem sucesso em e-mail/SMS, falha parcial, canais desabilitados e configuração de provedor ausente.
