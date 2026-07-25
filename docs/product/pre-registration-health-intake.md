# Anamnese Inicial no pré-cadastro

## Objetivo

A Anamnese Inicial é um módulo opcional, autenticado e retomável após a conclusão dos dados básicos do pré-cadastro. Ela registra informações declaradas de saúde para apoiar o acompanhamento profissional, sem representar diagnóstico, prescrição ou liberação para treino.

## Fronteiras funcionais

- A fonte canônica é `StudentHealthIntake`.
- `StudentOnboardingProcess` armazena somente status, referência e timestamps do módulo.
- PAR-Q possui ciclo próprio em `StudentParqSubmission`; concluir ou alterar um módulo não altera o status do outro.
- Antropometria, composição corporal, nutrição e dados cardiovasculares pertencem a avaliações e não fazem parte da Anamnese Inicial.
- `AlunoIntakeForm` permanece disponível apenas para leitura histórica e migração.

## Acesso e privacidade

O módulo exige conta autenticada vinculada ao mesmo `Aluno` e `contractId` do processo. Convite público não concede acesso às respostas de saúde. Um responsável somente acessa o menor quando existe autorização ativa validada conforme o fluxo de responsável do pré-cadastro.

Antes da primeira persistência do módulo público, o aluno ou responsável deve aceitar explicitamente a versão vigente do aviso de privacidade. O aceite registra versão, data, usuário, IP e agente do navegador. Mensagens públicas não revelam existência de aluno, tenant, responsável ou registro fora do escopo autorizado.

## Etapas e retomada

1. Privacidade e consentimento.
2. Histórico de saúde e objetivo.
3. Medicamentos e alergias.
4. Lesões e restrições para exercício.
5. Experiência com atividade física e observações.
6. Revisão e declaração final.

Cada etapa é salva de forma transacional e incrementa a versão do registro. Outra aba ou dispositivo que tentar salvar uma versão antiga recebe conflito explícito e deve recarregar a versão mais recente; não há sobrescrita silenciosa. O usuário pode escolher **Agora não** ou **Salvar e continuar depois**.

## Estados

- `NOT_STARTED`: nenhuma etapa de saúde persistida.
- `IN_PROGRESS`: consentimento registrado e ao menos uma etapa salva.
- `COMPLETED`: validação final executada pelo backend e declaração aceita.

O pré-cadastro básico continua concluído mesmo quando a Anamnese não foi iniciada ou foi interrompida.

## Validação de conclusão

O backend exige resposta explícita para condição de saúde, uso de medicamentos, lesões, alergias e restrições de exercício. Quando uma resposta é positiva, a descrição correspondente é obrigatória. Campos internos, PAR-Q, medidas corporais, nutrição e dados cardiovasculares são rejeitados pela allowlist do endpoint.
