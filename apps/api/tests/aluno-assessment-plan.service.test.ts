// ---------------------------------------------------------------------------
// Mock @prisma/client before any imports
// ---------------------------------------------------------------------------
jest.mock('@prisma/client', () => {
  const assessment = { groupBy: jest.fn() };
  const alunoAssessmentPlanItem = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const assessmentType = { findMany: jest.fn() };

  const instance: Record<string, unknown> = {
    assessment,
    alunoAssessmentPlanItem,
    assessmentType,
    $transaction: jest.fn(),
  };

  (instance.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(instance);
    return Promise.all(arg as Promise<unknown>[]);
  });

  return { PrismaClient: jest.fn(() => instance), _db: instance };
});

import { alunoAssessmentPlanService } from '../src/modules/alunos/aluno-assessment-plan.service';

const db = ((jest.requireMock('@prisma/client') as { _db: unknown })._db) as {
  assessment: { groupBy: jest.Mock };
  alunoAssessmentPlanItem: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  assessmentType: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'type-1',
    name: 'Antropometria',
    code: 'ANT',
    scheduleType: 'fixed_interval' as const,
    intervalMonths: 3,
    afterTypeId: null,
    offsetMonths: null,
    isActive: true,
    contractId: 'contract-1',
    ...overrides,
  };
}

function makePlanItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    alunoId: 'aluno-1',
    assessmentTypeId: 'type-1',
    isActive: true,
    isRequired: true,
    cadenceMonths: null as number | null,
    startDate: null as Date | null,
    nextDueDate: null as Date | null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePlanItemWithType(overrides: Record<string, unknown> = {}) {
  const { assessmentType: typeOverride, ...rest } = overrides as {
    assessmentType?: Record<string, unknown>;
    [key: string]: unknown;
  };
  return {
    ...makePlanItem(rest),
    assessmentType: typeOverride ?? {
      id: 'type-1',
      contractId: 'contract-1',
      scheduleType: 'fixed_interval',
      intervalMonths: 3,
    },
  };
}

