import { useCallback, useEffect, useMemo, useState } from 'react';
import { anthropometryService } from '../services/anthropometry.service';
import type { AnthropometryAssessment, AnthropometryObservation, AnthropometrySegment } from '../types/anthropometry';

export function useAnthropometry(alunoId?: string, alunoSex?: 'male' | 'female' | 'other') {
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

  const currentAssessment = assessments[0] ?? null;

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
      setSelectedAssessmentId((current) => current || assessmentData[0]?.id || '');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao carregar antropometria.');
    } finally {
      setLoading(false);
    }
  }, [alunoId, alunoSex]);

  useEffect(() => {
    void load();
  }, [load]);

  const createNewAssessment = async (professorId?: string | null) => {
    if (!alunoId) return null;
    setSaving(true);
    setError(null);
    try {
      const created = await anthropometryService.createAssessment(alunoId, {
        assessmentDate: new Date().toISOString().slice(0, 10),
        professorId,
        copyPrevious: true,
      });
      const next = await anthropometryService.listAssessments(alunoId);
      setAssessments(next);
      setSelectedAssessmentId(created.id);
      return created;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao criar avaliação antropométrica.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateHeader = async (assessmentId: string, data: { assessmentDate?: string; professorId?: string | null; notes?: string | null }) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await anthropometryService.updateAssessment(assessmentId, data);
      setAssessments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao atualizar avaliação.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveValues = async (
    assessmentId: string,
    values: Array<{ segmentId: string; value?: string | null; unit: string; observation?: string | null }>
  ) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await anthropometryService.saveValues(assessmentId, values);
      setAssessments((current) => current.map((item) => (item.id === updated?.id ? updated : item)));
      return updated;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao salvar medidas.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveObservations = async (
    assessmentId: string,
    observations: Array<Pick<AnthropometryObservation, 'segmentId' | 'text' | 'importable'>>
  ) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await anthropometryService.saveObservations(assessmentId, observations);
      setAssessments((current) => current.map((item) => (item.id === updated?.id ? updated : item)));
      return updated;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao salvar observações.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    assessments,
    currentAssessment,
    error,
    loading,
    saving,
    segments,
    selectedAssessment,
    selectedAssessmentId,
    createNewAssessment,
    load,
    saveObservations,
    saveValues,
    setSelectedAssessmentId,
    updateHeader,
  };
}
