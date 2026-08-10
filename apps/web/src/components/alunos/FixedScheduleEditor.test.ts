import { describe, expect, it } from 'vitest';
import type { FixedScheduleErrorCode } from '../../services/agenda.service';
import { serializeFixedScheduleSlots, type FixedScheduleSlotDraft } from './FixedScheduleEditor';

describe('serializeFixedScheduleSlots', () => {
  const row = (available: boolean | null): FixedScheduleSlotDraft => ({
    id: 'slot-1',
    clientKey: 'slot-1',
    professorId: 'professor-1',
    spaceId: 'space-1',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:00',
    availability:
      available === null
        ? null
        : {
            rowIndex: 0,
            clientKey: 'slot-1',
            available,
            code: available ? 'AVAILABLE' : 'SPACE_CAPACITY_FULL',
            message: available ? 'Disponível' : 'Sem vaga',
            stage: 'space',
          },
  });

  it('marks only a positively checked unchanged row as confirmed', () => {
    expect(serializeFixedScheduleSlots([row(true)])[0].availabilityConfirmed).toBe(true);
    expect(serializeFixedScheduleSlots([row(false)])[0].availabilityConfirmed).toBe(false);
    expect(serializeFixedScheduleSlots([row(null)])[0].availabilityConfirmed).toBe(false);
  });

  it('accepts the identity error codes returned by the fixed schedule backend', () => {
    const identityErrorCodes: FixedScheduleErrorCode[] = [
      'FIXED_SLOT_INACTIVE',
      'FIXED_SLOT_ID_DUPLICATE',
    ];

    expect(identityErrorCodes).toEqual([
      'FIXED_SLOT_INACTIVE',
      'FIXED_SLOT_ID_DUPLICATE',
    ]);
  });
});