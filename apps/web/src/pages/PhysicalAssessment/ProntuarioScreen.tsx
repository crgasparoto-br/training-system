import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ClipboardList, FilePlus2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BodyDiscomfortMap } from '../../components/BodyDiscomfortMap';
import { canAccessBlock } from '../../access/access-control';
import { useAuthStore } from '../../stores/useAuthStore';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { prontuarioService } from '../../services/prontuario.service';
import type {
  AccessBlockKey,
  ProntuarioActivityHistory,
  ProntuarioDiscomfortEntry,
  ProntuarioGoal,
  ProntuarioMedicationProcedure,
  ProntuarioOverview,
  ProntuarioPainCase,
  ProntuarioRecord,
  StudentParqSubmission,
} from '@corrida/types';
import type { BodyDiscomfortEntry } from '../../constants/bodyRegions';

const protocolLinks = [
  ['antropometria', 'Antropometria'],
  ['prontuario-entrevista-acompanhamento', 'Prontuário'],
  ['adipometria', 'Adipometria'],
  ['bioimpedanciometria', 'Bioimpedanciometria'],
  ['ultrassonografia', 'Ultrassonografia'],
] as const;

type ProntuarioBlockName =
  | 'summary'
  | 'goals'
  | 'anamnesis'
  | 'activity'
  | 'meds'
  | 'pain'
  | 'discomforts'
  | 'create'
  | 'edit'
  | 'closeFollowUp'
  | 'reviewParq';

const prontuarioBlockKeys = {
  summary: 'physicalAssessment.prnt.summary',
  goals: 'physicalAssessment.prnt.goals',
  anamnesis: 'physicalAssessment.prnt.anamnesisFollowUp',
  activity: 'physicalAssessment.prnt.activityHistory',
  meds: 'physicalAssessment.prnt.medicationsProcedures',
  pain: 'physicalAssessment.prnt.painCases',
  discomforts: 'physicalAssessment.prnt.discomforts',
  create: 'physicalAssessment.prnt.actions.createRecord',
  edit: 'physicalAssessment.prnt.actions.editRecord',
  closeFollowUp: 'physicalAssessment.prnt.actions.closeFollowUp',
  reviewParq: 'physicalAssessment.prnt.actions.reviewParq',
} as const satisfies Record<ProntuarioBlockName, AccessBlockKey>;

const prontuarioBlockEntries = Object.entries(prontuarioBlockKeys) as Array<[
  ProntuarioBlockName,
  AccessBlockKey,
]>;

const allowedActivityTypes = [
  'running',
  'strength',
  'mobility',
  'sport',
  'occupational',
  'other',
] as const satisfies readonly ProntuarioActivityHistory['activityType'][];

const allowedMedicationProcedureTypes = [
  'medication',
  'supplement',
  'procedure',
  'exam',
  'therapy',
  'other',
] as const satisfies readonly ProntuarioMedicationProcedure['type'][];

const allowedPainCaseStatuses = [
  'active',
  'monitoring',
  'resolved',
  'archived',
] as const satisfies readonly ProntuarioPainCase['status'][];

const today = () => new Date().toISOString().slice(0, 10);

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

function getProntuarioErrorMessage(err: any) {
  const apiError = err?.response?.data?.error;

  if (apiError === 'Route not found') {
    return 'O módulo de prontuário ainda não está disponível na API publicada. Publique a API da branch main antes de carregar este aluno.';
  }

  return apiError || 'Não foi possível carregar o PRNT.';
}

type Drafts = {
  recordDate: string;
  summary: string;
  notes: string;
  goals: Array<Partial<ProntuarioGoal> & { title: string }>;
  activityHistory: Array<Partial<ProntuarioActivityHistory> & { description: string }>;
  medicationsProcedures: Array<Partial<ProntuarioMedicationProcedure> & { type: ProntuarioMedicationProcedure['type']; name: string }>;
  painCases: Array<Partial<ProntuarioPainCase> & { title: string }>;
};

