# Proveniência demográfica da Adipometria (ADPT)

A conclusão de uma avaliação ADPT não aceita idade, sexo ou maturação enviados pelo frontend ou por SQL chamador como autoridade clínica. Esses dados são resolvidos novamente dentro da mesma transação que conclui a avaliação.

## Ordem das fontes

A função `resolveAdipometryCanonicalProfile` aplica a seguinte precedência:

1. `StudentProfile.identificationData`, fonte canônica do cadastro do aluno;
2. `Aluno.birthDate`, projeção normalizada usada durante o ciclo lead → aluno;
3. `Profile.birthDate` e `Profile.gender`, fallback legado vinculado ao usuário do aluno.

Não existe fallback para maturação. Quando um protocolo exigir esse critério, ele deve estar registrado em `StudentProfile.identificationData.maturation`.

## Regras

- A idade é calculada em anos completos entre a data de nascimento e `assessmentDate`.
- A data de nascimento posterior à avaliação é bloqueada.
- Sexo é normalizado para código maiúsculo antes da comparação com `population.sexCriteria`.
- Valores demográficos presentes em `calculationSnapshot` no comando recebido são descartados.
- O snapshot final registra data de nascimento, sexo, maturação e a origem de cada campo.
- As linhas de cadastro consultadas são bloqueadas para leitura até o fim da transação, evitando mudança concorrente entre resolução e persistência.
- Alterações posteriores do cadastro não recalculam avaliações concluídas; o snapshot histórico permanece imutável.

## Erros de domínio

- `ADIPOMETRY_BIRTH_DATE_REQUIRED`
- `ADIPOMETRY_BIRTH_DATE_INVALID`
- `ADIPOMETRY_BIRTH_DATE_AFTER_ASSESSMENT`
- `ADIPOMETRY_SEX_REQUIRED`
- `ADIPOMETRY_SEX_INVALID`
- `ADIPOMETRY_MATURATION_REQUIRED`
- `ADIPOMETRY_MATURATION_INVALID`

## Controle adversarial

`scripts/verify-adipometry-demographic-provenance.sh` comprova que:

- idade e sexo fabricados pelo chamador são substituídos;
- a idade muda corretamente na data do aniversário;
- ausência canônica de nascimento ou sexo bloqueia a conclusão mesmo com snapshot forjado;
- protocolo que exige maturação rejeita maturação fornecida apenas pelo chamador;
- fallback legado permanece funcional para registros existentes.
