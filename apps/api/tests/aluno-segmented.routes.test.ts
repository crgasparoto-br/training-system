import express from 'express';
import segmentedAlunoRouter from '../src/modules/alunos/student-domain.routes';
import { alunoService } from '../src/modules/alunos/aluno.service';
import { studentDomainService } from '../src/modules/alunos/student-domain.service';

const request = require('supertest');

const mockScreenAccessMiddleware = jest.fn(
  () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
);
const mockBlockAccessMiddleware = jest.fn(
  () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
);

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
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
  screenAccessMiddleware: mockScreenAccessMiddleware,
  blockAccessMiddleware: mockBlockAccessMiddleware,
}));

jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: {
    belongsToContract: jest.fn(),
    belongsToProfessor: jest.fn(),
  },
}));

jest.mock('../src/modules/alunos/student-domain.service', () => ({
  studentDomainService: {
    getSummary: jest.fn(),
    getProfile: jest.fn(),
    getHealthIntake: jest.fn(),
    listAssessmentRecords: jest.fn(),
    getFinancialProfile: jest.fn(),
    getIntegrations: jest.fn(),
    listExternalActivities: jest.fn(),
    getTimeline: jest.fn(),
  },
}));

describe('segmented aluno routes', () => {
  const app = express();

  app.use(express.json());
  app.use('/alunos', segmentedAlunoRouter);

  beforeEach(() => {
    (alunoService.belongsToContract as jest.Mock).mockReset();
    (alunoService.belongsToProfessor as jest.Mock).mockReset();
    (studentDomainService.getSummary as jest.Mock).mockReset();
    (studentDomainService.getProfile as jest.Mock).mockReset();
    (studentDomainService.getHealthIntake as jest.Mock).mockReset();
    (studentDomainService.listAssessmentRecords as jest.Mock).mockReset();
    (studentDomainService.getFinancialProfile as jest.Mock).mockReset();
    (studentDomainService.getIntegrations as jest.Mock).mockReset();
    (studentDomainService.listExternalActivities as jest.Mock).mockReset();
    (studentDomainService.getTimeline as jest.Mock).mockReset();
    (alunoService.belongsToContract as jest.Mock).mockResolvedValue(true);
  });

  it('returns segmented summary when the professor has access', async () => {
    (studentDomainService.getSummary as jest.Mock).mockResolvedValue({
      alunoId: 'aluno-1',
      overview: { name: 'Aluno Teste' },
    });

    const response = await request(app).get('/alunos/aluno-1/summary');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      alunoId: 'aluno-1',
      overview: { name: 'Aluno Teste' },
    });
    expect(studentDomainService.getSummary).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-1',
    });
  });

  it('blocks segmented profile when the professor does not have access to the aluno', async () => {
    (alunoService.belongsToContract as jest.Mock).mockResolvedValue(false);

    const response = await request(app).get('/alunos/aluno-1/profile');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Aluno não encontrado ou não pertence ao seu acesso');
    expect(studentDomainService.getProfile).not.toHaveBeenCalled();
  });

  it('returns 404 when segmented financial data is not available for the aluno', async () => {
    (studentDomainService.getFinancialProfile as jest.Mock).mockResolvedValue(null);

    const response = await request(app).get('/alunos/aluno-1/financial');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Aluno não encontrado');
    expect(studentDomainService.getFinancialProfile).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-1',
    });
  });

  it('protects the timeline with the audit block permission and contract scope', async () => {
    (studentDomainService.getTimeline as jest.Mock).mockResolvedValue({
      alunoId: 'aluno-1',
      items: [],
      total: 0,
    });

    const response = await request(app).get('/alunos/aluno-1/timeline');

    expect(response.status).toBe(200);
    expect(mockBlockAccessMiddleware).toHaveBeenCalledWith('students.details.audit');
    expect(studentDomainService.getTimeline).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-1',
    });
  });
});
