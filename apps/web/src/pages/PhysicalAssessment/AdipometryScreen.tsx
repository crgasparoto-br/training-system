import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  AdipometryAssessmentDetail,
  AdipometryCorrectionCategory,
  AdipometryResponsibleProfessor,
} from '@corrida/types';
import { canAccessBlock } from '../../access/access-control';
import { canMutateAdipometryAssessment } from '../../access/adipometry-mutation-access';
import { Button } from '../../components/ui/Button';
import { adipometryService } from '../../services/adipometry.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { AdipometryScreenOverlays } from './AdipometryScreenOverlays';
import { AdipometryView } from './AdipometryView';
import {
  adipometryProtocolKey,
  type AdipometryFormState,
  type AdipometrySkinfoldHelp,
} from './adipometry-ui';
import {
  adipometryFormFromAssessment,
  buildAdipometryDraftPayload,
  readAdipometryApiError,
} from './adipometry-screen-utils';
import { useAdipometryWorkspace } from './useAdipometryWorkspace';

export function AdipometryScreen() {
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const lockedAlunoId = useRef(searchParams.get('alunoId') ?? '').current;
  const assessmentIdParam = searchParams.get('assessmentId') ?? '';

  const canView = canAccessBlock(user, 'physicalAssessment.adpt.view');
  const workspace = useAdipometryWorkspace({ canView, lockedAlunoId, assessmentIdParam });
  const {
    alunos, selectedAlunoId, selectAluno, assessments, current, setCurrent, protocols, support,
    form, setForm, preview, setPreview, fieldErrors, setFieldErrors, loading, referencesLoading,
    setLoading, dirty, setDirty, conflict, setConflict, error, setError, success, setSuccess,
    supportError, setRefreshToken, capacityWarningConfirmed, setCapacityWarningConfirmed,
    resetMessages, invalidateWorkspace, setFormField, setMeasurement,
  } = workspace;
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<AdipometrySkinfoldHelp | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showCancelCorrection, setShowCancelCorrection] = useState(false);
  const [correctionCategory, setCorrectionCategory] = useState<AdipometryCorrectionCategory>('DATA_ENTRY_ERROR');
  const [correctionReason, setCorrectionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [responsibleProfessors, setResponsibleProfessors] = useState<AdipometryResponsibleProfessor[]>([]);
  const [responsibleDirectoryReady, setResponsibleDirectoryReady] = useState(false);
  const [selectedResponsibleProfessorId, setSelectedResponsibleProfessorId] = useState('');
  const canManage = canAccessBlock(user, 'physicalAssessment.adpt.actions.manage');
  const canCorrect = canAccessBlock(user, 'physicalAssessment.adpt.actions.correctCompleted');
  const isCorrectionDraft = Boolean(current && current.revisionStatus === 'DRAFT' && current.revisionNumber > 1);
  const canMutate = canMutateAdipometryAssessment(current, {
    canManage,
    canCorrectCompleted: canCorrect,
  });
  const defaultResponsibleProfessorId = user?.professor?.id ?? '';
  const contextBusy = loading || referencesLoading || !responsibleDirectoryReady;
  const currentResponsibleEligible = Boolean(
    current && responsibleProfessors.some((item) => item.id === current.professorId)
  );
  const responsibleReassignmentRequired = Boolean(
    responsibleDirectoryReady
      && current
      && current.status === 'DRAFT'
      && current.revisionStatus === 'DRAFT'
      && !currentResponsibleEligible
  );
  const canOperateDraft = canMutate && !responsibleReassignmentRequired;

  useEffect(() => {
    if (!canView) {
      setResponsibleDirectoryReady(true);
      return;
    }
    let cancelled = false;
    setResponsibleDirectoryReady(false);
    void adipometryService.listResponsibleProfessors()
      .then((items) => {
        if (!cancelled) setResponsibleProfessors(items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(readAdipometryApiError(loadError).message);
      })
      .finally(() => {
        if (!cancelled) setResponsibleDirectoryReady(true);
      });
    return () => { cancelled = true; };
  }, [canView, setError]);

  useEffect(() => {
    if (current?.professorId) {
      const currentIsEligible = responsibleProfessors.some(
        (item) => item.id === current.professorId
      );
      if (
        !responsibleDirectoryReady
        || currentIsEligible
        || current.status !== 'DRAFT'
        || current.revisionStatus !== 'DRAFT'
      ) {
        setSelectedResponsibleProfessorId(current.professorId);
      } else {
        setSelectedResponsibleProfessorId('');
      }
      return;
    }
    setSelectedResponsibleProfessorId((previous) => {
      if (previous && responsibleProfessors.some((item) => item.id === previous)) return previous;
      return responsibleProfessors.some((item) => item.id === defaultResponsibleProfessorId)
        ? defaultResponsibleProfessorId
        : '';
    });
  }, [
    current?.professorId,
    current?.revisionStatus,
    current?.status,
    defaultResponsibleProfessorId,
    responsibleDirectoryReady,
    responsibleProfessors,
  ]);

  const handleAluno = (id: string) => {
    if (lockedAlunoId) return;
    selectAluno(id);
    const next = new URLSearchParams(searchParams);
    next.delete('alunoId');
    next.delete('assessmentId');
    setSearchParams(next);
  };

  const handleOpen = (id: string) => {
    invalidateWorkspace();
    const next = new URLSearchParams(searchParams);
    if (lockedAlunoId) next.set('alunoId', lockedAlunoId);
    else next.delete('alunoId');
    next.set('assessmentId', id);
    setSearchParams(next);
  };

  const handleFormField = <K extends keyof AdipometryFormState>(
    field: K,
    value: AdipometryFormState[K]
  ) => {
    setCapacityWarningConfirmed(false);
    setFormField(field, value);
  };

  const handleMeasurement = (field: Parameters<typeof setMeasurement>[0], value: string) => {
    setCapacityWarningConfirmed(false);
    setMeasurement(field, value);
  };

  const handleCreate = async () => {
    if (contextBusy || !selectedAlunoId || !selectedResponsibleProfessorId) return;
    setBusy(true);
    resetMessages();
    try {
      const created = await adipometryService.createDraft(
        selectedAlunoId,
        { assessmentDate: form.assessmentDate },
        selectedResponsibleProfessorId
      );
      setSuccess('Rascunho criado. Continue a coleta e salve antes de calcular.');
      handleOpen(created.id);
    } catch (createError) {
      setError(readAdipometryApiError(createError).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReassignResponsible = async () => {
    if (
      contextBusy
      || !current
      || !responsibleReassignmentRequired
      || !selectedResponsibleProfessorId
    ) return;

    setBusy(true);
    resetMessages();
    try {
      const reassigned = await adipometryService.reassignResponsible(current.id, {
        responsibleProfessorId: selectedResponsibleProfessorId,
        expectedUpdatedAt: current.updatedAt,
      });
      setCurrent(reassigned);
      setPreview(null);
      setCapacityWarningConfirmed(false);
      setConflict(false);
      setSuccess('Responsável atualizado. O rascunho pode ser retomado sem perda dos dados locais.');
    } catch (reassignError) {
      const parsed = readAdipometryApiError(reassignError);
      if (parsed.status === 409) {
        setConflict(true);
        setError('O rascunho mudou em outra sessão. Seus valores locais foram preservados.');
      } else {
        setError(parsed.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (silent = false): Promise<AdipometryAssessmentDetail | null> => {
    if (contextBusy || !current || !canOperateDraft) return null;
    const built = buildAdipometryDraftPayload({ form, current, isCorrectionDraft });
    if (!built.payload) {
      setFieldErrors(built.fieldErrors);
      if (built.message) setError(built.message);
      return null;
    }
    const payload = built.payload;
    setBusy(true);
    if (!silent) resetMessages();
    try {
      const saved = await adipometryService.updateDraft(current.id, payload);
      setCurrent(saved);
      setForm(adipometryFormFromAssessment(saved));
      setDirty(false);
      setConflict(false);
      setPreview(null);
      setFieldErrors({});
      if (!silent) setSuccess('Rascunho salvo com sucesso.');
      return saved;
    } catch (saveError) {
      const parsed = readAdipometryApiError(saveError);
      if (parsed.status === 409) {
        setConflict(true);
        setError('O servidor recusou a gravação porque o rascunho mudou em outra sessão.');
      } else {
        setError(parsed.message);
      }
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleCalculate = async () => {
    if (contextBusy || responsibleReassignmentRequired) return;
    if (!form.protocolKey || !form.protocolSex || !form.protocolSexSource) {
      setError('Selecione o protocolo e confirme o sexo de referência antes de calcular.');
      return;
    }
    resetMessages();
    const saved = await saveDraft(true);
    if (!saved) return;
    setBusy(true);
    try {
      const calculated = await adipometryService.calculate(saved.id, {
        ...(capacityWarningConfirmed ? { skinfoldCapacityWarningConfirmed: true } : {}),
      });
      setPreview(calculated);
      setDirty(false);
      setSuccess(calculated.canFinalize
        ? 'Prévia calculada. Revise o resultado antes de concluir.'
        : 'Prévia calculada com pendências. Corrija os itens indicados.');
    } catch (calculateError) {
      setError(readAdipometryApiError(calculateError).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (contextBusy || responsibleReassignmentRequired || !current || !preview) return;
    setBusy(true);
    resetMessages();
    try {
      const result = await adipometryService.finalize(current.id, {
        inputFingerprint: preview.inputFingerprint,
        expectedUpdatedAt: current.updatedAt,
      });
      setShowFinalize(false);
      setCurrent(result.assessment);
      setForm(adipometryFormFromAssessment(result.assessment));
      setPreview(null);
      setCapacityWarningConfirmed(false);
      setDirty(false);
      setSuccess(result.alreadyFinalized ? 'A avaliação já estava concluída.' : 'Avaliação concluída com sucesso.');
      setRefreshToken((value) => value + 1);
    } catch (finalizeError) {
      const parsed = readAdipometryApiError(finalizeError);
      if (parsed.status === 409) {
        setConflict(true);
        setError('A prévia foi invalidada ou o rascunho mudou. Reconcilie os dados e calcule novamente.');
      } else setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStartCorrection = async () => {
    if (contextBusy || !current || correctionReason.trim().length < 10) return;
    setBusy(true);
    resetMessages();
    try {
      const correction = await adipometryService.startCorrection(current.id, {
        category: correctionCategory,
        reason: correctionReason.trim(),
      });
      setShowCorrection(false);
      setCorrectionReason('');
      setSuccess('Revisão de correção criada. A avaliação original foi preservada.');
      handleOpen(correction.id);
    } catch (correctionError) {
      setError(readAdipometryApiError(correctionError).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelCorrection = async () => {
    if (contextBusy || !current || cancelReason.trim().length < 10) return;
    setBusy(true);
    resetMessages();
    try {
      await adipometryService.cancelCorrection(current.id, cancelReason.trim());
      setShowCancelCorrection(false);
      setCancelReason('');
      setSuccess('Correção cancelada e preservada no histórico.');
      invalidateWorkspace();
      const next = new URLSearchParams(searchParams);
      next.delete('assessmentId');
      if (!lockedAlunoId) next.delete('alunoId');
      setSearchParams(next);
      setRefreshToken((value) => value + 1);
    } catch (cancelError) {
      setError(readAdipometryApiError(cancelError).message);
    } finally {
      setBusy(false);
    }
  };

  const reloadServer = async () => {
    if (contextBusy || !current) return;
    setLoading(true);
    try {
      const server = await adipometryService.getAssessment(current.id);
      setCurrent(server);
      setForm(adipometryFormFromAssessment(server));
      setPreview(null);
      setCapacityWarningConfirmed(false);
      setDirty(false);
      setConflict(false);
      setError(null);
    } catch (loadError) {
      setError(readAdipometryApiError(loadError).message);
    } finally {
      setLoading(false);
    }
  };

  const keepLocal = async () => {
    if (contextBusy || !current) return;
    setLoading(true);
    try {
      const server = await adipometryService.getAssessment(current.id);
      setCurrent(server);
      setPreview(null);
      setCapacityWarningConfirmed(false);
      setDirty(true);
      setConflict(false);
      setError(null);
      setSuccess('Valores locais preservados sobre a versão mais recente. Revise e salve novamente.');
    } catch (loadError) {
      setError(readAdipometryApiError(loadError).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedAluno = alunos.find((item) => item.id === selectedAlunoId);
  const selectedProtocol = protocols.find((item) => adipometryProtocolKey(item) === form.protocolKey);
  const selectedResponsible = responsibleProfessors.find(
    (item) => item.id === selectedResponsibleProfessorId
  );
  const responsibleName = selectedResponsible?.name ?? 'Responsável não disponível';

  return (
    <>
      {responsibleReassignmentRequired ? (
        <section
          role="alert"
          aria-labelledby="adpt-responsible-recovery-title"
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <h2 id="adpt-responsible-recovery-title" className="font-semibold">
            Selecione um novo responsável para retomar este rascunho
          </h2>
          <p className="mt-1">
            O professor registrado ficou inativo, foi desligado ou perdeu a permissão necessária.
            Os dados do rascunho permanecem preservados e nenhuma operação clínica será executada
            até a reassociação.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="adpt-recovery-responsible" className="mb-1 block font-medium">
                Novo responsável elegível
              </label>
              <select
                id="adpt-recovery-responsible"
                value={selectedResponsibleProfessorId}
                onChange={(event) => setSelectedResponsibleProfessorId(event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm"
              >
                <option value="">Selecione um professor ativo</option>
                {responsibleProfessors.map((professor) => (
                  <option key={professor.id} value={professor.id}>{professor.name}</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              onClick={() => void handleReassignResponsible()}
              disabled={!selectedResponsibleProfessorId || busy || contextBusy || !canMutate}
              isLoading={busy}
            >
              Atualizar responsável
            </Button>
          </div>
        </section>
      ) : null}

      <AdipometryView
        lockedAlunoId={lockedAlunoId}
        alunos={alunos}
        selectedAlunoId={selectedAlunoId}
        current={current}
        assessments={assessments}
        protocols={protocols}
        responsibleProfessors={responsibleProfessors}
        selectedResponsibleProfessorId={selectedResponsibleProfessorId}
        form={form}
        preview={preview}
        support={support}
        fieldErrors={fieldErrors}
        loading={contextBusy}
        busy={busy || contextBusy}
        dirty={dirty}
        conflict={conflict}
        error={error}
        success={success}
        supportError={supportError}
        canView={canView}
        canMutate={canOperateDraft}
        canCorrect={canCorrect}
        responsibleName={responsibleName}
        capacityWarningConfirmed={capacityWarningConfirmed}
        mutationBlockMessage={responsibleReassignmentRequired
          ? 'Atualize o responsável acima para editar, calcular ou concluir este rascunho.'
          : undefined}
        onAluno={handleAluno}
        onResponsible={setSelectedResponsibleProfessorId}
        onForm={handleFormField}
        onMeasurement={handleMeasurement}
        onHelp={setHelp}
        onCreate={() => void handleCreate()}
        onSave={() => void saveDraft(false)}
        onCalculate={() => void handleCalculate()}
        onFinalize={() => setShowFinalize(true)}
        onCorrection={() => setShowCorrection(true)}
        onCancelCorrection={() => setShowCancelCorrection(true)}
        onOpen={handleOpen}
        onReloadServer={() => void reloadServer()}
        onKeepLocal={() => void keepLocal()}
        onCapacityWarning={(checked) => {
          setCapacityWarningConfirmed(checked);
          setPreview(null);
        }}
      />

      <AdipometryScreenOverlays
        help={help}
        showFinalize={showFinalize}
        current={current}
        preview={preview}
        selectedAluno={selectedAluno}
        responsibleName={responsibleName}
        selectedProtocol={selectedProtocol}
        busy={busy || contextBusy}
        showCorrection={showCorrection}
        correctionCategory={correctionCategory}
        correctionReason={correctionReason}
        showCancelCorrection={showCancelCorrection}
        cancelReason={cancelReason}
        onHelpClose={() => setHelp(null)}
        onFinalizeClose={() => setShowFinalize(false)}
        onFinalizeConfirm={() => void handleFinalize()}
        onCorrectionCategory={setCorrectionCategory}
        onCorrectionReason={setCorrectionReason}
        onCorrectionClose={() => setShowCorrection(false)}
        onCorrectionConfirm={() => void handleStartCorrection()}
        onCancelClose={() => setShowCancelCorrection(false)}
        onCancelReason={setCancelReason}
        onCancelConfirm={() => void handleCancelCorrection()}
      />
    </>
  );
}
