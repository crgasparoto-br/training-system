import {
  buildStudentAdministrativeFormResponsesReadModel,
  buildStudentAdministrativeIdentityPatch,
  mergeStudentAdministrativeFormResponses,
  upsertStudentAdministrativeFormResponses,
} from '../src/modules/alunos/student-administrative-form-responses.service';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service';

jest.mock('../src/modules/alunos/student-identity.service', () => ({
  upsertStudentIdentity: jest.fn(),
}));

describe('administrative student form responses', () => {
  it('keeps the canonical writer responsible for synchronizing the legacy projection', async () => {
    const tx = {
      aluno: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ contractId: 'contract-1' }),
      },
    } as any;
    const mockedUpsertStudentIdentity = upsertStudentIdentity as jest.Mock;
    mockedUpsertStudentIdentity.mockClear();

    await upsertStudentAdministrativeFormResponses(tx, 'aluno-1', {
      identification: { maritalStatus: 'União estável' },
    });

    expect(mockedUpsertStudentIdentity).toHaveBeenCalledWith(
      'aluno-1',
      'contract-1',
      { maritalStatus: 'stable_union' },
      expect.objectContaining({
        client: tx,
        syncLegacyProfile: true,
      })
    );
  });

  it('maps compatibility form names to canonical identity keys', () => {
    expect(
      buildStudentAdministrativeIdentityPatch({
        cpf: '139.513.548-79',
        rg: '20.743.396-X',
        maritalStatus: 'Casado(a)',
        address: 'Rua A',
        neighborhood: 'Centro',
        socialNetwork: 'linkedin',
        instagram: 'https://linkedin.com/in/aluno',
        emergencyContactRelationship: 'Vizinho de confiança',
      })
    ).toEqual({
      cpf: '139.513.548-79',
      rg: '20.743.396-X',
      maritalStatus: 'married',
      addressStreet: 'Rua A',
      addressNeighborhood: 'Centro',
      socialNetwork: 'linkedin',
      socialAccount: 'https://linkedin.com/in/aluno',
      emergencyContactRelationship: 'Vizinho de confiança',
    });
  });

  it('uses canonical identification over legacy fallback and exposes the current web aliases', () => {
    expect(
      buildStudentAdministrativeFormResponsesReadModel({
        legacy: {
          identification: {
            cpf: 'legacy',
            instagram: '@legado',
            emergencyContactRelationship: 'Amigo(a)',
          },
        },
        profile: {
          identification: {
            cpf: '13951354879',
            socialNetwork: 'linkedin',
            socialAccount: 'aluno-linkedin',
            emergencyContactRelationship: 'Vizinho de confiança',
          },
        },
      })
    ).toMatchObject({
      identification: {
        cpf: '13951354879',
        socialNetwork: 'linkedin',
        socialAccount: 'aluno-linkedin',
        instagram: 'aluno-linkedin',
        emergencyContactRelationship: 'Vizinho de confiança',
      },
    });
  });

  it('assumes Instagram only as read fallback when a legacy account has no network', () => {
    expect(
      buildStudentAdministrativeFormResponsesReadModel({
        legacy: { identification: {} },
        profile: { identification: { cpf: '13951354879' } },
        legacyInstagramHandle: '@aluno',
      })
    ).toMatchObject({
      identification: {
        socialNetwork: 'instagram',
        socialAccount: '@aluno',
        instagram: '@aluno',
      },
    });
  });

  it('persists decimal discount received with pt-BR comma without losing precision', async () => {
    const tx = {
      aluno: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ contractId: 'contract-1' }),
      },
      studentFinancialProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as any;

    await upsertStudentAdministrativeFormResponses(tx, 'aluno-1', {
      financial: { discountPercentage: '16,45' },
    });

    expect(tx.studentFinancialProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          alunoId: 'aluno-1',
          discountPercentage: 16.45,
        }),
      })
    );
  });

  it('normalizes every controlled label without changing canonical values or legacy values', () => {
    const statuses = [
      ['Solteiro(a)', 'single'],
      ['Casado(a)', 'married'],
      ['União estável', 'stable_union'],
      ['Divorciado(a)', 'divorced'],
      ['Separado(a)', 'separated'],
      ['Viúvo(a)', 'widowed'],
      ['Outro', 'other'],
    ] as const;

    for (const [label, canonical] of statuses) {
      expect(buildStudentAdministrativeIdentityPatch({ maritalStatus: label })).toMatchObject({
        maritalStatus: canonical,
      });
    }

    expect(buildStudentAdministrativeIdentityPatch({ maritalStatus: 'stable_union' })).toMatchObject({
      maritalStatus: 'stable_union',
    });
    expect(buildStudentAdministrativeIdentityPatch({ maritalStatus: '' })).toMatchObject({
      maritalStatus: null,
    });
    expect(buildStudentAdministrativeIdentityPatch({ maritalStatus: 'Viúvo' })).toMatchObject({
      maritalStatus: 'Viúvo',
    });
  });

  it('recarrega desconto decimal canônico no formato pt-BR', () => {
    expect(
      buildStudentAdministrativeFormResponsesReadModel({
        financial: { discountPercentage: 16.45 },
      })
    ).toMatchObject({
      financial: { discountPercentage: '16,45' },
    });
  });

  it('merges read compatibility sections without accepting legacy PAR-Q writes', () => {
    expect(
      mergeStudentAdministrativeFormResponses(
        {
          identification: { cpf: '111' },
          financial: { currentService: 'Contrato atual', paymentDay: '5' },
        },
        {
          identification: { cpf: '222', emergencyContactRelationship: 'Vizinho' },
          financial: { currentService: 'valor do navegador', monthlyValue: '300,00' },
          parqResponses: { q1: true },
        }
      )
    ).toEqual({
      identification: { cpf: '222', emergencyContactRelationship: 'Vizinho' },
      financial: {
        currentService: 'Contrato atual',
        paymentDay: '5',
        monthlyValue: '300,00',
      },
    });
  });

  it('does not create a client-owned current service when none is persisted', () => {
    expect(
      mergeStudentAdministrativeFormResponses({}, {
        financial: { currentService: 'não confiável', paymentDay: '10' },
      })
    ).toEqual({ financial: { paymentDay: '10' } });
  });
});
