import { PrismaClient } from '@prisma/client';
import type {
  FutureTemporalBinding,
  FutureTemporalBookingCandidate,
  FutureTemporalPreview,
  FutureTemporalPreviewCommand,
} from '@corrida/types';
import {
  ACTIVE_COMBINED_CONFLICT_RULES_V1,
  COMBINED_CONFLICT_PROTOCOL_VERSION,
  evaluateCombinedTrainingConflicts,
  type ConflictCapacity,
  type ConflictObservation,
} from '../workout/combined-training-conflicts.domain.js';
import { ConsolidatedPrescriptionDomainError } from './consolidated-prescription.service.js';
import {
  assertFutureWindow, canonicalTimeZone, parseCanonicalUtc, resolveAgendaBookingUtc,
} from './combined-future-temporal.domain.js';

const prisma = new PrismaClient();
type Context = { contractId: string; alunoId: string };
const MAX_BOOKINGS = 80;
const MAX_PAGES = 100;
const MAX_SCANNED_BOOKINGS = MAX_BOOKINGS * MAX_PAGES * 2;
const MINUTE = 60_000;
const MAX_IANA_OFFSET_MS = 14 * 60 * MINUTE;
const CIVIL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

function invalid(message: string): never {
  throw new ConsolidatedPrescriptionDomainError('INVALID_INPUT', message);
}
function stale(): never {
  throw new ConsolidatedPrescriptionDomainError('CONFLICT', 'Agendamento ou versão de prescrição alterado; atualize os dados da agenda e da montagem.');
}
function canonicalCivilDay(value: Date | null): string | null {
  return value && value.toISOString().endsWith('T00:00:00.000Z')
    ? value.toISOString().slice(0, 10) : null;
}
/**
 * The GET has no confirmed IANA zone. Exclude a booking only when its canonical
 * civil start is outside the requested future window in *every* possible zone.
 * Legacy/malformed sources remain unverified candidates, never guessed from
 * the server's timezone or the professor's address.
 */
