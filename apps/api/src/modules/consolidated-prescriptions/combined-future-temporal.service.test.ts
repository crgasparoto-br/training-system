import { createCombinedFutureTemporalService } from './combined-future-temporal.service.js';

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
      windowStart: '2026-10-30T00:00:00.000Z',
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
      ...command, windowStart: '2026-11-01T00:00:00.000Z',
      bindings: [command.bindings[0]],
    }, now)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
