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
    `}

function isoDayOfWeek(value: Date): number {`,
    `}

function hasCapacityForInterval(
  startTime: string,
  endTime: string,
  capacity: number,
  intervals: Array<{ startTime: string; endTime: string }>
): boolean {
  const candidateStart = fixedScheduleTimeToMinutes(startTime);
  const candidateEnd = fixedScheduleTimeToMinutes(endTime);
  const events: Array<{ minute: number; delta: number }> = [];

  intervals.forEach((interval) => {
    const intervalStart = Math.max(candidateStart, fixedScheduleTimeToMinutes(interval.startTime));
    const intervalEnd = Math.min(candidateEnd, fixedScheduleTimeToMinutes(interval.endTime));
    if (intervalStart < intervalEnd) {
      events.push({ minute: intervalStart, delta: 1 });
      events.push({ minute: intervalEnd, delta: -1 });
    }
  });

  events.sort((left, right) => left.minute - right.minute || left.delta - right.delta);
  let occupancy = 0;
  for (const event of events) {
    occupancy += event.delta;
    if (occupancy >= capacity) return false;
  }
  return true;
}

function isIntervalFullyCovered(
  startTime: string,
  endTime: string,
  intervals: Array<{ startTime: string; endTime: string }>
): boolean {
  const targetStart = fixedScheduleTimeToMinutes(startTime);
  const targetEnd = fixedScheduleTimeToMinutes(endTime);
  let coveredUntil = targetStart;

  const ordered = intervals
    .map((interval) => ({
      start: fixedScheduleTimeToMinutes(interval.startTime),
      end: fixedScheduleTimeToMinutes(interval.endTime),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  for (const interval of ordered) {
    if (interval.end <= coveredUntil) continue;
    if (interval.start > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= targetEnd) return true;
  }
  return coveredUntil >= targetEnd;
}

function isoDayOfWeek(value: Date): number {`,
    'interval validation helpers'
  );
  content = replaceRequired(
    content,
    `  const occupancy = competingSpaceSlots.filter((item) =>
    fixedScheduleOverlaps(slot.startTime, slot.endTime, item.startTime, item.endTime)
  ).length;
  if (occupancy >= space.capacity) {`,
    `  if (
    !hasCapacityForInterval(
      slot.startTime,
      slot.endTime,
      space.capacity,
      competingSpaceSlots
    )
  ) {`,
    'maximum concurrent space occupancy'
  );
  content = replaceRequired(
    content,
    `  const covered = availability.some(
    (item) =>
      fixedScheduleTimeToMinutes(item.startTime) <= fixedScheduleTimeToMinutes(slot.startTime) &&
      fixedScheduleTimeToMinutes(item.endTime) >= fixedScheduleTimeToMinutes(slot.endTime)
  );
  if (!covered) {`,
    `  if (!isIntervalFullyCovered(slot.startTime, slot.endTime, availability)) {`,
    'continuous professor availability coverage'
  );
  content = replaceRequired(
    content,
    `) {
  const aluno = await loadStudent(tx, contractId, alunoId);
  const existing = await loadStudentSlots(tx, contractId, alunoId);

  if (schedulePlan === 'free') {`,
    `) {
  if (schedulePlan === 'free') {
    await acquireScheduleLocks(tx, contractId, alunoId, []);
    const aluno = await loadStudent(tx, contractId, alunoId);
    const existing = await loadStudentSlots(tx, contractId, alunoId);`,
    'student lock before free schedule snapshot'
  );
  content = replaceRequired(
    content,
    `  await acquireScheduleLocks(tx, contractId, alunoId, slots);
  const results = await checkFixedScheduleAvailability(tx, contractId, alunoId, slots);`,
    `  await acquireScheduleLocks(tx, contractId, alunoId, slots);
  const existing = await loadStudentSlots(tx, contractId, alunoId);
  const results = await checkFixedScheduleAvailability(tx, contractId, alunoId, slots);`,
    'student lock before fixed schedule snapshot'
  );
  write(file, content);
}

{
  const file = 'apps/api/tests/fixed-schedule.service.test.ts';
  let content = read(file);
  content = replaceRequired(
    content,
    `  it('requires explicit confirmation before changing fixed to free with future bookings', async () => {`,
    `  it('uses maximum concurrent occupancy instead of counting disjoint overlaps', async () => {
    const db = databaseMock();
    db.trainingSpace.findFirst.mockResolvedValue({ id: 'space-1', capacity: 2, isActive: true });
    db.fixedScheduleSlot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { startTime: '08:00', endTime: '08:30' },
        { startTime: '08:30', endTime: '09:00' },
      ]);

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result).toMatchObject({ available: true, code: 'AVAILABLE' });
  });

  it('accepts contiguous availability blocks that cover the complete interval', async () => {
    const db = databaseMock();
    db.professorAvailability.findMany.mockResolvedValue([
      { startTime: '08:00', endTime: '08:30' },
      { startTime: '08:30', endTime: '09:00' },
    ]);

    const [result] = await checkFixedScheduleAvailability(
      db as never,
      'contract-1',
      'aluno-1',
      [slot()]
    );

    expect(result).toMatchObject({ available: true, code: 'AVAILABLE' });
  });

  it('requires explicit confirmation before changing fixed to free with future bookings', async () => {`,
    'interval regression tests'
  );
  write(file, content);
}

console.log('Issue 265 interval and locking corrections applied successfully.');
