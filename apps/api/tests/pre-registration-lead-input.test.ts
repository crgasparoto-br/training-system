import { validateAndNormalizePreRegistrationLeadInput } from '../src/modules/pre-registration-enrollment/pre-registration-lead-input.js';

describe('validateAndNormalizePreRegistrationLeadInput', () => {
  it('normalizes a valid lead payload', () => {
    const result = validateAndNormalizePreRegistrationLeadInput({
      name: '  Maria   da Silva ',
      origin: '  Indicação   interna ',
      phone: '(15) 99999-9999',
      email: ' MARIA@EXEMPLO.COM ',
      cpf: '529.982.247-25',
      unit: '  Unidade   Centro ',
      commercialNotes: '  Primeiro contato  \n  Retornar amanhã  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: 'Maria da Silva',
        origin: 'Indicação interna',
        phone: '(15) 99999-9999',
        email: 'maria@exemplo.com',
        cpf: '529.982.247-25',
        unit: 'Unidade Centro',
        commercialNotes: 'Primeiro contato\nRetornar amanhã',
      },
    });
  });

  it('rejects missing required fields before persistence', () => {
    const result = validateAndNormalizePreRegistrationLeadInput({ name: ' ', origin: ' ' });

    expect(result).toMatchObject({
      success: false,
      fields: expect.arrayContaining(['name', 'origin', 'phone_or_email']),
    });
  });

  it.each([
    [{ name: 'Maria', origin: 'Campanha', phone: '1234' }, 'phone'],
    [{ name: 'Maria', origin: 'Campanha', email: 'maria@' }, 'email'],
    [
      {
        name: 'Maria',
        origin: 'Campanha',
        email: 'maria@example.com',
        cpf: '111.111.111-11',
      },
      'cpf',
    ],
  ])('rejects invalid structured input %#', (payload, expectedField) => {
    const result = validateAndNormalizePreRegistrationLeadInput(payload);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.fields).toContain(expectedField);
  });
});
