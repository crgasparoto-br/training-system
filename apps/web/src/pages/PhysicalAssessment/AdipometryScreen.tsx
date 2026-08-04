import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  AdipometryAssessmentDetail,
  AdipometryCorrectionCategory,
} from '@corrida/types';
import { canAccessBlock } from '../../access/access-control';
import { adipometryService } from '../../services/adipometry.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { AdipometryScreenOverlays } from './AdipometryScreenOverlays';
import { AdipometryView } from './AdipometryView';
import {
  adipometryProtocolKey,
  type AdipometrySkinfoldHelp,
} from './adipometry-ui';
import { adipometryFormFromAssessment, buildAdipometryDraftPayload, readAdipometryApiError } from './adipometry-screen-utils';
import { useAdipometryWorkspace } from './useAdipometryWorkspace';

export function AdipometryScreen() {
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const lockedAlunoId = useRef(searchParams.get('alunoId') ?? '').current;
  const assessmentIdParam = searchParams.get('assessmentId') ?? '';

  const canView = canAccessBlock(user, 'physicalAssessment.adpt.view');
  const workspace = useAdipometryWorkspace({ canView, lockedAlunoId, assessmentIdParam });
  const {
    alunos, selectedAlunoId, setSelectedAlunoId, assessments, current, setCurrent, protocols, support,
    form, setForm, preview, setPreview, fieldErrors, setFieldErrors, loading, setLoading, dirty, setDirty,
    conflict, setConflict, error, setError, success, setSuccess, supportError, setRefreshToken,
    capacityWarningConfirmed, setCapacityWarningConfirmed, resetMessages, setFormField, setMeasurement,
  } = workspace;
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<AdipometrySkinfoldHelp | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showCancelCorrection, setShowCancelCorrection] = useState(false);
  const [correctionCategory, setCorrectionCategory] = useState<AdipometryCorrectionCategory>('DATA_ENTRY_ERROR');
  const [correctionReason, setCorrectionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const canManage = canAccessBlock(user, 'physicalAssessment.adpt.actions.manage');
  const canCorrect = canAccessBlock(user, 'physicalAssessment.adpt.actions.correctCompleted');
  const isCorrectionDraft = Boolean(current && current.revisionStatus === 'DRAFT' && current.revisionNumber > 1);
  const canMutate = canManage || (isCorrectionDraft && canCorrect);
  const responsibleName = user?.name ?? '';

  const handleAluno = (id: string) => {
    if (lockedAlunoId) return;
    setSelectedAlunoId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set('alunoId', id); else next.delete('alunoId');
    next.delete('assessmentId');
    setSearchParams(next);
  };

  const handleOpen = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (selectedAlunoId) next.set('alunoId', selectedAlunoId);
    next.set('assessmentId', id);
    setSearchParams(next);
  };

  const handleCreate = async () => {
    if (!selectedAlunoId) return;
    setBusy(true);
    resetMessages();
    try {
      const created = await adipometryService.createDraft(selectedAlunoId, { assessmentDate: form.assessmentDate });
      setSuccess('Rascunho criado. Continue a coleta e salve antes de calcular.');
      handleOpen(created.id);
    } catch (createError) {
      setError(readAdipometryApiError(createError).message);
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (silent = false): Promise<AdipometryAssessmentDetail | null> => {
    if (!current || !canMutate) return null;
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
    if (!current || !preview) return;
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
      setDirty(false);
      setSuccess(result.alreadyFinalized ? 'A avaliação já estava concluída.' : 'Avaliação concluída com sucesso.');
      setRefreshToken((value) => value + 1);
    } catch (finalizeError) {
      const parsed = readAdipometryApiError(finalizeError);
      if (parsed.status === 409) {
        setConflict(true);
        setError('A prévia foi invalidada ou o rascunho mudou. Reconcile os dados e calcule novamente.');
      } else setError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStartCorrection = async () => {
    if (!current || correctionReason.trim().length < 10) return;
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
    if (!current || cancelReason.trim().length < 10) return;
    setBusy(true);
    resetMessages();
    try {
      await adipometryService.cancelCorrection(current.id, cancelReason.trim());
      setShowCancelCorrection(false);
      setCancelReason('');
      setSuccess('Correção cancelada e preservada no histórico.');
      const next = new URLSearchParams(searchParams);
      next.delete('assessmentId');
      setSearchParams(next);
      setRefreshToken((value) => value + 1);
    } catch (cancelError) {
      setError(readAdipometryApiError(cancelError).message);
    } finally {
      setBusy(false);
    }
  };

  const reloadServer = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const server = await adipometryService.getAssessment(current.id);
      setCurrent(server);
      setForm(adipometryFormFromAssessment(server));
      setPreview(null);
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
    if (!current) return;
    setLoading(true);
    try {
      const server = await adipometryService.getAssessment(current.id);
      setCurrent(server);
      setPreview(null);
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

  return (
    <>
      <AdipometryView
        lockedAlunoId={lockedAlunoId}
        alunos={alunos}
        selectedAlunoId={selectedAlunoId}
        current={current}
        assessments={assessments}
        protocols={protocols}
        form={form}
        preview={preview}
        support={support}
        fieldErrors={fieldErrors}
        loading={loading}
        busy={busy}
        dirty={dirty}
        conflict={conflict}
        error={error}
        success={success}
        supportError={supportError}
        canView={canView}
        canMutate={canMutate}
        canCorrect={canCorrect}
        responsibleName={responsibleName}
        capacityWarningConfirmed={capacityWarningConfirmed}
        onAluno={handleAluno}
        onForm={setFormField}
        onMeasurement={setMeasurement}
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
        busy={busy}
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
