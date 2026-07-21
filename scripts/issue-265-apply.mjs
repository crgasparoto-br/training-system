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
  const file = 'apps/web/src/components/alunos/FixedScheduleEditor.tsx';
  let content = read(file);
  content = replaceRequired(
    content,
    `    // O refreshKey é incrementado somente após uma gravação concluída.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunoId, plan, refreshKey]);`,
    `  }, [alunoId, plan, refreshKey]);`,
    'unsupported eslint directive'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/agenda/fixed-schedule.service.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `function validateStudentRows(slots: FixedScheduleSlotInput[]) {
  for (let left = 0; left < slots.length; left += 1) {
    for (let right = left + 1; right < slots.length; right += 1) {
      if (
        slots[left].dayOfWeek === slots[right].dayOfWeek &&
        fixedScheduleOverlaps(
          slots[left].startTime,
          slots[left].endTime,
          slots[right].startTime,
          slots[right].endTime
        )
      ) {
        throw new FixedScheduleError(
          'STUDENT_FIXED_SLOT_CONFLICT',
          MESSAGES.STUDENT_FIXED_SLOT_CONFLICT,
          { stage: 'student', rowIndex: right }
        );
      }
    }
  }
}`,
    `function findStudentRowConflictIndexes(slots: FixedScheduleSlotInput[]): Set<number> {
  const conflicts = new Set<number>();
  for (let left = 0; left < slots.length; left += 1) {
    for (let right = left + 1; right < slots.length; right += 1) {
      if (
        slots[left].dayOfWeek === slots[right].dayOfWeek &&
        fixedScheduleOverlaps(
          slots[left].startTime,
          slots[left].endTime,
          slots[right].startTime,
          slots[right].endTime
        )
      ) {
        conflicts.add(left);
        conflicts.add(right);
      }
    }
  }
  return conflicts;
}

function validateStudentRows(slots: FixedScheduleSlotInput[]) {
  const firstConflict = [...findStudentRowConflictIndexes(slots)].sort((a, b) => a - b)[0];
  if (firstConflict !== undefined) {
    throw new FixedScheduleError(
      'STUDENT_FIXED_SLOT_CONFLICT',
      MESSAGES.STUDENT_FIXED_SLOT_CONFLICT,
      { stage: 'student', rowIndex: firstConflict }
    );
  }
}`,
    'all desired row conflict detection'
  );
  content = replaceRequired(
    content,
    `  const validRows = normalized.filter((slot): slot is FixedScheduleSlotInput => Boolean(slot));
  try {
    validateStudentRows(validRows);
  } catch (error) {
    if (error instanceof FixedScheduleError && error.rowIndex !== undefined) {
      const originalIndex = normalized.findIndex((row) => row === validRows[error.rowIndex!]);
      earlyErrors.set(originalIndex, error);
    } else throw error;
  }`,
    `  const validRowsWithIndexes = normalized
    .map((slot, originalIndex) => ({ slot, originalIndex }))
    .filter(
      (item): item is { slot: FixedScheduleSlotInput; originalIndex: number } =>
        Boolean(item.slot)
    );
  const validRows = validRowsWithIndexes.map((item) => item.slot);
  findStudentRowConflictIndexes(validRows).forEach((validRowIndex) => {
    const originalIndex = validRowsWithIndexes[validRowIndex].originalIndex;
    earlyErrors.set(
      originalIndex,
      new FixedScheduleError(
        'STUDENT_FIXED_SLOT_CONFLICT',
        MESSAGES.STUDENT_FIXED_SLOT_CONFLICT,
        { stage: 'student', rowIndex: originalIndex }
      )
    );
  });`,
    'per-line desired conflict feedback'
  );
  content = replaceRequired(
    content,
    `  const excludedSlotIds = [...submittedIds, ...removedIds];

  return Promise.all(`,
    `  // Existing submitted rows are replaced by their desired versions above; they are
  // excluded from the persisted snapshot, while every desired row remains represented
  // in the complete-set conflict validation.
  const excludedSlotIds = [...submittedIds, ...removedIds];

  return Promise.all(`,
    'complete set exclusion rationale'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/agenda/agenda.service.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `      isActive?: boolean;
    }
  ) {`,
    `      isActive?: boolean;
    },
    options: { confirmKeepFutureBookings?: boolean } = {}
  ) {`,
    'update fixed slot transition options'
  );
  content = replaceRequired(
    content,
    `        { confirmKeepFutureBookings: false }
      );`,
    `        { confirmKeepFutureBookings: options.confirmKeepFutureBookings }
      );`,
    'forward fixed to free confirmation'
  );
  content = replaceRequired(
    content,
    `  async deactivateFixedSlot(contractId: string, id: string) {
    return this.updateFixedSlot(contractId, id, { isActive: false });
  },`,
    `  async deactivateFixedSlot(
    contractId: string,
    id: string,
    options: { confirmKeepFutureBookings?: boolean } = {}
  ) {
    return agendaService.updateFixedSlot(contractId, id, { isActive: false }, options);
  },`,
    'explicit agenda deactivation confirmation'
  );
  write(file, content);
}

