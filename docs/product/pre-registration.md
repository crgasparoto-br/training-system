# Pré-matrícula digital

Este documento é a fonte de produto para o ciclo único de lead até aluno ativo. Os documentos especializados de convites, Anamnese, PAR-Q e conversão continuam válidos para os detalhes de cada domínio.

## Objetivo

Permitir que a equipe registre um potencial aluno, compartilhe manualmente um convite seguro, acompanhe o preenchimento, revise possíveis duplicidades e confirme a matrícula sem copiar a pessoa para outro cadastro e sem perder o histórico.

O mesmo `Aluno.id` acompanha todo o ciclo. A ativação comercial não cria automaticamente contrato, cobrança, agenda, plano de treino ou liberação clínica.

## Estados do ciclo

1. `LEAD`: registro criado sem convite ativo.
2. `INVITED`: existe convite ativo e o preenchimento ainda não foi concluído.
3. `PRE_REGISTRATION_IN_PROGRESS`: o potencial aluno iniciou o fluxo autenticado.
4. `PRE_REGISTRATION_COMPLETED`: os dados básicos obrigatórios foram concluídos.
5. `READY_FOR_ENROLLMENT`: a revisão administrativa vigente foi concluída e o registro está apto à confirmação comercial.
6. `ACTIVE_STUDENT`: a equipe confirmou a matrícula no mesmo registro canônico.
7. `DISCARDED`: o processo comercial foi encerrado com motivo e auditoria.

Anamnese, PAR-Q e análise profissional são estados complementares. Eles não substituem o ciclo comercial e não bloqueiam a matrícula nesta entrega.

## Fluxo administrativo

1. Criar um lead com nome, origem e pelo menos telefone ou e-mail.
2. Revisar candidatos a duplicidade antes da criação ou alteração de identidade.
3. Gerar ou regenerar um convite. Somente o token bruto recém-criado pode ser copiado.
4. Compartilhar o link por um canal externo; o sistema não envia o convite automaticamente.
5. Acompanhar progresso, pendências, consentimento, estado resumido da Anamnese e estado resumido do PAR-Q.
6. Resolver falso positivo ou consolidação quando houver candidatos compatíveis e permissão suficiente.
7. Revisar a versão atual dos dados e marcar o registro como apto.
8. Confirmar a matrícula, preservando o mesmo identificador e revogando o convite ativo.

A interface administrativa não deve expor respostas clínicas completas em listagens ou resumos comerciais.

## Fluxo público

1. Abrir um convite válido.
2. Criar uma conta compatível ou reivindicar o convite com uma conta existente.
3. Após a reivindicação, acessar dados pessoais somente com sessão autenticada vinculada ao processo.
4. Confirmar identificação, contato, endereço, responsável quando aplicável e aviso de privacidade.
5. Salvar cada etapa com versão otimista e retomar em outro dispositivo.
6. Concluir o pré-cadastro básico.
7. Opcionalmente adiantar a Anamnese Inicial e o PAR-Q.

Token inválido, expirado, revogado ou substituído deve produzir resposta pública indistinguível e não enumerável.

## Anamnese Inicial

- Usa `StudentHealthIntake` como fonte canônica de novas gravações.
- É opcional, autenticada, salvável e retomável.
- Exige consentimento versionado antes da primeira gravação.
- Não contém antropometria, composição corporal, nutrição ou avaliação cardiovascular.
- Não bloqueia a conclusão comercial nem a ativação do aluno.

Consulte [`pre-registration-health-intake.md`](pre-registration-health-intake.md).

## PAR-Q

- Usa `StudentParqSubmission` como histórico canônico concluído.
- Usa catálogo versionado e cálculo no backend.
- Respostas positivas criam ou mantêm pendência de análise profissional.
- Uma submissão negativa posterior não encerra automaticamente uma pendência positiva anterior.
- O resultado não bloqueia a matrícula nesta entrega.

Consulte [`pre-registration-parq.md`](pre-registration-parq.md).

## Duplicidade e conversão

- CPF bloqueante é avaliado dentro do tenant; e-mail e telefone podem exigir revisão.
- A resposta pública nunca revela candidato, contato, CPF, fingerprint ou classificação.
- Consolidação não exclui fisicamente o registro de origem.
- Relações operacionais ou clínicas na origem bloqueiam consolidação automática até existir reassociação transacional específica.
- A ativação normal é uma transição do mesmo registro; não é uma cópia de lead para aluno.

Consulte [`pre-registration-enrollment-conversion.md`](pre-registration-enrollment-conversion.md) e [`../architecture/pre-registration-enrollment.md`](../architecture/pre-registration-enrollment.md).

## Permissões administrativas

A tela exige `students.preRegistration`. As ações são independentes:

- `students.preRegistration.create`;
- `students.preRegistration.editCommercial`;
- `students.preRegistration.generateInvite`;
- `students.preRegistration.revokeInvite`;
- `students.preRegistration.review`;
- `students.preRegistration.discardReopen`;
- `students.preRegistration.convert`.

Toda leitura e mutação também respeita `contractId` e, quando aplicável, `dataScope`. Ocultar um botão não substitui a autorização do backend.

## Rollout

Em produção, a API e a interface ficam desabilitadas quando suas flags estão ausentes ou inválidas. O rollout deve seguir o runbook [`../operations/pre-registration-rollout-and-qa.md`](../operations/pre-registration-rollout-and-qa.md).
