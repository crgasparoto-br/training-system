import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryComparison,
  AdipometryComparisonItem,
} from '@corrida/types';
import { canAccessBlock } from '../../access/access-control';
import { canMutateAdipometryAssessment } from '../../access/adipometry-mutation-access';
import { adipometryService } from '../../services/adipometry.service';
import type { Assessment } from '../../services/assessment.service';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatDateBR } from '../../utils/date';
import { Button, buttonClassName } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';

type HistoryFilter = 'all' | 'adpt' | 'other';

type AlunoAdipometryEvolutionCardProps = {
  alunoId: string;
  assessments: Assessment[];
};

type UnifiedHistoryItem = {
  id: string;
  kind: 'adpt' | 'other';
  title: string;
  code: string;
  performedAt: string;
  responsibleName: string;
  state: string;
  protocol: string;
  origin: string;
  detailPath?: string;
};

type ComparisonMetric = {
  label: string;
  unit: string;
  read: (item: AdipometryComparisonItem) => number | undefined;
  readDelta: (comparison: AdipometryComparison) => number | undefined;
};

const comparisonMetrics: ComparisonMetric[] = [
  {
    label: 'Peso',
    unit: 'kg',
    read: (item) => item.measurements.weightKg,
    readDelta: (comparison) => comparison.deltas?.weightKg,
  },
  {
    label: 'Dobra tricipital',
    unit: 'mm',
    read: (item) => item.measurements.tricepsMm,
    readDelta: (comparison) => comparison.deltas?.tricepsMm,
  },
  {
    label: 'Dobra subescapular',
    unit: 'mm',
    read: (item) => item.measurements.subscapularMm,
    readDelta: (comparison) => comparison.deltas?.subscapularMm,
  },
  {
    label: 'Dobra suprailíaca',
    unit: 'mm',
    read: (item) => item.measurements.suprailiacMm,
    readDelta: (comparison) => comparison.deltas?.suprailiacMm,
  },
  {
    label: 'Dobra abdominal',
    unit: 'mm',
    read: (item) => item.measurements.abdominalMm,
    readDelta: (comparison) => comparison.deltas?.abdominalMm,
  },
  {
    label: 'Dobra da coxa',
    unit: 'mm',
    read: (item) => item.measurements.thighMm,
    readDelta: (comparison) => comparison.deltas?.thighMm,
  },
  {
    label: 'Total das dobras',
    unit: 'mm',
    read: (item) => item.results.skinfoldTotalMm,
    readDelta: (comparison) => comparison.deltas?.skinfoldTotalMm,
  },
  {
    label: 'Percentual de gordura',
    unit: '%',
    read: (item) => item.results.bodyFatPercentage,
    readDelta: (comparison) => comparison.deltas?.bodyFatPercentage,
  },
  {
    label: 'Gordura absoluta',
    unit: 'kg',
    read: (item) => item.results.fatMassKg,
    readDelta: (comparison) => comparison.deltas?.fatMassKg,
  },
  {
    label: 'Massa magra',
    unit: 'kg',
    read: (item) => item.results.leanMassKg,
    readDelta: (comparison) => comparison.deltas?.leanMassKg,
  },
];

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareByAssessmentDate(
  left: Pick<AdipometryAssessmentSummary, 'assessmentDate' | 'createdAt' | 'id'>,
  right: Pick<AdipometryAssessmentSummary, 'assessmentDate' | 'createdAt' | 'id'>
): number {
  return (
    timestamp(right.assessmentDate) - timestamp(left.assessmentDate)
    || timestamp(right.createdAt) - timestamp(left.createdAt)
    || right.id.localeCompare(left.id)
  );
}

function formatNumber(value: number | undefined, unit: string): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'Indisponível';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit}`;
}

function formatDelta(value: number | undefined, unit: string): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'Indisponível';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit}`;
}

function protocolLabel(assessment: AdipometryAssessmentSummary): string {
  if (!assessment.protocolCode || !assessment.protocolVersion) return 'Protocolo indisponível';
  return `${assessment.protocolCode} v${assessment.protocolVersion}`;
}

function correctionStateLabel(assessment: AdipometryAssessmentSummary): string | null {
  if (assessment.revisionStatus !== 'FINALIZED' || assessment.revisionNumber <= 1) return null;
  return `Avaliação corrigida — revisão ${assessment.revisionNumber} vigente`;
}

