import { createCombinedFutureTemporalService } from './combined-future-temporal.service.js';
import { FutureTemporalInputError } from './combined-future-temporal.domain.js';

const now = new Date('2026-11-06T12:00:00.000Z');
const bindingVersion = '2026-11-06T13:00:00.000Z';
const capacityIds = ['resisted-v1', 'cyclic-v1', 'flexibility-v1', 'balance-v1'];
const capacities = ['resisted', 'cyclic', 'flexibility', 'balance'] as const;
const source = (capacity: typeof capacities[number], i: number) => ({
  id: capacityIds[i], capacity, version: 1, status: 'active',
  prescription: { status: 'active', currentVersion: 1 },
});
const booking = (id: string, date: string, startTime: string, endTime: string) => ({
  id, bookingDate: new Date(date + 'T00:00:00.000Z'),
  bookingCivilDate: new Date(date + 'T00:00:00.000Z'),
  contractId: 'tenant-a', alunoId: 'student-a',
  startTime, endTime, updatedAt: new Date(bindingVersion), status: 'scheduled',
});
function mockDb() {
  const aluno = { findFirst: jest.fn().mockResolvedValue({ id: 'student-a' }) };
  const consolidatedPrescription = { findFirst: jest.fn().mockResolvedValue({
    id: 'assembly', currentVersion: 3,
    versions: [{ id: 'assembly-version-3', capacityBlocks: capacityIds.map((id, i) => ({
      capacityPrescriptionVersionId: id, capacity: capacities[i], capacityVersion: 1,
    })) }],
  }) };
  const capacityPrescriptionVersion = { findMany: jest.fn().mockResolvedValue(capacityIds.map((_, i) => source(capacities[i], i))) };
  const agendaBooking = { findMany: jest.fn().mockResolvedValue([
    booking('booking-1', '2026-11-10', '08:00', '09:00'),
    booking('booking-2', '2026-11-11', '10:00', '11:00'),
  ]) };
  return { aluno, consolidatedPrescription, capacityPrescriptionVersion, agendaBooking };
}
const scope = { alunoId: 'student-a', contractId: 'tenant-a' };
const command = {
  expectedCurrentVersion: 3,
  windowStart: '2026-11-09T00:00:00.000Z',
  windowEnd: '2026-11-15T00:00:00.000Z',
  timeZone: 'UTC',
  bindings: [
    { bookingId: 'booking-1', capacityPrescriptionVersionId: 'resisted-v1', expectedBookingUpdatedAt: bindingVersion },
    { bookingId: 'booking-2', capacityPrescriptionVersionId: 'cyclic-v1', expectedBookingUpdatedAt: bindingVersion },
  ],
};
const create = (db: ReturnType<typeof mockDb>) => createCombinedFutureTemporalService(db as never);
describe('#403 future preview strict source binding', () => {
  it('A-539-003 pages 81 eligible bookings without exceeding 80 candidates per response', async () => {
    const rows = Array.from({ length: 81 }, (_, i) => booking(
      `booking-${String(i).padStart(3, '0')}`, '2026-11-10', '08:00', '09:00'
    ));
    const db = mockDb();
    db.agendaBooking.findMany.mockImplementation(async (query: { cursor?: { id: string } }) =>
      query.cursor ? [] : rows);
    const service = create(db);
    const first = await service.getCandidates(scope, command.windowStart, command.windowEnd, now);
    const second = await service.getCandidates(scope, command.windowStart, command.windowEnd, now, 2);
    const third = await service.getCandidates(scope, command.windowStart, command.windowEnd, now, 3);
    expect(first).toHaveLength(80);
    expect(first[0].bookingId).toBe('booking-000');
    expect(first[79].bookingId).toBe('booking-079');
    expect(second.map((item) => item.bookingId)).toEqual(['booking-080']);
    expect(third).toEqual([]);
    await expect(service.getCandidates(scope, command.windowStart, command.windowEnd, now, 101))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('A-539-004 removes definitely past appointments before the limit and scans later pages', async () => {
    const db = mockDb();
    const past = Array.from({ length: 81 }, (_, i) => booking(
      `past-${String(i).padStart(3, '0')}`, '2026-11-05', '08:00', '09:00'
    ));
    const future = booking('future', '2026-11-10', '10:00', '11:00');
    db.agendaBooking.findMany.mockImplementation(async (query: { cursor?: { id: string } }) =>
      query.cursor ? [future] : past);
    const candidates = await create(db).getCandidates(scope,
      '2026-11-06T12:00:00.000Z', '2026-11-15T00:00:00.000Z', now);
    expect(candidates.map((b) => b.bookingId)).toEqual(['future']);
    expect(db.agendaBooking.findMany).toHaveBeenCalledTimes(2);
    expect(db.agendaBooking.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: { id: 'past-080' }, skip: 1, take: 81,
    }));
  });

  it('A-539-004 retains uncertain edge/legacy bookings but excludes provably past civil starts', async () => {
    const db = mockDb();
    db.agendaBooking.findMany.mockResolvedValueOnce([
      booking('expired', '2026-11-05', '08:00', '09:00'),
      booking('possible-across-zones', '2026-11-05', '23:30', '23:45'),
      { ...booking('legacy', '2026-11-05', '08:00', '09:00'), bookingCivilDate: null },
      booking('today', '2026-11-06', '08:00', '09:00'),
      booking('after-window', '2026-11-17', '08:00', '09:00'),
    ]);
    const candidates = await create(db).getCandidates(scope,
      '2026-11-06T12:00:00.000Z', '2026-11-15T00:00:00.000Z', now);
    expect(candidates.map((b) => b.bookingId)).toEqual([
      'possible-across-zones', 'legacy', 'today',
    ]);
    expect(candidates.find((b) => b.bookingId === 'legacy')?.bookingDate).toBeNull();
  });

  it('rejects past-start and far-future windows before loading tenant or booking data', async () => {
    const db = mockDb();
    const service = create(db);
    const windows = [
      ['2027-11-10T00:00:00.000Z', '2027-11-11T00:00:00.000Z'],
      ['2026-11-06T11:54:59.999Z', command.windowEnd],
    ] as const;
    for (const [start, end] of windows) {
      await expect(service.getCandidates(scope, start, end, now)).rejects.toBeInstanceOf(FutureTemporalInputError);
      await expect(service.preview(scope, { ...command, windowStart: start, windowEnd: end }, now))
        .rejects.toBeInstanceOf(FutureTemporalInputError);
    }
    expect(db.aluno.findFirst).not.toHaveBeenCalled();
    expect(db.agendaBooking.findMany).not.toHaveBeenCalled();
  });
  it('uses only explicit scheduled bookings, exact assembly capacity IDs and UTC gaps after session end', async () => {
    const db = mockDb();
    const preview = await create(db).preview(scope, command, now);
    expect(preview).toMatchObject({
      protocolVersion: 'combined-conflict-v1', state: 'no_active_rules',
      assemblyVersionId: 'assembly-version-3', assemblyVersion: 3,
      coverage: 'partial', mayConcludeNoConflict: false,
      changesWorkoutAutomatically: false,
      timeZone: 'UTC', timeZoneBasis: 'explicit_preview_assumption',
      temporalEvidenceStatus: 'verified_bindings_only',
    });
    expect(preview.mappedSessions.map((item) => item.proof)).toEqual(['verified', 'verified']);
    expect(preview.gaps).toEqual([{
      previousBookingId: 'booking-1', nextBookingId: 'booking-2',
      hoursFromEndToStart: 25, overlapsInTime: false,
    }]);
    expect(preview.unlinkedCapacities).toEqual(['flexibility', 'balance']);
    expect(db.agendaBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['booking-1', 'booking-2'] }, contractId: 'tenant-a', alunoId: 'student-a' },
    }));
    expect((db as unknown as { agendaBooking: { update?: unknown } }).agendaBooking.update).toBeUndefined();
  });

  it('rejects another tenant before looking up bookings or prescriptions', async () => {
    const db = mockDb();
    db.aluno.findFirst.mockResolvedValue(null);
    await expect(create(db).preview(scope, command, now)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(db.agendaBooking.findMany).not.toHaveBeenCalled();
  });

  it('refuses a forged capacity ID or stale prescription version', async () => {
    const db = mockDb();
    await expect(create(db).preview(scope, { ...command, bindings: [
      { ...command.bindings[0], capacityPrescriptionVersionId: 'not-assembly-source' },
    ] }, now)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(db.agendaBooking.findMany).toHaveBeenCalledTimes(1);
    db.capacityPrescriptionVersion.findMany.mockResolvedValueOnce([
      { ...source('resisted', 0), prescription: { status: 'active', currentVersion: 2 } },
    ]);
    await expect(create(db).preview(scope, command, now)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects changed, canceled, wrong-account bookings and duplicate bindings', async () => {
    const db = mockDb();
    await expect(create(db).preview(scope, { ...command, bindings: [
      { ...command.bindings[0], expectedBookingUpdatedAt: '2026-11-06T12:00:00.000Z' },
    ] }, now)).rejects.toMatchObject({ code: 'CONFLICT' });
    db.agendaBooking.findMany.mockResolvedValueOnce([{
      ...booking('booking-1', '2026-11-10', '08:00', '09:00'), status: 'canceled',
    }]);
    await expect(create(db).preview(scope, { ...command, bindings: [command.bindings[0]] }, now)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(create(db).preview(scope, { ...command, bindings: [command.bindings[0], command.bindings[0]] }, now))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('uses the authoritative civil day even when the legacy host-local booking instant is different', async () => {
    const db = mockDb();
    db.agendaBooking.findMany.mockResolvedValueOnce([{
      ...booking('booking-1', '2026-11-10', '08:00', '09:00'),
      bookingDate: new Date('2026-11-10T03:00:00.000Z'), // server TZ=America/Sao_Paulo
    }]);
    const preview = await create(db).preview(scope, {
      ...command, timeZone: 'America/Sao_Paulo',
      bindings: [command.bindings[0]],
    }, now);
    expect(preview.mappedSessions[0]).toMatchObject({
      proof: 'verified', startAtUtc: '2026-11-10T11:00:00.000Z',
      endAtUtc: '2026-11-10T12:00:00.000Z',
    });
    expect(preview.coverage).toBe('partial');
    expect(preview.mayConcludeNoConflict).toBe(false);
  });

  it('keeps legacy bookings with no authoritative civil date unverified', async () => {
    const db = mockDb();
    const legacy = {
      ...booking('booking-1', '2026-11-10', '08:00', '09:00'),
      bookingDate: new Date('2026-11-10T03:00:00.000Z'),
      bookingCivilDate: null,
    };
    db.agendaBooking.findMany.mockResolvedValue([legacy]);
    const candidates = await create(db).getCandidates(scope, command.windowStart, command.windowEnd, now);
    expect(candidates[0].bookingDate).toBeNull();
    const preview = await create(db).preview(scope, {
      ...command, timeZone: 'America/Sao_Paulo', bindings: [command.bindings[0]],
    }, now);
    expect(preview.mappedSessions[0]).toMatchObject({
      proof: 'invalid_source_date', startAtUtc: null, endAtUtc: null,
    });
    expect(preview.temporalEvidenceStatus).toBe('insufficient_data');
    expect(preview.gaps).toEqual([]);
  });

  it('ignores no appointment automatically and never concludes temporal coverage complete', async () => {
    const db = mockDb();
    const preview = await create(db).preview(scope, { ...command, bindings: [] }, now);
    expect(preview.mappedSessions).toEqual([]);
    expect(preview.unlinkedCapacities).toEqual([...capacities]);
    expect(preview.temporalEvidenceStatus).toBe('insufficient_data');
    expect(preview.coverage).toBe('partial');
    expect(db.agendaBooking.findMany).not.toHaveBeenCalled();
  });

  it('does not convert unresolvable wall time into a valid session or risk clearance', async () => {
    const db = mockDb();
    db.agendaBooking.findMany.mockResolvedValueOnce([
      booking('booking-1', '2026-11-01', '01:30', '02:30'),
    ]);
    const preview = await create(db).preview(scope, {
      ...command, timeZone: 'America/New_York',
      windowStart: '2026-10-30T12:00:00.000Z',
      windowEnd: '2026-11-04T00:00:00.000Z',
      bindings: [command.bindings[0]],
    }, new Date('2026-10-30T12:00:00.000Z'));
    expect(preview.temporalEvidenceStatus).toBe('insufficient_data');
    expect(preview.mappedSessions[0]).toMatchObject({
      proof: 'ambiguous_local_time', startAtUtc: null, endAtUtc: null,
    });
    expect(preview.gaps).toEqual([]);
    expect(preview.mayConcludeNoConflict).toBe(false);
  });

  it('rejects deliberately conflicting booking tenant and a date outside the window', async () => {
    const db = mockDb();
    db.agendaBooking.findMany.mockResolvedValueOnce([{
      ...booking('booking-1', '2026-11-10', '08:00', '09:00'),
      contractId: 'other-tenant',
    }]);
    await expect(create(db).preview(scope, { ...command, bindings: [command.bindings[0]] }, now))
      .rejects.toMatchObject({ code: 'CONFLICT' });

    db.agendaBooking.findMany.mockResolvedValueOnce([
      booking('booking-1', '2026-12-02', '08:00', '09:00'),
    ]);
    await expect(create(db).preview(scope, { ...command, bindings: [command.bindings[0]] }, now))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects past session starts even if the booking is still scheduled', async () => {
    const db = mockDb();
    db.agendaBooking.findMany.mockResolvedValueOnce([
      booking('booking-1', '2026-11-05', '08:00', '09:00'),
    ]);
    await expect(create(db).preview(scope, {
      ...command, windowStart: '2026-11-06T11:59:00.000Z',
      bindings: [command.bindings[0]],
    }, now)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
