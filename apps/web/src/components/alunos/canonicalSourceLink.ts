import type { StudentTimelineEvent } from '../../services/aluno.service';

export function canonicalSourceLink(item: StudentTimelineEvent, alunoId: string): string | null {
  const meta = item.metadata ?? {};
  const params = new URLSearchParams({ alunoId });
  const prntPath = '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento';
  const source = item.sourceType;
  if (source === 'prontuario-history-event') {
    // A version is identified by the canonical record, entity and version,
    // not by the synthetic timeline ID or the current PRNT state.
    if (typeof meta.recordId !== 'string' || typeof meta.entityType !== 'string'
      || typeof meta.entityId !== 'string' || typeof meta.version !== 'number') return null;
    params.set('recordId', meta.recordId);
    params.set('entityType', meta.entityType);
    params.set('entityId', meta.entityId);
    params.set('version', String(meta.version));
    return `${prntPath}?${params.toString()}`;
  }
  if (source === 'student-health-intake-revision') {
    if (typeof meta.revision !== 'number') return null;
    params.set('intakeRevision', String(meta.revision));
    return `${prntPath}?${params.toString()}`;
  }
  if (source === 'student-parq-submission') {
    if (!item.sourceId) return null;
    params.set('parqSubmissionId', item.sourceId);
    return `${prntPath}?${params.toString()}`;
  }
  if (source === 'anthropometry-assessment' || source === 'anthropometry-correction') {
    const assessmentId = typeof meta.assessmentId === 'string' ? meta.assessmentId
      : source === 'anthropometry-assessment' ? item.sourceId : null;
    if (!assessmentId) return null;
    params.set('assessmentId', assessmentId);
    if (source === 'anthropometry-correction' && typeof meta.correctionId === 'string') {
      params.set('correctionId', meta.correctionId);
    }
    return `/protocolo-avaliacao-fisica/antropometria?${params.toString()}`;
  }
  if (source === 'adipometry-assessment') {
    if (!item.sourceId) return null;
    params.set('assessmentId', item.sourceId);
    return `/protocolo-avaliacao-fisica/adipometria?${params.toString()}`;
  }
  return null;
}
