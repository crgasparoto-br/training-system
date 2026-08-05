import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [capacityWarningConfirmed, setCapacityWarningConfirmed] = useState(false);
  const workspaceGenerationRef = useRef(0);
  const referencesGenerationRef = useRef(0);

  const resetMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const clearWorkspaceState = useCallback(() => {
    setAssessments([]);
    setCurrent(null);
    setProtocols([]);
    setSupport(null);
    setForm(createEmptyAdipometryForm());
    setPreview(null);
    setFieldErrors({});
    setDirty(false);
    setConflict(false);
    setSupportError(null);
    setCapacityWarningConfirmed(false);
  }, []);

  const invalidateWorkspace = useCallback(() => {
    workspaceGenerationRef.current += 1;
    referencesGenerationRef.current += 1;
    setReferencesLoading(false);
    clearWorkspaceState();
  }, [clearWorkspaceState]);

  const selectAluno = useCallback((alunoId: string) => {
    invalidateWorkspace();
    resetMessages();
    setSelectedAlunoId(alunoId);
  }, [invalidateWorkspace, resetMessages]);

  const refreshReferences = useCallback(async (
    alunoId: string,
    assessmentDate: string,
    anthropometryAssessmentId?: string,
    expectedWorkspaceGeneration = workspaceGenerationRef.current
  ) => {
    const referencesGeneration = ++referencesGenerationRef.current;
    setProtocols([]);
    setSupport(null);
    setSupportError(null);

    if (!assessmentDate) {
      setReferencesLoading(false);
      return;
    }

    setReferencesLoading(true);
    const [protocolResult, supportResult] = await Promise.allSettled([
      adipometryService.listProtocols(alunoId, assessmentDate),
      adipometryService.getAnthropometrySupport(
        alunoId,
        assessmentDate,
        anthropometryAssessmentId || undefined
      ),
    ]);

    const isCurrent =
      expectedWorkspaceGeneration === workspaceGenerationRef.current
      && referencesGeneration === referencesGenerationRef.current;
    if (!isCurrent) return;

    if (protocolResult.status === 'fulfilled') {
      setProtocols(protocolResult.value);
    } else {
      setProtocols([]);
      setError(readAdipometryApiError(protocolResult.reason).message);
    }

    if (supportResult.status === 'fulfilled') {
      setSupport(supportResult.value);
    } else {
      setSupport(null);
      setSupportError(readAdipometryApiError(supportResult.reason).message);
    }
    setReferencesLoading(false);
  }, []);

  const setFormField = <K extends keyof AdipometryFormState>(
    field: K,
    value: AdipometryFormState[K]
  ) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setPreview(null);
    setDirty(true);
    setConflict(false);
    if (field === 'assessmentDate' && selectedAlunoId && typeof value === 'string') {
      void refreshReferences(
        selectedAlunoId,
        value,
        form.anthropometryAssessmentId,
        workspaceGenerationRef.current
      );
    }
  };

  const setMeasurement = (field: AdipometryInputField, value: string) => {
    setForm((previous) => ({
      ...previous,
      measurements: { ...previous.measurements, [field]: value },
    }));
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
    if (!canView) {
      invalidateWorkspace();
      setLoading(false);
      return;
    }

    const workspaceGeneration = ++workspaceGenerationRef.current;
    referencesGenerationRef.current += 1;
    let cancelled = false;
    const isCurrent = () =>
      !cancelled && workspaceGeneration === workspaceGenerationRef.current;

    async function loadWorkspace() {
      setLoading(true);
      setReferencesLoading(false);
      resetMessages();
      clearWorkspaceState();
      try {
        let alunoId = selectedAlunoId;
        let explicit: AdipometryAssessmentDetail | null = null;
        if (assessmentIdParam) {
          explicit = await adipometryService.getAssessment(assessmentIdParam);
          if (!isCurrent()) return;
          if (lockedAlunoId && explicit.alunoId !== lockedAlunoId) {
            throw new Error('A avaliação informada não pertence ao aluno preservado pela Central.');
          }
          if (alunoId && explicit.alunoId !== alunoId) {
            throw new Error('A avaliação informada não pertence ao aluno selecionado.');
          }
          alunoId = explicit.alunoId;
          if (!selectedAlunoId) setSelectedAlunoId(alunoId);
        }

        if (!alunoId) return;

        const history = await adipometryService.listAssessments(alunoId);
        if (!isCurrent()) return;
        let detail = explicit;
        if (!detail) {
          const target = history.find(
            (item) => item.status === 'DRAFT' && item.revisionStatus === 'DRAFT'
          ) ?? history[0];
          detail = target ? await adipometryService.getAssessment(target.id) : null;
        }
        if (!isCurrent()) return;

        setAssessments(history);
        setCurrent(detail);
        setPreview(null);
        setConflict(false);
        setFieldErrors({});
        setCapacityWarningConfirmed(false);
        const nextForm = detail
          ? adipometryFormFromAssessment(detail)
          : createEmptyAdipometryForm();
        setForm(nextForm);
        setDirty(false);
        await refreshReferences(
          alunoId,
          nextForm.assessmentDate,
          nextForm.anthropometryAssessmentId,
          workspaceGeneration
        );
      } catch (loadError) {
        if (isCurrent()) {
          clearWorkspaceState();
          setError(readAdipometryApiError(loadError).message);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => { cancelled = true; };
  }, [
    assessmentIdParam,
    canView,
    clearWorkspaceState,
    invalidateWorkspace,
    lockedAlunoId,
    refreshReferences,
    refreshToken,
    resetMessages,
    selectedAlunoId,
  ]);

  return {
    alunos,
    selectedAlunoId,
    selectAluno,
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
    referencesLoading,
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
    invalidateWorkspace,
    setFormField,
    setMeasurement,
  };
}
