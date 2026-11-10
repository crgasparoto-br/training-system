import { ExerciseCurationStatus } from '@prisma/client';
import { PHYSICAL_CAPACITY_TYPES } from '@corrida/types';

/** A legacy approval is historical, never a new operational authorization. */
export const approvedOperationalExerciseWhere = {
  curationStatus: ExerciseCurationStatus.approved,
  legacyGrandfathered: false,
} as const;

export type CurationAction = 'submit' | 'approve' | 'request_changes' | 'deactivate' | 'reopen';

export class LibraryCurationError extends Error {
  constructor(
    readonly kind: 'not_found' | 'conflict' | 'invalid' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'LibraryCurationError';
  }
}

/** Transitions are explicit, fail-closed and never apply or change a workout. */
export function nextExerciseStatus(
  status: ExerciseCurationStatus,
  action: CurationAction,
): ExerciseCurationStatus {
  const transitions: Record<CurationAction, Partial<Record<ExerciseCurationStatus, ExerciseCurationStatus>>> = {
    submit: { draft: 'in_review' },
    approve: { in_review: 'approved' },
    request_changes: { in_review: 'draft' },
    deactivate: { draft: 'inactive', in_review: 'inactive', approved: 'inactive' },
    reopen: { inactive: 'draft' },
  };
  const next = transitions[action][status];
  if (!next) {
    throw new LibraryCurationError('conflict', 'Ação incompatível com a situação atual do exercício.');
  }
  return next;
}

export function assertExerciseCanBeApproved(exercise: {
  name: string;
  category: string | null;
  capacity: string | null;
  instructions: string[];
  videoUrl: string | null;
  mediaOrigin: string | null;
  mediaLicense: string | null;
}) {
  if (!exercise.name.trim() || !exercise.category?.trim() ||
      !PHYSICAL_CAPACITY_TYPES.some((capacity) => capacity === exercise.capacity) || exercise.instructions.length === 0) {
    throw new LibraryCurationError(
      'invalid',
      'Informe nome, categoria, capacidade canônica e instruções antes de aprovar.',
    );
  }
  if (exercise.videoUrl?.trim() &&
      (!exercise.mediaOrigin?.trim() || !exercise.mediaLicense?.trim())) {
    throw new LibraryCurationError(
      'invalid',
      'A mídia exige origem e licença verificáveis antes da aprovação.',
    );
  }
}
