# Student App Data Contract

## Objetivo

Definir o contrato de dados da experiencia autenticada do aluno. O web responsivo atual e um futuro app mobile reutilizam os endpoints do backend com prefixo `/api/v1/student/me`; regras de seguranca e dominio nao devem ser duplicadas por cliente.

Este documento padroniza:
- dados exibidos por tela
- campos editaveis vs somente leitura
- fluxo de revisao cadastral
- regras de privacidade e limites de alteracao pelo aluno

## Implementacao atual e evolucao mobile

A revisao cadastral ja esta implementada no web responsivo:

- `/inicio` sinaliza quando existe revisao pendente;
- `/student/profile-review` carrega perfil e revisao no contexto autenticado;
- a conclusao preserva `x-contract-id` quando o contrato foi selecionado;
- campos sensiveis permanecem pendentes para aprovacao/rejeicao profissional;
- falha de notificacao externa nao desfaz a revisao persistida.

O app mobile permanece evolucao futura e deve consumir o mesmo contrato `student/me`, sem criar uma segunda politica de campos, aprovacao ou isolamento por contrato.

## Escopo da experiencia do aluno

A experiencia do aluno deve permitir:
- consultar seus dados cadastrais e de saude permitida
- atualizar campos de autoatendimento
- concluir revisao cadastral pendente
- visualizar historico de avaliacoes
- visualizar plano de avaliacoes e proximas previsoes
- acompanhar treinos e agenda
- acompanhar notificacoes

## Telas previstas

1. Inicio
2. Meu Perfil
3. Revisao Cadastral
4. Minhas Avaliacoes
5. Plano de Avaliacoes
6. Meus Treinos
7. Agenda
8. Notificacoes

## Endpoints base (student/me)

Todos os endpoints desta secao exigem autenticacao do aluno. Quando a conta possui mais de um vinculo ativo ou o cliente seleciona explicitamente um contrato, o contexto deve ser enviado em `x-contract-id`. A API revalida usuario, aluno, status do vinculo e `contractId`; o cliente nao pode inferir autorizacao apenas pela rota ou pelo estado local.

### 1) GET /api/v1/student/me/profile

Retorna dados permitidos do aluno autenticado.
Agora inclui um resumo contratual seguro em `contractSummary`.

Resposta esperada (resumo):

```json
{
  "success": true,
  "data": {
    "id": "aluno_id",
    "email": "aluno@exemplo.com",
    "contractSummary": {
      "activeContract": {
        "contractId": "generated_contract_id",
        "title": "Contrato Plano Performance",
        "service": {
          "id": "service_id",
          "name": "Assessoria Corrida",
          "code": "ASSESSORIA_CORRIDA"
        },
        "status": "active",
        "startDate": "2026-01-01T00:00:00.000Z",
        "endDate": null,
        "signedAt": "2026-01-03T10:00:00.000Z",
        "paymentDay": null,
        "amount": null,
        "signedDocumentUrl": null
      },
      "history": [
        {
          "contractId": "generated_contract_old",
          "title": "Contrato Plano Start",
          "service": {
            "id": "service_old",
            "name": "Assessoria Basica",
            "code": "ASSESSORIA_BASICA"
          },
          "status": "canceled",
          "startDate": "2025-08-01T00:00:00.000Z",
          "endDate": "2025-12-31T00:00:00.000Z",
          "signedAt": "2025-08-02T10:00:00.000Z"
        }
      ],
      "visibility": {
        "paymentDay": false,
        "amount": false,
        "signedDocumentUrl": false
      }
    },
    "profile": {
      "name": "Aluno",
      "avatar": "https://...",
      "phone": "+55...",
      "birthDate": "1990-01-01T00:00:00.000Z",
      "gender": "male",
      "maritalStatus": "single",
      "addressStreet": "Rua X",
      "addressNumber": "123",
      "addressComplement": "Apto 10",
      "addressNeighborhood": "Centro",
      "addressCity": "Sao Paulo",
      "addressState": "SP",
      "addressZipCode": "00000-000",
      "instagramHandle": "@aluno"
    },
    "physical": {
      "age": 35,
      "weight": 78.3,
      "height": 178
    },
    "intakeForm": {
      "assessmentDate": "2026-05-01T00:00:00.000Z",
      "mainGoal": "Melhorar condicionamento",
      "trainingBackground": "Corre 3x por semana",
      "observations": "Sem observacoes"
    }
  }
}
```

