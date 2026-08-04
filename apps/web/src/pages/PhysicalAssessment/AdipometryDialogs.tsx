import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ExternalLink, X } from 'lucide-react';
import type {
  AdipometryCalculatedResults,
  AdipometryCorrectionCategory,
} from '@corrida/types';
import { Button } from '../../components/ui/Button';
import type { AdipometrySkinfoldHelp } from './adipometry-ui';

export function AccessibleDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current
      ?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ?.focus();
    return () => previousFocus.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adpt-dialog-title"
        aria-describedby={description ? 'adpt-dialog-description' : undefined}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-card shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="adpt-dialog-title" className="text-lg font-semibold text-foreground">{title}</h2>
            {description ? <p id="adpt-dialog-description" className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Fechar" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function SkinfoldHelpDialog({ item, onClose }: { item: AdipometrySkinfoldHelp; onClose: () => void }) {
  return (
    <AccessibleDialog title={item.label} description="Referência técnica para a coleta da dobra cutânea." onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-6 text-foreground">{item.description}</p>
        {item.imageUrl ? (
          <img className="max-h-80 w-full rounded-lg object-contain" src={item.imageUrl} alt={`Referência anatômica para ${item.label}`} />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            A referência visual é opcional e ainda não foi cadastrada.
          </div>
        )}
        <a
          href={item.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Abrir vídeo de referência
        </a>
      </div>
    </AccessibleDialog>
  );
}

export function FinalizeDialog({
  studentName,
  date,
  protocol,
  responsible,
  results,
  busy,
  onClose,
  onConfirm,
}: {
  studentName: string;
  date: string;
  protocol: string;
  responsible: string;
  results: AdipometryCalculatedResults;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const value = (number: number, unit: string) => `${String(number).replace('.', ',')} ${unit}`;
  return (
    <AccessibleDialog
      title="Confirmar conclusão da ADPT"
      description="Depois da conclusão, o registro fica somente leitura. Correções geram uma nova revisão."
      onClose={onClose}
    >
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['Aluno', studentName],
            ['Data', date],
            ['Responsável', responsible],
            ['Protocolo', protocol],
            ['Gordura corporal', value(results.bodyFatPercentage, '%')],
            ['Massa magra', value(results.leanMassKg, 'kg')],
          ].map(([label, content]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold text-foreground">{content}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Voltar e revisar</Button>
          <Button type="button" onClick={onConfirm} isLoading={busy} disabled={busy}>Confirmar conclusão</Button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

const categories: Array<{ value: AdipometryCorrectionCategory; label: string }> = [
  { value: 'DATA_ENTRY_ERROR', label: 'Erro de digitação' },
  { value: 'MEASUREMENT_TRANSCRIPTION_ERROR', label: 'Erro de transcrição da medida' },
  { value: 'EVALUATION_DATE_ERROR', label: 'Erro na data da avaliação' },
  { value: 'PROTOCOL_SEX_ERROR', label: 'Erro no sexo de referência' },
  { value: 'PROTOCOL_SELECTION_ERROR', label: 'Erro na seleção do protocolo' },
  { value: 'OTHER', label: 'Outro motivo' },
];

export function CorrectionDialog({
  category,
  reason,
  busy,
  onCategory,
  onReason,
  onClose,
  onConfirm,
}: {
  category: AdipometryCorrectionCategory;
  reason: string;
  busy: boolean;
  onCategory: (value: AdipometryCorrectionCategory) => void;
  onReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AccessibleDialog title="Iniciar correção" description="A avaliação concluída será preservada e uma nova revisão será criada." onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="adpt-correction-category" className="mb-2 block text-sm font-medium">Categoria</label>
          <select
            id="adpt-correction-category"
            value={category}
            onChange={(event) => onCategory(event.target.value as AdipometryCorrectionCategory)}
            className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="adpt-correction-reason" className="mb-2 block text-sm font-medium">Motivo</label>
          <textarea
            id="adpt-correction-reason"
            rows={4}
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            placeholder="Explique por que a avaliação precisa ser corrigida."
            className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={onConfirm} isLoading={busy} disabled={busy || reason.trim().length < 10}>Criar revisão</Button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
