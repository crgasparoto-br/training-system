# ADPT — separação entre ator e responsável clínico

A autorização para operar a Adipometria não é derivada do professor escolhido como responsável pela avaliação.

## Autoridade do ator

O ator autenticado precisa possuir um vínculo profissional próprio e ativo com o contrato. Esse vínculo pode vir de:

- um registro ativo de `Professor`; ou
- `ProfessionalActorMembership`, quando a conta profissional não possui registro próprio de `Professor`.

O vínculo direto registra `userId`, `contractId` e `collaboratorFunctionId`. A função deve pertencer ao mesmo contrato e permanecer ativa. As permissões de tela e blocos ADPT são resolvidas pela função do ator.

Se existir um registro de `Professor` inativo para a conta, um vínculo direto paralelo não pode contornar a inativação.

## Autoridade do responsável

O responsável clínico é selecionado separadamente e continua obrigado a:

- pertencer ao mesmo contrato;
- estar ativo e vigente;
- possuir acesso à tela de avaliação física;
- possuir o bloco de gestão ADPT, salvo a regra explícita de `master`.

As permissões ou o contrato do responsável nunca autorizam o ator.

## Fronteira da interface

A tela usa exclusivamente `GET /api/v1/adipometry/accessible-students` para listar alunos. Essa consulta aplica o contrato do ator e, quando o ator possui um registro de professor não master, preserva o escopo próprio e da equipe gerenciada.

Na criação, o navegador envia apenas o `responsibleProfessorId` escolhido. `contractId` e `actorUserId` continuam derivados da sessão e do vínculo profissional autenticado.

## Controle adversarial

O controle `AUTH-ACTOR-RESP-001` deve cobrir pela fronteira HTTP:

1. ator autorizado sem registro de `Professor`, selecionando responsável elegível;
2. ator sem vínculo profissional;
3. vínculo profissional inativo;
4. responsável de outro contrato;
5. ausência de avaliação persistida nos casos negados.