### 2) PUT /api/v1/student/me/profile

Atualiza apenas campos liberados para autoatendimento.

Request body esperado:

```json
{
  "phone": "+55 11 99999-9999",
  "addressStreet": "Rua Nova",
  "addressNumber": "200",
  "addressComplement": "Casa",
  "addressNeighborhood": "Bairro Novo",
  "addressCity": "Campinas",
  "addressState": "SP",
  "addressZipCode": "13000-000",
  "instagramHandle": "@novo_handle",
  "intakeForm": {
    "mainGoal": "Perder gordura",
    "trainingBackground": "Iniciante",
    "observations": "Prefere treino matinal"
  }
}
```

Resposta esperada:

```json
{
  "success": true,
  "data": null,
  "message": "Perfil atualizado com sucesso"
}
```

### 3) GET /api/v1/student/me/profile-review

Retorna revisao cadastral pendente (ou `null` se nao houver) para o aluno e contrato ativos no contexto autenticado.

Resposta esperada (exemplo com pendencia):

```json
{
  "success": true,
  "data": {
    "id": "review_id",
    "alunoId": "aluno_id",
    "requestedAt": "2026-05-05T10:00:00.000Z",
    "dueAt": "2026-05-20T10:00:00.000Z",
    "status": "pending",
    "sectionsRequested": ["personal", "contact", "health"],
    "requiresApproval": false
  }
}
```

### 4) POST /api/v1/student/me/profile-reviews/:id/complete

Conclui a revisao cadastral. A API revalida no momento da escrita se `reviewId`, `alunoId`, usuario autenticado, vinculo `ACTIVE_STUDENT` e `contractId` continuam pertencendo ao mesmo contexto.

Sem alteracoes:

```json
{
  "noChanges": true
}
```

Com alteracoes:

```json
{
  "changes": {
    "profile": {
      "phone": "+55 11 98888-7777"
    },
    "intakeForm": {
      "currentMedications": "Medicacao X"
    }
  }
}
```

Observacao:
- alteracoes sensiveis nao sao aplicadas diretamente
- alteracoes sensiveis ficam pendentes para aprovacao do professor/gestor
- a resposta informa se ainda existe aprovacao pendente e deve dirigir a mensagem exibida pelo cliente
- erro de submissao nao pode ser convertido em sucesso local pelo frontend

### 5) GET /api/v1/student/me/assessments

Retorna historico de avaliacoes do aluno.

Somente leitura para o aluno.

### 6) GET /api/v1/student/me/assessment-plan

Retorna plano de avaliacoes e proximas previsoes.

Somente leitura para o aluno.

### 7) GET /api/v1/student/me/summary

Retorna resumo da home da experiencia do aluno.
Agora inclui o bloco `contract` para o aluno consultar contrato ativo e historico resumido e sinaliza a revisao cadastral pendente usada pelo `/inicio` do web.

Resposta esperada (resumo):

