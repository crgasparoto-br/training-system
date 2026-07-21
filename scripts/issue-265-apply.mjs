import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceRequired(content, search, replacement, label) {
  if (!content.includes(search)) throw new Error(`Anchor not found: ${label}`);
  return content.replace(search, replacement);
}

{
  const file = 'apps/api/src/modules/agenda/fixed-schedule.service.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `  notes?: string | null;
}`,
    `  notes?: string | null;
  availabilityConfirmed?: boolean;
}`,
    'backend availability confirmation contract'
  );
  content = replaceRequired(
    content,
    `  readonly rowIndex?: number;
  readonly statusCode: number;`,
    `  readonly rowIndex?: number;
  readonly statusCode: number;
  readonly reasonCode?: FixedScheduleErrorCode;`,
    'fixed schedule reason code property'
  );
  content = replaceRequired(
    content,
    `      rowIndex?: number;
      statusCode?: number;
    }`,
    `      rowIndex?: number;
      statusCode?: number;
      reasonCode?: FixedScheduleErrorCode;
    }`,
    'fixed schedule reason code option'
  );
  content = replaceRequired(
    content,
    `    this.rowIndex = options.rowIndex;
    this.statusCode = options.statusCode ?? 409;`,
    `    this.rowIndex = options.rowIndex;
    this.statusCode = options.statusCode ?? 409;
    this.reasonCode = options.reasonCode;`,
    'fixed schedule reason code assignment'
  );
  content = replaceRequired(
    content,
    `    await tx.$queryRaw\`SELECT pg_advisory_xact_lock(hashtext(\${key}))\`;`,
    `    await tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(\${key}))\`;`,
    'advisory lock execute without result'
  );
  content = replaceRequired(
    content,
    `  if (firstFailure) {
    throw new FixedScheduleError(firstFailure.code as FixedScheduleErrorCode, firstFailure.message, {
      stage: firstFailure.stage,
      rowIndex: firstFailure.rowIndex,
    });
  }`,
    `  if (firstFailure) {
    const reasonCode = firstFailure.code as FixedScheduleErrorCode;
    const checkedRow = slots[firstFailure.rowIndex];
    if (checkedRow?.availabilityConfirmed) {
      throw new FixedScheduleError(
        'FIXED_SCHEDULE_CHANGED',
        \`\${MESSAGES.FIXED_SCHEDULE_CHANGED} \${firstFailure.message}\`,
        {
          stage: firstFailure.stage,
          rowIndex: firstFailure.rowIndex,
          reasonCode,
        }
      );
    }
    throw new FixedScheduleError(reasonCode, firstFailure.message, {
      stage: firstFailure.stage,
      rowIndex: firstFailure.rowIndex,
    });
  }`,
    'availability changed classification'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/alunos/aluno.service.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `      await syncStudentFixedSchedule(
        tx,
        professor.contractId,
        aluno.id,
        data.schedulePlan,
        data.schedulePlan === 'fixed' ? data.fixedScheduleSlots ?? [] : [],
        { confirmKeepFutureBookings: data.confirmKeepFutureBookings }
      );`,
    `      if (data.schedulePlan === 'fixed') {
        await syncStudentFixedSchedule(
          tx,
          professor.contractId,
          aluno.id,
          'fixed',
          data.fixedScheduleSlots ?? [],
          { confirmKeepFutureBookings: data.confirmKeepFutureBookings }
        );
      }`,
    'skip no-op free schedule synchronization on create'
  );
  write(file, content);
}

