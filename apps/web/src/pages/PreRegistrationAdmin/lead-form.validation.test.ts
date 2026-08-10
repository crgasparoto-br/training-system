import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEAD_FORM_VALUES,
  formatLeadPhone,
  normalizeLeadFormValues,
  validateLeadFormValues,
} from './lead-form.validation';

describe('lead form validation', () => {
  it('formats Brazilian landline and mobile numbers', () => {
    expect(formatLeadPhone('15999999999')).toBe('(15) 99999-9999');
    expect(formatLeadPhone('1533334444')).toBe('(15) 3333-4444');
  });

  it('normalizes textual and email fields before submission', () => {
    const values = normalizeLeadFormValues({
      ...EMPTY_LEAD_FORM_VALUES,
      name: '  Maria   da Silva  ',
      email: '  MARIA@EXEMPLO.COM ',
      origin: '  Indicação   interna ',
      commercialNotes: '  Primeiro contato  \n  Retornar amanhã  ',
    });

    expect(values).toMatchObject({
      name: 'Maria da Silva',
      email: 'maria@exemplo.com',
      origin: 'Indicação interna',
      commercialNotes: 'Primeiro contato\nRetornar amanhã',
    });
  });

  it('requires name, origin and at least one contact', () => {
    const errors = validateLeadFormValues(EMPTY_LEAD_FORM_VALUES);
    expect(errors.name).toBeDefined();
    expect(errors.origin).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it('rejects invalid optional identifiers and contacts', () => {
    const errors = validateLeadFormValues({
      ...EMPTY_LEAD_FORM_VALUES,
      name: 'Maria da Silva',
      origin: 'Indicação',
      phone: '(15) 1234',
      additionalPhone: '(15) 9999',
      email: 'maria@',
      additionalEmail: 'outro@',
      cpf: '111.111.111-11',
    });

    expect(errors.phone).toBeDefined();
    expect(errors.additionalPhone).toBeDefined();
    expect(errors.email).toBeDefined();
    expect(errors.additionalEmail).toBeDefined();
    expect(errors.cpf).toBeDefined();
  });

  it('accepts a valid lead with either phone or email', () => {
    const phoneOnly = validateLeadFormValues({
      ...EMPTY_LEAD_FORM_VALUES,
      name: 'Maria da Silva',
      origin: 'Indicação',
      phone: '(15) 99999-9999',
      cpf: '529.982.247-25',
    });
    const emailOnly = validateLeadFormValues({
      ...EMPTY_LEAD_FORM_VALUES,
      name: 'João da Silva',
      origin: 'Campanha',
      email: 'joao@example.com',
    });

    expect(phoneOnly).toEqual({});
    expect(emailOnly).toEqual({});
  });
});