{
  const file = 'apps/api/src/modules/agenda/agenda.routes.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `const checkFixedScheduleSchema = z.object({
  alunoId: z.string().cuid().optional(),
  slots: z.array(fixedScheduleSlotInputSchema).min(1),
});`,
    `const checkFixedScheduleSchema = z.object({
  alunoId: z.string().cuid().optional(),
  slots: z.array(fixedScheduleSlotInputSchema).min(1),
});

const deactivateFixedSlotSchema = z.object({
  confirmKeepFutureBookings: z.boolean().optional(),
});`,
    'deactivate fixed slot schema'
  );
  content = replaceRequired(
    content,
    `    const item = await agendaService.deactivateFixedSlot(contractId, req.params.id);`,
    `    const validated = deactivateFixedSlotSchema.parse(req.body ?? {});
    const item = await agendaService.deactivateFixedSlot(
      contractId,
      req.params.id,
      validated
    );`,
    'deactivate fixed slot payload'
  );
  content = replaceRequired(
    content,
    `  } catch (error: any) {
    return sendFixedScheduleError(res, error, 'Erro ao inativar horario fixo');
  }
});`,
    `  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendFixedScheduleError(res, error, 'Erro ao inativar horario fixo');
  }
});`,
    'deactivate fixed slot validation error'
  );
  write(file, content);
}

{
  const file = 'apps/web/src/services/agenda.service.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `  async deactivateFixedSlot(id: string): Promise<FixedScheduleSlot> {
    const response = await api.delete<{ success: boolean; data: FixedScheduleSlot }>(\`/agenda/fixed-slots/\${id}\`);
    return response.data.data;
  },`,
    `  async deactivateFixedSlot(
    id: string,
    confirmKeepFutureBookings = false
  ): Promise<FixedScheduleSlot> {
    const response = await api.delete<{ success: boolean; data: FixedScheduleSlot }>(
      \`/agenda/fixed-slots/\${id}\`,
      { data: { confirmKeepFutureBookings } }
    );
    return response.data.data;
  },`,
    'web explicit fixed slot deactivation'
  );
  write(file, content);
}

{
  const file = 'apps/web/src/pages/Agenda.tsx';
  let content = read(file);
  content = replaceRequired(
    content,
    `  const handleDeactivateFixedSlot = async (id: string) => {
    clearMessages();
    try {
      await agendaService.deactivateFixedSlot(id);
      await reloadData();
      setSuccess(agendaCopy.fixedSlotDeactivateSuccess);
    } catch (err: any) {
      setError(err?.response?.data?.error || agendaCopy.fixedSlotDeactivateError);
    }
  };`,
    `  const handleDeactivateFixedSlot = async (id: string) => {
    clearMessages();
    try {
      await agendaService.deactivateFixedSlot(id);
    } catch (err: any) {
      if (err?.response?.data?.code !== 'FUTURE_BOOKINGS_CONFIRMATION_REQUIRED') {
        setError(err?.response?.data?.error || agendaCopy.fixedSlotDeactivateError);
        return;
      }

      const confirmed = window.confirm(
        'Este é o último horário fixo ativo e existem agendamentos futuros vinculados. Os agendamentos serão mantidos para cancelamento separado. Deseja continuar?'
      );
      if (!confirmed) return;
      await agendaService.deactivateFixedSlot(id, true);
    }

    await reloadData();
    setSuccess(agendaCopy.fixedSlotDeactivateSuccess);
  };`,
    'agenda future booking decision'
  );
  write(file, content);
}

{
  const file = 'apps/api/tests/fixed-schedule.service.test.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `    expect(results[1]).toMatchObject({
      available: false,
      code: 'STUDENT_FIXED_SLOT_CONFLICT',
      stage: 'student',
    });`,
    `    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 0,
          available: false,
          code: 'STUDENT_FIXED_SLOT_CONFLICT',
          stage: 'student',
        }),
        expect.objectContaining({
          rowIndex: 1,
          available: false,
          code: 'STUDENT_FIXED_SLOT_CONFLICT',
          stage: 'student',
        }),
      ])
    );`,
    'both conflicting rows fail'
  );
  content = replaceRequired(
    content,
    `  it('locks competing resources before the final validation and persists the complete set', async () => {`,
    `  it('does not write plan or slots when the final validation fails', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 1, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ startTime: '08:30', endTime: '09:30' }]);

    await expect(
      syncStudentFixedSchedule(db as never, 'contract-1', 'aluno-1', 'fixed', [slot()])
    ).rejects.toMatchObject({ code: 'SPACE_CAPACITY_FULL' });

    expect(db.fixedScheduleSlot.create).not.toHaveBeenCalled();
    expect(db.fixedScheduleSlot.update).not.toHaveBeenCalled();
    expect(db.fixedScheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(db.aluno.update).not.toHaveBeenCalled();
  });

  it('locks competing resources before the final validation and persists the complete set', async () => {`,
    'rollback unit coverage'
  );
  write(file, content);
}

console.log('Final issue 265 audit corrections applied successfully.');
