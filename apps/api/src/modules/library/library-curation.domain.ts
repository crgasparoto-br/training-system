import type { ExerciseCurationStatus } from '@prisma/client';
import { PHYSICAL_CAPACITY_TYPES } from '@corrida/types';

/** A legacy approval is historical, never a new operational authorization. */
export const approvedOperationalExerciseWhere = {
  curationStatus: 'approved',
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

/** Declared own media requires no additional license. */
export function hasAuthorizedExerciseMedia(origin: unknown, license: unknown): boolean {
  if (typeof origin !== 'string' || !origin.trim()) return false;
  return origin === 'Própria' ||
    (typeof license === 'string' && Boolean(license.trim()));
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
  const missing: string[] = [];
  if (!exercise.name.trim()) missing.push('Nome do exercício');
  if (!exercise.category?.trim()) missing.push('Categoria');
  if (!PHYSICAL_CAPACITY_TYPES.some((capacity) => capacity === exercise.capacity)) {
    missing.push('Capacidade física');
  }
  if (exercise.instructions.length === 0) missing.push('Instruções em etapas');
  if (exercise.videoUrl?.trim()) {
    if (!exercise.mediaOrigin?.trim()) missing.push('Origem da mídia');
    if (exercise.mediaOrigin !== 'Própria' && !exercise.mediaLicense?.trim()) {
      missing.push('Licença ou autorização de uso da mídia');
    }
  }
  if (missing.length) {
    throw new LibraryCurationError(
      'invalid',
      `Preencha ou regularize os seguintes campos antes de aprovar: ${missing.join('; ')}.`,
    );
  }
}

/** Collapse explicitly linked versions only; never infer lineage from names. */
export function selectCatalogIdentityRows<T extends {
  id?: string;
  versionRootId?: string | null;
  supersededAt?: Date | null;
  curationStatus?: ExerciseCurationStatus;
  legacyGrandfathered?: boolean;
  contentVersion?: number;
}>(rows: T[], preferCandidate: boolean): T[] {
  const rank = (row: T) => {
    if (row.curationStatus === 'draft' || row.curationStatus === 'in_review') return preferCandidate ? 4 : 3;
    if (row.curationStatus === 'approved' && !row.legacyGrandfathered) return preferCandidate ? 3 : 4;
    return row.curationStatus === 'approved' ? 2 : 1;
  };
  const selected = new Map<string | symbol, T>();
  for (const row of rows) {
    if (row.supersededAt) continue;
    const key = row.versionRootId ?? row.id ?? Symbol();
    const previous = selected.get(key);
    if (!previous || rank(row) > rank(previous) ||
      (rank(row) === rank(previous) && (row.contentVersion ?? 1) > (previous.contentVersion ?? 1))) selected.set(key, row);
  }
  return [...selected.values()];
}