function mayStartInWindow(
  booking: { bookingCivilDate: Date | null; startTime: string },
  from: Date, to: Date, now: Date
): boolean {
  const day = canonicalCivilDay(booking.bookingCivilDate);
  if (!day || !CIVIL_TIME.test(booking.startTime)) return true;
  const localStart = Date.parse(`${day}T${booking.startTime}:00.000Z`);
  if (!Number.isFinite(localStart)) return true;
  const earliestUtc = localStart - MAX_IANA_OFFSET_MS;
  const latestUtc = localStart + MAX_IANA_OFFSET_MS;
  return latestUtc > Math.max(from.getTime(), now.getTime()) && earliestUtc < to.getTime();
}
function bindingKey(binding: FutureTemporalBinding) {
  return binding.bookingId + ':' + binding.capacityPrescriptionVersionId;
}
export function createCombinedFutureTemporalService(client: PrismaClient = prisma) {
  async function assertStudent(context: Context) {
    const aluno = await client.aluno.findFirst({
      where: { id: context.alunoId, contractId: context.contractId },
      select: { id: true },
    });
    if (!aluno) throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
  }

  return {
    async getCandidates(context: Context, start: string, end: string, now = new Date(), page = 1):
      Promise<FutureTemporalBookingCandidate[]> {
      const { from, to } = assertFutureWindow(start, end, now);
      if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) {
        invalid('Página de agendamentos inválida.');
      }
      await assertStudent(context);
      // Calendar-day envelope is widened by one day to avoid silently discarding UTC crossings.
      const fromDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - 1));
      const toDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1));
      const candidates: FutureTemporalBookingCandidate[] = [];
      const beforePage = (page - 1) * MAX_BOOKINGS;
      let eligibleSeen = 0;
      let scanned = 0;
      let cursor: string | undefined;
      // Scan bounded DB pages, not an unbounded tenant list. Filtering only the
      // first 81 rows could let past bookings hide eligible future bookings.
      do {
        const bookings = await client.agendaBooking.findMany({
          where: {
            contractId: context.contractId, alunoId: context.alunoId,
            status: 'scheduled', bookingDate: { gte: fromDay, lte: toDay },
          },
          select: { id: true, bookingDate: true, bookingCivilDate: true, startTime: true, endTime: true, updatedAt: true },
          orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
          take: MAX_BOOKINGS + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        scanned += bookings.length;
        if (scanned > MAX_SCANNED_BOOKINGS) {
          invalid('Consulta muito extensa; selecione um período menor.');
        }
        for (const booking of bookings) {
          if (!mayStartInWindow(booking, from, to, now)) continue;
          eligibleSeen += 1;
          if (eligibleSeen <= beforePage) continue;
          if (candidates.length === MAX_BOOKINGS) return candidates;
          candidates.push({
            bookingId: booking.id, bookingDate: canonicalCivilDay(booking.bookingCivilDate),
            startTime: booking.startTime, endTime: booking.endTime,
            sourceUpdatedAt: booking.updatedAt.toISOString(),
          });
        }
        if (bookings.length < MAX_BOOKINGS + 1) break;
        cursor = bookings[bookings.length - 1].id;
      } while (true);
      return candidates;
    },

    async preview(context: Context, command: FutureTemporalPreviewCommand, now = new Date()):
      Promise<FutureTemporalPreview> {
      const { from, to } = assertFutureWindow(command.windowStart, command.windowEnd, now);
      const zone = canonicalTimeZone(command.timeZone);
      if (!Number.isInteger(command.expectedCurrentVersion) || command.expectedCurrentVersion < 1 ||
          !Array.isArray(command.bindings) || command.bindings.length > MAX_BOOKINGS * 4) {
        invalid('Versão ou vínculos de agenda inválidos.');
      }
      const selected = new Set<string>();
      for (const binding of command.bindings) {
        if (!binding.bookingId || !binding.capacityPrescriptionVersionId ||
            selected.has(bindingKey(binding))) invalid('Vínculo de agendamento inválido ou duplicado.');
        selected.add(bindingKey(binding));
        parseCanonicalUtc(binding.expectedBookingUpdatedAt);
      }
      await assertStudent(context);
      const root = await client.consolidatedPrescription.findFirst({
        where: { contractId: context.contractId, alunoId: context.alunoId },
        select: {
          id: true, currentVersion: true,
          versions: {
            where: { version: command.expectedCurrentVersion },
            select: {
              id: true,
              capacityBlocks: {
                select: { capacity: true, capacityPrescriptionVersionId: true, capacityVersion: true },
              },
            },
            take: 1,
          },
        },
      });
      if (!root) throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
      if (root.currentVersion !== command.expectedCurrentVersion || !root.versions[0]) stale();
      const current = root.versions[0];
      const blocks = current.capacityBlocks;
      const bySource = new Map(blocks.map((block) => [block.capacityPrescriptionVersionId, block]));
      const capacityIds = blocks.map((block) => block.capacityPrescriptionVersionId);
      const live = capacityIds.length
        ? await client.capacityPrescriptionVersion.findMany({
            where: { id: { in: capacityIds }, contractId: context.contractId, alunoId: context.alunoId },
            select: {
              id: true, capacity: true, version: true, status: true,
              prescription: { select: { status: true, currentVersion: true } },
            },
          })
        : [];
      if (live.length !== capacityIds.length || live.some((v) => {
        const block = bySource.get(v.id);
        return !block || block.capacity !== v.capacity || block.capacityVersion !== v.version ||
          v.status !== 'active' || v.prescription.status !== 'active' ||
          v.prescription.currentVersion !== v.version;
      })) stale();

      const bookingIds = [...new Set(command.bindings.map((item) => item.bookingId))];
      if (bookingIds.length > MAX_BOOKINGS) invalid('Vínculos demais para uma única avaliação.');
      const bookings = bookingIds.length ? await client.agendaBooking.findMany({
        where: { id: { in: bookingIds }, contractId: context.contractId, alunoId: context.alunoId },
        select: {
          id: true, bookingDate: true, bookingCivilDate: true, startTime: true, endTime: true,
          status: true, updatedAt: true, contractId: true, alunoId: true,
        },
      }) : [];
      if (bookings.length !== bookingIds.length) stale();
      const byBooking = new Map(bookings.map((booking) => [booking.id, booking]));
      const resolved = new Map<string, ReturnType<typeof resolveAgendaBookingUtc>>();
      const mappedSessions: FutureTemporalPreview['mappedSessions'] = [];
      const observations: ConflictObservation[] = [];
      for (const binding of command.bindings) {
        const block = bySource.get(binding.capacityPrescriptionVersionId);
        const booking = byBooking.get(binding.bookingId);
        if (!block || !booking || booking.status !== 'scheduled' ||
            booking.contractId !== context.contractId || booking.alunoId !== context.alunoId ||
            booking.updatedAt.toISOString() !== binding.expectedBookingUpdatedAt) stale();
        const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - 1);
        const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1);
        const sourceDay = (booking.bookingCivilDate ?? booking.bookingDate).getTime();
        if (sourceDay < fromDay || sourceDay > toDay) {
          invalid('O agendamento informado está fora da janela solicitada.');
        }
        const earliestCivilDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);
        if (sourceDay < earliestCivilDay) {
          invalid('Um agendamento passado não pode representar uma sessão futura.');
        }
        const time = resolved.get(booking.id) ?? resolveAgendaBookingUtc(
          booking.bookingCivilDate, booking.startTime, booking.endTime, zone
        );
        resolved.set(booking.id, time);
        const verified = time.status === 'verified';
        const startAtUtc = verified ? time.startAtUtc : null;
        const endAtUtc = verified ? time.endAtUtc : null;
        if (startAtUtc !== null && (startAtUtc <= now.toISOString() ||
            startAtUtc < command.windowStart || startAtUtc >= command.windowEnd)) {
          invalid('O agendamento selecionado deve começar no futuro e pertencer ao período solicitado.');
        }
        mappedSessions.push({
          bookingId: booking.id, bookingVersion: booking.updatedAt.toISOString(),
          assemblyVersionId: current.id,
          capacity: block.capacity as ConflictCapacity,
          capacityPrescriptionVersionId: block.capacityPrescriptionVersionId,
          capacityVersion: block.capacityVersion,
          startAtUtc, endAtUtc,
          proof: verified ? 'verified' : time.reason,
        });
        if (startAtUtc !== null) {
          observations.push({
            alunoId: context.alunoId, contractId: context.contractId,
            sessionId: booking.id, capacity: block.capacity as ConflictCapacity,
            scheduledAt: startAtUtc, numeric: {}, flags: {},
          });
        }
      }
      const uniqueVerified = new Map<string, { bookingId: string; start: string; end: string }>();
      for (const item of mappedSessions) {
        if (item.proof === 'verified') uniqueVerified.set(item.bookingId, {
          bookingId: item.bookingId, start: item.startAtUtc!, end: item.endAtUtc!,
        });
      }
      const ordered = [...uniqueVerified.values()].sort((a, b) =>
        a.start.localeCompare(b.start) || a.bookingId.localeCompare(b.bookingId));
      const gaps: FutureTemporalPreview['gaps'] = [];
      for (let i = 1; i < ordered.length; i += 1) {
        const hours = (Date.parse(ordered[i].start) - Date.parse(ordered[i - 1].end)) / (60 * MINUTE);
        gaps.push({
          previousBookingId: ordered[i - 1].bookingId, nextBookingId: ordered[i].bookingId,
          hoursFromEndToStart: Number(hours.toFixed(3)), overlapsInTime: hours < 0,
        });
      }
      const bound = new Set(mappedSessions.filter((item) => item.proof === 'verified')
        .map((item) => item.capacityPrescriptionVersionId));
      const evaluated = evaluateCombinedTrainingConflicts({
        alunoId: context.alunoId, contractId: context.contractId,
        windowStart: from.toISOString(), windowEnd: to.toISOString(),
        coverage: 'partial', observations, rules: ACTIVE_COMBINED_CONFLICT_RULES_V1,
      });
      return {
        protocolVersion: COMBINED_CONFLICT_PROTOCOL_VERSION,
        assemblyVersionId: current.id, assemblyVersion: command.expectedCurrentVersion,
        timeZone: zone, timeZoneBasis: 'explicit_preview_assumption',
        coverage: 'partial',
        state: evaluated.state,
        temporalEvidenceStatus: mappedSessions.length > 0 &&
          mappedSessions.every((item) => item.proof === 'verified')
          ? 'verified_bindings_only' : 'insufficient_data',
        mappedSessions, gaps,
        unlinkedCapacities: blocks.filter((block) => !bound.has(block.capacityPrescriptionVersionId))
          .map((block) => block.capacity as ConflictCapacity),
        evaluations: evaluated.evaluations,
        mayConcludeNoConflict: false,
        changesWorkoutAutomatically: false,
      };
    },
  };
}
export const combinedFutureTemporalService = createCombinedFutureTemporalService();
