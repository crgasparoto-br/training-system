import {
  upsertStudentIdentity,
  type StudentIdentityData,
} from '../src/modules/alunos/student-identity.service';

type MockClient = {
  aluno: {
    findFirst: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  studentProfile: { upsert: jest.Mock };
  profile: { update: jest.Mock };
  studentLifecycleEvent: { create: jest.Mock };
};

const profileDefaults = {
  name: 'Aluno Original',
  phone: null,
  birthDate: null,
  gender: null,
  cpf: null,
  rg: null,
  maritalStatus: null,
  addressStreet: null,
  addressNumber: null,
  addressComplement: null,
  addressNeighborhood: null,
  addressCity: null,
  addressState: null,
  addressZipCode: null,
  instagramHandle: null,
};

const makeClient = (overrides: Record<string, unknown> = {}): MockClient => {
  const aluno = {
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
    studentProfile: null,
    user: { profile: { ...profileDefaults } },
    ...overrides,
  };

  return {
    aluno: {
      findFirst: jest.fn().mockResolvedValue(aluno),
      update: jest.fn().mockResolvedValue(aluno),
      count: jest.fn().mockResolvedValue(1),
    },
    studentProfile: { upsert: jest.fn().mockResolvedValue({}) },
    profile: { update: jest.fn().mockResolvedValue({}) },
    studentLifecycleEvent: { create: jest.fn().mockResolvedValue({}) },
  };
};

describe('upsertStudentIdentity marital-status boundary', () => {
  it('normalizes a localized label before writing StudentProfile and Profile', async () => {
    const client = makeClient();
    const legacyPatch = { maritalStatus: 'Casado(a)' } as unknown as StudentIdentityData;

    const identity = await upsertStudentIdentity('aluno-1', 'contract-1', legacyPatch, {
      client: client as never,
      syncLegacyProfile: true,
      emitAuditEvent: false,
    });

    expect(identity.maritalStatus).toBe('married');
    expect(client.studentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          identificationData: expect.objectContaining({ maritalStatus: 'married' }),
        }),
      })
    );
    expect(client.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maritalStatus: 'married' }),
      })
    );
  });

  it('keeps an unknown legacy value in canonical JSON without sending it to the enum projection', async () => {
    const client = makeClient({
      studentProfile: {
        identificationData: { maritalStatus: 'Viúvo' },
        sourceType: 'student',
        sourceReference: null,
        recordedByUserId: null,
      },
      user: { profile: { ...profileDefaults, maritalStatus: 'single' } },
    });

    const identity = await upsertStudentIdentity(
      'aluno-1',
      'contract-1',
      { name: 'Aluno Atualizado' },
      {
        client: client as never,
        syncLegacyProfile: true,
        emitAuditEvent: false,
      }
    );

    expect(identity.maritalStatus).toBe('Viúvo');
    expect(client.studentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          identificationData: expect.objectContaining({ maritalStatus: 'Viúvo' }),
        }),
      })
    );
    expect(client.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maritalStatus: 'single' }),
      })
    );
  });

  it.each([
    ['Casado(a)', 'married'],
    ['União estável', 'stable_union'],
    ['Divorciado(a)', 'divorced'],
  ])('normalizes a known stored label during an unrelated identity update', async (label, canonical) => {
    const client = makeClient({
      studentProfile: {
        identificationData: { maritalStatus: label },
        sourceType: 'student',
        sourceReference: null,
        recordedByUserId: null,
      },
    });

    const identity = await upsertStudentIdentity(
      'aluno-1',
      'contract-1',
      { name: 'Aluno Atualizado' },
      {
        client: client as never,
        syncLegacyProfile: true,
        emitAuditEvent: false,
      }
    );

    expect(identity.maritalStatus).toBe(canonical);
    expect(client.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maritalStatus: canonical }),
      })
    );
  });

  it('writes null for an explicit empty marital-status selection', async () => {
    const client = makeClient({
      user: { profile: { ...profileDefaults, maritalStatus: 'married' } },
    });

    const identity = await upsertStudentIdentity(
      'aluno-1',
      'contract-1',
      { maritalStatus: null },
      {
        client: client as never,
        syncLegacyProfile: true,
        emitAuditEvent: false,
      }
    );

    expect(identity.maritalStatus).toBeNull();
    expect(client.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maritalStatus: null }),
      })
    );
  });
});
