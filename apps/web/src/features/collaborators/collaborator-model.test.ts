import { describe, expect, it } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';
import {
  collaboratorFormSchema,
  createCollaboratorFormValues,
  toCreateProfessorRequest,
  toSelfServiceUpdateProfessorRequest,
  toUpdateProfessorRequest,
} from './collaborator-model';

const collaborator = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
  responsibleManager: null,
  admissionDate: '2026-01-10T00:00:00.000Z',
  dismissalDate: null,
  currentStatus: 'Ativo',
  operationalRoleIds: ['function-1'],
  hourlyRates: { personal: 100, consulting: 80, evaluation: 120 },
  hasSignedContract: true,
  signedContractDocumentUrl: 'https://example.com/contract.pdf',
  user: {
    id: 'user-1',
    email: 'COLLABORATOR@example.com',
    isActive: true,
    profile: {
      name: 'Colaborador Teste',
      phone: '(15) 99999-9999',
      cpf: '12345678900',
      bankCode: '001',
      bankName: 'Banco do Brasil',
      avatar: '/uploads/professores/avatar.webp',
    },
  },
  contract: { id: 'contract-1', type: 'academy', document: '123' },
  createdAt: '2026-01-01T00:00:00.000Z',
} as ProfessorSummary;

describe('collaborator model', () => {
  it('reutiliza o mesmo mapeamento para preencher a edição sem carregar contrato legado', () => {
    const values = createCollaboratorFormValues(collaborator);
    expect(values).toMatchObject({
      name: 'Colaborador Teste',
      email: 'COLLABORATOR@example.com',
      collaboratorFunctionId: 'function-1',
      operationalRoleIds: ['function-1'],
      avatar: '/uploads/professores/avatar.webp',
      hourlyRates: { personal: '100,00', consulting: '80,00', evaluation: '120,00' },
    });
    expect(values).not.toHaveProperty('hasSignedContract');
    expect(values).not.toHaveProperty('signedContractDocumentUrl');
    expect(collaboratorFormSchema.safeParse(values).success).toBe(true);
  });

  it('preserva os campos cadastrais nos payloads sem enviar contrato legado', () => {
    const values = { ...createCollaboratorFormValues(collaborator), password: '12345678' };
    const createPayload = toCreateProfessorRequest(values);
    const updatePayload = toUpdateProfessorRequest(values);

    expect(createPayload).toMatchObject({
      name: 'Colaborador Teste',
      email: 'collaborator@example.com',
      password: '12345678',
      collaboratorFunctionId: 'function-1',
      operationalRoleIds: ['function-1'],
      hourlyRates: { personal: 100, consulting: 80, evaluation: 120 },
    });
    expect(updatePayload).toMatchObject({
      collaboratorFunctionId: 'function-1',
      currentStatus: 'Ativo',
    });
    expect(createPayload).not.toHaveProperty('hasSignedContract');
    expect(createPayload).not.toHaveProperty('signedContractDocumentUrl');
    expect(updatePayload).not.toHaveProperty('hasSignedContract');
    expect(updatePayload).not.toHaveProperty('signedContractDocumentUrl');
  });

  it('aceita separadores monetários em português e decimal técnico', () => {
    const base = { ...createCollaboratorFormValues(collaborator), password: '12345678' };
    expect(toCreateProfessorRequest({
      ...base,
      hourlyRates: { personal: '1.234,56', consulting: '100.50', evaluation: '1000' },
    }).hourlyRates).toEqual({ personal: 1234.56, consulting: 100.5, evaluation: 1000 });
  });

  it('rejeita remuneração negativa ou inválida antes do envio', () => {
    const base = createCollaboratorFormValues(collaborator);
    expect(collaboratorFormSchema.safeParse({
      ...base,
      hourlyRates: { ...base.hourlyRates, personal: '-1' },
    }).success).toBe(false);
    expect(collaboratorFormSchema.safeParse({
      ...base,
      hourlyRates: { ...base.hourlyRates, personal: 'abc' },
    }).success).toBe(false);
  });

  it('remove campos administrativos do autoatendimento', () => {
    const payload = toSelfServiceUpdateProfessorRequest(createCollaboratorFormValues(collaborator));
    expect(payload).not.toHaveProperty('collaboratorFunctionId');
    expect(payload).not.toHaveProperty('operationalRoleIds');
    expect(payload).not.toHaveProperty('hourlyRates');
    expect(payload).not.toHaveProperty('hasSignedContract');
    expect(payload).not.toHaveProperty('signedContractDocumentUrl');
    expect(payload).toMatchObject({ name: 'Colaborador Teste', email: 'collaborator@example.com' });
  });

  it('ignora campos contratuais legados recebidos em objetos externos', () => {
    const result = collaboratorFormSchema.safeParse({
      ...createCollaboratorFormValues(),
      name: 'Colaborador Teste',
      email: 'teste@example.com',
      collaboratorFunctionId: 'function-1',
      hasSignedContract: true,
      signedContractDocumentUrl: 'https://example.com/legado.pdf',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('hasSignedContract');
      expect(result.data).not.toHaveProperty('signedContractDocumentUrl');
    }
  });
});
