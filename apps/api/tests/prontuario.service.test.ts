jest.mock('@prisma/client', () => {
  const aluno = { findUnique: jest.fn() };
  const prontuarioRecord = {
    findFirstOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const prontuarioGoal = {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const prontuarioAnamnesisFollowUp = {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const prontuarioActivityHistory = {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const prontuarioMedicationProcedure = {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const prontuarioPainCase = {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const prontuarioPainFollowUp = {
    update: jest.fn(),
    create: jest.fn(),
  };
  const studentParqSubmission = {
    findMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
  };
  const prontuarioDiscomfortSnapshot = {
    create: jest.fn(),
  };

  const instance: Record<string, unknown> = {
    aluno,
    prontuarioRecord,
    prontuarioGoal,
    prontuarioAnamnesisFollowUp,
    prontuarioActivityHistory,
    prontuarioMedicationProcedure,
    prontuarioPainCase,
    prontuarioPainFollowUp,
    studentParqSubmission,
    prontuarioDiscomfortSnapshot,
    $transaction: jest.fn(),
  };

  (instance.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(instance);
    return Promise.all(arg as Promise<unknown>[]);
  });

  return {
    PrismaClient: jest.fn(() => instance),
    Prisma: { JsonNull: null },
    _db: instance,
  };
});

import { prontuarioService } from '../src/modules/prontuario/prontuario.service';

type DbMock = {
  aluno: { findUnique: jest.Mock };
  prontuarioRecord: { findFirstOrThrow: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  prontuarioGoal: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  prontuarioAnamnesisFollowUp: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  prontuarioActivityHistory: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  prontuarioMedicationProcedure: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  prontuarioPainCase: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  prontuarioPainFollowUp: { update: jest.Mock; create: jest.Mock };
  studentParqSubmission: { findMany: jest.Mock; findFirstOrThrow: jest.Mock; create: jest.Mock };
  prontuarioDiscomfortSnapshot: { create: jest.Mock };
  $transaction: jest.Mock;
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;

const CONTRACT_ID = 'contract-1';
const RECORD_ID = 'record-1';
const ALUNO_ID = 'aluno-1';

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(db);
    return Promise.all(arg as Promise<unknown>[]);
  });

  db.aluno.findUnique.mockResolvedValue({
    id: ALUNO_ID,
    professorId: 'prof-1',
    professor: { contractId: CONTRACT_ID },
    currentStudentContract: null,
  });
  db.prontuarioRecord.findFirstOrThrow.mockResolvedValue({ id: RECORD_ID, alunoId: ALUNO_ID, contractId: CONTRACT_ID });
  db.prontuarioRecord.findFirst.mockResolvedValue({ id: RECORD_ID, goals: [], anamnesisFollowUps: [], activityHistory: [], medicationsProcedures: [], painCases: [], discomfortSnapshots: [] });
  db.prontuarioRecord.findMany.mockResolvedValue([]);
  db.studentParqSubmission.findMany.mockResolvedValue([]);
  db.prontuarioDiscomfortSnapshot.create.mockResolvedValue({ id: 'snapshot-1', professorId: 'prof-2', entries: [] });
});

describe('prontuarioService', () => {
  it('arquiva objetivos ativos omitidos do payload', async () => {
    db.prontuarioGoal.findMany.mockResolvedValue([
      { id: 'goal-keep', status: 'active' },
      { id: 'goal-archive', status: 'monitoring' },
      { id: 'goal-resolved', status: 'resolved' },
    ]);

    await prontuarioService.saveGoals(CONTRACT_ID, RECORD_ID, [
      { id: 'goal-keep', title: 'Ganhar resistência', status: 'active' },
    ]);

    expect(db.prontuarioGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'goal-keep' } })
    );
    expect(db.prontuarioGoal.update).toHaveBeenCalledWith({
      where: { id: 'goal-archive' },
      data: { status: 'archived' },
    });
    expect(db.prontuarioGoal.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'goal-resolved' } })
    );
  });

  it('mantém acompanhamento de anamnese separado por submissão histórica de PAR-Q', async () => {
    db.prontuarioAnamnesisFollowUp.findMany.mockResolvedValue([
      { id: 'followup-old', itemKey: 'q1', parqSubmissionId: 'parq-old', status: 'monitoring', closedAt: null },
      { id: 'followup-current', itemKey: 'q1', parqSubmissionId: 'parq-current', status: 'active', closedAt: null },
      { id: 'followup-archive', itemKey: 'q2', parqSubmissionId: 'parq-current', status: 'active', closedAt: null },
    ]);
    db.studentParqSubmission.findFirstOrThrow.mockResolvedValue({ id: 'parq-current' });

    await prontuarioService.saveAnamnesisFollowUps(CONTRACT_ID, RECORD_ID, [
      {
        parqSubmissionId: 'parq-current',
        itemKey: 'q1',
        itemLabel: 'Pergunta 1',
        status: 'monitoring',
        followUpNotes: 'Reavaliar em 30 dias',
      },
    ]);

    expect(db.prontuarioAnamnesisFollowUp.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'followup-current' } })
    );
    expect(db.prontuarioAnamnesisFollowUp.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'followup-old' } })
    );
    expect(db.prontuarioAnamnesisFollowUp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'followup-archive' },
        data: expect.objectContaining({ status: 'archived' }),
      })
    );
  });

  it('encerra histórico de atividade omitido sem apagar registros', async () => {
    db.prontuarioActivityHistory.findMany.mockResolvedValue([
      { id: 'activity-keep', endedAt: null },
      { id: 'activity-end', endedAt: null },
      { id: 'activity-closed', endedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);

    await prontuarioService.saveActivityHistory(CONTRACT_ID, RECORD_ID, [
      { id: 'activity-keep', description: 'Corrida de rua', activityType: 'running' },
    ]);

    expect(db.prontuarioActivityHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'activity-keep' } })
    );
    expect(db.prontuarioActivityHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'activity-end' }, data: expect.objectContaining({ endedAt: expect.any(Date) }) })
    );
    expect(db.prontuarioActivityHistory.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'activity-closed' }, data: expect.objectContaining({ endedAt: expect.any(Date) }) })
    );
  });

  it('encerra medicações omitidas usando endDate', async () => {
    db.prontuarioMedicationProcedure.findMany.mockResolvedValue([
      { id: 'med-keep', endDate: null },
      { id: 'med-end', endDate: null },
    ]);

    await prontuarioService.saveMedicationsProcedures(CONTRACT_ID, RECORD_ID, [
      { id: 'med-keep', type: 'medication', name: 'Antiinflamatório' },
    ]);

    expect(db.prontuarioMedicationProcedure.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'med-end' }, data: expect.objectContaining({ endDate: expect.any(Date) }) })
    );
  });

  it('persiste professor autor no snapshot de desconforto sem herdar do PRNT', async () => {
    db.prontuarioRecord.findFirstOrThrow.mockResolvedValue({
      id: RECORD_ID,
      alunoId: ALUNO_ID,
      contractId: CONTRACT_ID,
      professorId: 'prof-record',
    });

    await prontuarioService.createDiscomfortSnapshot(CONTRACT_ID, RECORD_ID, 'prof-author', {
      notes: 'Reavaliação',
      entries: [
        {
          regionId: 'knee-right',
          regionName: 'Joelho direito',
          discomfortTypes: ['pain'],
          intensity: 4,
        },
      ],
    });

    expect(db.prontuarioDiscomfortSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractId: CONTRACT_ID,
          alunoId: ALUNO_ID,
          recordId: RECORD_ID,
          professorId: 'prof-author',
        }),
      })
    );
  });

  it('retorna overview com professorId persistido em cada snapshot', async () => {
    db.prontuarioRecord.findMany.mockResolvedValue([
      {
        id: RECORD_ID,
        professorId: 'prof-record',
        discomfortSnapshots: [
          { id: 'snapshot-a', professorId: 'prof-author-a', entries: [] },
          { id: 'snapshot-b', professorId: 'prof-author-b', entries: [] },
        ],
      },
    ]);

    const overview = await prontuarioService.overview(CONTRACT_ID, ALUNO_ID);

    expect(overview.currentRecord?.discomfortSnapshots).toEqual([
      expect.objectContaining({ id: 'snapshot-a', professorId: 'prof-author-a' }),
      expect.objectContaining({ id: 'snapshot-b', professorId: 'prof-author-b' }),
    ]);
  });

  it('arquiva casos de dor omitidos e preserva follow-ups existentes', async () => {
    db.prontuarioPainCase.findMany.mockResolvedValue([
      { id: 'pain-keep', status: 'active', closedAt: null, followUps: [{ id: 'fu-1' }] },
      { id: 'pain-archive', status: 'monitoring', closedAt: null, followUps: [{ id: 'fu-2' }] },
    ]);

    await prontuarioService.savePainCases(CONTRACT_ID, RECORD_ID, [
      {
        id: 'pain-keep',
        title: 'Dor lombar',
        status: 'active',
        followUps: [],
      },
    ]);

    expect(db.prontuarioPainCase.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pain-keep' } })
    );
    expect(db.prontuarioPainCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pain-archive' },
        data: expect.objectContaining({ status: 'archived', closedAt: expect.any(Date) }),
      })
    );
    expect(db.prontuarioPainFollowUp.update).not.toHaveBeenCalled();
  });
});
