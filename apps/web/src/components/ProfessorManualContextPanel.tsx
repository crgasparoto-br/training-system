import { useEffect, useMemo, useState } from 'react';
import {
  professorManualContextLabels,
  professorManualFormatLabels,
} from '../constants/professorManual';
import {
  professorManualService,
  type ProfessorManualContext,
  type ProfessorManualFormat,
  type ProfessorManualItem,
} from '../services/professor-manual.service';
import { cn } from '../utils/cn';

const formatMeta: Record<
  ProfessorManualFormat,
  { label: string; badgeClassName: string; cardClassName: string }
> = {
  dica_rapida: {
    label: professorManualFormatLabels.dica_rapida,
    badgeClassName: 'bg-sky-100 text-sky-700',
    cardClassName: 'border-sky-200 bg-sky-50/60',
  },
  alerta: {
    label: professorManualFormatLabels.alerta,
    badgeClassName: 'bg-amber-100 text-amber-700',
    cardClassName: 'border-amber-200 bg-amber-50/70',
  },
  exemplo: {
    label: professorManualFormatLabels.exemplo,
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    cardClassName: 'border-emerald-200 bg-emerald-50/70',
  },
  lembrete_metodo: {
    label: professorManualFormatLabels.lembrete_metodo,
    badgeClassName: 'bg-violet-100 text-violet-700',
    cardClassName: 'border-violet-200 bg-violet-50/70',
  },
  saiba_mais: {
    label: professorManualFormatLabels.saiba_mais,
    badgeClassName: 'bg-slate-200 text-slate-700',
    cardClassName: 'border-slate-200 bg-slate-50',
  },
};

type ProfessorManualContextPanelProps = {
  contexts: ProfessorManualContext[];
  title: string;
  description?: string;
  emptyState?: string;
  className?: string;
  limit?: number;
};

export function ProfessorManualContextPanel({
  contexts,
  title,
  description,
  emptyState = 'Nenhuma orientação contextual cadastrada para este momento.',
  className,
  limit,
}: ProfessorManualContextPanelProps) {
  const [items, setItems] = useState<ProfessorManualItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await professorManualService.list();
        setItems(data);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar o Manual do Professor.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => contexts.includes(item.context));
    return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
  }, [contexts, items, limit]);

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {contexts.map((context) => professorManualContextLabels[context]).join(' + ')}
          </span>
        </div>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Carregando orientações...
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          {emptyState}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const meta = formatMeta[item.format];
            return (
              <article
                key={item.id}
                className={cn('rounded-xl border p-4', meta.cardClassName)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', meta.badgeClassName)}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-slate-500">{item.productArea}</span>
                </div>

                <h4 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.content}</p>

                {item.productMoment ? (
                  <p className="mt-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">Momento:</span> {item.productMoment}
                  </p>
                ) : null}

                {item.frase ? (
                  <div className="mt-3 rounded-lg border border-white/80 bg-white/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Trecho-base do manual
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.frase}</p>
                  </div>
                ) : null}

                {(item.item || item.servicoContratado) ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {[item.item, item.servicoContratado].filter(Boolean).join(' | ')}
                  </p>
                ) : null}

                {item.linkHref ? (
                  <a
                    href={item.linkHref}
                    className="mt-3 inline-flex text-xs font-semibold text-slate-700 underline underline-offset-2"
                  >
                    {item.linkLabel || 'Abrir referência'}
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
