import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  ProntuarioActivityHistory,
  ProntuarioDiscomfortEntry,
  ProntuarioGoal,
  ProntuarioMedicationProcedure,
  ProntuarioOverview,
  ProntuarioPainCase,
  ProntuarioRecord,
} from '@corrida/types';
import type { BodyDiscomfortEntry } from '../../constants/bodyRegions';

const protocolLinks = [
  ['antropometria', 'Antropometria'],
  ['prontuario-entrevista-acompanhamento', 'Prontuário'],
  ['adipometria', 'Adipometria'],
  ['bioimpedanciometria', 'Bioimpedanciometria'],
  ['ultrassonografia', 'Ultrassonografia'],
] as const;

const today = () => new Date().toISOString().slice(0, 10);

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

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

export function ProntuarioScreen() {
  const user = useAuthStore((state) => state.user);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState('');
  const [overview, setOverview] = useState<ProntuarioOverview | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, { followUpNotes: string; actionPlan: string }>>({});
  const [discomfortEntries, setDiscomfortEntries] = useState<BodyDiscomfortEntry[]>([]);
  const [discomfortNotes, setDiscomfortNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRecord = overview?.currentRecord ?? null;
  const selectedStudent = students.find((student) => student.id === selectedAlunoId);

  const blocks = useMemo(() => ({
    summary: canAccessBlock(user, 'physicalAssessment.prnt.summary'),
    goals: canAccessBlock(user, 'physicalAssessment.prnt.goals'),
    anamnesis: canAccessBlock(user, 'physicalAssessment.prnt.anamnesisFollowUp'),
    activity: canAccessBlock(user, 'physicalAssessment.prnt.activityHistory'),
    meds: canAccessBlock(user, 'physicalAssessment.prnt.medicationsProcedures'),
    pain: canAccessBlock(user, 'physicalAssessment.prnt.painCases'),
    discomforts: canAccessBlock(user, 'physicalAssessment.prnt.discomforts'),
    create: canAccessBlock(user, 'physicalAssessment.prnt.actions.createRecord'),
    edit: canAccessBlock(user, 'physicalAssessment.prnt.actions.editRecord'),
    closeFollowUp: canAccessBlock(user, 'physicalAssessment.prnt.actions.closeFollowUp'),
  }), [user]);

  useEffect(() => {
    alunoService.list(1, 100, undefined, 'active')
      .then((response) => setStudents(response.alunos || []))
      .catch(() => setError('Não foi possível carregar alunos.'));
  }, []);

  useEffect(() => {
    if (!selectedAlunoId) {
      setOverview(null);
      setDrafts(emptyDrafts);
      return;
    }
    setLoading(true);
    setError(null);
    prontuarioService.overview(selectedAlunoId)
      .then((data) => {
        setOverview(data);
        setDrafts(draftsFromRecord(data.currentRecord));
      })
      .catch((err) => setError(err?.response?.data?.error || 'Não foi possível carregar o PRNT.'))
      .finally(() => setLoading(false));
  }, [selectedAlunoId]);

  useEffect(() => {
    const nextDrafts: Record<string, { followUpNotes: string; actionPlan: string }> = {};
    for (const item of overview?.latestParqSubmission?.positiveItems || []) {
      const followUp = overview?.currentRecord?.anamnesisFollowUps.find((entry) => entry.itemKey === item.key);
      nextDrafts[item.key] = {
        followUpNotes: followUp?.followUpNotes || '',
        actionPlan: followUp?.actionPlan || '',
      };
    }
    setFollowUpDrafts(nextDrafts);
  }, [overview?.currentRecord, overview?.latestParqSubmission]);

  const refresh = async () => {
    if (!selectedAlunoId) return;
    const data = await prontuarioService.overview(selectedAlunoId);
    setOverview(data);
    setDrafts(draftsFromRecord(data.currentRecord));
  };

  const ensureRecord = async () => {
    if (currentRecord) return currentRecord;
    if (!selectedAlunoId) throw new Error('Selecione um aluno.');
    const created = await prontuarioService.createRecord(selectedAlunoId, {
      recordDate: drafts.recordDate,
      summary: drafts.summary,
      notes: drafts.notes,
    });
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
      if (blocks.goals) await prontuarioService.saveGoals(record.id, drafts.goals);
      if (blocks.activity) await prontuarioService.saveActivityHistory(record.id, drafts.activityHistory);
      if (blocks.meds) await prontuarioService.saveMedicationsProcedures(record.id, drafts.medicationsProcedures);
      if (blocks.pain) await prontuarioService.savePainCases(record.id, drafts.painCases);
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Não foi possível salvar os blocos.');
    } finally {
      setSaving(false);
    }
  };

  const saveAnamnesisFollowUps = async () => {
    if (!overview?.latestParqSubmission?.positiveItems?.length) return;
    setSaving(true);
    try {
      const record = await ensureRecord();
      const previous = new Map(record.anamnesisFollowUps.map((item) => [item.itemKey, item]));
      await prontuarioService.saveAnamnesisFollowUps(
        record.id,
        overview.latestParqSubmission.positiveItems.map((item) => ({
          ...(previous.get(item.key) || {}),
          id: previous.get(item.key)?.id || item.key,
          recordId: record.id,
          parqSubmissionId: overview.latestParqSubmission?.id,
          itemKey: item.key,
          itemLabel: item.label,
          status: previous.get(item.key)?.status || 'monitoring',
          followUpNotes: followUpDrafts[item.key]?.followUpNotes || previous.get(item.key)?.followUpNotes || '',
          actionPlan: followUpDrafts[item.key]?.actionPlan || previous.get(item.key)?.actionPlan || '',
        }))
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
      setOverview((current) => current ? { ...current, currentRecord: record, records: [record, ...current.records.filter((item) => item.id !== record.id)] } : current);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível encerrar o acompanhamento.');
    } finally {
      setSaving(false);
    }
  };

  const latestPositiveItems = overview?.latestParqSubmission?.positiveItems || [];

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
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedAlunoId} onChange={(event) => setSelectedAlunoId(event.target.value)}>
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
              <EditableList title="Objetivos" items={drafts.goals} onChange={(goals) => setDrafts((current) => ({ ...current, goals }))} fields={['title', 'description', 'targetDate']} />
            )}

            {blocks.activity && (
              <EditableList title="Histórico de atividades" items={drafts.activityHistory} onChange={(activityHistory) => setDrafts((current) => ({ ...current, activityHistory }))} fields={['description', 'frequency', 'duration', 'intensity']} />
            )}

            {blocks.meds && (
              <EditableList title="Medicações e procedimentos" items={drafts.medicationsProcedures} onChange={(medicationsProcedures) => setDrafts((current) => ({ ...current, medicationsProcedures }))} fields={['type', 'name', 'dosage', 'frequency']} defaultItem={{ type: 'medication', name: '' }} />
            )}

            {blocks.pain && (
              <EditableList title="Casos de dor" items={drafts.painCases} onChange={(painCases) => setDrafts((current) => ({ ...current, painCases }))} fields={['title', 'region', 'description', 'onsetDate']} />
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
                  <div key={record.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="font-medium">{record.code}</div>
                    <div className="text-xs text-muted-foreground">{toDateInput(record.recordDate)} · {record.status}</div>
                  </div>
                ))}
                {!overview?.records.length ? <p className="text-sm text-muted-foreground">Sem registros PRNT.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PAR-Q</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {overview?.latestParqSubmission ? `${latestPositiveItems.length} item(ns) positivo(s) em ${toDateInput(overview.latestParqSubmission.submittedAt)}.` : 'Sem submissões históricas.'}
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function EditableList<T extends Record<string, any>>({
  title,
  items,
  fields,
  onChange,
  defaultItem,
}: {
  title: string;
  items: T[];
  fields: string[];
  onChange: (items: T[]) => void;
  defaultItem?: Partial<T>;
}) {
  const addItem = () => onChange([...items, { ...(defaultItem || {}), title: '', description: '', name: '', type: 'medication', activityType: 'other' } as unknown as T]);
  const updateItem = (index: number, field: string, value: string) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const removeItem = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id || index} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-2">
            {fields.map((field) => (
              <Input key={field} label={field} type={field.toLowerCase().includes('date') ? 'date' : 'text'} value={item[field] || ''} onChange={(event) => updateItem(index, field, event.target.value)} />
            ))}
            <div className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => removeItem(index)}>Remover</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addItem}>Adicionar</Button>
      </CardContent>
    </Card>
  );
}