const emptyDrafts: Drafts = {
  recordDate: today(),
  summary: '',
  notes: '',
  goals: [],
  activityHistory: [],
  medicationsProcedures: [],
  painCases: [],
};

function draftsFromRecord(record: ProntuarioRecord | null): Drafts {
  if (!record) return emptyDrafts;
  return {
    recordDate: toDateInput(record.recordDate) || today(),
    summary: record.summary || '',
    notes: record.notes || '',
    goals: record.goals.map((item) => ({ ...item, targetDate: toDateInput(item.targetDate) })),
    activityHistory: record.activityHistory.map((item) => ({ ...item, startedAt: toDateInput(item.startedAt), endedAt: toDateInput(item.endedAt) })),
    medicationsProcedures: record.medicationsProcedures.map((item) => ({ ...item, startDate: toDateInput(item.startDate), endDate: toDateInput(item.endDate) })),
    painCases: record.painCases.map((item) => ({ ...item, onsetDate: toDateInput(item.onsetDate) })),
  };
}

function inferParqSubmissionId(record: ProntuarioRecord | null, submissions: StudentParqSubmission[]): string | null {
  if (!record) return null;
  for (const followUp of record.anamnesisFollowUps) {
    if (!followUp.parqSubmissionId) continue;
    if (submissions.some((submission) => submission.id === followUp.parqSubmissionId)) {
      return followUp.parqSubmissionId;
    }
  }
  return null;
}

function followUpLookupKey(parqSubmissionId: string | null | undefined, itemKey: string) {
  return `${parqSubmissionId || '__none__'}:${itemKey}`;
}

