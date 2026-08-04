import { CheckCircle2, History } from 'lucide-react';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentStatus,
  AdipometryAssessmentSummary,
  AdipometryCalculationPreview,
} from '@corrida/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import type { AdipometryAnthropometrySupport } from '../../services/adipometry.service';

export const nav = [
  ['antropometria', 'Antropometria'],
  ['prontuario-entrevista-acompanhamento', 'Prontuário'],
  ['adipometria', 'Adipometria'],
  ['bioimpedanciometria', 'Bioimpedanciometria'],
  ['ultrassonografia', 'Ultrassonografia'],
] as const;

function dateLabel(value?: string) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function numberLabel(value: number | undefined, unit: string) {
  return value === undefined ? '—' : `${String(value).replace('.', ',')} ${unit}`;
}

export function adipometryRevisionStatusLabel(status: AdipometryAssessmentStatus): string {
  const labels: Record<AdipometryAssessmentStatus, string> = {
    DRAFT: 'Rascunho',
    FINALIZED: 'Concluída',
    SUPERSEDED: 'Substituída',
    CANCELLED: 'Cancelada',
    VOIDED: 'Invalidada',
  };
  return labels[status];
}

export function messageClass(tone: 'error' | 'success' | 'warning') {
  if (tone === 'error') return 'border-destructive/40 bg-destructive/10 text-destructive';
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-950';
  return 'border-amber-300 bg-amber-50 text-amber-950';
}

export function StepStrip({ detail, preview, selectedStudent }: {
  detail: AdipometryAssessmentDetail | null;
  preview: AdipometryCalculationPreview | null;
  selectedStudent: boolean;
}) {
  const steps = [
    ['1. Aluno', selectedStudent, 'Selecione o aluno que será avaliado.'],
    ['2. Rascunho', Boolean(detail), 'Crie ou abra um rascunho persistido.'],
    ['3. Coleta', Boolean(detail && Object.keys(detail.measurements).length), 'Registre peso, dobras e decisão clínica.'],
    ['4. Prévia', Boolean(preview), 'Calcule e revise o resultado autoritativo.'],
    ['5. Conclusão', detail?.revisionStatus === 'FINALIZED', 'Conclua ou crie uma revisão de correção.'],
  ] as const;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {steps.map(([title, done, description], index) => {
        const current = !done && steps.slice(0, index).every((step) => step[1]);
        return (
          <div key={title} className={`rounded-lg border p-3 ${done ? 'border-emerald-200 bg-emerald-50' : current ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {done ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : null}
              {title}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        );
      })}
    </div>
  );
}

export function Results({ preview, detail }: { preview: AdipometryCalculationPreview | null; detail: AdipometryAssessmentDetail | null }) {
  const results = preview?.results ?? detail?.results;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultado calculado</CardTitle>
        <CardDescription>Somente leitura. Os valores são produzidos pela API com o protocolo aprovado.</CardDescription>
      </CardHeader>
      <CardContent>
        {results ? (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Soma das dobras', numberLabel(results.skinfoldTotalMm, 'mm')],
              ['Gordura corporal', numberLabel(results.bodyFatPercentage, '%')],
              ['Massa de gordura', numberLabel(results.fatMassKg, 'kg')],
              ['Massa magra', numberLabel(results.leanMassKg, 'kg')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-muted/20 p-4">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            Salve o rascunho e calcule a prévia para visualizar os resultados.
          </div>
        )}
        {preview?.compatibility.reasons.length ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Pendências que impedem a conclusão</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{preview.compatibility.reasons.map((item) => <li key={`${item.code}-${item.field ?? ''}`}>{item.message}</li>)}</ul>
          </div>
        ) : null}
        {preview?.compatibility.warnings.length ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Alertas do protocolo</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{preview.compatibility.warnings.map((item) => <li key={`${item.code}-${item.field ?? ''}`}>{item.message}</li>)}</ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SupportCard({
  support,
  selectedId,
  disabled,
  onSelect,
}: {
  support: AdipometryAnthropometrySupport | null;
  selectedId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const record = support?.selected ?? support?.latestEligible ?? null;
  const find = (terms: string[]) => record?.measurements.find((item) => {
    const searchable = `${item.segmentName} ${item.technicalDescription ?? ''} ${item.formulaHint ?? ''}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  const triceps = find(['olecr']) ?? find(['braco']) ?? find(['tricip']);
  const thigh = find(['ligamento', 'patela']) ?? find(['coxa']);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Antropometria de apoio</CardTitle>
        <CardDescription>Vínculo opcional para conferência consciente. Nenhum resultado é copiado automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {record ? (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <p className="font-semibold">{record.assessmentCode} · {dateLabel(record.assessmentDate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Fonte antropométrica elegível para a data da ADPT.</p>
              {triceps ? <p className="mt-2">Referência tricipital: {triceps.value ?? '—'} {triceps.unit}</p> : null}
              {thigh ? <p>Referência da coxa: {thigh.value ?? '—'} {thigh.unit}</p> : null}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedId === record.anthropometryAssessmentId}
                disabled={disabled}
                onChange={(event) => onSelect(event.target.checked ? record.anthropometryAssessmentId : '')}
              />
              Vincular esta antropometria à avaliação ADPT
            </label>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhuma antropometria elegível foi encontrada. A coleta ADPT continua disponível.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function HistoryPanel({
  assessments,
  activeId,
  onOpen,
}: {
  assessments: AdipometryAssessmentSummary[];
  activeId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" aria-hidden="true" />Histórico</CardTitle>
        <CardDescription>Rascunhos e revisões do aluno.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {assessments.length ? assessments.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className={`w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.id === activeId ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{item.code} · R{item.revisionNumber}</span>
              <span className="text-xs text-muted-foreground">{adipometryRevisionStatusLabel(item.revisionStatus)}</span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{dateLabel(item.assessmentDate)} · {item.protocolCode ? `${item.protocolCode} v${item.protocolVersion}` : 'protocolo pendente'}</span>
          </button>
        )) : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma avaliação ADPT.</p>}
      </CardContent>
    </Card>
  );
}