```json
{
  "success": true,
  "data": {
    "name": "Aluno",
    "contract": {
      "active": {
        "contractId": "generated_contract_id",
        "title": "Contrato Plano Performance",
        "service": {
          "id": "service_id",
          "name": "Assessoria Corrida",
          "code": "ASSESSORIA_CORRIDA"
        },
        "status": "active",
        "startDate": "2026-01-01T00:00:00.000Z",
        "endDate": null,
        "signedAt": "2026-01-03T10:00:00.000Z",
        "paymentDay": null,
        "amount": null,
        "signedDocumentUrl": null
      },
      "history": [
        {
          "contractId": "generated_contract_old",
          "title": "Contrato Plano Start",
          "service": {
            "id": "service_old",
            "name": "Assessoria Basica",
            "code": "ASSESSORIA_BASICA"
          },
          "status": "canceled",
          "startDate": "2025-08-01T00:00:00.000Z",
          "endDate": "2025-12-31T00:00:00.000Z",
          "signedAt": "2025-08-02T10:00:00.000Z"
        }
      ]
    },
    "nextProfileReviewAt": "2026-06-01T00:00:00.000Z",
    "hasPendingProfileReview": true,
    "nextAssessment": {
      "assessmentTypeId": "type_id",
      "assessmentTypeName": "Avaliacao Fisica",
      "nextDueDate": "2026-05-15T00:00:00.000Z",
      "status": "scheduled"
    },
    "lastWorkoutDate": "2026-05-03T09:00:00.000Z",
    "recentNotifications": [
      {
        "id": "notif_1",
        "type": "profile_review_requested",
        "title": "Revisao cadastral",
        "message": "Complete sua revisao",
        "createdAt": "2026-05-05T10:00:00.000Z"
      }
    ]
  }
}
```

### 8) GET /api/v1/student/me/contract

