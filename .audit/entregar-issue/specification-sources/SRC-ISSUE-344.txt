## Issue pai

- #341

## Dependências recomendadas

- #342
- #343

## Objetivo

Conectar a criação de uma revisão cadastral aos canais externos configurados para o aluno e tornar explícita a diferença entre revisão criada, notificação interna registrada e entrega externa efetivamente realizada.

## Contexto

Atualmente `notificationService.create()` persiste a notificação e registra os canais habilitados nas preferências, mas isso não significa que e-mail, SMS ou WhatsApp tenham sido entregues. O fluxo do professor, porém, pode induzir a interpretação de que a solicitação foi enviada ao aluno.

O repositório já possui configuração de SendGrid e variáveis de Twilio. A solução deve reutilizar integrações existentes ou criar uma camada pequena e explícita de entrega, sem transformar serviços externos em dependência obrigatória para o funcionamento da revisão cadastral.

## Escopo

- Definir contrato de resultado da solicitação manual com estados suficientes para distinguir:
  - revisão criada;
  - notificação interna criada/deduplicada;
  - entrega externa não configurada;
  - entrega externa entregue;
  - entrega externa falhou.
- Implementar entrega por e-mail via SendGrid quando configurado e permitido pelas preferências.
- Implementar WhatsApp via Twilio quando configurado e permitido pelas preferências, caso a infraestrutura atual suporte envio seguro sem criar acoplamento indevido.
- Se um canal não estiver configurado, manter a notificação interna e apresentar fallback seguro.
- Atualizar o feedback do botão “Solicitar revisão agora” para não afirmar envio quando só houver criação interna.
- Definir e testar comportamento ao solicitar novamente enquanto já existe revisão pendente.
- Registrar falhas de entrega de forma observável sem expor dados pessoais sensíveis.

## Fora de escopo

- campanhas de marketing;
- notificações promocionais;
- tornar Twilio ou SendGrid obrigatórios;
- criar filas distribuídas complexas se o fluxo atual não exigir;
- app mobile;
- push notification nativo.

## Regras e invariantes

- A criação da revisão é a operação principal e não deve ser revertida apenas porque um canal externo falhou.
- A notificação interna deve continuar disponível quando nenhum canal externo estiver configurado.
- Preferências do usuário devem ser respeitadas.
- Não enviar conteúdo clínico/sensível no corpo da mensagem externa; a mensagem deve orientar o aluno a acessar o Sistema ACESSO autenticado.
- Não incluir tokens de autenticação persistentes em URLs externas.
- O resultado retornado ao professor deve representar o que realmente aconteceu.
- Repetição da ação deve evitar duplicidade acidental de revisões ou possuir regra explícita de reenvio/notificação.

## Conteúdo mínimo da mensagem externa

- informar que existe uma revisão cadastral pendente;
- identificar o Sistema ACESSO;
- orientar o aluno a entrar na conta e acessar a revisão;
- incluir link web seguro para a aplicação quando apropriado;
- não listar dados pessoais, respostas clínicas ou campos alteráveis.

## Estados de interface esperados no professor

Exemplos de semântica, sem obrigar exatamente estes textos:

- revisão criada e aluno notificado;
- revisão criada; notificação disponível no sistema, mas canal externo não configurado;
- revisão criada; não foi possível entregar pelo canal externo;
- já existe revisão pendente; nenhuma nova revisão foi criada;
- revisão existente teve notificação reenviada, se essa for a regra adotada.

## Critérios de aceite

- [ ] O backend distingue criação da revisão de entrega externa.
- [ ] O professor não recebe mensagem de “enviado” quando não houve entrega externa.
- [ ] A revisão permanece pendente e utilizável se SendGrid/Twilio falhar.
- [ ] Notificação interna continua funcionando sem integrações externas.
- [ ] Preferências de e-mail/WhatsApp são respeitadas.
- [ ] E-mail é enviado via infraestrutura configurada quando aplicável.
- [ ] WhatsApp é enviado via infraestrutura configurada quando aplicável ou a indisponibilidade do canal fica explicitamente tratada/documentada.
- [ ] Mensagens externas não expõem dados sensíveis da revisão.
- [ ] Repetição de solicitação com revisão pendente possui comportamento explícito e testado.
- [ ] Falhas de entrega possuem log/telemetria segura suficiente para diagnóstico.
- [ ] Testes cobrem canal configurado, canal ausente, falha de provider e deduplicação/repetição.

## Configuração e documentação

Revisar `.env.example` e documentação de deployment/operação para garantir que variáveis realmente usadas pelos canais estejam descritas sem segredos.

## Validação esperada

Executar testes de API/serviços relevantes e gates aplicáveis do repositório.
