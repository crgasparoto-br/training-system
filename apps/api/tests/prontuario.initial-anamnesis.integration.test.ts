import express from 'express';
import prontuarioInitialAnamnesisRouter from '../src/modules/prontuario/prontuario-initial-anamnesis.routes';
import { studentDomainService } from '../src/modules/alunos/student-domain.service';

const request = require('supertest');

const SUMMARY_BLOCK = 'physicalAssessment.prnt.summary';
const ANAMNESIS_BLOCK = 'physicalAssessment.prnt.anamnesisFollowUp';

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'professor',
      contractId: 'contract-1',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  blockAccessMiddleware: (blockKey: string) => (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const allowed = new Set((req.header('x-allowed-blocks') || '').split(',').filter(Boolean));
    if (allowed.has(blockKey)) return next();
    return res.status(403).json({ success: false, error: 'Perfil sem permissão para acessar este recurso' });
  },
}));

jest.mock('../src/modules/alunos/student-domain.service', () => ({
  studentDomainService: {
    getProfile: jest.fn(),
    getHealthIntake: jest.fn(),
    loadAlunoDomainSnapshot: jest.fn(),
  },
}));

jest.mock('../src/modules/alunos/student-parq-boundary.service', () => {
  const stripLegacyParqFields = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripLegacyParqFields);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'parqResponses' && key !== 'questionnaireParq')
        .map(([key, entry]) => [key, stripLegacyParqFields(entry)])
    );
  };

  return { stripLegacyParqFields };
});

const profile = {
  alunoId: 'lead-1',
  identification: {
    name: 'Lead Pré-Matrícula',
    email: 'lead@example.com',
    cpf: 'nao-deve-sair-na-identidade',
  },
};

const canonicalSnapshot = {
  id: 'lead-1',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
  studentHealthIntake: {
    sourceType: 'student',
    sourceReference: 'onboarding:lead-1',
    recordedByUserId: null,
    assessmentDate: null,
    status: 'COMPLETED',
    version: 3,
    currentStep: 'review',
    questionnaireParq: { q1: true },
    questionnaireAha: { chestPain: 'no' },
    clinicalHistoryData: { medicalHistory: 'Histórico canônico' },
    medicationData: null,
    injuryData: { injuriesHistory: 'Entorse antiga' },
    allergyData: { notes: 'Sem alergias conhecidas' },
    rawFormResponses: {
      mainGoal: 'Condicionamento',
      parqResponses: { q2: true },
      nested: { questionnaireParq: { q3: true } },
    },
    observations: null,
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-07T12:00:00.000Z',
    legacyIntakeId: 'legacy-intake-1',
    migrationReviewRequired: false,
    migrationStatus: 'migrated',
  },
  intakeForm: {
    id: 'legacy-intake-1',
    assessmentDate: '2025-01-01T12:00:00.000Z',
    medicalHistory: 'VALOR LEGADO NÃO DEVE COMPLETAR O CANÔNICO',
    currentMedications: 'MEDICAÇÃO LEGADA NÃO DEVE APARECER',
    observations: 'OBSERVAÇÃO LEGADA NÃO DEVE APARECER',
  },
};

const legacyCompatibleIntake = {
  alunoId: 'lead-1',
  status: 'NOT_STARTED',
  assessmentDate: '2025-01-01T12:00:00.000Z',
  questionnaires: {
    parq: { q1: true },
    american: null,
  },
  clinicalHistory: { medicalHistory: 'Compatibilidade legada' },
  medications: null,
  injuries: null,
  allergies: null,
  rawFormResponses: null,
  observations: null,
};