Endpoint opcional para tela dedicada de contrato na experiencia do aluno.

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "activeContract": {
      "contractId": "generated_contract_id",
      "title": "Contrato Plano Performance",
      "service": {
        "id": "service_id",
        "name": "Assessoria Corrida",
        "code": "ASSESSORIA_CORRIDA"
      },
      "status": "active",
      "startDate": "2026-01-01T00:00:00.000Z",
      "endDate": null,
      "signedAt": "2026-01-03T10:00:00.000Z",
      "paymentDay": null,
      "amount": null,
      "signedDocumentUrl": null
    },
    "history": [],
    "visibility": {
      "paymentDay": false,
      "amount": false,
      "signedDocumentUrl": false
    }
  }
}
```

Observacoes:
- endpoint somente leitura
- sempre escopado ao aluno autenticado e ao contrato selecionado quando aplicavel
- `paymentDay`, `amount` e `signedDocumentUrl` seguem politica de visibilidade

## Campos do perfil por categoria

### Editaveis diretamente pelo aluno

- `phone`
- `addressStreet`
- `addressNumber`
- `addressComplement`
- `addressNeighborhood`
- `addressCity`
- `addressState`
- `addressZipCode`
- `instagramHandle`
- `intakeForm.mainGoal`
- `intakeForm.trainingBackground`
- `intakeForm.observations`

### Alteraveis com aprovacao (nao aplicar diretamente)

- `profile.cpf`
- `profile.rg`
- `profile.birthDate`
- `profile.maritalStatus`
- `aluno.systolicPressure`
- `aluno.diastolicPressure`
- `aluno.maxHeartRate`
- `aluno.restingHeartRate`
- `intakeForm.medicalHistory`
- `intakeForm.currentMedications`
- `intakeForm.injuriesHistory`
- `intakeForm.parqResponses`

### Somente leitura para o aluno

- dados de avaliacao fisica historica
- plano de avaliacoes e regras de agendamento
- dados financeiros contratuais (quando politica de visibilidade nao permitir)
- registros de aprovacao/rejeicao feitos por professor/gestor

## Regras de privacidade

1. O aluno so pode consultar e alterar seus proprios dados no vinculo contratual autenticado.
2. Quando a mesma conta possui mais de um contrato, a selecao de um contexto nao concede acesso ao outro; `x-contract-id` e revalidado no backend.
3. Avaliacao fisica e historico de avaliacoes sao somente leitura para o aluno.
4. Plano financeiro/contratual deve ser somente leitura, resumido ou omitido conforme sensibilidade.
5. Valor, dia de pagamento e link de documento assinado so devem ser retornados quando permitidos por politica de privacidade.
6. Dados bancarios, documentos legais e informacoes administrativas internas nao devem ser expostos ao cliente do aluno.

## Fluxo de revisao cadastral

Estados e transicoes esperadas:

1. professor/gestor solicita a revisao ou o sistema agenda a pendencia;
2. `pending` (pendente) e notificada no canal in-app; email/WhatsApp sao opcionais;
3. confirmada sem alteracao (`completed_no_changes`);
4. confirmada com alteracao (`completed_with_changes`);
5. aguardando aprovacao (`requiresApproval = true` para campos sensiveis);
6. aprovada ou rejeitada pelo professor/gestor.

Regras:
- uma nova solicitacao enquanto ja existe pendencia reutiliza a revisao aberta, conforme a politica de idempotencia/concorrrencia do backend
- sem alteracoes: encerra revisao e agenda proxima
- com alteracoes nao sensiveis: aplica direto e encerra
- com alteracoes sensiveis: marca pendencia para aprovacao
- rejeicao deve registrar motivo e nao aplicar o valor sensivel
- notificacao externa e best effort; falha de provider nao desfaz a solicitacao persistida
- detalhes de entrega externa e callbacks ficam em `docs/profile-review-notification-delivery.md`
- matriz executavel de validacao do fluxo fica em `docs/profile-review-e2e-validation.md`

## Relacao com Plano de Avaliacoes

- professor define o plano e suas regras
- aluno apenas visualiza plano e status
- sistema notifica proximas avaliacoes no resumo/notificacoes

## Mapeamento por tela

### Inicio

Consumir:
- `GET /api/v1/student/me/summary`

Exibir:
- nome
- contrato ativo e historico resumido
- proxima revisao cadastral e sinalizacao da pendencia atual
- proxima avaliacao
- ultimo treino
- notificacoes recentes

### Meu Perfil

Consumir:
- `GET /api/v1/student/me/profile`
- `PUT /api/v1/student/me/profile`

Exibir:
- dados pessoais e contato permitidos
- resumo contratual do aluno (somente leitura)
- endereco
- preferencias/intake permitido

### Contrato

Consumir:
- `GET /api/v1/student/me/contract`

Exibir:
- contrato ativo
- historico resumido de contratos encerrados/cancelados
- valor, dia de pagamento e documento assinado apenas quando permitido

Editar:
- somente campos de autoatendimento

### Revisao Cadastral

Implementacao web atual:
- rota `/student/profile-review`
- responsiva para mobile e desktop
- preserva contexto `contractId`
- mensagens de conclusao dependem da resposta do backend

Consumir:
- `GET /api/v1/student/me/profile-review`
- `GET /api/v1/student/me/profile`
- `POST /api/v1/student/me/profile-reviews/:id/complete`

Exibir:
- revisao pendente
- prazo
- secoes solicitadas
- estados de carregamento, ausencia de pendencia e erro recuperavel

Acao:
- concluir sem alteracoes
- concluir com alteracoes (com fluxo de aprovacao para campos sensiveis)

### Minhas Avaliacoes

Consumir:
- `GET /api/v1/student/me/assessments`

Exibir:
- lista historica
- tipo, data, metadados relevantes

### Plano de Avaliacoes

Consumir:
- `GET /api/v1/student/me/assessment-plan`

Exibir:
- itens do plano
- proxima data prevista
- status por item

### Meus Treinos

Consumir inicialmente:
- `GET /api/v1/student/me/summary` (ultimo treino)

Evolucao futura:
- endpoint dedicado para plano e execucoes de treino

### Agenda

Consumir inicialmente:
- dados resumidos no `GET /api/v1/student/me/summary`

Evolucao futura:
- endpoint dedicado para compromissos/aulas do aluno

### Notificacoes

Consumir inicialmente:
- `GET /api/v1/student/me/summary` (notificacoes recentes)

Evolucao futura:
- endpoint dedicado para listagem paginada e marcacao de leitura

## Criterios de aceite do contrato

- Campos do perfil separados claramente em editaveis diretamente, alteraveis com aprovacao e somente leitura.
- Contrato dos endpoints `/api/v1/student/me` documentado com payloads esperados.
- Regras de privacidade, `contractId`, fluxo de revisao cadastral e relacao com plano de avaliacoes descritos.
- Web responsivo e futuro app mobile compartilham o mesmo contrato de backend.
- O cliente consegue consultar contrato ativo por `GET /api/v1/student/me/summary` e `GET /api/v1/student/me/contract`.
- Nenhum endpoint de `student/me` permite alteracao de contrato pelo aluno.
