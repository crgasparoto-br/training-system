# Ciclo de vida dos contratos do aluno

## Fonte de verdade

O documento jurídico é persistido em `Contract`, enquanto o vínculo de vigência do aluno é persistido em `StudentContract`.

- `Contract.status` representa o estado do documento: rascunho, enviado, visualizado, assinado, expirado ou cancelado.
- `StudentContract.status` representa o estado do vínculo: rascunho, aguardando assinatura/início, ativo, expirado, cancelado ou encerrado.
- `Aluno.currentStudentContractId` aponta para o único vínculo vigente do aluno.

Campos textuais legados da aba Financeiro permanecem apenas como observação e não substituem o vínculo real.

## Preparação de substituição

Gerar, enviar ou visualizar um novo documento não encerra o contrato vigente.

Ao preparar um candidato:

- documento `DRAFT` mantém o vínculo candidato em `draft`;
- documento `SENT` ou `VIEWED` coloca o candidato em `pending_signature`;
- documento `CANCELLED` ou `EXPIRED`, ou vínculo cancelado, expirado ou encerrado, não pode ser reativado;
- o vínculo atual e `Aluno.currentStudentContractId` permanecem inalterados.

## Assinatura e data efetiva

A data efetiva é a maior entre a data de assinatura e a data de início planejada.

### Ativação imediata

Quando a data efetiva é a própria assinatura:

1. o token público é reivindicado atomicamente;
2. a assinatura e o log de auditoria são gravados;
3. o contrato vigente anterior recebe `terminated` e `endDate`;
4. o candidato recebe `active` e `startDate` com a mesma data;
5. `Aluno.currentStudentContractId` passa a apontar para o candidato;
6. todas as mudanças são confirmadas na mesma transação.

### Início futuro

Quando a data planejada é futura:

- o documento fica `SIGNED`;
- o vínculo candidato fica `pending_signature`, com `signedAt` preenchido;
- o contrato vigente permanece ativo;
- o agendador chama `activateDueSignedContracts` e efetiva a troca na data planejada;
- o término do vínculo anterior e o início do novo usam a mesma data, sem lacuna e sem sobreposição.

## Concorrência e idempotência

- o token público é consumido por atualização condicional; somente uma assinatura concorrente pode reivindicá-lo;
- a ativação bloqueia a linha do aluno com `FOR UPDATE`, serializando trocas concorrentes do mesmo aluno;
- uma repetição sobre candidato já ativo apenas reafirma `Aluno.currentStudentContractId`;
- o resultado persistido mantém no máximo um vínculo `active` por aluno.

## Recusa, expiração e cancelamento

Recusa, expiração ou cancelamento do candidato:

- invalida o token público quando aplicável;
- registra o estado e a auditoria do candidato;
- não altera o vínculo vigente;
- impede assinatura posterior com o mesmo token;
- impede que o candidato seja reativado pelo fluxo de preparação.

## Falhas e rollback

Assinatura, consumo do token, criação de assinatura, auditoria, encerramento do vínculo anterior, ativação do candidato e atualização do ponteiro do aluno pertencem à mesma transação. Uma falha em qualquer etapa reverte todas as alterações, preservando o token e o contrato vigente.

## Validação automatizada

O workflow oficial inicia PostgreSQL, aplica as migrations e executa testes com persistência real cobrindo:

- preparação em `DRAFT`, `SENT` e `VIEWED`;
- recusa, expiração e cancelamento;
- assinatura imediata;
- assinatura com início futuro e execução do agendador;
- igualdade entre término do anterior e início do novo;
- atualização transacional de `Aluno.currentStudentContractId`;
- assinatura e agendador concorrentes;
- rollback forçado durante a ativação;
- manutenção de um único vínculo ativo.
