import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { ProntuarioOverview, ProntuarioPainCase } from '@corrida/types';
import { prontuarioService } from '../../services/prontuario.service';
import { ProntuarioScreen } from './ProntuarioScreen';
import './prontuario-screen.css';

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

function buildEmptyFollowUp(): FollowUpDraft {
  return {
    followUpAt: today(),
    intensity: '',
    notes: '',
    conduct: '',
  };
}

function isOpenPainCase(item: ProntuarioPainCase) {
  return item.status === 'active' || item.status === 'monitoring';
}

function hasFollowUpContent(draft: FollowUpDraft | undefined) {
  return Boolean(
    draft?.intensity.trim() || draft?.notes.trim() || draft?.conduct.trim()
  );
}

function PainFollowUpPanel({ alunoId }: { alunoId: string }) {
  const [overview, setOverview] = useState<ProntuarioOverview | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, FollowUpDraft>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, ProntuarioPainCase['status']>>({});
  const [loading, setLoading] = useState(false);
  const [savingCaseId, setSavingCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentRecord = overview?.currentRecord ?? overview?.records[0] ?? null;
  const painCases = useMemo(() => {
    const items = currentRecord?.painCases ?? [];
    return [...items].sort((left, right) => {
      const leftOpen = isOpenPainCase(left) ? 0 : 1;
      const rightOpen = isOpenPainCase(right) ? 0 : 1;
      if (leftOpen !== rightOpen) return leftOpen - rightOpen;
      return left.title.localeCompare(right.title, 'pt-BR');
    });
  }, [currentRecord]);
  const activeCount = painCases.filter(isOpenPainCase).length;

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);
    setSuccess(null);

    prontuarioService
      .overview(alunoId)
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setFollowUpDrafts({});
        setStatusDrafts({});
      })
      .catch((err: any) => {
        if (!active) return;
        setError(
          err?.response?.data?.error ||
            'Não foi possível carregar os acompanhamentos de dor.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [alunoId]);

  const updateFollowUpDraft = (caseId: string, patch: Partial<FollowUpDraft>) => {
    setFollowUpDrafts((current) => ({
      ...current,
      [caseId]: {
        ...(current[caseId] || buildEmptyFollowUp()),
        ...patch,
      },
    }));
    setSuccess(null);
  };

  const saveCaseFollowUp = async (caseItem: ProntuarioPainCase) => {
    if (!currentRecord) {
      setError('Crie ou carregue um registro PRNT antes de acompanhar dores.');
      return;
    }

    const draft = followUpDrafts[caseItem.id];
    const intensity = draft?.intensity.trim() ? Number(draft.intensity) : null;

    if (intensity !== null && (!Number.isFinite(intensity) || intensity < 0 || intensity > 10)) {
      setError('Informe uma intensidade entre 0 e 10.');
      return;
    }

    setSavingCaseId(caseItem.id);
    setError(null);
    setSuccess(null);

    try {
      const payload = currentRecord.painCases.map((item) => {
        const shouldAppendFollowUp = item.id === caseItem.id && hasFollowUpContent(draft);
        const nextFollowUps = shouldAppendFollowUp
          ? [
              ...(item.followUps || []),
              {
                followUpAt: draft?.followUpAt || today(),
                intensity,
                notes: draft?.notes.trim() || null,
                conduct: draft?.conduct.trim() || null,
              },
            ]
          : item.followUps || [];

        return {
          id: item.id,
          title: item.title,
          region: item.region || null,
          status: statusDrafts[item.id] || item.status,
          onsetDate: item.onsetDate || null,
          description: item.description || null,
          followUps: nextFollowUps,
        };
      });

      const record = await prontuarioService.savePainCases(currentRecord.id, payload);
      setOverview((current) =>
        current
          ? {
              ...current,
              currentRecord: record,
              records: [record, ...current.records.filter((item) => item.id !== record.id)],
            }
          : current
      );
      setFollowUpDrafts((current) => {
        const next = { ...current };
        delete next[caseItem.id];
        return next;
      });
      setStatusDrafts((current) => {
        const next = { ...current };
        delete next[caseItem.id];
        return next;
      });
      setSuccess(`Acompanhamento de ${caseItem.title} salvo.`);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          'Não foi possível salvar o acompanhamento de dor.'
      );
    } finally {
      setSavingCaseId(null);
    }
  };

  return (
    <Card className="prontuario-follow-up border-primary/30">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Acompanhamento de dores</CardTitle>
            <CardDescription>
              Cadastre o caso no bloco “Casos de dor” acima. Use esta área somente para registrar evolução, conduta e encerramento.
            </CardDescription>
          </div>
          <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {activeCount} em aberto
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div aria-live="polite" className="space-y-2">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
              {success}
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando acompanhamentos...</p>
        ) : null}

        {!loading && !painCases.length ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            Nenhum caso de dor registrado neste PRNT. Use o bloco “Casos de dor” acima para cadastrar o primeiro caso.
          </div>
        ) : null}

        <div className="space-y-3">
          {painCases.map((caseItem) => {
            const draft = followUpDrafts[caseItem.id] || buildEmptyFollowUp();
            const status = statusDrafts[caseItem.id] || caseItem.status;
            const statusChanged = status !== caseItem.status;
            const canSave = statusChanged || hasFollowUpContent(draft);
            const followUps = [...(caseItem.followUps || [])].sort(
              (left, right) =>
                new Date(right.followUpAt).getTime() - new Date(left.followUpAt).getTime()
            );
            const latestFollowUp = followUps[0];

            return (
              <details key={caseItem.id} className="prontuario-follow-up-case rounded-lg border border-border bg-background">
                <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {caseItem.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {caseItem.region || 'Região não informada'} · {painCaseStatusLabel[status]}
                      {latestFollowUp
                        ? ` · último acompanhamento em ${toDateInput(latestFollowUp.followUpAt)}`
                        : ' · sem acompanhamento'}
                    </span>
                  </span>
                  <span className="prontuario-follow-up-chevron" aria-hidden="true">›</span>
                </summary>

                <div className="space-y-5 border-t border-border p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Histórico</h3>
                    {followUps.length ? (
                      <ol className="mt-3 space-y-2">
                        {followUps.map((followUp) => (
                          <li
                            key={followUp.id || `${followUp.followUpAt}-${followUp.notes || ''}`}
                            className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">
                              {toDateInput(followUp.followUpAt)}
                            </span>
                            {followUp.intensity !== null && followUp.intensity !== undefined
                              ? ` · intensidade ${followUp.intensity}/10`
                              : ''}
                            {followUp.notes ? ` · ${followUp.notes}` : ''}
                            {followUp.conduct ? ` · Conduta: ${followUp.conduct}` : ''}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nenhuma evolução registrada para este caso.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      label="Data do acompanhamento"
                      type="date"
                      value={draft.followUpAt}
                      onChange={(event) =>
                        updateFollowUpDraft(caseItem.id, { followUpAt: event.target.value })
                      }
                    />
                    <Input
                      label="Intensidade (0 a 10)"
                      type="number"
                      min="0"
                      max="10"
                      value={draft.intensity}
                      onChange={(event) =>
                        updateFollowUpDraft(caseItem.id, { intensity: event.target.value })
                      }
                    />
                    <Select
                      id={`pain-status-${caseItem.id}`}
                      label="Status do caso"
                      value={status}
                      onChange={(event) => {
                        setStatusDrafts((current) => ({
                          ...current,
                          [caseItem.id]: event.target.value as ProntuarioPainCase['status'],
                        }));
                        setSuccess(null);
                      }}
                    >
                      <option value="active">Ativo</option>
                      <option value="monitoring">Em acompanhamento</option>
                      <option value="resolved">Resolvido</option>
                      <option value="archived">Arquivado</option>
                    </Select>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label htmlFor={`pain-notes-${caseItem.id}`} className="mb-1 block text-sm font-medium text-foreground">
                        Evolução observada
                      </label>
                      <textarea
                        id={`pain-notes-${caseItem.id}`}
                        className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={draft.notes}
                        onChange={(event) =>
                          updateFollowUpDraft(caseItem.id, { notes: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor={`pain-conduct-${caseItem.id}`} className="mb-1 block text-sm font-medium text-foreground">
                        Conduta ou próximo passo
                      </label>
                      <textarea
                        id={`pain-conduct-${caseItem.id}`}
                        className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={draft.conduct}
                        onChange={(event) =>
                          updateFollowUpDraft(caseItem.id, { conduct: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => saveCaseFollowUp(caseItem)}
                      disabled={!canSave || savingCaseId !== null}
                    >
                      {hasFollowUpContent(draft) ? <Activity size={16} /> : <Save size={16} />}
                      {savingCaseId === caseItem.id ? 'Salvando...' : 'Salvar acompanhamento'}
                    </Button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mantém o ponto de entrada histórico da rota e separa cadastro de caso de dor
 * do acompanhamento longitudinal, evitando dois editores concorrentes.
 */
export function ProntuarioScreenWithDiscomfortFollowUps() {
  const [searchParams] = useSearchParams();
  const alunoId = searchParams.get('alunoId') || '';

  return (
    <section
      className="prontuario-workspace space-y-6"
      aria-label="Prontuário de entrevista e acompanhamento"
    >
      <ProntuarioScreen />
      {alunoId ? <PainFollowUpPanel alunoId={alunoId} /> : null}
    </section>
  );
}