{
  const file = 'packages/utils/validations.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `  notes: z.string().trim().nullable().optional(),
});`,
    `  notes: z.string().trim().nullable().optional(),
  availabilityConfirmed: z.boolean().optional(),
});`,
    'shared availability confirmation schema'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/agenda/agenda.routes.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `  notes: z.string().nullable().optional(),
});`,
    `  notes: z.string().nullable().optional(),
  availabilityConfirmed: z.boolean().optional(),
});`,
    'agenda availability confirmation schema'
  );
  content = replaceRequired(
    content,
    `      rowIndex: error.rowIndex,
    });`,
    `      rowIndex: error.rowIndex,
      reasonCode: error.reasonCode,
    });`,
    'agenda fixed schedule reason response'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/alunos/aluno.routes.ts';
  let content = read(file);
  const search = `        rowIndex: error.rowIndex,
      });`;
  const replacement = `        rowIndex: error.rowIndex,
        reasonCode: error.reasonCode,
      });`;
  const first = content.indexOf(search);
  if (first < 0) throw new Error('Anchor not found: first student reason response');
  content = content.slice(0, first) + replacement + content.slice(first + search.length);
  const second = content.indexOf(search, first + replacement.length);
  if (second < 0) throw new Error('Anchor not found: second student reason response');
  content = content.slice(0, second) + replacement + content.slice(second + search.length);
  write(file, content);
}

{
  const file = 'apps/web/src/services/agenda.service.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `  notes?: string | null;
}`,
    `  notes?: string | null;
  availabilityConfirmed?: boolean;
}`,
    'web availability confirmation contract'
  );
  write(file, content);
}

{
  const file = 'apps/web/src/pages/AlunoForm.tsx';
  let content = read(file);
  content = replaceRequired(
    content,
    `      const serializedFixedScheduleSlots = fixedScheduleSlots.map(
        ({ availability: _availability, ...slot }) => slot
      );`,
    `      const serializedFixedScheduleSlots = fixedScheduleSlots.map(
        ({ availability, ...slot }) => ({
          ...slot,
          availabilityConfirmed: availability?.available === true,
        })
      );`,
    'serialize positive availability check'
  );
  content = replaceRequired(
    content,
    `    } catch (error: any) {
      console.error('Erro ao salvar aluno:', error);
      alert(error.response?.data?.error || alunoFormCopy.saveError);
    } finally {`,
    `    } catch (error: any) {
      console.error('Erro ao salvar aluno:', error);
      const scheduleError = error.response?.data;
      if (
        data.schedulePlan === 'fixed' &&
        Number.isInteger(scheduleError?.rowIndex) &&
        fixedScheduleSlots[scheduleError.rowIndex]
      ) {
        setFixedScheduleSlots((current) =>
          current.map((row, rowIndex) =>
            rowIndex === scheduleError.rowIndex
              ? {
                  ...row,
                  availability: {
                    rowIndex,
                    slotId: row.id,
                    clientKey: row.clientKey,
                    available: false,
                    code: scheduleError.reasonCode || scheduleError.code,
                    message: scheduleError.error || alunoFormCopy.saveError,
                    stage: scheduleError.stage || 'schedule',
                  },
                }
              : row
          )
        );
        setActiveTab('anamneseInicial');
      }
      alert(scheduleError?.error || alunoFormCopy.saveError);
    } finally {`,
    'surface save-time schedule conflict on row'
  );
  write(file, content);
}

{
  const file = 'apps/api/tests/fixed-schedule.service.test.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `    $queryRaw: jest.fn().mockResolvedValue([]),`,
    `    $executeRaw: jest.fn().mockResolvedValue(0),`,
    'unit transaction execute raw mock'
  );
  content = replaceRequired(
    content,
    `    expect(db.$queryRaw).toHaveBeenCalled();`,
    `    expect(db.$executeRaw).toHaveBeenCalled();`,
    'unit transaction execute raw expectation'
  );
  content = replaceRequired(
    content,
    `  it('locks competing resources before the final validation and persists the complete set', async () => {`,
    `  it('distinguishes a save-time availability change from its original reason', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 1, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ startTime: '08:30', endTime: '09:30' }]);

    await expect(
      syncStudentFixedSchedule(db as never, 'contract-1', 'aluno-1', 'fixed', [
        slot({ availabilityConfirmed: true }),
      ])
    ).rejects.toMatchObject({
      code: 'FIXED_SCHEDULE_CHANGED',
      reasonCode: 'SPACE_CAPACITY_FULL',
    });
  });

  it('locks competing resources before the final validation and persists the complete set', async () => {`,
    'availability change unit coverage'
  );
  write(file, content);
}

console.log('Issue 265 lock and availability change corrections applied successfully.');
