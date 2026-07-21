import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Anchor not found: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Anchor is not unique: ${label}`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

// Shared request validation.
{
  const file = 'packages/utils/validations.ts';
  let content = read(file);
  const schema = `const fixedScheduleSlotSchema = z.object({
  id: z.string().trim().min(1).optional(),
  clientKey: z.string().trim().min(1).optional(),
  professorId: z.string().trim().min(1, 'Selecione o professor responsável'),
  spaceId: z.string().trim().min(1, 'Selecione o espaço da academia'),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\\d{2}:\\d{2}$/, 'Horário inicial inválido'),
  endTime: z.string().regex(/^\\d{2}:\\d{2}$/, 'Horário final inválido'),
  notes: z.string().trim().nullable().optional(),
});

`;
  content = replaceOnce(
    content,
    'export const CreateAlunoSchema = z.object({',
    `${schema}export const CreateAlunoSchema = z.object({`,
    'student fixed schedule schema'
  );
  content = replaceOnce(
    content,
    "  schedulePlan: z.enum(['free', 'fixed'], {\n    errorMap: () => ({ message: 'Plano de agenda deve ser free ou fixed' }),\n  }),",
    "  schedulePlan: z.enum(['free', 'fixed'], {\n    errorMap: () => ({ message: 'Plano de agenda deve ser free ou fixed' }),\n  }),\n  fixedScheduleSlots: z.array(fixedScheduleSlotSchema).optional(),\n  confirmKeepFutureBookings: z.boolean().optional(),",
    'create student schedule fields'
  );
  content = replaceOnce(
    content,
    "  schedulePlan: z.enum(['free', 'fixed']).optional(),",
    "  schedulePlan: z.enum(['free', 'fixed']).optional(),\n  fixedScheduleSlots: z.array(fixedScheduleSlotSchema).optional(),\n  confirmKeepFutureBookings: z.boolean().optional(),",
    'update student schedule fields'
  );
  write(file, content);
}

// Student create/update transactions own the complete fixed schedule set.
{
  const file = 'apps/api/src/modules/alunos/aluno.service.ts';
  let content = read(file);
  content = replaceOnce(
    content,
    "import { assertStudentInterestServiceSelectable } from './aluno.service-selection.js';",
    "import { assertStudentInterestServiceSelectable } from './aluno.service-selection.js';\nimport {\n  syncStudentFixedSchedule,\n  type FixedScheduleSlotInput,\n} from '../agenda/fixed-schedule.service.js';",
    'aluno service schedule import'
  );
  content = replaceOnce(
    content,
    "  schedulePlan: 'free' | 'fixed';\n  birthDate?: Date;",
    "  schedulePlan: 'free' | 'fixed';\n  fixedScheduleSlots?: FixedScheduleSlotInput[];\n  confirmKeepFutureBookings?: boolean;\n  birthDate?: Date;",
    'create dto schedule slots'
  );
  content = replaceOnce(
    content,
    "  schedulePlan?: 'free' | 'fixed';\n  birthDate?: Date;",
    "  schedulePlan?: 'free' | 'fixed';\n  fixedScheduleSlots?: FixedScheduleSlotInput[];\n  confirmKeepFutureBookings?: boolean;\n  birthDate?: Date;",
    'update dto schedule slots'
  );
  content = replaceOnce(
    content,
    `      return tx.aluno.findUniqueOrThrow({
        where: { id: aluno.id },`,
    `      await syncStudentFixedSchedule(
        tx,
        professor.contractId,
        aluno.id,
        data.schedulePlan,
        data.schedulePlan === 'fixed' ? data.fixedScheduleSlots ?? [] : [],
        { confirmKeepFutureBookings: data.confirmKeepFutureBookings }
      );

      return tx.aluno.findUniqueOrThrow({
        where: { id: aluno.id },`,
    'create schedule sync'
  );
  content = replaceOnce(
    content,
    `      avatar,
      professorId,
      birthDate,
      gender,
      macronutrients,
      intakeForm,
      ...alunoPatch`,
    `      avatar,
      professorId,
      schedulePlan,
      fixedScheduleSlots,
      confirmKeepFutureBookings,
      birthDate,
      gender,
      macronutrients,
      intakeForm,
      ...alunoPatch`,
    'update schedule destructuring'
  );
  content = replaceOnce(
    content,
    `      return tx.aluno.findUniqueOrThrow({
        where: { id },
        include: {`,
    `      if (schedulePlan !== undefined || fixedScheduleSlots !== undefined) {
        const desiredSchedulePlan = schedulePlan ?? currentAluno.schedulePlan;
        await syncStudentFixedSchedule(
          tx,
          alunoContractId,
          id,
          desiredSchedulePlan,
          desiredSchedulePlan === 'fixed' ? fixedScheduleSlots ?? [] : [],
          { confirmKeepFutureBookings }
        );
      }

      return tx.aluno.findUniqueOrThrow({
        where: { id },
        include: {`,
    'update schedule sync'
  );
  write(file, content);
}

// Agenda routes and legacy mutations reuse the canonical validator.
{
  const file = 'apps/api/src/modules/agenda/agenda.service.ts';
  let content = read(file);
  content = replaceOnce(
    content,
    "import { PrismaClient, type AgendaBookingStatus, type AgendaBookingType } from '@prisma/client';",
    "import { PrismaClient, type AgendaBookingStatus, type AgendaBookingType } from '@prisma/client';\nimport {\n  checkFixedScheduleAvailability,\n  syncStudentFixedSchedule,\n  type FixedScheduleSlotInput,\n} from './fixed-schedule.service.js';",
    'agenda canonical import'
  );
  content = replaceOnce(
    content,
    '        where: { contractId },\n        include: { user: { include: { profile: true } } },',
    '        where: { contractId, user: { isActive: true } },\n        include: { user: { include: { profile: true } } },',
    'active professors metadata'
  );
  content = replaceOnce(
    content,
    '    const where: any = { professor: { contractId } };\n    if (filters.professorId) where.professorId = filters.professorId;',
    '    const where: any = { professor: { contractId }, isActive: true };\n    if (filters.professorId) where.professorId = filters.professorId;',
    'active fixed slot list'
  );

  const start = content.indexOf('  async createFixedSlot(');
  const end = content.indexOf('  async listBookings(', start);
  if (start < 0 || end < 0) throw new Error('Agenda fixed slot method block not found');
  const replacement = `  async checkFixedSchedule(
    contractId: string,
    data: { alunoId?: string; slots: FixedScheduleSlotInput[] }
  ) {
    return checkFixedScheduleAvailability(prisma, contractId, data.alunoId, data.slots);
  },

  async createFixedSlot(
    contractId: string,
    data: FixedScheduleSlotInput & { alunoId: string }
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.fixedScheduleSlot.findMany({
        where: { alunoId: data.alunoId, isActive: true, professor: { contractId } },
        select: {
          id: true,
          professorId: true,
          spaceId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          notes: true,
        },
      });
      const result = await syncStudentFixedSchedule(tx, contractId, data.alunoId, 'fixed', [
        ...current.map((slot) => ({ ...slot, spaceId: slot.spaceId || '' })),
        data,
      ]);
      return result.slots.find(
        (slot) =>
          slot.professorId === data.professorId &&
          slot.spaceId === data.spaceId &&
          slot.dayOfWeek === data.dayOfWeek &&
          slot.startTime === data.startTime &&
          slot.endTime === data.endTime
      );
    });
  },

  async updateFixedSlot(
    contractId: string,
    id: string,
    data: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      professorId?: string;
      spaceId?: string | null;
      notes?: string | null;
      isActive?: boolean;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.fixedScheduleSlot.findFirst({
        where: { id, professor: { contractId } },
        select: { alunoId: true },
      });
      if (!current) throw new Error('Horario fixo nao encontrado');

      const active = await tx.fixedScheduleSlot.findMany({
        where: { alunoId: current.alunoId, isActive: true, professor: { contractId } },
        select: {
          id: true,
          professorId: true,
          spaceId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          notes: true,
        },
      });
      const desired = active
        .filter((slot) => slot.id !== id || data.isActive !== false)
        .map((slot) =>
          slot.id === id
            ? {
                ...slot,
                ...data,
                spaceId: data.spaceId ?? slot.spaceId ?? '',
                professorId: data.professorId ?? slot.professorId,
              }
            : { ...slot, spaceId: slot.spaceId || '' }
        );

      const result = await syncStudentFixedSchedule(
        tx,
        contractId,
        current.alunoId,
        desired.length > 0 ? 'fixed' : 'free',
        desired,
        { confirmKeepFutureBookings: false }
      );
      return (
        result.slots.find((slot) => slot.id === id) ??
        tx.fixedScheduleSlot.findUnique({ where: { id } })
      );
    });
  },

  async deactivateFixedSlot(contractId: string, id: string) {
    return this.updateFixedSlot(contractId, id, { isActive: false });
  },

`;
  content = content.slice(0, start) + replacement + content.slice(end);
  write(file, content);
}

{
  const file = 'apps/api/src/modules/agenda/agenda.routes.ts';
  let content = read(file);
  content = replaceOnce(
    content,
    "import { agendaService } from './agenda.service.js';",
    "import { agendaService } from './agenda.service.js';\nimport { FixedScheduleError } from './fixed-schedule.service.js';",
    'agenda route error import'
  );
  content = replaceOnce(
    content,
    `const createFixedSlotSchema = z.object({
  alunoId: z.string().cuid(),
  professorId: z.string().cuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: hhmm,
  endTime: hhmm,
  spaceId: z.string().cuid().optional(),
  notes: z.string().optional(),
});`,
    `const fixedScheduleSlotInputSchema = z.object({
  id: z.string().cuid().optional(),
  clientKey: z.string().min(1).optional(),
  professorId: z.string().cuid(),
  spaceId: z.string().cuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: hhmm,
  endTime: hhmm,
  notes: z.string().nullable().optional(),
});

const createFixedSlotSchema = fixedScheduleSlotInputSchema.extend({
  alunoId: z.string().cuid(),
});

const checkFixedScheduleSchema = z.object({
  alunoId: z.string().cuid().optional(),
  slots: z.array(fixedScheduleSlotInputSchema).min(1),
});`,
    'agenda fixed schedule schemas'
  );
  content = replaceOnce(
    content,
    `const updateBookingStatusSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'canceled', 'no_show']),
  canceledReason: z.string().nullable().optional(),
});`,
    `const updateBookingStatusSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'canceled', 'no_show']),
  canceledReason: z.string().nullable().optional(),
});

const sendFixedScheduleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof FixedScheduleError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      stage: error.stage,
      rowIndex: error.rowIndex,
    });
  }
  const message = error instanceof Error ? error.message : fallback;
  return sendError(res, message || fallback, 400);
};`,
    'agenda fixed schedule error responder'
  );
  content = replaceOnce(
    content,
    "router.post('/fixed-slots', async (req: Request, res: Response) => {",
    `router.post('/fixed-slots/check', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const validated = checkFixedScheduleSchema.parse(req.body);
    const results = await agendaService.checkFixedSchedule(contractId, validated);
    return sendSuccess(res, results, 'Disponibilidade dos horários verificada');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendFixedScheduleError(res, error, 'Erro ao verificar horários fixos');
  }
});

router.post('/fixed-slots', async (req: Request, res: Response) => {`,
    'fixed schedule check endpoint'
  );
  content = content.replace(
    "    return sendError(res, error.message || 'Erro ao criar horario fixo', 400);",
    "    return sendFixedScheduleError(res, error, 'Erro ao criar horario fixo');"
  );
  content = content.replace(
    "    return sendError(res, error.message || 'Erro ao atualizar horario fixo', 400);",
    "    return sendFixedScheduleError(res, error, 'Erro ao atualizar horario fixo');"
  );
  content = content.replace(
    "    return sendError(res, error.message || 'Erro ao inativar horario fixo', 400);",
    "    return sendFixedScheduleError(res, error, 'Erro ao inativar horario fixo');"
  );
  write(file, content);
}

// Stable errors also flow through student create/update endpoints.
{
  const file = 'apps/api/src/modules/alunos/aluno.routes.ts';
  let content = read(file);
  content = replaceOnce(
    content,
    "import { alunoService } from './aluno.service.js';",
    "import { alunoService } from './aluno.service.js';\nimport { FixedScheduleError } from '../agenda/fixed-schedule.service.js';",
    'aluno route fixed schedule import'
  );
  content = content.replace(
    `    console.error('Erro ao criar aluno:', error);
    return sendError(res, 'Erro ao criar aluno', 500);`,
    `    if (error instanceof FixedScheduleError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        stage: error.stage,
        rowIndex: error.rowIndex,
      });
    }
    console.error('Erro ao criar aluno:', error);
    return sendError(res, error?.message || 'Erro ao criar aluno', 500);`
  );
  content = content.replace(
    `    console.error('Erro ao atualizar aluno:', error);
    return sendError(res, 'Erro ao atualizar aluno', 500);`,
    `    if (error instanceof FixedScheduleError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        stage: error.stage,
        rowIndex: error.rowIndex,
      });
    }
    console.error('Erro ao atualizar aluno:', error);
    return sendError(res, error?.message || 'Erro ao atualizar aluno', 500);`
  );
  write(file, content);
}

// Web API contracts.
{
  const file = 'apps/web/src/services/agenda.service.ts';
  let content = read(file);
  content = replaceOnce(
    content,
    `export interface FixedScheduleSlot {
  id: string;`,
    `export type FixedScheduleErrorCode =
  | 'FIXED_SCHEDULE_REQUIRED'
  | 'INVALID_DAY_OF_WEEK'
  | 'INVALID_TIME_RANGE'
  | 'SPACE_NOT_FOUND'
  | 'SPACE_INACTIVE'
  | 'SPACE_CAPACITY_FULL'
  | 'PROFESSOR_NOT_FOUND'
  | 'PROFESSOR_INACTIVE'
  | 'PROFESSOR_OUTSIDE_AVAILABILITY'
  | 'PROFESSOR_FIXED_SLOT_CONFLICT'
  | 'PROFESSOR_BOOKING_CONFLICT'
  | 'STUDENT_FIXED_SLOT_CONFLICT'
  | 'FIXED_SLOT_NOT_FOUND'
  | 'FUTURE_BOOKINGS_CONFIRMATION_REQUIRED'
  | 'FIXED_SCHEDULE_CHANGED';

export interface FixedScheduleSlotInput {
  id?: string;
  clientKey?: string;
  professorId: string;
  spaceId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes?: string | null;
}

export interface FixedScheduleAvailabilityResult {
  rowIndex: number;
  slotId?: string;
  clientKey?: string;
  available: boolean;
  code: FixedScheduleErrorCode | 'AVAILABLE';
  message: string;
  stage: 'schedule' | 'student' | 'space' | 'professor';
}

export interface FixedScheduleSlot {
  id: string;`,
    'web agenda schedule contracts'
  );
  content = replaceOnce(
    content,
    `  async createFixedSlot(data: {
    alunoId: string;`,
    `  async checkFixedScheduleAvailability(data: {
    alunoId?: string;
    slots: FixedScheduleSlotInput[];
  }): Promise<FixedScheduleAvailabilityResult[]> {
    const response = await api.post<{ success: boolean; data: FixedScheduleAvailabilityResult[] }>(
      '/agenda/fixed-slots/check',
      data
    );
    return response.data.data;
  },

  async createFixedSlot(data: {
    alunoId: string;`,
    'web agenda check method'
  );
  content = content.replace('    spaceId?: string;\n    notes?: string;\n  }): Promise<FixedScheduleSlot> {', '    spaceId: string;\n    notes?: string;\n  }): Promise<FixedScheduleSlot> {');
  write(file, content);
}

{
  const file = 'apps/web/src/services/aluno.service.ts';
  let content = read(file);
  content = replaceOnce(
    content,
    "import api from './api';",
    "import api from './api';\nimport type { FixedScheduleSlotInput } from './agenda.service';",
    'web aluno agenda type import'
  );
  content = replaceOnce(
    content,
    "  schedulePlan: 'free' | 'fixed';\n  birthDate?: string;",
    "  schedulePlan: 'free' | 'fixed';\n  fixedScheduleSlots?: FixedScheduleSlotInput[];\n  confirmKeepFutureBookings?: boolean;\n  birthDate?: string;",
    'web create dto schedule fields'
  );
  content = replaceOnce(
    content,
    "  schedulePlan?: 'free' | 'fixed';\n  birthDate?: string;",
    "  schedulePlan?: 'free' | 'fixed';\n  fixedScheduleSlots?: FixedScheduleSlotInput[];\n  confirmKeepFutureBookings?: boolean;\n  birthDate?: string;",
    'web update dto schedule fields'
  );
  write(file, content);
}

// Student form UI and payload.
{
  const file = 'apps/web/src/pages/AlunoForm.tsx';
  let content = read(file);
  content = replaceOnce(
    content,
    "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';",
    "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';\nimport {\n  FixedScheduleEditor,\n  type FixedScheduleSlotDraft,\n} from '../components/alunos/FixedScheduleEditor';",
    'aluno form editor import'
  );
  content = replaceOnce(
    content,
    "  const [originalResponsibleProfessorId, setOriginalResponsibleProfessorId] = useState('');\n  const avatarInputRef",
    "  const [originalResponsibleProfessorId, setOriginalResponsibleProfessorId] = useState('');\n  const [originalSchedulePlan, setOriginalSchedulePlan] = useState<'free' | 'fixed'>('free');\n  const [fixedScheduleSlots, setFixedScheduleSlots] = useState<FixedScheduleSlotDraft[]>([]);\n  const [fixedScheduleRefreshKey, setFixedScheduleRefreshKey] = useState(0);\n  const avatarInputRef",
    'aluno form schedule state'
  );
  content = replaceOnce(
    content,
    "  const selectedServiceId = watch('serviceId');\n  const avatar = watch('avatar');",
    "  const selectedServiceId = watch('serviceId');\n  const schedulePlan = watch('schedulePlan');\n  const avatar = watch('avatar');",
    'aluno form schedule watch'
  );
  content = replaceOnce(
    content,
    "      setValue('schedulePlan', aluno.schedulePlan);\n      setValue('age', aluno.age);",
    "      setValue('schedulePlan', aluno.schedulePlan);\n      setOriginalSchedulePlan(aluno.schedulePlan);\n      setValue('age', aluno.age);",
    'load original schedule plan'
  );
  content = replaceOnce(
    content,
    `      const updatePayload: UpdateAlunoDTO = {`,
    `      if (
        data.schedulePlan === 'fixed' &&
        (fixedScheduleSlots.length === 0 ||
          fixedScheduleSlots.some(
            (slot) =>
              !slot.professorId ||
              !slot.spaceId ||
              !slot.startTime ||
              !slot.endTime ||
              slot.startTime >= slot.endTime
          ))
      ) {
        alert('Preencha ao menos um horário recorrente válido para usar a agenda fixa.');
        return;
      }

      let confirmKeepFutureBookings = false;
      if (isEditMode && originalSchedulePlan === 'fixed' && data.schedulePlan === 'free') {
        confirmKeepFutureBookings = window.confirm(
          'Ao mudar para agenda livre, os horários fixos serão inativados. Agendamentos futuros já criados serão mantidos e deverão ser cancelados separadamente quando necessário. Deseja continuar?'
        );
        if (!confirmKeepFutureBookings) return;
      }

      const serializedFixedScheduleSlots = fixedScheduleSlots.map(
        ({ availability: _availability, ...slot }) => slot
      );

      const updatePayload: UpdateAlunoDTO = {`,
    'aluno form pre-save schedule validation'
  );
  content = replaceOnce(
    content,
    "        schedulePlan: data.schedulePlan,\n        age: resolvedAge,",
    "        schedulePlan: data.schedulePlan,\n        fixedScheduleSlots: data.schedulePlan === 'fixed' ? serializedFixedScheduleSlots : [],\n        confirmKeepFutureBookings,\n        age: resolvedAge,",
    'update payload schedule fields'
  );
  content = replaceOnce(
    content,
    "          setSaveNotice('Dados do aluno atualizados com sucesso.');\n        }\n\n        return;",
    "          setSaveNotice('Dados do aluno atualizados com sucesso.');\n        }\n\n        setOriginalSchedulePlan(data.schedulePlan);\n        setFixedScheduleRefreshKey((current) => current + 1);\n        return;",
    'refresh schedule after update'
  );
  content = replaceOnce(
    content,
    "        schedulePlan: data.schedulePlan,\n        age: resolvedAge,",
    "        schedulePlan: data.schedulePlan,\n        fixedScheduleSlots: data.schedulePlan === 'fixed' ? serializedFixedScheduleSlots : [],\n        confirmKeepFutureBookings,\n        age: resolvedAge,",
    'create payload schedule fields'
  );

  const interestEnd = `                          {errors.serviceId?.message && (
                            <p className="text-sm text-destructive">{errors.serviceId.message}</p>
                          )}
                        </div>

                      </div>`;
  const interestReplacement = `                          {errors.serviceId?.message && (
                            <p className="text-sm text-destructive">{errors.serviceId.message}</p>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-foreground">
                              Plano de agenda <span className="ml-1 text-destructive">*</span>
                            </label>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Na agenda fixa, informe todos os dias e horários recorrentes antes de salvar.
                            </p>
                          </div>
                          <select className={selectClassName} {...register('schedulePlan')}>
                            <option value="free">Agenda livre</option>
                            <option value="fixed">Agenda fixa</option>
                          </select>
                          {errors.schedulePlan?.message && (
                            <p className="text-sm text-destructive">{errors.schedulePlan.message}</p>
                          )}
                        </div>

                        <FixedScheduleEditor
                          alunoId={isEditMode ? id : undefined}
                          plan={schedulePlan}
                          value={fixedScheduleSlots}
                          onChange={setFixedScheduleSlots}
                          refreshKey={fixedScheduleRefreshKey}
                        />
                      </div>`;
  content = replaceOnce(content, interestEnd, interestReplacement, 'schedule editor UI');
  write(file, content);
}

console.log('Issue 265 source patch applied successfully.');