function revisionStateLabel(assessment: AdipometryAssessmentSummary): string {
  if (assessment.revisionStatus === 'FINALIZED') {
    return correctionStateLabel(assessment) ?? 'Concluída';
  }
  if (assessment.revisionStatus === 'SUPERSEDED') return 'Substituída';
  if (assessment.revisionStatus === 'CANCELLED') return 'Cancelada';
  if (assessment.revisionStatus === 'VOIDED') return 'Invalidada';
  return 'Rascunho';
}

function isCurrentCompleted(assessment: AdipometryAssessmentSummary): boolean {
  return assessment.status === 'COMPLETED' && assessment.revisionStatus === 'FINALIZED';
}

function isOperationalDraft(assessment: AdipometryAssessmentSummary): boolean {
  return assessment.status === 'DRAFT' && assessment.revisionStatus === 'DRAFT';
}

function assessmentPath(alunoId: string, assessmentId: string): string {
  return `/protocolo-avaliacao-fisica/adipometria?alunoId=${encodeURIComponent(alunoId)}&assessmentId=${encodeURIComponent(assessmentId)}`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function AlunoAdipometryEvolutionCard({
  alunoId,
  assessments,
}: AlunoAdipometryEvolutionCardProps) {
  const user = useAuthStore((state) => state.user);
  const canViewAssessments = canAccessBlock(user, 'students.details.assessments');
  const canViewAdipometry = canAccessBlock(user, 'physicalAssessment.adpt.view');
  const canManageAdipometry = canAccessBlock(user, 'physicalAssessment.adpt.actions.manage');
  const canCorrectAdipometry = canAccessBlock(
    user,
    'physicalAssessment.adpt.actions.correctCompleted'
  );
  const canLoadAdipometry = canViewAssessments && canViewAdipometry;

  const [adipometryAssessments, setAdipometryAssessments] = useState<AdipometryAssessmentSummary[]>([]);
  const [latestDetail, setLatestDetail] = useState<AdipometryAssessmentDetail | null>(null);
  const [responsibleNames, setResponsibleNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<string[]>([]);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [comparison, setComparison] = useState<AdipometryComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const comparisonRequestIdRef = useRef(0);

  const completedAssessments = useMemo(
    () => adipometryAssessments.filter(isCurrentCompleted).sort(compareByAssessmentDate),
    [adipometryAssessments]
  );
  const drafts = useMemo(
    () => adipometryAssessments
      .filter(isOperationalDraft)
      .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt) || right.id.localeCompare(left.id)),
    [adipometryAssessments]
  );
  const actionableDrafts = useMemo(
    () => drafts.filter((draft) => canMutateAdipometryAssessment(draft, {
      canManage: canManageAdipometry,
      canCorrectCompleted: canCorrectAdipometry,
    })),
    [canCorrectAdipometry, canManageAdipometry, drafts]
  );

  const loadAdipometry = useCallback(async () => {
    if (!canLoadAdipometry) return;

    const requestId = ++loadRequestIdRef.current;
    comparisonRequestIdRef.current += 1;
    setComparison(null);
    setComparisonLoading(false);
    setComparisonError(null);
    setLoading(true);
    setError(null);

    try {
      const [loadedAssessments, responsibleDirectory] = await Promise.all([
        adipometryService.listAssessments(alunoId),
        adipometryService.listResponsibleProfessors().catch(() => []),
      ]);
      if (requestId !== loadRequestIdRef.current) return;

      const sorted = [...loadedAssessments].sort(compareByAssessmentDate);
      const completed = sorted.filter(isCurrentCompleted);
      const latest = completed[0] ?? null;
      const detail = latest ? await adipometryService.getAssessment(latest.id) : null;
      if (requestId !== loadRequestIdRef.current) return;

      setAdipometryAssessments(sorted);
      setLatestDetail(detail);
      setResponsibleNames(
        Object.fromEntries(responsibleDirectory.map((responsible) => [responsible.id, responsible.name]))
      );
    } catch {
      if (requestId !== loadRequestIdRef.current) return;
      setAdipometryAssessments([]);
      setLatestDetail(null);
      setResponsibleNames({});
      setComparison(null);
      setError('Não foi possível carregar a adipometria deste aluno. As demais áreas da Central continuam disponíveis.');
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [alunoId, canLoadAdipometry]);

  useEffect(() => {
    void loadAdipometry();
  }, [loadAdipometry, refreshToken]);

  useEffect(() => {
    if (canLoadAdipometry) return;

    loadRequestIdRef.current += 1;
    comparisonRequestIdRef.current += 1;
    setAdipometryAssessments([]);
    setLatestDetail(null);
    setResponsibleNames({});
    setLoading(false);
    setError(null);
    setHistoryFilter('all');
    setSelectedAssessmentIds([]);
    setSelectionNotice(null);
    setComparison(null);
    setComparisonLoading(false);
    setComparisonError(null);
  }, [canLoadAdipometry]);

  useEffect(() => () => {
    loadRequestIdRef.current += 1;
    comparisonRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    const availableIds = new Set(completedAssessments.map((item) => item.id));
    const validSelection = selectedAssessmentIds.filter((id) => availableIds.has(id));
    if (validSelection.length === selectedAssessmentIds.length) return;

    comparisonRequestIdRef.current += 1;
    setComparisonLoading(false);
    setSelectedAssessmentIds(validSelection);
    setSelectionNotice('Uma avaliação selecionada deixou de estar disponível e foi removida da comparação.');
    setComparison(null);
  }, [completedAssessments, selectedAssessmentIds]);

  useEffect(() => {
    if (!canLoadAdipometry || typeof window === 'undefined' || typeof document === 'undefined') return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setRefreshToken((value) => value + 1);
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [canLoadAdipometry]);

  const unifiedHistory = useMemo<UnifiedHistoryItem[]>(() => {
    const structured: UnifiedHistoryItem[] = canViewAdipometry
      ? completedAssessments.map((assessment) => ({
        id: `adpt-${assessment.id}`,
        kind: 'adpt',
        title: 'Adipometria',
        code: assessment.code,
        performedAt: assessment.assessmentDate,
        responsibleName: responsibleNames[assessment.professorId] ?? 'Responsável não disponível',
        state: revisionStateLabel(assessment),
        protocol: protocolLabel(assessment),
        origin: 'Avaliação estruturada ADPT',
        detailPath: assessmentPath(alunoId, assessment.id),
      }))
      : [];
    const uploads: UnifiedHistoryItem[] = assessments.map((assessment) => ({
      id: `upload-${assessment.id}`,
      kind: 'other',
      title: assessment.type?.name || 'Avaliação física',
      code: assessment.type?.code || 'UPLOAD',
      performedAt: assessment.assessmentDate,
      responsibleName: assessment.professional?.user?.profile?.name || 'Responsável não informado',
      state: 'Registrada',
      protocol: 'Não se aplica',
      origin: assessment.originalFileName ? 'Upload genérico' : 'Registro de avaliação',
    }));

    return [...structured, ...uploads].sort((left, right) => (
      timestamp(right.performedAt) - timestamp(left.performedAt) || right.id.localeCompare(left.id)
    ));
  }, [alunoId, assessments, canViewAdipometry, completedAssessments, responsibleNames]);

  const filteredHistory = historyFilter === 'all'
    ? unifiedHistory
    : unifiedHistory.filter((item) => item.kind === historyFilter);

  const latestSummary = completedAssessments[0] ?? null;
  const latestResponsible = latestSummary
    ? responsibleNames[latestSummary.professorId] ?? 'Responsável não disponível'
    : 'Responsável não disponível';
  const latestCorrectionState = latestSummary ? correctionStateLabel(latestSummary) : null;
  const latestResults = latestDetail?.results;
  const latestMeasurements = latestDetail?.measurements;
  const newAdipometryPath = `/protocolo-avaliacao-fisica/adipometria?alunoId=${encodeURIComponent(alunoId)}`;

  const toggleComparisonSelection = (assessmentId: string) => {
    comparisonRequestIdRef.current += 1;
    setComparisonLoading(false);
    setSelectionNotice(null);
    setComparison(null);
    setComparisonError(null);
    setSelectedAssessmentIds((previous) => {
      if (previous.includes(assessmentId)) return previous.filter((id) => id !== assessmentId);
      if (previous.length >= 2) {
        setSelectionNotice('Selecione no máximo duas avaliações para comparar.');
        return previous;
      }
      return [...previous, assessmentId];
    });
  };

  const compareSelected = async () => {
    if (selectedAssessmentIds.length !== 2) return;

    const requestId = ++comparisonRequestIdRef.current;
    const assessmentIds = [...selectedAssessmentIds];
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const loaded = await adipometryService.compare(alunoId, assessmentIds);
      if (requestId !== comparisonRequestIdRef.current) return;
      setComparison(loaded);
    } catch {
      if (requestId !== comparisonRequestIdRef.current) return;
      setComparison(null);
      setComparisonError('Não foi possível comparar as avaliações selecionadas. Revise a seleção e tente novamente.');
    } finally {
      if (requestId === comparisonRequestIdRef.current) setComparisonLoading(false);
    }
  };

  if (!canViewAssessments || (!canViewAdipometry && assessments.length === 0)) return null;

  const protocolsDiffer = Boolean(
    comparison?.previous
      && (
        comparison.previous.assessment.protocolCode !== comparison.current.assessment.protocolCode
        || comparison.previous.assessment.protocolVersion !== comparison.current.assessment.protocolVersion
      )
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>
              {canViewAdipometry ? 'Adipometria e evolução ADPT' : 'Avaliações físicas'}
            </CardTitle>
            <CardDescription>
              {canViewAdipometry
                ? 'Consulte o último resultado vigente, retome pendências autorizadas e compare avaliações concluídas sem misturar ADPT com uploads ou Antropometria.'
                : 'Consulte as avaliações e os uploads autorizados deste aluno.'}
            </CardDescription>
          </div>
          {canViewAdipometry && canManageAdipometry && (
            <Link to={newAdipometryPath} className={buttonClassName({ size: 'sm' })}>
              Nova adipometria
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {canViewAdipometry && (
          loading ? (
            <div role="status" className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Carregando adipometria do aluno…
            </div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p>{error}</p>
              <Button className="mt-3" variant="outline" size="sm" onClick={() => setRefreshToken((value) => value + 1)}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              {latestSummary && latestDetail ? (
                <section aria-labelledby="adpt-latest-title" className="rounded-lg border border-border bg-muted/10 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 id="adpt-latest-title" className="text-sm font-semibold text-foreground">Última adipometria concluída</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateBR(latestSummary.assessmentDate)} • {latestSummary.code} • {latestResponsible} • {protocolLabel(latestSummary)}
                      </p>
                      {latestCorrectionState && (
                        <p className="mt-2 text-xs font-semibold text-foreground">
                          {latestCorrectionState}
                        </p>
                      )}
                    </div>
                    <Link
                      to={assessmentPath(alunoId, latestSummary.id)}
                      className={buttonClassName({ variant: 'outline', size: 'sm' })}
                    >
                      Abrir detalhe
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard label="Peso" value={formatNumber(latestMeasurements?.weightKg, 'kg')} />
                    <MetricCard label="Percentual de gordura" value={formatNumber(latestResults?.bodyFatPercentage, '%')} />
                    <MetricCard label="Gordura absoluta" value={formatNumber(latestResults?.fatMassKg, 'kg')} />
                    <MetricCard label="Massa magra" value={formatNumber(latestResults?.leanMassKg, 'kg')} />
                  </div>
                </section>
              ) : (
                <section aria-labelledby="adpt-empty-title" className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
                  <h3 id="adpt-empty-title" className="text-sm font-semibold text-foreground">Nenhuma adipometria concluída</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A ausência de ADPT não impede o uso das demais avaliações e áreas da Central do Aluno.
                  </p>
                </section>
              )}

              {actionableDrafts.length > 0 && (
                <details className="rounded-lg border border-amber-200 bg-amber-50/50" open>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
                    Pendências operacionais ({actionableDrafts.length})
                  </summary>
                  <div className="space-y-3 border-t border-amber-200 px-4 py-4">
                    {actionableDrafts.map((draft) => (
                      <div key={draft.id} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{draft.code} • Rascunho</p>
                          <p className="mt-1 text-xs text-muted-foreground">Atualizado em {formatDateBR(draft.updatedAt)}</p>
                        </div>
                        <Link
                          to={assessmentPath(alunoId, draft.id)}
                          className={buttonClassName({ variant: 'outline', size: 'sm' })}
                        >
                          Retomar rascunho
                        </Link>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )
        )}

        <details className="rounded-lg border border-border bg-background" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
            Histórico unificado
          </summary>
          <div className="border-t border-border px-4 py-4">
            <div className="mb-4 flex flex-col gap-2 sm:max-w-xs">
              <label htmlFor="adpt-history-filter" className="text-sm font-medium text-foreground">Filtrar por tipo</label>
              <select
                id="adpt-history-filter"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={historyFilter}
                onChange={(event) => setHistoryFilter(event.target.value as HistoryFilter)}
              >
                <option value="all">Todas as avaliações</option>
                {canViewAdipometry && <option value="adpt">Adipometria estruturada</option>}
                <option value="other">Outras avaliações e uploads</option>
              </select>
            </div>
            {filteredHistory.length > 0 ? (
              <div className="space-y-3">
                {filteredHistory.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border bg-muted/10 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title} • {item.code}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateBR(item.performedAt)} • {item.responsibleName} • {item.state}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.protocol} • Origem: {item.origin}</p>
                      </div>
                      {item.detailPath && (
                        <Link
                          to={item.detailPath}
                          className={buttonClassName({ variant: 'outline', size: 'sm' })}
                        >
                          Abrir avaliação
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Nenhum item corresponde ao filtro selecionado.
              </p>
            )}
          </div>
        </details>

        {canViewAdipometry && !loading && !error && (
          <details className="rounded-lg border border-border bg-background" open>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
              Comparação evolutiva ADPT
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
              <p className="text-sm text-muted-foreground">
                Selecione duas avaliações concluídas. Rascunhos, outros tipos e registros inacessíveis não podem participar da comparação.
              </p>
              {completedAssessments.length >= 2 ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-foreground">Avaliações disponíveis</legend>
                  {completedAssessments.map((assessment) => (
                    <label key={assessment.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedAssessmentIds.includes(assessment.id)}
                        onChange={() => toggleComparisonSelection(assessment.id)}
                      />
                      <span className="text-sm text-foreground">
                        <span className="font-semibold">{assessment.code}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDateBR(assessment.assessmentDate)} • {protocolLabel(assessment)} • {revisionStateLabel(assessment)}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  São necessárias pelo menos duas adipometrias concluídas e vigentes para comparar.
                </p>
              )}

              {selectionNotice && <p role="status" className="text-sm text-amber-700">{selectionNotice}</p>}
              {comparisonError && <p role="alert" className="text-sm text-red-700">{comparisonError}</p>}

              {completedAssessments.length >= 2 && (
                <Button
                  type="button"
                  onClick={() => void compareSelected()}
                  disabled={selectedAssessmentIds.length !== 2 || comparisonLoading}
                >
                  {comparisonLoading ? 'Comparando…' : 'Comparar avaliações selecionadas'}
                </Button>
              )}

              {comparison?.previous && (
                <div className="space-y-3">
                  {protocolsDiffer && (
                    <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Os protocolos ou versões são diferentes. A comparação é limitada e os valores persistidos foram mantidos sem recálculo.
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                      <caption className="sr-only">
                        Comparação de duas adipometrias concluídas com valores absolutos e variação entre avaliações.
                      </caption>
                      <thead className="bg-muted/40">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">Medida</th>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            {comparison.previous.assessment.code}<br />
                            <span className="text-xs font-normal text-muted-foreground">
                              {formatDateBR(comparison.previous.assessment.assessmentDate)} • {protocolLabel(comparison.previous.assessment)}
                            </span>
                          </th>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            {comparison.current.assessment.code}<br />
                            <span className="text-xs font-normal text-muted-foreground">
                              {formatDateBR(comparison.current.assessment.assessmentDate)} • {protocolLabel(comparison.current.assessment)}
                            </span>
                          </th>
                          <th scope="col" className="px-3 py-2 font-semibold">Variação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonMetrics.map((metric) => (
                          <tr key={metric.label} className="border-t border-border">
                            <th scope="row" className="px-3 py-2 font-medium text-foreground">{metric.label}</th>
                            <td className="px-3 py-2">{formatNumber(metric.read(comparison.previous as AdipometryComparisonItem), metric.unit)}</td>
                            <td className="px-3 py-2">{formatNumber(metric.read(comparison.current), metric.unit)}</td>
                            <td className="px-3 py-2">{formatDelta(metric.readDelta(comparison), metric.unit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    As variações são apresentadas sem classificar melhora ou piora.
                  </p>
                </div>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
