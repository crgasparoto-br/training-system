jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: {
    findById: jest.fn(),
  },
}));

jest.mock('../src/modules/alunos/student-domain.service', () => ({
  studentDomainService: {
    loadAlunoDomainSnapshot: jest.fn(),
    getFinancialProfile: jest.fn(),
    getSummary: jest.fn(),
    getHealthIntake: jest.fn(),
  },
}));

jest.mock('../src/modules/pre-registration-public/pre-registration-parq.service', () => ({
  preRegistrationParqService: {
    summary: jest.fn(),
    overview: jest.fn(),
  },
}));

const { alunoService } = require('../src/modules/alunos/aluno.service');
const { studentDomainService } = require('../src/modules/alunos/student-domain.service');
const {
  studentParqBoundaryService,
} = require('../src/modules/alunos/student-parq-boundary.service');

const parqSummary = {
  state: 'NOT_STARTED',
  latestSubmission: null,
  requiresProfessionalReview: false,
  legacy: { preserved: false, needsRepeat: false },
};

const legacyAluno = {
  id: 'aluno-legacy',
  contractId: 'contract-1',
  user: {
    profile: {
      instagramHandle: '@perfil-legado',
    },
  },
  intakeForm: {
    formResponses: {
      identification: {
        cpf: '13951354879',
        rg: '12345678X',
        maritalStatus: 'Separado judicialmente',
        address: 'Rua Legada',
        neighborhood: 'Centro',
        city: 'Sorocaba',
        state: 'SP',
        zipCode: '18000000',
        emergencyContactRelationship: 'Vizinho de confiança',
      },
      preferences: {
        preferredNickname: 'Gaspa',
      },
      parqResponses: { q1: true },
    },
  },
  parq: parqSummary,
};

describe('student PAR-Q administrative read boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (alunoService.findById as jest.Mock).mockResolvedValue(legacyAluno);
    (studentDomainService.getFinancialProfile as jest.Mock).mockResolvedValue(null);
  });

  it('preserves legacy administrative identity when no canonical StudentProfile exists', async () => {
    (studentDomainService.loadAlunoDomainSnapshot as jest.Mock).mockResolvedValue({
      studentProfile: null,
    });

    const result = await studentParqBoundaryService.getAdministrativeAluno(
      'contract-1',
      'aluno-legacy'
    );

    expect(result).not.toBeNull();
    if (!result) throw new Error('expected administrative aluno');

    expect(result.intakeForm.formResponses.identification).toMatchObject({
      cpf: '13951354879',
      rg: '12345678X',
      maritalStatus: 'Separado judicialmente',
      address: 'Rua Legada',
      neighborhood: 'Centro',
      city: 'Sorocaba',
      state: 'SP',
      zipCode: '18000000',
      emergencyContactRelationship: 'Vizinho de confiança',
      socialNetwork: 'instagram',
      socialAccount: '@perfil-legado',
      instagram: '@perfil-legado',
    });
    expect(result.intakeForm.formResponses.preferences).toEqual({
      preferredNickname: 'Gaspa',
    });
    expect(JSON.stringify(result)).not.toContain('parqResponses');
  });

  it('lets explicit canonical fields win while legacy siblings remain fallback', async () => {
    (studentDomainService.loadAlunoDomainSnapshot as jest.Mock).mockResolvedValue({
      studentProfile: {
        identificationData: {
          cpf: null,
          maritalStatus: 'Casado(a)',
          socialNetwork: 'linkedin',
          socialAccount: 'aluno-linkedin',
        },
        preferenceData: {
          favoriteChocolate: '70%',
        },
      },
    });

    const result = await studentParqBoundaryService.getAdministrativeAluno(
      'contract-1',
      'aluno-legacy'
    );

    expect(result).not.toBeNull();
    if (!result) throw new Error('expected administrative aluno');

    expect(result.intakeForm.formResponses.identification).toMatchObject({
      cpf: '',
      rg: '12345678X',
      maritalStatus: 'Casado(a)',
      address: 'Rua Legada',
      emergencyContactRelationship: 'Vizinho de confiança',
      socialNetwork: 'linkedin',
      socialAccount: 'aluno-linkedin',
      instagram: 'aluno-linkedin',
    });
    expect(result.intakeForm.formResponses.preferences).toEqual({
      preferredNickname: 'Gaspa',
      favoriteChocolate: '70%',
    });
  });
});
