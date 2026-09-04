import { useCallback, useEffect, useMemo, useState } from 'react';
import { anthropometryService } from '../services/anthropometry.service';
import type {
  AnthropometryAssessment,
  AnthropometryCorrectionPayload,
  AnthropometryObservation,
  AnthropometrySegment,
} from '../types/anthropometry';

export function useAnthropometry(
  alunoId?: string,
  alunoSex?: 'male' | 'female' | 'other'
) {
  const requestedAssessmentId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('assessmentId') ?? '';
  }, []);
  const [segments, setSegments] = useState<AnthropometrySegment[]>([]);
  const [assessments, setAssessments] = useState<AnthropometryAssessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => assessment.id === selectedAssessmentId) ?? assessments[0] ?? null,
    [assessments, selectedAssessmentId]
  );

  const currentAssessment = useMemo(
    () => assessments.find((assessment) => assessment.status === 'DRAFT') ?? assessments[0] ?? null,
    [assessments]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [segmentData, assessmentData] = await Promise.all([
        anthropometryService.listActiveSegments(alunoSex),
        alunoId ? anthropometryService.listAssessments(alunoId) : Promise.resolve([]),
      ]);
      setSegments(segmentData);
      setAssessments(assessmentData);
      setSelectedAssessmentId((current) => {
        if (current && assessmentData.some((item) => item.id === current)) return current;
        if (requestedAssessmentId && assessmentData.some((item) => item.id === requestedAssessmentId)) {
          return requestedAssessmentId;
        }
        const draft = assessmentData.find((item) => item.status === 'DRAFT');
        return draft?.id || assessmentData[0]?.id || '';
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao carregar antropometria.');
    } finally {
      setLoading(false);
    }
  }, [alunoId, alunoSex, requestedAssessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceAssessment = (assessment: AnthropometryAssessment) => {
    setAssessments((current) => {
      const exists = current.some((item) => item.id === assessment.id);
      const next = exists
        ? current.map((item) => (item.id === assessment.id ? assessment : item))
        : [assessment, ...current];
      return [...next].sort((a, b) => {
        const dateDelta = new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime();
        return dateDelta || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });
    setSelectedAssessmentId(assessment.id);
  };

  const withSaving = async <T,>(action: () => Promise<T>, fallback: string): Promise<T | null> => {
    setSaving(true);
    setError(null);
    try {
      return await action();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || fallback);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createNewAssessment = async (professorId?: string | null) => {
    if (!alunoId) return null;
    return withSaving(async () => {
      const created = await anthropometryService.createAssessment(alunoId, {
        assessmentDate: new Date().toISOString().slice(0, 10),
        professorId,
        copyPrevious: true,
      });
      const next = await anthropometryService.listAssessments(alunoId);
      setAssessments(next);
      setSelectedAssessmentId(created.id);
      return next.find((item) => item.id === created.id) ?? created;
    }, 'Erro ao criar avaliação antropométrica.');
  };

  const updateHeader = async (
    assessmentId: string,
    data: { assessmentDate?: string; professorId?: string | null; notes?: string | null }
  ) => withSaving(async () => {
    const updated = await anthropometryService.updateAssessment(assessmentId, data);
    replaceAssessment(updated);
    return updated;
  }, 'Erro ao atualizar avaliação.');

  const saveValues = async (
    assessmentId: string,
    values: Array<{ segmentId: string; value?: string | null; unit: string; observation?: string | null }>
  ) => withSaving(async () => {
    const updated = await anthropometryService.saveValues(assessmentId, values);
    replaceAssessment(updated);
    return updated;
  }, 'Erro ao salvar medidas.');

  const saveObservations = async (
    assessmentId: string,
    observations: Array<Pick<AnthropometryObservation, 'segmentId' | 'text' | 'importable'>>
  ) => withSaving(async () => {
    const updated = await anthropometryService.saveObservations(assessmentId, observations);
    replaceAssessment(updated);
    return updated;
  }, 'Erro ao salvar observações.');

  const completeAssessment = async (assessmentId: string) => withSaving(async () => {
    const updated = await anthropometryService.completeAssessment(assessmentId);
    replaceAssessment(updated);
    if (alunoId) setAssessments(await anthropometryService.listAssessments(alunoId));
    return updated;
  }, 'Erro ao concluir avaliação antropométrica.');

  const correctAssessment = async (assessmentId: string, data: AnthropometryCorrectionPayload) => withSaving(async () => {
    const updated = await anthropometryService.correctAssessment(assessmentId, data);
    replaceAssessment(updated);
    if (alunoId) setAssessments(await anthropometryService.listAssessments(alunoId));
    return updated;
  }, 'Erro ao registrar correção antropométrica.');

  return {
    assessments,
    currentAssessment,
    error,
    loading,
    saving,
    segments,
    selectedAssessment,
    selectedAssessmentId,
    completeAssessment,
    correctAssessment,
    createNewAssessment,
    load,
    saveObservations,
    saveValues,
    setSelectedAssessmentId,
    updateHeader,
  };
}
