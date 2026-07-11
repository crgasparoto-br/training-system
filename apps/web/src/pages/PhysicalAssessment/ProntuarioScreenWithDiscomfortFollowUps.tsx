import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { prontuarioService } from '../../services/prontuario.service';
import { ProntuarioScreen } from './ProntuarioScreen';
import type { ProntuarioOverview, ProntuarioPainCase, ProntuarioRecord } from '@corrida/types';

type PainCaseDraft = Partial<ProntuarioPainCase> & { title: string };

type FollowUpDraft = {
  followUpAt: string;
  intensity: string;
  notes: string;
  conduct: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

const painCaseStatusLabel: Record<ProntuarioPainCase['status'], string> = {
  active: 'Ativo',
  monitoring: 'Em acompanhamento',
  resolved: 'Resolvido',
  archived: 'Arquivado',
};

const isActivePainCase = (item: ProntuarioPainCase | PainCaseDraft) =>
  item.status !== 'resolved' && item.status !== 'archived';

function draftsFromRecord(record: ProntuarioRecord | null): PainCaseDraft[] {
  return (record?.painCases || []).map((item) => ({
    ...item,
    onsetDate: toDateInput(item.onsetDate),
    followUps: item.followUps || [],
  }));
}

function normalizePainCases(items: PainCaseDraft[], followUpDrafts: Record<string, FollowUpDraft>) {
  return items
    .map((item, index) => {
      const key = item.id || String(index);
      const followUpDraft = followUpDrafts[key];
      const existingFollowUps = item.followUps || [];
      const shouldCreateFollowUp = Boolean(
        followUpDraft?.notes.trim() ||
        followUpDraft?.conduct.trim() ||
        followUpDraft?.intensity.trim()
      );
      const nextFollowUps = shouldCreateFollowUp
        ? [
            ...existingFollowUps,
            {
              followUpAt: followUpDraft.followUpAt || today(),
              intensity: followUpDraft.intensity.trim() ? Number(followUpDraft.intensity) : null,
              notes: followUpDraft.notes.trim() || null,
              conduct: followUpDraft.conduct.trim() || null,
            },
          ]
        : existingFollowUps;

      return {
        id: item.id,
        title: item.title?.trim() || '',
        region: item.region?.trim() || null,
        status: item.status || 'active',
        onsetDate: item.onsetDate || null,
        description: item.description?.trim() || null,
        followUps: nextFollowUps,
      };
    })
    .filter((item) => item.title.length > 0);
}

function buildEmptyFollowUp(): FollowUpDraft {
  return {
    followUpAt: today(),
    intensity: '',
    notes: '',
    conduct: '',
  };
}

function DiscomfortFollowUpPanel({ alunoId }: { alunoId: string }) {
  const [overview, setOverview] = useState<ProntuarioOverview | null>(null);
  const [drafts, setDrafts] = useState<PainCaseDraft[]>([]);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, FollowUpDraft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRecord = overview?.currentRecord ?? overview?.records[0] ?? null;
  const activeCases = drafts.filter(isActivePainCase);
  const latestFollowUp = useMemo(() => {
    return drafts
      .flatMap((item) => item.followUps || [])
      .filter((item) => item.followUpAt)
      .sort((left, right) => new Date(right.followUpAt).getTime() - new Date(left.followUpAt).getTime())[0] ?? null;
  }, [drafts]);

  const load = async () => {
    if (!alunoId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await prontuarioService.overview(alunoId);
      const record = data.currentRecord ?? data.records[0] ?? null;
      setOverview(data);
      setDrafts(draftsFromRecord(record));
      setFollowUpDrafts({});
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível carregar os desconfortos do PRNT.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [alunoId]);

  const updateCase = (index: number, patch: Partial<PainCaseDraft>) => {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const updateFollowUpDraft = (key: string, patch: Partial<FollowUpDraft>) => {
    setFollowUpDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] || buildEmptyFollowUp()), ...patch },
    }));
  };

  const addCase = () => {
    setDrafts((current) => [
      ...current,
      { title: '', region: '', status: 'active', onsetDate: today(), description: '', followUps: [] },
    ]);
  };

  const saveCases = async () => {
    if (!currentRecord) {
      setError('Crie ou carregue um registro PRNT antes de salvar desconfortos.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = normalizePainCases(drafts, followUpDrafts);
      const record = await prontuarioService.savePainCases(currentRecord.id, payload);
      setOverview((current) => current ? {
        ...current,
        currentRecord: record,
        records: [record, ...current.records.filter((item) => item.id !== record.id)],
      } : current);
      setDrafts(draftsFromRecord(record));
      setFollowUpDrafts({});
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível salvar acompanhamentos de desconforto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Acompanhamento de desconfortos</CardTitle>
            <CardDescription>
              Fluxo contextual da #182 para registrar desconfortos ativos, acompanhamentos e encerramentos sem sair do aluno selecionado.
            </CardDescription>
          </div>
          <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {activeCases.length} ativo(s)
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
        {loading ? <p className="text-sm text-muted-foreground">Carregando desconfortos...</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Desconfortos ativos</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{activeCases.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Casos com status ativo ou em acompanhamento.</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Último acompanhamento</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{latestFollowUp ? toDateInput(latestFollowUp.followUpAt) : 'Não registrado'}</div>
            <p className="mt-1 text-xs text-muted-foreground">Usado pela Central para saber se o caso está sendo acompanhado.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700"><AlertTriangle size={14} /> Alerta técnico</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{activeCases.length > 0 ? 'Revisar antes de prescrever' : 'Sem caso ativo'}</div>
            <p className="mt-1 text-xs text-muted-foreground">Desconfortos ativos podem impactar treino, avaliação e conduta.</p>
          </div>
        </div>

        <div className="space-y-3">
          {drafts.map((item, index) => {
            const key = item.id || String(index);
            const followUpDraft = followUpDrafts[key] || buildEmptyFollowUp();
            const followUps = item.followUps || [];
            return (
              <div key={key} className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Input label="Título" value={item.title || ''} onChange={(event) => updateCase(index, { title: event.target.value })} />
                  <Input label="Região" value={item.region || ''} onChange={(event) => updateCase(index, { region: event.target.value })} />
                  <Input label="Data de início" type="date" value={toDateInput(item.onsetDate)} onChange={(event) => updateCase(index, { onsetDate: event.target.value })} />
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Status</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={item.status || 'active'}
                      onChange={(event) => updateCase(index, { status: event.target.value as ProntuarioPainCase['status'] })}
                    >
                      <option value="active">Ativo</option>
                      <option value="monitoring">Em acompanhamento</option>
                      <option value="resolved">Resolvido</option>
                      <option value="archived">Arquivado</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <textarea
                      className="min-h-[76px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Descrição do desconforto, restrição ou contexto"
                      value={item.description || ''}
                      onChange={(event) => updateCase(index, { description: event.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-border bg-background p-3">
                  <p className="text-sm font-semibold text-foreground">Histórico de acompanhamentos</p>
                  <div className="mt-2 space-y-2">
                    {followUps.length ? followUps.map((followUp) => (
                      <div key={followUp.id || `${followUp.followUpAt}-${followUp.notes}`} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{toDateInput(followUp.followUpAt)}</span>
                        {followUp.intensity ? ` · intensidade ${followUp.intensity}` : ''}
                        {followUp.notes ? ` · ${followUp.notes}` : ''}
                        {followUp.conduct ? ` · Conduta: ${followUp.conduct}` : ''}
                      </div>
                    )) : <p className="text-xs text-muted-foreground">Nenhum acompanhamento registrado para este desconforto.</p>}
                  </div>
                </div>

                {isActivePainCase(item) ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <Input label="Data do acompanhamento" type="date" value={followUpDraft.followUpAt} onChange={(event) => updateFollowUpDraft(key, { followUpAt: event.target.value })} />
                    <Input label="Intensidade" type="number" min="0" max="10" value={followUpDraft.intensity} onChange={(event) => updateFollowUpDraft(key, { intensity: event.target.value })} />
                    <div className="md:col-span-2">
                      <textarea
                        className="min-h-[76px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Observação do acompanhamento"
                        value={followUpDraft.notes}
                        onChange={(event) => updateFollowUpDraft(key, { notes: event.target.value })}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <textarea
                        className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Conduta, orientação ou próximo passo"
                        value={followUpDraft.conduct}
                        onChange={(event) => updateFollowUpDraft(key, { conduct: event.target.value })}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {isActivePainCase(item) ? (
                    <Button type="button" variant="outline" onClick={() => updateCase(index, { status: 'resolved' })} disabled={saving}>
                      Marcar como resolvido
                    </Button>
                  ) : (
                    <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                      {painCaseStatusLabel[item.status || 'archived']}
                    </span>
                  )}
                  <Button type="button" variant="outline" onClick={() => setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={saving}>
                    Remover da lista
                  </Button>
                </div>
              </div>
            );
          })}

          {!drafts.length ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Nenhum desconforto registrado. Adicione um caso ativo para iniciar o acompanhamento.
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={addCase} disabled={saving}>
            <Activity size={16} />
            Novo desconforto
          </Button>
          <Button type="button" onClick={saveCases} disabled={saving || !currentRecord}>
            <Save size={16} />
            Salvar acompanhamentos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProntuarioScreenWithDiscomfortFollowUps() {
  const [searchParams] = useSearchParams();
  const alunoId = searchParams.get('alunoId') || '';

  return (
    <div className="space-y-6">
      <ProntuarioScreen />
      {alunoId ? (
        <DiscomfortFollowUpPanel alunoId={alunoId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Acompanhamento de desconfortos</CardTitle>
            <CardDescription>Selecione um aluno no PRNT para carregar o fluxo de desconfortos ativos e acompanhamentos.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
