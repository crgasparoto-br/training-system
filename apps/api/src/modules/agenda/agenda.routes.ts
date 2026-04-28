import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { agendaService } from './agenda.service.js';

const router: Router = Router();

router.use(authMiddleware);
router.use(professorMiddleware);

const hhmm = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Formato de horario invalido. Use HH:mm');

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data invalida. Use YYYY-MM-DD');

const createSpaceSchema = z.object({
  name: z.string().min(2),
  capacity: z.number().int().min(1).max(200),
});

const updateSpaceSchema = z.object({
  name: z.string().min(2).optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

const createAvailabilitySchema = z.object({
  professorId: z.string().cuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: hhmm,
  endTime: hhmm,
});

const createFixedSlotSchema = z.object({
  alunoId: z.string().cuid(),
  professorId: z.string().cuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: hhmm,
  endTime: hhmm,
  spaceId: z.string().cuid().optional(),
  notes: z.string().optional(),
});

const updateFixedSlotSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  spaceId: z.string().cuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const createBookingSchema = z.object({
  alunoId: z.string().cuid(),
  professorId: z.string().cuid(),
  bookingDate: dateString,
  startTime: hhmm,
  endTime: hhmm,
  spaceId: z.string().cuid().optional(),
  bookingType: z.enum(['free', 'fixed_makeup']),
  fixedSlotId: z.string().cuid().optional(),
  notes: z.string().optional(),
});

const updateBookingStatusSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'canceled', 'no_show']),
  canceledReason: z.string().nullable().optional(),
});

router.get('/metadata', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);

    const data = await agendaService.getMetadata(contractId);
    return sendSuccess(res, data, 'Metadados da agenda carregados');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar metadados da agenda', 500);
  }
});

router.get('/spaces', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const spaces = await agendaService.listSpaces(contractId);
    return sendSuccess(res, spaces, 'Espacos carregados');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar espacos', 500);
  }
});

router.post('/spaces', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);

    const validated = createSpaceSchema.parse(req.body);
    const space = await agendaService.createSpace(contractId, validated);
    return sendSuccess(res, space, 'Espaco criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao criar espaco', 400);
  }
});

router.put('/spaces/:id', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);

    const validated = updateSpaceSchema.parse(req.body);
    const space = await agendaService.updateSpace(contractId, req.params.id, validated);
    return sendSuccess(res, space, 'Espaco atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao atualizar espaco', 400);
  }
});

router.get('/availabilities', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);

    const professorId =
      typeof req.query.professorId === 'string' && req.query.professorId.trim()
        ? req.query.professorId.trim()
        : undefined;
    const items = await agendaService.listAvailabilities(contractId, professorId);
    return sendSuccess(res, items, 'Disponibilidades carregadas');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar disponibilidades', 500);
  }
});

router.post('/availabilities', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const validated = createAvailabilitySchema.parse(req.body);
    const item = await agendaService.createAvailability(contractId, validated);
    return sendSuccess(res, item, 'Disponibilidade criada com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao criar disponibilidade', 400);
  }
});

router.delete('/availabilities/:id', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    await agendaService.deleteAvailability(contractId, req.params.id);
    return sendSuccess(res, null, 'Disponibilidade removida com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao remover disponibilidade', 400);
  }
});

router.get('/fixed-slots', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const professorId =
      typeof req.query.professorId === 'string' && req.query.professorId.trim()
        ? req.query.professorId.trim()
        : undefined;
    const alunoId =
      typeof req.query.alunoId === 'string' && req.query.alunoId.trim()
        ? req.query.alunoId.trim()
        : undefined;

    const items = await agendaService.listFixedSlots(contractId, { professorId, alunoId });
    return sendSuccess(res, items, 'Horarios fixos carregados');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar horarios fixos', 500);
  }
});

router.post('/fixed-slots', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const validated = createFixedSlotSchema.parse(req.body);
    const item = await agendaService.createFixedSlot(contractId, validated);
    return sendSuccess(res, item, 'Horario fixo criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao criar horario fixo', 400);
  }
});

router.put('/fixed-slots/:id', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const validated = updateFixedSlotSchema.parse(req.body);
    const item = await agendaService.updateFixedSlot(contractId, req.params.id, validated);
    return sendSuccess(res, item, 'Horario fixo atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao atualizar horario fixo', 400);
  }
});

router.delete('/fixed-slots/:id', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const item = await agendaService.deactivateFixedSlot(contractId, req.params.id);
    return sendSuccess(res, item, 'Horario fixo inativado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao inativar horario fixo', 400);
  }
});

router.get('/bookings', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);

    const dateFromRaw = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateToRaw = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const professorId =
      typeof req.query.professorId === 'string' && req.query.professorId.trim()
        ? req.query.professorId.trim()
        : undefined;
    const alunoId =
      typeof req.query.alunoId === 'string' && req.query.alunoId.trim()
        ? req.query.alunoId.trim()
        : undefined;
    const status =
      typeof req.query.status === 'string' &&
      ['scheduled', 'completed', 'canceled', 'no_show'].includes(req.query.status)
        ? (req.query.status as 'scheduled' | 'completed' | 'canceled' | 'no_show')
        : undefined;

    const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00`) : undefined;
    const dateTo = dateToRaw ? new Date(`${dateToRaw}T00:00:00`) : undefined;

    const items = await agendaService.listBookings(contractId, {
      dateFrom,
      dateTo,
      professorId,
      alunoId,
      status,
    });
    return sendSuccess(res, items, 'Agendamentos carregados');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao listar agendamentos', 500);
  }
});

router.post('/bookings', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const validated = createBookingSchema.parse(req.body);
    const booking = await agendaService.createBooking(contractId, {
      ...validated,
      bookingDate: new Date(`${validated.bookingDate}T00:00:00`),
    });
    return sendSuccess(res, booking, 'Agendamento criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao criar agendamento', 400);
  }
});

router.patch('/bookings/:id/status', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    if (!contractId) return sendError(res, 'Contrato nao encontrado', 404);
    const validated = updateBookingStatusSchema.parse(req.body);
    const booking = await agendaService.updateBookingStatus(contractId, req.params.id, validated);
    return sendSuccess(res, booking, 'Status do agendamento atualizado');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }
    return sendError(res, error.message || 'Erro ao atualizar agendamento', 400);
  }
});

export default router;


