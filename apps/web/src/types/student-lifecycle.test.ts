import { describe, expect, it } from 'vitest';
import { STUDENT_LIFECYCLE_STATUSES } from '@corrida/types';
import {
  STUDENT_LIFECYCLE_STATUS_LABELS,
  getStudentLifecycleStatusOptions,
} from './student-lifecycle';

describe('student lifecycle frontend contract', () => {
  it('uses every shared status without duplicating the lifecycle enum', () => {
    expect(Object.keys(STUDENT_LIFECYCLE_STATUS_LABELS)).toEqual(
      expect.arrayContaining([...STUDENT_LIFECYCLE_STATUSES])
    );
    expect(getStudentLifecycleStatusOptions()).toHaveLength(
      STUDENT_LIFECYCLE_STATUSES.length
    );
  });
});
