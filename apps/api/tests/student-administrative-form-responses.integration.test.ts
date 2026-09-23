import { upsertStudentAdministrativeFormResponses } from '../src/modules/alunos/student-administrative-form-responses.service';

type MockAdministrativeTransaction = {
  aluno: {
    findUniqueOrThrow: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  studentProfile: { upsert: jest.Mock };
  profile: { update: jest.Mock };
  studentLifecycleEvent: { create: jest.Mock };
};

const makeTransaction = (): MockAdministrativeTransaction => ({
  aluno: {
    findUniqueOrThrow: jest.fn().mockResolvedValue({ contractId: 'contract-1' }),
    findFirst: jest.fn().mockResolvedValue({
      id: 'aluno-1',
      contractId: 'contract-1',
      userId: 'user-1',
      leadName: 'Aluno Original',
      leadEmail: null,
      leadPhone: null,
      leadCpf: null,
      leadEmailNormalized: null,
      leadPhoneNormalized: null,
      leadCpfNormalized: null,
      birthDate: null,
      studentProfile: {
        identificationData: { maritalStatus: 'single' },
        sourceType: 'student',
        sourceReference: null,
        recordedByUserId: null,
      },
      user: {
        profile: {
          name: 'Aluno Original',
          phone: null,
          birthDate: null,
          gender: null,
          cpf: null,
          rg: null,
          maritalStatus: 'single',
          addressStreet: null,
          addressNumber: null,
          addressComplement: null,
          addressNeighborhood: null,
          addressCity: null,
          addressState: null,
          addressZipCode: null,
          instagramHandle: null,
        },
      },
    }),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(1),
  },
  studentProfile: { upsert: jest.fn().mockResolvedValue({}) },
  profile: { update: jest.fn().mockResolvedValue({}) },
  studentLifecycleEvent: { create: jest.fn().mockResolvedValue({}) },
});

describe('administrative identity update integration', () => {
  it('propagates a changed canonical marital status to the valid Profile projection', async () => {
    const tx = makeTransaction();

    await upsertStudentAdministrativeFormResponses(tx as never, 'aluno-1', {
      identification: { maritalStatus: 'União estável' },
    });

    expect(tx.studentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          identificationData: expect.objectContaining({ maritalStatus: 'stable_union' }),
        }),
      })
    );
    expect(tx.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maritalStatus: 'stable_union' }),
      })
    );
  });
});