/** Set up mocks needed for the final buildAssessmentPlanView call inside upsert/recalculate */
// Hooks
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(db);
    return Promise.all(arg as Promise<unknown>[]);
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('alunoAssessmentPlanService', () => {
  // ── getByAluno ────────────────────────────────────────────────────────────
  describe('getByAluno – status computation', () => {
    it('retorna status em_dia quando nextDueDate é futura', async () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([makePlanItem({ nextDueDate: futureDate })]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].summary.status).toBe('em_dia');
    });

    it('retorna status vencida quando nextDueDate é passada', async () => {
      const pastDate = new Date('2025-01-01');
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([makePlanItem({ nextDueDate: pastDate })]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].summary.status).toBe('vencida');
    });

    it('retorna status pendente quando não há nextDueDate mas há planItem ativo', async () => {
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([makePlanItem()]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].summary.status).toBe('pendente');
    });

    it('retorna status sem_planejamento quando não há planItem para o tipo', async () => {
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].summary.status).toBe('sem_planejamento');
    });
  });

  // ── effectiveCadenceMonths ────────────────────────────────────────────────
  describe('getByAluno – cadenceMonths priority', () => {
    it('usa cadenceMonths do plano antes do intervalMonths do tipo (AssessmentType.intervalMonths ignorado)', async () => {
      const type = makeType({ intervalMonths: 6 });
      const planItem = makePlanItem({ cadenceMonths: 2 });
      const lastDate = new Date('2026-01-01');
      db.assessmentType.findMany.mockResolvedValue([type]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      db.assessment.groupBy.mockResolvedValue([
        { typeId: 'type-1', _max: { assessmentDate: lastDate } },
      ]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      const expected = new Date(lastDate);
      expected.setMonth(expected.getMonth() + 2);
      expect(result.items[0].summary.nextDueDate).toEqual(expected);
      expect(result.items[0].effectiveCadenceMonths).toBe(2);
    });

    it('usa intervalMonths do tipo quando cadenceMonths do plano é null e scheduleType = fixed_interval', async () => {
      const type = makeType({ scheduleType: 'fixed_interval', intervalMonths: 4 });
      const planItem = makePlanItem({ cadenceMonths: null });
      const lastDate = new Date('2026-01-01');
      db.assessmentType.findMany.mockResolvedValue([type]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      db.assessment.groupBy.mockResolvedValue([
        { typeId: 'type-1', _max: { assessmentDate: lastDate } },
      ]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      const expected = new Date(lastDate);
      expected.setMonth(expected.getMonth() + 4);
      expect(result.items[0].summary.nextDueDate).toEqual(expected);
      expect(result.items[0].effectiveCadenceMonths).toBe(4);
    });

    it('retorna effectiveCadenceMonths null quando scheduleType não é fixed_interval e cadenceMonths é null', async () => {
      const type = makeType({ scheduleType: 'manual', intervalMonths: null });
      const planItem = makePlanItem({ cadenceMonths: null });
      db.assessmentType.findMany.mockResolvedValue([type]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].effectiveCadenceMonths).toBeNull();
    });
  });

  // ── computeNextDueDate ────────────────────────────────────────────────────
  describe('getByAluno – computeNextDueDate', () => {
    it('usa lastAssessmentDate + cadenceMonths para calcular próxima data', async () => {
      const lastDate = new Date('2026-03-15');
      const planItem = makePlanItem({ cadenceMonths: 3 });
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      db.assessment.groupBy.mockResolvedValue([
        { typeId: 'type-1', _max: { assessmentDate: lastDate } },
      ]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      const expected = new Date(lastDate);
      expected.setMonth(expected.getMonth() + 3);
      expect(result.items[0].summary.nextDueDate).toEqual(expected);
    });

    it('usa startDate quando não há lastAssessmentDate', async () => {
      const startDate = new Date('2026-06-01');
      const planItem = makePlanItem({ startDate, cadenceMonths: 3 });
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].summary.nextDueDate).toEqual(startDate);
    });

    it('preserva nextDueDate existente quando não há lastAssessmentDate e sem startDate', async () => {
      const existingNextDue = new Date('2026-09-01');
      const planItem = makePlanItem({ nextDueDate: existingNextDue, cadenceMonths: 3 });
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      db.assessment.groupBy.mockResolvedValue([]);

      const result = await alunoAssessmentPlanService.getByAluno('aluno-1', 'contract-1');

      expect(result.items[0].summary.nextDueDate).toEqual(existingNextDue);
    });
  });

  // ── upsertByAluno ─────────────────────────────────────────────────────────
  describe('upsertByAluno', () => {
    it('cria plano com múltiplos tipos de avaliação', async () => {
      const types = [makeType({ id: 'type-1' }), makeType({ id: 'type-2', code: 'CARD' })];
      // 1st call: count-check inside upsertByAluno; 2nd call: buildAssessmentPlanView
      db.assessmentType.findMany
        .mockResolvedValueOnce(types)
        .mockResolvedValueOnce([makeType({ id: 'type-1' })]);
      db.alunoAssessmentPlanItem.findUnique.mockResolvedValue(null);
      db.alunoAssessmentPlanItem.create.mockResolvedValue({});
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([]);
      db.assessment.groupBy.mockResolvedValue([]);

      await alunoAssessmentPlanService.upsertByAluno({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        items: [
          { assessmentTypeId: 'type-1', isActive: true },
          { assessmentTypeId: 'type-2', isActive: true },
        ],
      });

      expect(db.alunoAssessmentPlanItem.create).toHaveBeenCalledTimes(2);
    });

    it('impede duplicidade ativa: atualiza item existente sem criar novo', async () => {
      const existing = makePlanItem();
      // 1st call: count-check; 2nd call: buildAssessmentPlanView
      db.assessmentType.findMany
        .mockResolvedValueOnce([makeType()])
        .mockResolvedValueOnce([makeType()]);
      db.alunoAssessmentPlanItem.findUnique.mockResolvedValue(existing);
      db.alunoAssessmentPlanItem.update.mockResolvedValue({});
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([existing]);
      db.assessment.groupBy.mockResolvedValue([]);

      await alunoAssessmentPlanService.upsertByAluno({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        items: [{ assessmentTypeId: 'type-1', isActive: false }],
      });

      expect(db.alunoAssessmentPlanItem.create).not.toHaveBeenCalled();
      expect(db.alunoAssessmentPlanItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' } }),
      );
    });

    it('lança erro quando tipo não pertence ao contrato', async () => {
      // API returns only 1 type but 2 were requested → count mismatch
      db.assessmentType.findMany.mockResolvedValue([makeType({ id: 'type-1' })]);

      await expect(
        alunoAssessmentPlanService.upsertByAluno({
          alunoId: 'aluno-1',
          contractId: 'contract-1',
          items: [
            { assessmentTypeId: 'type-1' },
            { assessmentTypeId: 'type-NAO-EXISTE' },
          ],
        }),
      ).rejects.toThrow('Um ou mais tipos de avaliação não pertencem ao contrato do professor');
    });
  });

  // ── recalculateByAluno ────────────────────────────────────────────────────
  describe('recalculateByAluno', () => {
    /** Helper: set up all mocks for a recalculate test.
     *  findMany returns the same planItems for BOTH calls (recalculate + view).
     *  groupBy handles two sequential calls: first for recalculate, second for view. */
    function setupRecalcMocks(
      planItem: ReturnType<typeof makePlanItemWithType>,
      firstGroupBy: { typeId: string; _max: { assessmentDate: Date | null } }[],
    ) {
      // Both findMany calls (recalculate and buildAssessmentPlanView) get the same planItems
      db.alunoAssessmentPlanItem.findMany.mockResolvedValue([planItem]);
      // 1st groupBy: for recalculate; 2nd groupBy: for buildAssessmentPlanView
      db.assessment.groupBy
        .mockResolvedValueOnce(firstGroupBy)
        .mockResolvedValueOnce([]);
      db.alunoAssessmentPlanItem.update.mockResolvedValue({});
      db.assessmentType.findMany.mockResolvedValue([makeType()]);
    }

    it('recalcula nextDueDate após nova avaliação (usa data da última avaliação)', async () => {
      const lastDate = new Date('2026-02-10');
      const planItem = makePlanItemWithType({ cadenceMonths: 3 });
      setupRecalcMocks(planItem, [{ typeId: 'type-1', _max: { assessmentDate: lastDate } }]);

      await alunoAssessmentPlanService.recalculateByAluno({ alunoId: 'aluno-1', contractId: 'contract-1' });

      const expected = new Date(lastDate);
      expected.setMonth(expected.getMonth() + 3);
      expect(db.alunoAssessmentPlanItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextDueDate: expected }) }),
      );
    });

    it('recalcula nextDueDate após edição de avaliação (mesma lógica: data mais recente)', async () => {
      const editedDate = new Date('2026-04-20');
      const planItem = makePlanItemWithType({ cadenceMonths: 2 });
      setupRecalcMocks(planItem, [{ typeId: 'type-1', _max: { assessmentDate: editedDate } }]);

      await alunoAssessmentPlanService.recalculateByAluno({ alunoId: 'aluno-1', contractId: 'contract-1' });

      const expected = new Date(editedDate);
      expected.setMonth(expected.getMonth() + 2);
      expect(db.alunoAssessmentPlanItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextDueDate: expected }) }),
      );
    });

    it('recalcula usando startDate após exclusão da avaliação (sem lastAssessmentDate)', async () => {
      const startDate = new Date('2026-07-01');
      const planItem = makePlanItemWithType({ cadenceMonths: 3, startDate });
      setupRecalcMocks(planItem, []); // no last assessment

      await alunoAssessmentPlanService.recalculateByAluno({ alunoId: 'aluno-1', contractId: 'contract-1' });

      expect(db.alunoAssessmentPlanItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextDueDate: startDate }) }),
      );
    });

    it('respeita cadenceMonths do aluno antes do intervalMonths do AssessmentType', async () => {
      const lastDate = new Date('2026-01-01');
      const planItem = makePlanItemWithType({
        cadenceMonths: 2,
        assessmentType: { id: 'type-1', contractId: 'contract-1', scheduleType: 'fixed_interval', intervalMonths: 6 },
      });
      setupRecalcMocks(planItem, [{ typeId: 'type-1', _max: { assessmentDate: lastDate } }]);

      await alunoAssessmentPlanService.recalculateByAluno({ alunoId: 'aluno-1', contractId: 'contract-1' });

      const expected = new Date(lastDate);
      expected.setMonth(expected.getMonth() + 2); // 2 months (aluno), not 6 (type)
      expect(db.alunoAssessmentPlanItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextDueDate: expected }) }),
      );
    });

    it('não atualiza itens inativos', async () => {
      const planItem = makePlanItemWithType({ isActive: false });
      setupRecalcMocks(planItem, []);

      await alunoAssessmentPlanService.recalculateByAluno({ alunoId: 'aluno-1', contractId: 'contract-1' });

      expect(db.alunoAssessmentPlanItem.update).not.toHaveBeenCalled();
    });
  });
});
