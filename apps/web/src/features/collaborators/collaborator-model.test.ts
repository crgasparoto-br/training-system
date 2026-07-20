import { describe, expect, it } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';
import {
  collaboratorFormSchema,
  createCollaboratorFormValues,
  findCollaboratorById,
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
    },
  },
  contract: { id: 'contract-1', type: 'academy', document: '123' },
  createdAt: '2026-01-01T00:00:00.000Z',
} as ProfessorSummary;

describe('collaborator model', () => {
  it('reutiliza o mesmo mapeamento para preencher a edição', () => {
    const values = createCollaboratorFormValues(collaborator);
    expect(values).toMatchObject({
      name: 'Colaborador Teste',
      email: 'COLLABORATOR@example.com',
      collaboratorFunctionId: 'function-1',
      operationalRoleIds: ['function-1'],
      hasSignedContract: true,
      hourlyRates: { personal: '100,00', consulting: '80,00', evaluation: '120,00' },
    });
  });

  it('preserva os campos atuais nos payloads de criação e edição', () => {
    const values = { ...createCollaboratorFormValues(collaborator), password: '12345678' };
    expect(toCreateProfessorRequest(values)).toMatchObject({
      name: 'Colaborador Teste',
      email: 'collaborator@example.com',
      password: '12345678',
      collaboratorFunctionId: 'function-1',
      operationalRoleIds: ['function-1'],
      hourlyRates: { personal: 100, consulting: 80, evaluation: 120 },
      hasSignedContract: true,
      signedContractDocumentUrl: 'https://example.com/contract.pdf',
    });
    expect(toUpdateProfessorRequest(values)).toMatchObject({
      collaboratorFunctionId: 'function-1',
      currentStatus: 'Ativo',
      hasSignedContract: true,
    });
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

  it('exige o PDF quando o contrato é marcado como assinado', () => {
    const result = collaboratorFormSchema.safeParse({
      ...createCollaboratorFormValues(),
      name: 'Colaborador Teste',
      email: 'teste@example.com',
      collaboratorFunctionId: 'function-1',
      hasSignedContract: true,
      signedContractDocumentUrl: '',
    });
    expect(result.success).toBe(false);
  });

  it('retorna nulo para id inexistente ou fora da lista autorizada', () => {
    expect(findCollaboratorById([collaborator], 'professor-1')).toBe(collaborator);
    expect(findCollaboratorById([collaborator], 'outro-contrato')).toBeNull();
  });
});
