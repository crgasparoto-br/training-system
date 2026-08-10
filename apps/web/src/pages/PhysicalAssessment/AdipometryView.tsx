import { Link } from 'react-router-dom';
import {
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryCalculationPreview,
  AdipometryInputField,
  AdipometryProtocolSummary,
  AdipometryResponsibleProfessor,
} from '@corrida/types';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import type { Aluno } from '../../services/aluno.service';
import type { AdipometryAnthropometrySupport } from '../../services/adipometry.service';
import type { AdipometryFormState, AdipometrySkinfoldHelp } from './adipometry-ui';
import { StepStrip, adipometryRevisionStatusLabel, messageClass } from './AdipometryViewSections';
import { AdipometryEditor } from './AdipometryEditor';
import { ProtocolNavTabs } from './protocolNav';

export interface AdipometryViewProps {
  lockedAlunoId: string;
  alunos: Aluno[];
  selectedAlunoId: string;
  current: AdipometryAssessmentDetail | null;
  assessments: AdipometryAssessmentSummary[];
  protocols: AdipometryProtocolSummary[];
  responsibleProfessors: AdipometryResponsibleProfessor[];
  selectedResponsibleProfessorId: string;
  form: AdipometryFormState;
  preview: AdipometryCalculationPreview | null;
  support: AdipometryAnthropometrySupport | null;
  fieldErrors: Partial<Record<AdipometryInputField, string>>;
  loading: boolean;
  busy: boolean;
  dirty: boolean;
  conflict: boolean;
  error: string | null;
  success: string | null;
  supportError: string | null;
  canView: boolean;
  canMutate: boolean;
  canCorrect: boolean;
  responsibleName: string;
  capacityWarningConfirmed: boolean;
  mutationBlockMessage?: string;
  onAluno: (id: string) => void;
  onResponsible: (id: string) => void;
  onForm: <K extends keyof AdipometryFormState>(field: K, value: AdipometryFormState[K]) => void;
  onMeasurement: (field: AdipometryInputField, value: string) => void;
  onHelp: (item: AdipometrySkinfoldHelp) => void;
  onCreate: () => void;
  onSave: () => void;
  onCalculate: () => void;
  onFinalize: () => void;
  onCorrection: () => void;
  onCancelCorrection: () => void;
  onOpen: (id: string) => void;
  onReloadServer: () => void;
  onKeepLocal: () => void;
  onCapacityWarning: (checked: boolean) => void;
}

export function responsibleProfessorOptionLabel({
  currentProfessorId,
  responsibleProfessors,
}: {
  currentProfessorId?: string;
  responsibleProfessors: AdipometryResponsibleProfessor[];
}): string | null {
  if (!currentProfessorId) return null;
  return responsibleProfessors.some((item) => item.id === currentProfessorId)
    ? null
    : 'Responsável histórico indisponível';
}

