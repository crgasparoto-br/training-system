import type {
  ParqAdministrativeSummaryDTO,
  ParqSubmissionDTO,
} from '@corrida/types';
import { alunoService } from '../src/modules/alunos/aluno.service.js';
import { studentDomainService } from '../src/modules/alunos/student-domain.service.js';
import {
  attachCanonicalParqToHealthIntake,
  sanitizeAdministrativeAlunoPayload,
  sanitizeAdministrativeStudentSummary,
  stripLegacyParqFields,
  studentParqBoundaryService,
} from '../src/modules/alunos/student-parq-boundary.service.js';

const parqSummary: ParqAdministrativeSummaryDTO = {
  state: 'COMPLETED_REVIEW_REQUIRED',
  latestSubmission: {
    id: 'submission-1',
    catalogVersion: 'parq-2026-01',
    submittedAt: '2026-07-26T10:00:00.000Z',
    positiveCount: 1,
    review: { status: 'PENDING' },
  },
  requiresProfessionalReview: true,
  legacy: { preserved: true, needsRepeat: false },
};

const canonicalSubmission: ParqSubmissionDTO = {
  id: 'submission-1',
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  catalogVersion: 'parq-2026-01',
  submittedAt: '2026-07-26T10:00:00.000Z',
  responses: { q1: true, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false },
  positiveItems: [{ key: 'q1', label: 'Pergunta canônica' }],
  positiveCount: 1,
  declarationAccepted: true,
  sourceType: 'student',
};

const legacyAdministrativeAluno = {
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

describe('student PAR-Q administrative boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes direct and nested legacy PAR-Q fields recursively', () => {
    expect(
      stripLegacyParqFields({
        parqResponses: { q1: true },
        nested: {
          questionnaireParq: { q1: false },
          keep: 'value',
          formResponses: { parqResponses: { q2: true }, keepToo: true },
        },
      })
    ).toEqual({ nested: { keep: 'value', formResponses: { keepToo: true } } });
  });

  it('preserves dates and non-plain domain values while sanitizing', () => {
    const createdAt = new Date('2026-07-26T10:00:00.000Z');
    class DomainValue {
      constructor(readonly value: string) {}
    }
    const decimal = new DomainValue('10.50');

    const result = stripLegacyParqFields({
      createdAt,
      amount: decimal,
      parqResponses: { q1: true },
    }) as Record<string, unknown>;

    expect(result).toEqual({ createdAt, amount: decimal });
    expect(result.createdAt).toBe(createdAt);
    expect(result.amount).toBe(decimal);
  });

  it('returns only the authorized PAR-Q summary on the generic aluno payload', () => {
    const result = sanitizeAdministrativeAlunoPayload(
      {
        id: 'aluno-1',
        intakeForm: {
          mainGoal: 'Corrida',
          parqResponses: { q1: true },
          formResponses: { parqResponses: { q2: true }, preferences: { period: 'morning' } },
        },
      },
      parqSummary
    );

    expect(result.parq).toEqual(parqSummary);
    expect(result.intakeForm).toEqual({
      mainGoal: 'Corrida',
      formResponses: { preferences: { period: 'morning' } },
    });
    expect(JSON.stringify(result)).not.toContain('parqResponses');
    expect(JSON.stringify(result)).not.toContain('positiveItems');
  });

  it('removes detailed answers from the summary permission boundary', () => {
    const result = sanitizeAdministrativeStudentSummary(
      {
        alunoId: 'aluno-1',
        intake: {
          questionnaires: {
            parq: { q1: true },
            american: { q1: false },
          },
          rawFormResponses: { questionnaireParq: { q1: true }, keep: 'ok' },
        },
      },
      parqSummary
    );

    expect(result.parq).toEqual(parqSummary);
    expect(result.intake).toEqual({
      questionnaires: { american: { q1: false } },
      rawFormResponses: { keep: 'ok' },
    });
    expect(JSON.stringify(result)).not.toContain('"responses"');
  });

  it('uses only the canonical submission in the health-authorized intake response', () => {
    const result = attachCanonicalParqToHealthIntake(
      {
        alunoId: 'aluno-1',
        questionnaires: {
          parq: { q1: false },
          american: { q1: false },
        },
        rawFormResponses: { parqResponses: { q1: false }, keep: 'ok' },
      },
      canonicalSubmission
    );

    expect(result).toEqual({
      alunoId: 'aluno-1',
      questionnaires: {
        parq: canonicalSubmission.responses,
        american: { q1: false },
      },
      rawFormResponses: { keep: 'ok' },
    });
  });

  it('preserves legacy administrative identity when no canonical StudentProfile exists', async () => {
    jest
      .spyOn(alunoService, 'findById')
      .mockResolvedValue(legacyAdministrativeAluno as any);
    jest
      .spyOn(studentDomainService, 'loadAlunoDomainSnapshot')
      .mockResolvedValue({ studentProfile: null } as any);
    jest
      .spyOn(studentDomainService, 'getFinancialProfile')
      .mockResolvedValue(null);

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
    jest
      .spyOn(alunoService, 'findById')
      .mockResolvedValue(legacyAdministrativeAluno as any);
    jest
      .spyOn(studentDomainService, 'loadAlunoDomainSnapshot')
      .mockResolvedValue({
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
      } as any);
    jest
      .spyOn(studentDomainService, 'getFinancialProfile')
      .mockResolvedValue(null);

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
