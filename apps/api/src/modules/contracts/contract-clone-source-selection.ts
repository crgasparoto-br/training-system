export interface CloneSourceCandidate {
  id: string;
  createdAt: Date;
  parameters: number;
  exercises: number;
  assessmentTypes: number;
}

const coveredCategories = (candidate: CloneSourceCandidate) =>
  Number(candidate.parameters > 0) +
  Number(candidate.exercises > 0) +
  Number(candidate.assessmentTypes > 0);

const totalRecords = (candidate: CloneSourceCandidate) =>
  candidate.parameters + candidate.exercises + candidate.assessmentTypes;

export function selectBestCloneSourceCandidate(
  candidates: CloneSourceCandidate[]
): CloneSourceCandidate | null {
  const eligible = candidates.filter((candidate) => totalRecords(candidate) > 0);

  eligible.sort((left, right) => {
    const exercisePriority = Number(right.exercises > 0) - Number(left.exercises > 0);
    if (exercisePriority !== 0) return exercisePriority;

    const coveragePriority = coveredCategories(right) - coveredCategories(left);
    if (coveragePriority !== 0) return coveragePriority;

    const totalPriority = totalRecords(right) - totalRecords(left);
    if (totalPriority !== 0) return totalPriority;

    const chronologicalPriority = left.createdAt.getTime() - right.createdAt.getTime();
    if (chronologicalPriority !== 0) return chronologicalPriority;

    return left.id.localeCompare(right.id);
  });

  return eligible[0] ?? null;
}

export function selectCloneSourceCandidate(
  candidates: CloneSourceCandidate[],
  preferredId?: string | null
): CloneSourceCandidate | null {
  const eligible = candidates.filter((candidate) => totalRecords(candidate) > 0);

  if (preferredId) {
    const preferred = eligible.find((candidate) => candidate.id === preferredId);
    if (preferred) return preferred;
  }

  return selectBestCloneSourceCandidate(eligible);
}