export function AdipometryView(props: AdipometryViewProps) {
  const {
    lockedAlunoId, alunos, selectedAlunoId, current, assessments, protocols,
    responsibleProfessors, selectedResponsibleProfessorId, form, preview, support,
    fieldErrors, loading, busy, dirty, conflict, error, success, supportError, canView,
    canMutate, canCorrect, responsibleName, capacityWarningConfirmed, mutationBlockMessage,
  } = props;
  const selectedAluno = alunos.find((item) => item.id === selectedAlunoId);
  const readOnly = !current || current.status !== 'DRAFT' || current.revisionStatus !== 'DRAFT' || !canMutate;
  const historicalResponsibleLabel = responsibleProfessorOptionLabel({
    currentProfessorId: current?.professorId,
    responsibleProfessors,
  });
  const registeredResponsibleName = current
    ? responsibleProfessors.find((item) => item.id === current.professorId)?.name
      ?? historicalResponsibleLabel
      ?? 'Responsável histórico indisponível'
    : responsibleName;
  const responsibleSelectValue = current?.professorId ?? selectedResponsibleProfessorId;

  if (!canView) {
    return <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">Seu perfil não possui permissão para consultar avaliações ADPT.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Avaliação Física</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Adipometria</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Fluxo guiado ADPT com protocolo explícito, prévia autoritativa, histórico e ajuda técnica.</p>
        </div>
        <ProtocolNavTabs activeSlug="adipometria" alunoId={selectedAlunoId} />
      </div>

      {lockedAlunoId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <span className="flex items-center gap-2"><Lock className="h-4 w-4" aria-hidden="true" />Aluno preservado porque o fluxo foi iniciado pela Central.</span>
          <Link to={`/central-do-aluno/${lockedAlunoId}`} className="font-medium text-primary hover:underline">Voltar à Central</Link>
        </div>
      ) : null}

      <StepStrip detail={current} preview={preview} selectedStudent={Boolean(selectedAlunoId)} />

      {error ? <div role="alert" className={`rounded-lg border p-4 text-sm ${messageClass('error')}`}>{error}</div> : null}
      {success ? <div role="status" className={`rounded-lg border p-4 text-sm ${messageClass('success')}`}>{success}</div> : null}
      {supportError ? <div role="status" className={`rounded-lg border p-4 text-sm ${messageClass('warning')}`}>{supportError}</div> : null}
      {conflict ? (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" aria-hidden="true" />O rascunho foi alterado em outra sessão.</p>
          <p className="mt-1">Seus valores locais foram preservados. Escolha como reconciliar antes de salvar novamente.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={props.onReloadServer}>Usar versão do servidor</Button>
            <Button type="button" size="sm" onClick={props.onKeepLocal}>Manter meus valores</Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Aluno e avaliação</CardTitle>
          <CardDescription>O ator vem da sessão autenticada; o responsável clínico deve estar ativo no mesmo contrato.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_180px_minmax(0,1fr)_auto]">
          <div>
            <label htmlFor="adpt-aluno" className="mb-2 block text-sm font-medium">Aluno *</label>
            <select id="adpt-aluno" value={selectedAlunoId} disabled={Boolean(lockedAlunoId)} onChange={(event) => props.onAluno(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted">
              <option value="">Selecione um aluno</option>
              {alunos.map((aluno) => <option key={aluno.id} value={aluno.id}>{aluno.user.profile.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="adpt-date" className="mb-2 block text-sm font-medium">Data *</label>
            <input id="adpt-date" type="date" value={form.assessmentDate} disabled={readOnly && Boolean(current)} onChange={(event) => props.onForm('assessmentDate', event.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted" />
          </div>
          <div>
            <label htmlFor="adpt-responsible" className="mb-2 block text-sm font-medium">Responsável *</label>
            <select
              id="adpt-responsible"
              value={responsibleSelectValue}
              disabled={Boolean(current) || !canMutate}
              onChange={(event) => props.onResponsible(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm disabled:bg-muted"
            >
              <option value="">Selecione um professor ativo</option>
              {historicalResponsibleLabel && current?.professorId ? (
                <option value={current.professorId}>{historicalResponsibleLabel}</option>
              ) : null}
              {responsibleProfessors.map((professor) => (
                <option key={professor.id} value={professor.id}>{professor.name}</option>
              ))}
            </select>
            {current ? <p className="mt-1 text-xs text-muted-foreground">Responsável registrado: {registeredResponsibleName}</p> : null}
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={props.onCreate} disabled={!selectedAlunoId || !selectedResponsibleProfessorId || !canMutate || busy}><Plus className="h-4 w-4" aria-hidden="true" />Nova avaliação</Button>
          </div>
        </CardContent>
        {current ? (
          <CardContent className="border-t border-border pt-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Código</dt><dd className="font-semibold">{current.code}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Estado</dt><dd className="font-semibold">{adipometryRevisionStatusLabel(current.revisionStatus)}</dd></div>
            </dl>
          </CardContent>
        ) : null}
      </Card>

      <AdipometryEditor
        selectedAlunoId={selectedAlunoId}
        current={current}
        assessments={assessments}
        protocols={protocols}
        form={form}
        preview={preview}
        support={support}
        fieldErrors={fieldErrors}
        busy={busy}
        dirty={dirty}
        canMutate={canMutate}
        canCorrect={canCorrect}
        capacityWarningConfirmed={capacityWarningConfirmed}
        onForm={props.onForm}
        onMeasurement={props.onMeasurement}
        onHelp={props.onHelp}
        onSave={props.onSave}
        onCalculate={props.onCalculate}
        onFinalize={props.onFinalize}
        onCorrection={props.onCorrection}
        onCancelCorrection={props.onCancelCorrection}
        onOpen={props.onOpen}
        onCapacityWarning={props.onCapacityWarning}
      />

      {!canMutate && current?.revisionStatus !== 'FINALIZED' ? (
        <div role="status" className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          {mutationBlockMessage
            ?? 'Seu perfil possui acesso de leitura. Criar, editar, calcular e concluir exige permissão de gestão ADPT.'}
        </div>
      ) : null}
      {loading ? <div role="status" className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg"><RefreshCw className="h-4 w-4 animate-spin" />Atualizando ADPT…</div> : null}
      {busy ? <span className="sr-only" aria-live="polite">Processando operação</span> : null}
      {selectedAluno ? <span className="sr-only">Aluno selecionado: {selectedAluno.user.profile.name}</span> : null}
    </div>
  );
}
