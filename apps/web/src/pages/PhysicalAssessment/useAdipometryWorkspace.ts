import { useCallback, useEffect, useState } from 'react';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryCalculationPreview,
  AdipometryInputField,
  AdipometryProtocolSummary,
} from '@corrida/types';
import { alunoService, type Aluno } from '../../services/aluno.service';
import {
  adipometryService,
  type AdipometryAnthropometrySupport,
} from '../../services/adipometry.service';
import {
  createEmptyAdipometryForm,
  type AdipometryFormState,
} from './adipometry-ui';
import { adipometryFormFromAssessment, readAdipometryApiError } from './adipometry-screen-utils';

export function useAdipometryWorkspace({
  canView,
  lockedAlunoId,
  assessmentIdParam,
}: {
  canView: boolean;
  lockedAlunoId: string;
  assessmentIdParam: string;
}) {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState(lockedAlunoId);
  const [assessments, setAssessments] = useState<AdipometryAssessmentSummary[]>([]);
  const [current, setCurrent] = useState<AdipometryAssessmentDetail | null>(null);
  const [protocols, setProtocols] = useState<AdipometryProtocolSummary[]>([]);
  const [support, setSupport] = useState<AdipometryAnthropometrySupport | null>(null);
  const [form, setForm] = useState<AdipometryFormState>(createEmptyAdipometryForm);
  const [preview, setPreview] = useState<AdipometryCalculationPreview | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AdipometryInputField, string>>>({});
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [capacityWarningConfirmed, setCapacityWarningConfirmed] = useState(false);

  const resetMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const refreshReferences = useCallback(async (
    alunoId: string,
    assessmentDate: string,
    anthropometryAssessmentId?: string
  ) => {
    if (!assessmentDate) return;
    setSupportError(null);
    const [protocolResult, supportResult] = await Promise.allSettled([
      adipometryService.listProtocols(alunoId, assessmentDate),
      adipometryService.getAnthropometrySupport(alunoId, assessmentDate, anthropometryAssessmentId || undefined),
    ]);
    if (protocolResult.status === 'fulfilled') setProtocols(protocolResult.value);
    else setError(readAdipometryApiError(protocolResult.reason).message);
    if (supportResult.status === 'fulfilled') setSupport(supportResult.value);
    else {
      setSupport(null);
      setSupportError(readAdipometryApiError(supportResult.reason).message);
    }
  }, []);

  const setFormField = <K extends keyof AdipometryFormState>(field: K, value: AdipometryFormState[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setPreview(null);
    setDirty(true);
    setConflict(false);
    if (field === 'assessmentDate' && selectedAlunoId && typeof value === 'string') {
      void refreshReferences(selectedAlunoId, value, form.anthropometryAssessmentId);
    }
  };

  const setMeasurement = (field: AdipometryInputField, value: string) => {
    setForm((previous) => ({ ...previous, measurements: { ...previous.measurements, [field]: value } }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setPreview(null);
    setDirty(true);
    setConflict(false);
  };

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void alunoService.list(1, 200, undefined, 'active')
      .then((response) => {
        if (!cancelled) setAlunos(response.alunos);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(readAdipometryApiError(loadError).message);
      });
    return () => { cancelled = true; };
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      resetMessages();
      setSupportError(null);
      try {
        let alunoId = selectedAlunoId;
        let explicit: AdipometryAssessmentDetail | null = null;
        if (assessmentIdParam) {
          explicit = await adipometryService.getAssessment(assessmentIdParam);
          if (lockedAlunoId && explicit.alunoId !== lockedAlunoId) {
            throw new Error('A avaliação informada não pertence ao aluno preservado pela Central.');
          }
          if (alunoId && explicit.alunoId !== alunoId) {
            throw new Error('A avaliação informada não pertence ao aluno selecionado.');
          }
          alunoId = explicit.alunoId;
          if (!selectedAlunoId && !cancelled) setSelectedAlunoId(alunoId);
        }

        if (!alunoId) {
          if (!cancelled) {
            setAssessments([]);
            setCurrent(null);
            setProtocols([]);
            setSupport(null);
            setPreview(null);
            setForm(createEmptyAdipometryForm());
          }
          return;
        }

        const history = await adipometryService.listAssessments(alunoId);
        let detail = explicit;
        if (!detail) {
          const target = history.find((item) => item.status === 'DRAFT' && item.revisionStatus === 'DRAFT') ?? history[0];
          detail = target ? await adipometryService.getAssessment(target.id) : null;
        }
        if (cancelled) return;
        setAssessments(history);
        setCurrent(detail);
        setPreview(null);
        setConflict(false);
        setFieldErrors({});
        setCapacityWarningConfirmed(false);
        const nextForm = detail ? adipometryFormFromAssessment(detail) : createEmptyAdipometryForm();
        setForm(nextForm);
        setDirty(false);
        await refreshReferences(alunoId, nextForm.assessmentDate, nextForm.anthropometryAssessmentId);
      } catch (loadError) {
        if (!cancelled) setError(readAdipometryApiError(loadError).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => { cancelled = true; };
  }, [assessmentIdParam, canView, lockedAlunoId, refreshReferences, refreshToken, resetMessages, selectedAlunoId]);

  return {
    alunos,
    selectedAlunoId,
    setSelectedAlunoId,
    assessments,
    current,
    setCurrent,
    protocols,
    support,
    form,
    setForm,
    preview,
    setPreview,
    fieldErrors,
    setFieldErrors,
    loading,
    setLoading,
    dirty,
    setDirty,
    conflict,
    setConflict,
    error,
    setError,
    success,
    setSuccess,
    supportError,
    setRefreshToken,
    capacityWarningConfirmed,
    setCapacityWarningConfirmed,
    resetMessages,
    setFormField,
    setMeasurement,
  };
}
