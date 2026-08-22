import { validateContractProfileIdentityUpdate } from './contract-profile-validation.js';

describe('validateContractProfileIdentityUpdate', () => {
  it('aceita manter pessoa jurídica com CNPJ de 14 dígitos', () => {
    expect(
      validateContractProfileIdentityUpdate({
        currentType: 'academy',
        requestedType: 'academy',
        document: '12.345.678/0001-95',
      })
    ).toEqual({
      ok: true,
      targetType: 'academy',
      normalizedDocument: '12345678000195',
    });
  });

  it('aceita trocar para pessoa física com CPF de 11 dígitos', () => {
    expect(
      validateContractProfileIdentityUpdate({
        currentType: 'academy',
        requestedType: 'personal',
        document: '123.456.789-09',
      })
    ).toEqual({
      ok: true,
      targetType: 'personal',
      normalizedDocument: '12345678909',
    });
  });

  it('valida o documento contra o tipo de destino e não contra o tipo atual', () => {
    expect(
      validateContractProfileIdentityUpdate({
        currentType: 'personal',
        requestedType: 'academy',
        document: '12.345.678/0001-95',
      })
    ).toMatchObject({ ok: true, targetType: 'academy' });
  });

  it('exige novo documento ao trocar o tipo', () => {
    expect(
      validateContractProfileIdentityUpdate({
        currentType: 'academy',
        requestedType: 'personal',
        document: '',
      })
    ).toEqual({ ok: false, error: 'Informe um CPF válido' });
  });

  it('rejeita documento com tamanho incompatível com o tipo escolhido', () => {
    expect(
      validateContractProfileIdentityUpdate({
        currentType: 'academy',
        requestedType: 'personal',
        document: '12.345.678/0001-95',
      })
    ).toEqual({ ok: false, error: 'CPF inválido' });
  });

  it('rejeita tipo desconhecido', () => {
    expect(
      validateContractProfileIdentityUpdate({
        currentType: 'academy',
        requestedType: 'company',
        document: '12.345.678/0001-95',
      })
    ).toEqual({ ok: false, error: 'Tipo de pessoa inválido' });
  });
});
