import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, History, Lock, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import { canAccessBlock } from '../../access/access-control';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/Accordion';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { professorService } from '../../services/professor.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAnthropometry } from '../../hooks/useAnthropometry';
import type { AnthropometryAssessment, AnthropometryObservation, AnthropometrySegment } from '../../types/anthropometry';
import { AnthropometryComparisonTable } from './AnthropometryComparisonTable';
import { AnthropometryEvolutionChart } from './AnthropometryEvolutionChart';
import { AnthropometryHelpDialog } from './AnthropometryHelpDialog';
import { AnthropometrySegmentSettings } from './AnthropometrySegmentSettings';
import { ProtocolNavTabs } from './protocolNav';

type ProfessorOption = { id: string; name: string };
type GuidedStepTone = 'done' | 'current' | 'pending';
type GuidedStep = { title: string; description: string; tone: GuidedStepTone };

const toDateInput = (value?: string) =>
  value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

const guidedStepClass: Record<GuidedStepTone, string> = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  current: 'border-primary/40 bg-primary/5 text-foreground',
  pending: 'border-border bg-muted/20 text-muted-foreground',
};

function GuidedStepCard({ title, description, tone }: GuidedStep) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${guidedStepClass[tone]}`}>
      <div className="flex items-center gap-2 font-semibold">
        {tone === 'done' ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
    </div>
  );
}

function StatusPill({ assessment }: { assessment: AnthropometryAssessment }) {
  const completed = assessment.status === 'COMPLETED';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
      {completed ? 'Concluída' : 'Rascunho'}
    </span>
  );
}

export function AnthropometryScreen() {
  const { user } = useAuthStore();
  const canCorrectCompleted = canAccessBlock(user, 'students.actions.manageAssessments');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAlunoId = searchParams.get('alunoId') || '';
  const startedFromCentral = Boolean(initialAlunoId);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState(initialAlunoId);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [helpSegment, setHelpSegment] = useState<AnthropometrySegment | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [header, setHeader] = useState({ assessmentDate: toDateInput(), professorId: '', notes: '' });
  const [observations, setObservations] = useState<Array<Pick<AnthropometryObservation, 'segmentId' | 'text' | 'importable'>>>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [correctionTargetId, setCorrectionTargetId] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState('');

  const selectedAluno = alunos.find((aluno) => aluno.id === selectedAlunoId);
  const alunoSex = selectedAluno?.user.profile.gender;
  const anthropometry = useAnthropometry(selectedAlunoId || undefined, alunoSex);
  const defaultAssessment = anthropometry.currentAssessment;
  const correctionTarget = correctionTargetId
    ? anthropometry.assessments.find((assessment) => assessment.id === correctionTargetId) ?? null
    : null;
  const workingAssessment = correctionTarget ?? defaultAssessment;
  const isCorrectionMode = Boolean(correctionTarget);
  const isDraft = workingAssessment?.status === 'DRAFT';
  const isEditable = Boolean(workingAssessment && (isDraft || isCorrectionMode));
  const hasDraft = anthropometry.assessments.some((assessment) => assessment.status === 'DRAFT');
  const selectedReadOnlyAssessment =
    anthropometry.selectedAssessment && anthropometry.selectedAssessment.id !== defaultAssessment?.id
      ? anthropometry.selectedAssessment
      : null;
  const previousAssessments = anthropometry.assessments.filter((assessment) => assessment.id !== defaultAssessment?.id);
  const effectiveProfessorId = header.professorId || user?.professor?.id || '';
  const centralAlunoPath = selectedAlunoId ? `/central-do-aluno/${selectedAlunoId}` : '/central-do-aluno';

  useEffect(() => {
    async function loadMetadata() {
      const [alunoResult, professorResult] = await Promise.all([
        alunoService.list(1, 100, undefined, 'active'),
        professorService.list('active'),
      ]);
      setAlunos(alunoResult.alunos);
      setProfessors(professorResult.map((professor) => ({ id: professor.id, name: professor.user.profile.name })));
    }
    void loadMetadata();
  }, []);

  useEffect(() => {
    if (!selectedAlunoId) return;
    setSearchParams({ alunoId: selectedAlunoId });
  }, [selectedAlunoId, setSearchParams]);

  useEffect(() => {
    if (!workingAssessment) {
      setValues({});
      setHeader({ assessmentDate: toDateInput(), professorId: user?.professor?.id || '', notes: '' });
      setObservations([]);
      return;
    }
    setValues(Object.fromEntries(workingAssessment.values.map((item) => [item.segmentId, item.value ?? ''])));
    setHeader({
      assessmentDate: toDateInput(workingAssessment.assessmentDate),
      professorId: workingAssessment.professorId || user?.professor?.id || '',
      notes: workingAssessment.notes || '',
    });
    setObservations(
      workingAssessment.observations.length
        ? workingAssessment.observations.map((item) => ({ segmentId: item.segmentId, text: item.text, importable: item.importable }))
        : [{ segmentId: null, text: '', importable: false }]
    );
  }, [workingAssessment?.id, workingAssessment?.updatedAt, user?.professor?.id]);

  useEffect(() => {
    setCorrectionTargetId('');
    setCorrectionReason('');
  }, [selectedAlunoId]);

  const sortedAssessments = useMemo(
    () => [...anthropometry.assessments].sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime()),
    [anthropometry.assessments]
  );

  const requiredSegments = useMemo(
    () => anthropometry.segments.filter((segment) => segment.requiredForCompletion),
    [anthropometry.segments]
  );

  const guidedSteps: GuidedStep[] = useMemo(
    () => [
      {
        title: '1. Aluno preservado',
        description: selectedAluno ? `${selectedAluno.user.profile.name} está vinculado ao fluxo atual.` : 'Selecione ou aguarde o aluno carregado pela Central.',
        tone: selectedAluno ? 'done' : 'current',
      },
      {
        title: '2. Cabeçalho obrigatório',
        description: header.assessmentDate && effectiveProfessorId ? 'Data e responsável definidos para rastreabilidade.' : 'Informe data e responsável antes de criar ou salvar a avaliação.',
        tone: header.assessmentDate && effectiveProfessorId ? 'done' : selectedAluno ? 'current' : 'pending',
      },
      {
        title: '3. Coleta guiada',
        description: workingAssessment ? `Preencha as medidas. ${requiredSegments.length} segmento(s) estão explicitamente obrigatórios para conclusão.` : 'Crie a avaliação ANTR para liberar a tabela de medidas.',
        tone: workingAssessment ? 'done' : selectedAluno ? 'current' : 'pending',
      },
      {
        title: '4. Concluir',
        description: workingAssessment?.status === 'COMPLETED' ? 'A avaliação está concluída e protegida contra edição comum.' : 'Salve o rascunho e conclua somente quando as medidas obrigatórias estiverem preenchidas.',
        tone: workingAssessment?.status === 'COMPLETED' ? 'done' : workingAssessment ? 'current' : 'pending',
      },
    ],
    [effectiveProfessorId, header.assessmentDate, requiredSegments.length, selectedAluno, workingAssessment]
  );

  const validateRequiredHeader = () => {
    if (!selectedAlunoId) {
      setValidationError('Selecione um aluno antes de iniciar a antropometria.');
      return false;
    }
    if (!header.assessmentDate) {
      setValidationError('Informe a data da avaliação antes de continuar.');
      return false;
    }
    if (!effectiveProfessorId) {
      setValidationError('Informe o professor responsável antes de continuar.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleCreateAssessment = async () => {
    if (!validateRequiredHeader()) return;
    const created = await anthropometry.createNewAssessment(effectiveProfessorId);
    if (created) {
      setHeader({ assessmentDate: toDateInput(created.assessmentDate), professorId: created.professorId || effectiveProfessorId, notes: created.notes || '' });
      setCorrectionTargetId('');
    }
  };

  const handleSave = async () => {
    if (!workingAssessment || !isDraft || !validateRequiredHeader()) return false;
    const headerResult = await anthropometry.updateHeader(workingAssessment.id, { ...header, professorId: effectiveProfessorId });
    if (!headerResult) return false;
    const valueResult = await anthropometry.saveValues(
      workingAssessment.id,
      anthropometry.segments.map((segment) => ({ segmentId: segment.id, value: values[segment.id] ?? '', unit: 'cm' }))
    );
    if (!valueResult) return false;
    const observationResult = await anthropometry.saveObservations(
      workingAssessment.id,
      observations.filter((item) => item.text.trim())
    );
    return Boolean(observationResult);
  };

  const handleComplete = async () => {
    if (!workingAssessment || !isDraft) return;
    const saved = await handleSave();
    if (!saved) return;
    await anthropometry.completeAssessment(workingAssessment.id);
  };

  const startCorrection = (assessment: AnthropometryAssessment) => {
    setValidationError(null);
    setCorrectionReason('');
    setCorrectionTargetId(assessment.id);
    anthropometry.setSelectedAssessmentId(assessment.id);
  };

  const cancelCorrection = () => {
    setCorrectionTargetId('');
    setCorrectionReason('');
    setValidationError(null);
  };

  const handleCorrection = async () => {
    if (!workingAssessment || !isCorrectionMode) return;
    if (!correctionReason.trim()) {
      setValidationError('Informe o motivo da correção antes de salvar.');
      return;
    }
    const corrected = await anthropometry.correctAssessment(workingAssessment.id, {
      reason: correctionReason.trim(),
      notes: header.notes,
      values: anthropometry.segments.map((segment) => ({ segmentId: segment.id, value: values[segment.id] ?? '', unit: 'cm' })),
      observations: observations.filter((item) => item.text.trim()),
    });
    if (corrected) cancelCorrection();
  };

  const updateObservation = (index: number, field: 'text' | 'importable', value: string | boolean) => {
    setObservations((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Avaliação Física</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Avaliação Antropométrica</h1>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            Histórico por aluno com avaliações ANTR, requisitos explícitos de conclusão, comparação acessível e correções auditadas.
          </p>
        </div>
        <ProtocolNavTabs activeSlug="antropometria" alunoId={selectedAlunoId} />
      </div>

      {startedFromCentral ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Fluxo iniciado pela Central do Aluno</CardTitle>
                <CardDescription>O aluno veio pré-selecionado pela Central e fica protegido contra troca acidental durante a coleta.</CardDescription>
              </div>
              <Link to={centralAlunoPath}><Button variant="outline" size="sm">Voltar à Central</Button></Link>
            </div>
          </CardHeader>
          <CardContent><div className="grid gap-3 md:grid-cols-4">{guidedSteps.map((step) => <GuidedStepCard key={step.title} {...step} />)}</div></CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Aluno e avaliação atual</CardTitle>
              <CardDescription>Trabalhe no rascunho; avaliações concluídas ficam imutáveis fora do fluxo de correção.</CardDescription>
            </div>
            {workingAssessment ? <StatusPill assessment={workingAssessment} /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_180px_minmax(220px,0.8fr)_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Aluno <span className="text-destructive">*</span></label>
              <select
                value={selectedAlunoId}
                disabled={startedFromCentral}
                onChange={(event) => setSelectedAlunoId(event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
              >
                <option value="">Selecione um aluno</option>
                {alunos.map((aluno) => <option key={aluno.id} value={aluno.id}>{aluno.user.profile.name}</option>)}
              </select>
              {startedFromCentral ? <p className="mt-1 text-xs text-muted-foreground">Aluno travado porque o fluxo foi iniciado pela Central.</p> : null}
            </div>

            <Input
              label="Data *"
              type="date"
              value={header.assessmentDate}
              disabled={!selectedAlunoId || !isDraft}
              onChange={(event) => setHeader((current) => ({ ...current, assessmentDate: event.target.value }))}
            />

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Professor <span className="text-destructive">*</span></label>
              <select
                value={effectiveProfessorId}
                disabled={!selectedAlunoId || !isDraft}
                onChange={(event) => setHeader((current) => ({ ...current, professorId: event.target.value }))}
                className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
              >
                <option value="">Professor atual</option>
                {professors.map((professor) => <option key={professor.id} value={professor.id}>{professor.name}</option>)}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="button" onClick={handleCreateAssessment} disabled={!selectedAlunoId || hasDraft || isCorrectionMode} isLoading={anthropometry.saving}>
                <Plus className="h-4 w-4" /> Nova avaliação
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void handleSave()} disabled={!isDraft} isLoading={anthropometry.saving}>
              <Save className="h-4 w-4" /> Salvar rascunho
            </Button>
            <Button type="button" onClick={() => void handleComplete()} disabled={!isDraft} isLoading={anthropometry.saving}>
              <CheckCircle2 className="h-4 w-4" /> Concluir avaliação
            </Button>
            {workingAssessment?.status === 'COMPLETED' && canCorrectCompleted && !isCorrectionMode ? (
              <Button type="button" variant="outline" onClick={() => startCorrection(workingAssessment)}>
                <Pencil className="h-4 w-4" /> Corrigir avaliação
              </Button>
            ) : null}
          </div>

          {isCorrectionMode ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div>
                <p className="font-semibold text-amber-900">Correção auditada de {workingAssessment?.code}</p>
                <p className="mt-1 text-sm text-amber-800">Altere somente o que precisa ser corrigido. O sistema preservará antes/depois, motivo, responsável e horário.</p>
              </div>
              <div>
                <label htmlFor="anthropometry-correction-reason" className="mb-2 block text-sm font-medium text-foreground">Motivo da correção *</label>
                <textarea
                  id="anthropometry-correction-reason"
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  className="min-h-[80px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Explique por que a avaliação concluída precisa ser corrigida"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleCorrection()} isLoading={anthropometry.saving}><Save className="h-4 w-4" /> Salvar correção</Button>
                <Button type="button" variant="outline" onClick={cancelCorrection}><X className="h-4 w-4" /> Cancelar</Button>
              </div>
            </div>
          ) : null}

          {validationError ? <p className="text-sm text-destructive" role="alert">{validationError}</p> : null}
          {anthropometry.error ? <p className="text-sm text-destructive" role="alert">{anthropometry.error}</p> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground">
              <span className="font-semibold">Conclusão:</span>{' '}
              {requiredSegments.length
                ? `${requiredSegments.length} medida(s) explicitamente configurada(s) como obrigatória(s).`
                : 'nenhuma medida obrigatória foi configurada; a conclusão permanecerá bloqueada até essa definição.'}
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Segmento principal, importação automática e histórico não definem obrigatoriedade por inferência.
            </div>
          </div>

          {workingAssessment ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>Avaliação: <strong>{workingAssessment.code}</strong>.</span>
                <StatusPill assessment={workingAssessment} />
              </div>
              {workingAssessment.status === 'COMPLETED' ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Concluída em {workingAssessment.completedAt ? new Date(workingAssessment.completedAt).toLocaleString('pt-BR') : 'data histórica preservada'}.
                  {workingAssessment.corrections.length ? ` ${workingAssessment.corrections.length} correção(ões) auditada(s) registrada(s).` : ''}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Selecione um aluno e clique em Nova avaliação para gerar ANTR-001 ou o próximo código sequencial. A nova avaliação começa como rascunho.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAlunoId ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Comparação lado a lado</CardTitle>
              <CardDescription>Representação tabular principal, com valores persistidos e variações absolutas e percentuais quando comparáveis.</CardDescription>
            </CardHeader>
            <CardContent>
              {anthropometry.loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando histórico...</div>
              ) : workingAssessment ? (
                <AnthropometryComparisonTable
                  assessments={sortedAssessments}
                  editableAssessmentId={isEditable ? workingAssessment.id : undefined}
                  segments={anthropometry.segments}
                  values={values}
                  onValueChange={(segmentId, value) => setValues((current) => ({ ...current, [segmentId]: value }))}
                  onOpenHelp={setHelpSegment}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Ainda não há avaliações antropométricas para este aluno.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evolução visual</CardTitle>
              <CardDescription>Gráfico complementar para leitura rápida da evolução de um segmento ao longo do histórico.</CardDescription>
            </CardHeader>
            <CardContent><AnthropometryEvolutionChart assessments={sortedAssessments} segments={anthropometry.segments} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Observações</CardTitle>
              <CardDescription>Observações permanecem editáveis apenas no rascunho ou durante uma correção auditada.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible defaultValue="observations">
                <AccordionItem value="observations">
                  <AccordionTrigger>Observações da avaliação em foco</AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <textarea
                      value={header.notes}
                      disabled={!isEditable}
                      onChange={(event) => setHeader((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Observações gerais da avaliação"
                      className="min-h-[96px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
                    />

                    {observations.map((item, index) => (
                      <div key={index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <Input
                          value={item.text}
                          disabled={!isEditable}
                          onChange={(event) => updateObservation(index, 'text', event.target.value)}
                          placeholder="Ex.: observação relevante da coleta"
                        />
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={item.importable}
                            disabled={!isEditable}
                            onChange={(event) => updateObservation(index, 'importable', event.target.checked)}
                            className="h-4 w-4 rounded border-border"
                          />
                          Importar na próxima
                        </label>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!isEditable}
                      onClick={() => setObservations((current) => [...current, { segmentId: null, text: '', importable: false }])}
                    >
                      <Plus className="h-4 w-4" /> Adicionar observação
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico e configurações</CardTitle>
              <CardDescription>Consulte avaliações anteriores e configure explicitamente os requisitos de conclusão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Accordion type="single" collapsible>
                <AccordionItem value="history">
                  <AccordionTrigger><span className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico de avaliações</span></AccordionTrigger>
                  <AccordionContent>
                    {previousAssessments.length ? (
                      <div className="grid gap-2">
                        {previousAssessments.map((assessment) => (
                          <button
                            key={assessment.id}
                            type="button"
                            onClick={() => anthropometry.setSelectedAssessmentId(assessment.id)}
                            className="rounded-lg border border-border bg-card px-4 py-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <strong>{assessment.code}</strong>
                              <StatusPill assessment={assessment} />
                            </div>
                            <span className="mt-1 block text-xs text-muted-foreground">{new Date(assessment.assessmentDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma avaliação anterior cadastrada.</p>
                    )}

                    {selectedReadOnlyAssessment ? (
                      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <h3 className="text-sm font-semibold text-foreground">
                            {selectedReadOnlyAssessment.code} em {new Date(selectedReadOnlyAssessment.assessmentDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          </h3>
                          {selectedReadOnlyAssessment.status === 'COMPLETED' && canCorrectCompleted && !isCorrectionMode ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => startCorrection(selectedReadOnlyAssessment)}>
                              <Pencil className="h-4 w-4" /> Corrigir esta avaliação
                            </Button>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{selectedReadOnlyAssessment.notes || 'Sem observações gerais cadastradas.'}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {selectedReadOnlyAssessment.observations.map((observation) => (
                            <div key={observation.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">{observation.text}</div>
                          ))}
                        </div>
                        {selectedReadOnlyAssessment.corrections.length ? (
                          <div className="mt-4 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correções auditadas</p>
                            {selectedReadOnlyAssessment.corrections.map((correction) => (
                              <div key={correction.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                                <span className="font-medium">{new Date(correction.createdAt).toLocaleString('pt-BR')}</span>
                                <span className="ml-2 text-muted-foreground">{correction.reason}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <AnthropometrySegmentSettings segments={anthropometry.segments} onChanged={anthropometry.load} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <AnthropometryHelpDialog segment={helpSegment} alunoSex={alunoSex} onClose={() => setHelpSegment(null)} />
    </div>
  );
}
