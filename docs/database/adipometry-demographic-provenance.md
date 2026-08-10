# Proveniência demográfica da Adipometria (ADPT)

A conclusão de uma avaliação ADPT não aceita idade, sexo ou maturação enviados pelo frontend ou por SQL chamador como autoridade clínica. Esses dados são resolvidos novamente dentro da mesma transação que conclui a avaliação e confrontados com o contrato demográfico executável do protocolo aprovado.

## Ordem das fontes

A função `resolveAdipometryCanonicalProfile` aplica a seguinte precedência:

1. `StudentProfile.identificationData`, fonte canônica do cadastro do aluno;
2. `Aluno.birthDate`, projeção normalizada usada durante o ciclo lead → aluno;
3. `Profile.birthDate` e `Profile.gender`, fallback legado vinculado ao usuário do aluno.

Não existe fallback para maturação. Quando um protocolo exigir esse critério, ele deve estar registrado em `StudentProfile.identificationData.maturation`.

## Valores canônicos

- A idade é calculada em anos completos entre a data de nascimento e `assessmentDate`.
- Sexo é normalizado para `MALE`, `FEMALE` ou `OTHER`.
- Maturação é aparada e normalizada para maiúsculas antes da comparação.
- Valores fora desses contratos são rejeitados; não existe fallback silencioso.
- A data de nascimento posterior à avaliação é bloqueada.
- Valores demográficos presentes em `calculationSnapshot` no comando recebido são descartados.
- O snapshot final registra data de nascimento, sexo, maturação e a origem de cada campo.
- Alterações posteriores do cadastro não recalculam avaliações concluídas; o snapshot histórico permanece imutável.

## Contrato demográfico do protocolo

`population.sexCriteria` usa somente códigos canônicos maiúsculos e não aceita valores livres.

A descrição clínica humana permanece em `population.maturationCriteria`, mas a regra executável é obrigatoriamente informada em `population.maturationRule`:

```json
{
  "mode": "NOT_REQUIRED"
}
```

ou:

```json
{
  "mode": "REQUIRED",
  "allowedValues": ["ADULT", "TANNER_STAGE_5"]
}
```

Para `REQUIRED`, os valores são não vazios, únicos, canônicos e todos os vetores de aprovação devem usar maturação compatível. Durante a conclusão, maturação ausente gera `ADIPOMETRY_MATURATION_REQUIRED`; valor presente, mas fora de `allowedValues`, gera `ADIPOMETRY_MATURATION_NOT_APPLICABLE`.

A AST clínica pode usar `ageAtAssessment` como variável numérica. Condicionais `ifEquals` podem consultar apenas `profileCriteria.sex` e `profileCriteria.maturation`, porque são os únicos critérios discretos reproduzíveis pelo resolvedor canônico. Campos arbitrários como `profileCriteria.magic` invalidam a aprovação do protocolo.

## Erros de domínio

- `ADIPOMETRY_BIRTH_DATE_REQUIRED`
- `ADIPOMETRY_BIRTH_DATE_INVALID`
- `ADIPOMETRY_BIRTH_DATE_AFTER_ASSESSMENT`
- `ADIPOMETRY_SEX_REQUIRED`
- `ADIPOMETRY_SEX_INVALID`
- `ADIPOMETRY_SEX_NOT_APPLICABLE`
- `ADIPOMETRY_MATURATION_REQUIRED`
- `ADIPOMETRY_MATURATION_INVALID`
- `ADIPOMETRY_MATURATION_NOT_APPLICABLE`
- `ADIPOMETRY_PROTOCOL_CANONICAL_PROFILE_INVALID`

## Controle adversarial

`scripts/verify-adipometry-demographic-provenance.sh` mantém a cobertura de precedência, idade e ausência de dados canônicos.

`scripts/verify-adipometry-canonical-profile-contract.sh` comprova adicionalmente que:

- protocolo com sexo em caixa não canônica não pode ser aprovado;
- protocolo sem `maturationRule` estruturada não pode ser aprovado;
- AST que consulta campo demográfico inexistente não pode ser aprovada;
- vetor com maturação incompatível não pode sustentar aprovação;
- maturação canônica presente, porém incompatível, bloqueia conclusão;
- sexo e maturação do snapshot final são normalizados e vêm do cadastro, não do chamador.