export function ProntuarioScreen() {
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const alunoIdFromUrl = searchParams.get('alunoId') || '';
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState(alunoIdFromUrl);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedParqSubmissionId, setSelectedParqSubmissionId] = useState<string | null>(null);
  const [overview, setOverview] = useState<ProntuarioOverview | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, { followUpNotes: string; actionPlan: string }>>({});
  const [discomfortEntries, setDiscomfortEntries] = useState<BodyDiscomfortEntry[]>([]);
  const [discomfortNotes, setDiscomfortNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parqReviewNotes, setParqReviewNotes] = useState('');
  const overviewRequestIdRef = useRef(0);

  const currentRecord = useMemo(() => {
    if (!overview) return null;
    if (selectedRecordId) {
      return overview.records.find((record) => record.id === selectedRecordId) ?? overview.currentRecord ?? null;
    }
    return overview.currentRecord ?? null;
  }, [overview, selectedRecordId]);
  const selectedStudent = students.find((student) => student.id === selectedAlunoId);
  const parqSubmissions = overview?.parqSubmissions || [];
  const selectedParqSubmission =
    (selectedParqSubmissionId
      ? parqSubmissions.find((submission) => submission.id === selectedParqSubmissionId)
      : null) || overview?.latestParqSubmission || null;

  const blocks = useMemo(
    () =>
      Object.fromEntries(
        prontuarioBlockEntries.map(([blockName, blockKey]) => [
          blockName,
          canAccessBlock(user, blockKey),
        ])
      ) as Record<ProntuarioBlockName, boolean>,
    [user]
  );

  useEffect(() => {
    let isActive = true;

    alunoService.list(1, 100, undefined, 'active')
      .then((response) => {
        if (isActive) {
          setStudents(response.alunos || []);
        }
      })
      .catch(() => {
        if (isActive) {
          setError('Não foi possível carregar alunos.');
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    setSelectedAlunoId((currentAlunoId) =>
      currentAlunoId === alunoIdFromUrl ? currentAlunoId : alunoIdFromUrl
    );
  }, [alunoIdFromUrl]);

  useEffect(() => {
    const requestId = overviewRequestIdRef.current + 1;
    overviewRequestIdRef.current = requestId;

    if (!selectedAlunoId) {
      setOverview(null);
      setSelectedRecordId(null);
      setSelectedParqSubmissionId(null);
      setDrafts(emptyDrafts);
      setFollowUpDrafts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setOverview(null);
    setSelectedRecordId(null);
    setSelectedParqSubmissionId(null);
    setDrafts(emptyDrafts);
    setFollowUpDrafts({});

    prontuarioService.overview(selectedAlunoId)
      .then((data) => {
        if (overviewRequestIdRef.current !== requestId) {
          return;
        }

        setOverview(data);
        const fallbackRecord = data.currentRecord ?? data.records[0] ?? null;
        setSelectedRecordId(fallbackRecord?.id ?? null);
        const preferredParqId = inferParqSubmissionId(fallbackRecord, data.parqSubmissions || []);
        setSelectedParqSubmissionId(preferredParqId ?? data.latestParqSubmission?.id ?? null);
        setDrafts(draftsFromRecord(fallbackRecord));
      })
      .catch((err) => {
        if (overviewRequestIdRef.current === requestId) {
          setError(getProntuarioErrorMessage(err));
        }
      })
      .finally(() => {
        if (overviewRequestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [selectedAlunoId]);

  useEffect(() => {
    const nextDrafts: Record<string, { followUpNotes: string; actionPlan: string }> = {};
    const followUpsByKey = new Map(
      (currentRecord?.anamnesisFollowUps || []).map((entry) => [followUpLookupKey(entry.parqSubmissionId, entry.itemKey), entry])
    );

    for (const item of selectedParqSubmission?.positiveItems || []) {
      const followUp = followUpsByKey.get(followUpLookupKey(selectedParqSubmission?.id, item.key));
      nextDrafts[item.key] = {
        followUpNotes: followUp?.followUpNotes || '',
        actionPlan: followUp?.actionPlan || '',
      };
    }
    setFollowUpDrafts(nextDrafts);
  }, [currentRecord, selectedParqSubmission]);

  useEffect(() => {
    setDrafts(draftsFromRecord(currentRecord));
  }, [currentRecord?.id]);

  const refresh = async () => {
    if (!selectedAlunoId) return;
    const data = await prontuarioService.overview(selectedAlunoId);
    setOverview(data);
    const preferredRecord = selectedRecordId
      ? data.records.find((record) => record.id === selectedRecordId) ?? null
      : null;
    const fallbackRecord = preferredRecord ?? data.currentRecord ?? data.records[0] ?? null;
    const nextParqSubmissionId = selectedParqSubmissionId && data.parqSubmissions.some((submission) => submission.id === selectedParqSubmissionId)
      ? selectedParqSubmissionId
      : inferParqSubmissionId(fallbackRecord, data.parqSubmissions || []) ?? data.latestParqSubmission?.id ?? null;
    setSelectedRecordId(fallbackRecord?.id ?? null);
    setSelectedParqSubmissionId(nextParqSubmissionId);
    setDrafts(draftsFromRecord(fallbackRecord));
  };

  const handleAlunoSelectionChange = (alunoId: string) => {
    setSelectedAlunoId(alunoId);
    setSearchParams(alunoId ? { alunoId } : {}, { replace: true });
  };

  const reviewSelectedParq = async () => {
    const reviewId = selectedParqSubmission?.review?.id;
    if (!selectedAlunoId || !reviewId) return;
    setSaving(true);
    setError(null);
    try {
      const data = await prontuarioService.reviewParq(selectedAlunoId, reviewId, parqReviewNotes || null);
      setOverview(data);
      setParqReviewNotes('');
    } catch (err) {
      setError(getProntuarioErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const normalizeGoalsPayload = (goals: Drafts['goals']) =>
    goals
      .map((item, index) => ({
        id: item.id,
        title: item.title?.trim() || '',
        description: item.description?.trim() || null,
        status: item.status,
        priority: item.priority ?? index,
        targetDate: item.targetDate || null,
      }))
      .filter((item) => item.title.length > 0);

  const normalizeActivityPayload = (items: Drafts['activityHistory']) =>
    items
      .map((item) => ({
        id: item.id,
        description: item.description?.trim() || '',
        activityType: allowedActivityTypes.includes(item.activityType as ProntuarioActivityHistory['activityType'])
          ? (item.activityType as ProntuarioActivityHistory['activityType'])
          : 'other',
        frequency: item.frequency?.trim() || null,
        duration: item.duration?.trim() || null,
        intensity: item.intensity?.trim() || null,
        startedAt: item.startedAt || null,
        endedAt: item.endedAt || null,
        notes: item.notes?.trim() || null,
      }))
      .filter((item) => item.description.length > 0);

  const normalizeMedicationsPayload = (items: Drafts['medicationsProcedures']) =>
    items
      .map((item) => ({
        id: item.id,
        type: allowedMedicationProcedureTypes.includes(item.type) ? item.type : 'other',
        name: item.name?.trim() || '',
        dosage: item.dosage?.trim() || null,
        frequency: item.frequency?.trim() || null,
        startDate: item.startDate || null,
        endDate: item.endDate || null,
        notes: item.notes?.trim() || null,
      }))
      .filter((item) => item.name.length > 0);

  const normalizePainCasesPayload = (items: Drafts['painCases']) =>
    items
      .map((item) => ({
        id: item.id,
        title: item.title?.trim() || '',
        region: item.region?.trim() || null,
        status: allowedPainCaseStatuses.includes(item.status as ProntuarioPainCase['status'])
          ? (item.status as ProntuarioPainCase['status'])
          : 'active',
        onsetDate: item.onsetDate || null,
        description: item.description?.trim() || null,
        followUps: item.followUps,
      }))
      .filter((item) => item.title.length > 0);

  const ensureRecord = async () => {
    if (currentRecord) return currentRecord;
    if (!selectedAlunoId) throw new Error('Selecione um aluno.');
    const created = await prontuarioService.createRecord(selectedAlunoId, {
      recordDate: drafts.recordDate,
      summary: drafts.summary,
      notes: drafts.notes,
    });
    setSelectedRecordId(created.id);
    await refresh();
    return created;
  };

  const saveRecord = async () => {
    setSaving(true);
    setError(null);
    try {
      const record = currentRecord
        ? await prontuarioService.updateRecord(currentRecord.id, { recordDate: drafts.recordDate, summary: drafts.summary, notes: drafts.notes })
        : await prontuarioService.createRecord(selectedAlunoId, { recordDate: drafts.recordDate, summary: drafts.summary, notes: drafts.notes });
      setSelectedRecordId(record.id);
      setOverview((current) => current ? { ...current, currentRecord: record, records: [record, ...current.records.filter((item) => item.id !== record.id)] } : current);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível salvar o registro.');
    } finally {
      setSaving(false);
    }
  };

  const saveBlocks = async () => {
    setSaving(true);
    setError(null);
    try {
      const record = await ensureRecord();
      if (blocks.goals) {
        await prontuarioService.saveGoals(record.id, normalizeGoalsPayload(drafts.goals));
      }

      if (blocks.activity) {
        await prontuarioService.saveActivityHistory(record.id, normalizeActivityPayload(drafts.activityHistory));
      }

      if (blocks.meds) {
        await prontuarioService.saveMedicationsProcedures(record.id, normalizeMedicationsPayload(drafts.medicationsProcedures));
      }

      if (blocks.pain) {
        await prontuarioService.savePainCases(record.id, normalizePainCasesPayload(drafts.painCases));
      }
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Não foi possível salvar os blocos.');
    } finally {
      setSaving(false);
    }
  };

  const saveAnamnesisFollowUps = async () => {
    if (!selectedParqSubmission?.positiveItems?.length) return;
    setSaving(true);
    try {
      const record = await ensureRecord();
      const previous = new Map(
        record.anamnesisFollowUps.map((item) => [followUpLookupKey(item.parqSubmissionId, item.itemKey), item])
      );
      await prontuarioService.saveAnamnesisFollowUps(
        record.id,
        selectedParqSubmission.positiveItems.map((item) => {
          const previousFollowUp = previous.get(followUpLookupKey(selectedParqSubmission.id, item.key));
          const draft = followUpDrafts[item.key];

          return {
            ...previousFollowUp,
            id: previousFollowUp?.id,
            recordId: record.id,
            parqSubmissionId: selectedParqSubmission.id,
            itemKey: item.key,
            itemLabel: item.label,
            status: previousFollowUp?.status || 'monitoring',
            followUpNotes: draft?.followUpNotes || previousFollowUp?.followUpNotes || '',
            actionPlan: draft?.actionPlan || previousFollowUp?.actionPlan || '',
          };
        })
      );
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível salvar acompanhamento do PAR-Q.');
    } finally {
      setSaving(false);
    }
  };

  const saveDiscomfortSnapshot = async () => {
    if (!discomfortEntries.length) {
      setError('Marque pelo menos uma região no mapa antes de salvar o snapshot.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const record = await ensureRecord();
      await prontuarioService.createDiscomfortSnapshot(record.id, {
        notes: discomfortNotes,
        entries: discomfortEntries as ProntuarioDiscomfortEntry[],
      });
      setDiscomfortEntries([]);
      setDiscomfortNotes('');
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível salvar o snapshot.');
    } finally {
      setSaving(false);
    }
  };

  const closeFollowUp = async (followUpId: string) => {
    setSaving(true);
    setError(null);
    try {
      const record = await prontuarioService.closeAnamnesisFollowUp(followUpId);
      setSelectedRecordId(record.id);
      setOverview((current) => current ? { ...current, currentRecord: record, records: [record, ...current.records.filter((item) => item.id !== record.id)] } : current);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível encerrar o acompanhamento.');
    } finally {
      setSaving(false);
    }
  };

  const latestPositiveItems = selectedParqSubmission?.positiveItems || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase text-primary">Protocolo de Avaliação Física</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Prontuário de entrevista e acompanhamento</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Histórico PRNT separado do cadastro inicial, com anamnese acompanhável, dores, rotina e desconfortos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {protocolLinks.map(([slug, label]) => (
            <Link key={slug} to={`/protocolo-avaliacao-fisica/${slug}`} className={slug === 'prontuario-entrevista-acompanhamento' ? 'rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground' : 'rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted'}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 lg:grid-cols-[minmax(260px,420px)_1fr_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Aluno</label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedAlunoId} onChange={(event) => handleAlunoSelectionChange(event.target.value)}>
              <option value="">Selecione um aluno</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.user.profile.name}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-muted-foreground">
            {selectedStudent ? `${selectedStudent.user.profile.name} · ${selectedStudent.user.email}` : 'Escolha um aluno para carregar ou criar registros PRNT.'}
          </div>
          {blocks.create && (
            <Button type="button" onClick={saveRecord} disabled={!selectedAlunoId || saving}>
              <FilePlus2 size={16} />
              {currentRecord ? 'Salvar cabeçalho' : 'Criar PRNT'}
            </Button>
          )}
        </CardContent>
      </Card>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {loading ? <p className="text-sm text-muted-foreground">Carregando PRNT...</p> : null}

      {selectedAlunoId && !loading ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            {blocks.summary && (
              <Card>
                <CardHeader>
                  <CardTitle>Resumo do registro</CardTitle>
                  <CardDescription>{currentRecord ? `${currentRecord.code} · ${currentRecord.status}` : 'Novo registro PRNT'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentRecord ? (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Visualizando registro {currentRecord.code} salvo em {toDateInput(currentRecord.recordDate)}.
                    </div>
                  ) : null}
                  <Input label="Data" type="date" value={drafts.recordDate} onChange={(event) => setDrafts((current) => ({ ...current, recordDate: event.target.value }))} />
                  <textarea className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Resumo do momento do aluno" value={drafts.summary} onChange={(event) => setDrafts((current) => ({ ...current, summary: event.target.value }))} />
                  <textarea className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Notas gerais" value={drafts.notes} onChange={(event) => setDrafts((current) => ({ ...current, notes: event.target.value }))} />
                  {blocks.edit ? <Button type="button" onClick={saveRecord} disabled={saving}><Save size={16} />Salvar resumo</Button> : null}
                </CardContent>
              </Card>
            )}

            {blocks.anamnesis && (
              <Card>
                <CardHeader>
                  <CardTitle>Última anamnese</CardTitle>
                  <CardDescription>Itens positivos da submissão PAR-Q mais recente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {latestPositiveItems.length ? latestPositiveItems.map((item) => (
                    <div key={item.key} className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                      <div className="font-medium text-foreground">{item.label}</div>
                      {(() => {
                        const followUp = currentRecord?.anamnesisFollowUps.find((entry) => entry.itemKey === item.key);
                        return (
                          <>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <textarea
                                className="min-h-[86px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="Acompanhamento do professor"
                                value={followUpDrafts[item.key]?.followUpNotes || ''}
                                onChange={(event) =>
                                  setFollowUpDrafts((current) => ({
                                    ...current,
                                    [item.key]: { ...(current[item.key] || { actionPlan: '' }), followUpNotes: event.target.value },
                                  }))
                                }
                              />
                              <textarea
                                className="min-h-[86px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="Conduta ou plano de ação"
                                value={followUpDrafts[item.key]?.actionPlan || ''}
                                onChange={(event) =>
                                  setFollowUpDrafts((current) => ({
                                    ...current,
                                    [item.key]: { ...(current[item.key] || { followUpNotes: '' }), actionPlan: event.target.value },
                                  }))
                                }
                              />
                            </div>
                            {followUp && blocks.closeFollowUp && followUp.status !== 'resolved' ? (
                              <Button type="button" variant="outline" className="mt-3" onClick={() => closeFollowUp(followUp.id)} disabled={saving}>
                                Encerrar acompanhamento
                              </Button>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Nenhum item positivo na submissão PAR-Q mais recente.</p>}
                  {latestPositiveItems.length ? <Button type="button" variant="outline" onClick={saveAnamnesisFollowUps} disabled={saving}><ClipboardList size={16} />Criar/atualizar acompanhamentos</Button> : null}
                </CardContent>
              </Card>
            )}

            {blocks.goals && (
              <GoalsEditor items={drafts.goals} onChange={(goals) => setDrafts((current) => ({ ...current, goals }))} />
            )}

            {blocks.activity && (
              <ActivityHistoryEditor items={drafts.activityHistory} onChange={(activityHistory) => setDrafts((current) => ({ ...current, activityHistory }))} />
            )}

            {blocks.meds && (
              <MedicationsProceduresEditor items={drafts.medicationsProcedures} onChange={(medicationsProcedures) => setDrafts((current) => ({ ...current, medicationsProcedures }))} />
            )}

            {blocks.pain && (
              <PainCasesEditor items={drafts.painCases} onChange={(painCases) => setDrafts((current) => ({ ...current, painCases }))} />
            )}

            {(blocks.goals || blocks.activity || blocks.meds || blocks.pain) && (
              <Button type="button" onClick={saveBlocks} disabled={saving || !selectedAlunoId}>
                <Save size={16} />
                Salvar blocos
              </Button>
            )}

            {blocks.discomforts && (
              <Card>
                <CardHeader>
                  <CardTitle>Desconfortos</CardTitle>
                  <CardDescription>Snapshot corporal do PRNT usando o mapa atual do sistema.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BodyDiscomfortMap value={discomfortEntries} onChange={setDiscomfortEntries} />
                  <textarea className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Notas do snapshot" value={discomfortNotes} onChange={(event) => setDiscomfortNotes(event.target.value)} />
                  <Button type="button" onClick={saveDiscomfortSnapshot} disabled={saving || !selectedAlunoId}><Activity size={16} />Salvar snapshot</Button>
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(overview?.records || []).map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className={record.id === currentRecord?.id ? 'w-full rounded-md border border-primary bg-primary/5 px-3 py-2 text-left text-sm' : 'w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40'}
                    onClick={() => {
                      setSelectedRecordId(record.id);
                      const recordParqId = inferParqSubmissionId(record, parqSubmissions);
                      if (recordParqId) {
                        setSelectedParqSubmissionId(recordParqId);
                      }
                      setDrafts(draftsFromRecord(record));
                    }}
                  >
                    <div className="font-medium">{record.code}</div>
                    <div className="text-xs text-muted-foreground">{toDateInput(record.recordDate)} · {record.status}</div>
                  </button>
                ))}
                {!overview?.records.length ? <p className="text-sm text-muted-foreground">Sem registros PRNT.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PAR-Q</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {parqSubmissions.length ? (
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={selectedParqSubmission?.id || ''}
                    onChange={(event) => setSelectedParqSubmissionId(event.target.value || null)}
                  >
                    {parqSubmissions.map((submission) => (
                      <option key={submission.id} value={submission.id}>
                        {toDateInput(submission.submittedAt)} · {submission.positiveItems?.length || 0} positivo(s)
                      </option>
                    ))}
                  </select>
                ) : null}
                {selectedParqSubmission ? (
                  <div className="space-y-3">
                    <p>{latestPositiveItems.length} item(ns) positivo(s) em {toDateInput(selectedParqSubmission.submittedAt)}.</p>
                    <p className="text-xs">Versão: {selectedParqSubmission.catalogVersion}</p>
                    {selectedParqSubmission.review?.status === 'PENDING' ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                        <p className="font-medium">Análise profissional pendente</p>
                        {blocks.reviewParq ? (
                          <>
                            <textarea
                              className="mt-3 min-h-[88px] w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-foreground"
                              placeholder="Observação permitida da análise"
                              value={parqReviewNotes}
                              onChange={(event) => setParqReviewNotes(event.target.value)}
                              maxLength={4000}
                            />
                            <Button type="button" className="mt-3 w-full" onClick={reviewSelectedParq} disabled={saving}>
                              Registrar análise
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : selectedParqSubmission.review?.status === 'REVIEWED' ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
                        Analisado em {selectedParqSubmission.review.reviewedAt ? toDateInput(selectedParqSubmission.review.reviewedAt) : 'data não informada'}.
                      </div>
                    ) : null}
                  </div>
                ) : 'Sem submissões históricas.'}
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function GoalsEditor({
  items,
  onChange,
}: {
  items: Array<Partial<ProntuarioGoal> & { title: string }>;
  onChange: (items: Array<Partial<ProntuarioGoal> & { title: string }>) => void;
}) {
  const updateItem = (index: number, patch: Partial<ProntuarioGoal> & { title?: string }) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id || index} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-2">
            <Input label="Título" value={item.title || ''} onChange={(event) => updateItem(index, { title: event.target.value })} />
            <Input label="Data alvo" type="date" value={toDateInput(item.targetDate)} onChange={(event) => updateItem(index, { targetDate: event.target.value })} />
            <div className="md:col-span-2">
              <textarea className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Descrição" value={item.description || ''} onChange={(event) => updateItem(index, { description: event.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...items, { title: '', description: '', targetDate: '' }])}>Adicionar</Button>
      </CardContent>
    </Card>
  );
}

function ActivityHistoryEditor({
  items,
  onChange,
}: {
  items: Array<Partial<ProntuarioActivityHistory> & { description: string }>;
  onChange: (items: Array<Partial<ProntuarioActivityHistory> & { description: string }>) => void;
}) {
  const updateItem = (index: number, patch: Partial<ProntuarioActivityHistory> & { description?: string }) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de atividades</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id || index} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-2">
            <Input label="Descrição" value={item.description || ''} onChange={(event) => updateItem(index, { description: event.target.value })} />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Tipo</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={item.activityType || 'other'}
                onChange={(event) => updateItem(index, { activityType: event.target.value as ProntuarioActivityHistory['activityType'] })}
              >
                <option value="running">Corrida</option>
                <option value="strength">Força</option>
                <option value="mobility">Mobilidade</option>
                <option value="sport">Esporte</option>
                <option value="occupational">Ocupacional</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <Input label="Frequência" value={item.frequency || ''} onChange={(event) => updateItem(index, { frequency: event.target.value })} />
            <Input label="Duração" value={item.duration || ''} onChange={(event) => updateItem(index, { duration: event.target.value })} />
            <Input label="Intensidade" value={item.intensity || ''} onChange={(event) => updateItem(index, { intensity: event.target.value })} />
            <div className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...items, { description: '', activityType: 'other' }])}>Adicionar</Button>
      </CardContent>
    </Card>
  );
}

function MedicationsProceduresEditor({
  items,
  onChange,
}: {
  items: Array<Partial<ProntuarioMedicationProcedure> & { type: ProntuarioMedicationProcedure['type']; name: string }>;
  onChange: (items: Array<Partial<ProntuarioMedicationProcedure> & { type: ProntuarioMedicationProcedure['type']; name: string }>) => void;
}) {
  const updateItem = (index: number, patch: Partial<ProntuarioMedicationProcedure> & { type?: ProntuarioMedicationProcedure['type']; name?: string }) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medicações e procedimentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id || index} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Tipo</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={item.type || 'medication'}
                onChange={(event) => updateItem(index, { type: event.target.value as ProntuarioMedicationProcedure['type'] })}
              >
                <option value="medication">Medicação</option>
                <option value="supplement">Suplemento</option>
                <option value="procedure">Procedimento</option>
                <option value="exam">Exame</option>
                <option value="therapy">Terapia</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <Input label="Nome" value={item.name || ''} onChange={(event) => updateItem(index, { name: event.target.value })} />
            <Input label="Dosagem" value={item.dosage || ''} onChange={(event) => updateItem(index, { dosage: event.target.value })} />
            <Input label="Frequência" value={item.frequency || ''} onChange={(event) => updateItem(index, { frequency: event.target.value })} />
            <div className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...items, { type: 'medication', name: '' }])}>Adicionar</Button>
      </CardContent>
    </Card>
  );
}

function PainCasesEditor({
  items,
  onChange,
}: {
  items: Array<Partial<ProntuarioPainCase> & { title: string }>;
  onChange: (items: Array<Partial<ProntuarioPainCase> & { title: string }>) => void;
}) {
  const updateItem = (index: number, patch: Partial<ProntuarioPainCase> & { title?: string }) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Casos de dor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id || index} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-2">
            <Input label="Título" value={item.title || ''} onChange={(event) => updateItem(index, { title: event.target.value })} />
            <Input label="Região" value={item.region || ''} onChange={(event) => updateItem(index, { region: event.target.value })} />
            <Input label="Data de início" type="date" value={toDateInput(item.onsetDate)} onChange={(event) => updateItem(index, { onsetDate: event.target.value })} />
            <div className="md:col-span-2">
              <textarea className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Descrição" value={item.description || ''} onChange={(event) => updateItem(index, { description: event.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...items, { title: '', description: '', region: '', onsetDate: '' }])}>Adicionar</Button>
      </CardContent>
    </Card>
  );
}