describe('prontuario initial anamnesis authorization boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/prontuario', prontuarioInitialAnamnesisRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    (studentDomainService.getProfile as jest.Mock).mockResolvedValue(profile);
    (studentDomainService.loadAlunoDomainSnapshot as jest.Mock).mockResolvedValue(canonicalSnapshot);
    (studentDomainService.getHealthIntake as jest.Mock).mockResolvedValue(legacyCompatibleIntake);
  });

  it('identifica o lead pelo alunoId da URL sem expor o perfil completo', async () => {
    const response = await request(app)
      .get('/api/v1/prontuario/alunos/lead-1/clinical-identity')
      .set('x-allowed-blocks', SUMMARY_BLOCK);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      alunoId: 'lead-1',
      name: 'Lead Pré-Matrícula',
      email: 'lead@example.com',
    });
    expect(JSON.stringify(response.body.data)).not.toContain('cpf');
    expect(studentDomainService.getProfile).toHaveBeenCalledWith('lead-1', {
      companyContractId: 'contract-1',
    });
  });

  it('nega a Anamnese sem o blockKey clínico e não consulta o domínio', async () => {
    const response = await request(app)
      .get('/api/v1/prontuario/alunos/lead-1/initial-anamnesis')
      .set('x-allowed-blocks', SUMMARY_BLOCK);

    expect(response.status).toBe(403);
    expect(studentDomainService.loadAlunoDomainSnapshot).not.toHaveBeenCalled();
    expect(studentDomainService.getHealthIntake).not.toHaveBeenCalled();
  });

  it('retorna somente StudentHealthIntake quando a fonte canônica existe, sem completar nulos pelo legado', async () => {
    const response = await request(app)
      .get('/api/v1/prontuario/alunos/lead-1/initial-anamnesis')
      .set('x-allowed-blocks', ANAMNESIS_BLOCK);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      alunoId: 'lead-1',
      status: 'COMPLETED',
      assessmentDate: null,
      clinicalHistory: { medicalHistory: 'Histórico canônico' },
      medications: null,
      observations: null,
      questionnaires: { american: { chestPain: 'no' } },
    });
    expect(response.body.data.questionnaires.parq).toBeUndefined();
    const serialized = JSON.stringify(response.body.data);
    expect(serialized).not.toContain('VALOR LEGADO');
    expect(serialized).not.toContain('MEDICAÇÃO LEGADA');
    expect(serialized).not.toContain('OBSERVAÇÃO LEGADA');
    expect(serialized).not.toContain('parqResponses');
    expect(serialized).not.toContain('questionnaireParq');
    expect(serialized).not.toContain('"q1":true');
    expect(studentDomainService.loadAlunoDomainSnapshot).toHaveBeenCalledWith('lead-1', {
      companyContractId: 'contract-1',
    });
    expect(studentDomainService.getHealthIntake).not.toHaveBeenCalled();
  });

  it('mantém compatibilidade legada somente quando ainda não existe StudentHealthIntake', async () => {
    (studentDomainService.loadAlunoDomainSnapshot as jest.Mock).mockResolvedValueOnce({
      ...canonicalSnapshot,
      studentHealthIntake: null,
    });

    const response = await request(app)
      .get('/api/v1/prontuario/alunos/lead-1/initial-anamnesis')
      .set('x-allowed-blocks', ANAMNESIS_BLOCK);

    expect(response.status).toBe(200);
    expect(response.body.data.clinicalHistory).toEqual({ medicalHistory: 'Compatibilidade legada' });
    expect(studentDomainService.getHealthIntake).toHaveBeenCalledWith('lead-1', {
      companyContractId: 'contract-1',
    });
  });

  it('trata outro tenant como recurso inexistente sem vazar conteúdo', async () => {
    (studentDomainService.loadAlunoDomainSnapshot as jest.Mock).mockResolvedValueOnce(null);

    const response = await request(app)
      .get('/api/v1/prontuario/alunos/lead-outro-tenant/initial-anamnesis')
      .set('x-allowed-blocks', ANAMNESIS_BLOCK);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Aluno não encontrado no contrato');
    expect(JSON.stringify(response.body)).not.toContain('Histórico canônico');
    expect(studentDomainService.getHealthIntake).not.toHaveBeenCalled();
  });
});
