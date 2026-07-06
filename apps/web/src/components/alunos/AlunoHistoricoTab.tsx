import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type { StudentSegmentedTimeline, StudentTimelineEvent } from '../../services/aluno.service';

type AlunoHistoricoTabProps = {
  timeline?: StudentSegmentedTimeline | null;
};

type EventCategory = 'all' | 'profile' | 'health' | 'assessment' | 'financial' | 'integration' | 'system';

const eventTypeLabel: Record<string, string> = {
  student_created: 'Cadastro criado',
  profile_created: 'Cadastro registrado',
  profile_updated: 'Cadastro atualizado',
  intake_recorded: 'PRNT registrado',
  intake_updated: 'PRNT atualizado',
  assessment_recorded: 'Avaliação registrada',
  financial_contract_created: 'Contrato criado',
  financial_contract_started: 'Contrato iniciado',
  financial_contract_signed: 'Contrato assinado',
  financial_contract_canceled: 'Contrato cancelado',
  financial_contract_active: 'Contrato ativo',
  integration_connected: 'Integração conectada',
  integration_synchronized: 'Integração sincronizada',
  external_activity_imported: 'Atividade importada',
};

const sourceTypeLabel: Record<string, string> = {
  student: 'Aluno',
  professional: 'Profissional',
  integration: 'Integração',
  system: 'Sistema',
};

const categoryLabel: Record<EventCategory, string> = {
  all: 'Todos',
  profile: 'Cadastro',
  health: 'PRNT',
  assessment: 'Avaliações',
  financial: 'Contratos',
  integration: 'Integrações',
  system: 'Sistema',
};

const detailLabel: Record<string, string> = {
  alunoId: 'Aluno',
  status: 'Status',
  serviceName: 'Serviço',
  contractTitle: 'Contrato',
  assessmentDate: 'Data da avaliação',
  assessmentType: 'Tipo de avaliação',
  provider: 'Origem',
  activityType: 'Tipo de atividade',
};

function getEventCategory(type: string): EventCategory {
  if (type.startsWith('profile_') || type === 'student_created') {
    return 'profile';
  }

  if (type.startsWith('intake_')) {
    return 'health';
  }

  if (type.startsWith('assessment_')) {
    return 'assessment';
  }

  if (type.startsWith('financial_')) {
    return 'financial';
  }

  if (type.startsWith('integration_') || type.startsWith('external_activity_')) {
    return 'integration';
  }

  return 'system';
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function sortTimelineEvents(items: StudentTimelineEvent[]) {
  return [...items].sort((a, b) => {
    const timestampA = new Date(a.occurredAt).getTime();
    const timestampB = new Date(b.occurredAt).getTime();
    return timestampB - timestampA;
  });
}

export function AlunoHistoricoTab({ timeline }: AlunoHistoricoTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>('all');
  const sortedItems = useMemo(() => sortTimelineEvents(timeline?.items ?? []), [timeline?.items]);
  const categoryCounts = useMemo(() => {
    return sortedItems.reduce<Record<EventCategory, number>>(
      (counts, item) => {
        const category = getEventCategory(item.type);
        counts.all += 1;
        counts[category] += 1;
        return counts;
      },
      {
        all: 0,
        profile: 0,
        health: 0,
        assessment: 0,
        financial: 0,
        integration: 0,
        system: 0,
      }
    );
  }, [sortedItems]);
  const visibleItems = useMemo(
    () =>
      selectedCategory === 'all'
        ? sortedItems
        : sortedItems.filter((item) => getEventCategory(item.type) === selectedCategory),
    [selectedCategory, sortedItems]
  );
  const categories = Object.keys(categoryLabel) as EventCategory[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>
                Linha do tempo consolidada com origem, categoria e eventos relevantes do acompanhamento do aluno.
              </CardDescription>
            </div>
            <div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {categoryCounts.all} {categoryCounts.all === 1 ? 'evento' : 'eventos'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedItems.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Filtros do histórico">
              {categories.map((category) => {
                const isSelected = selectedCategory === category;
                const count = categoryCounts[category];

                if (category !== 'all' && count === 0) {
                  return null;
                }

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {categoryLabel[category]} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {sortedItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-muted-foreground">
              Nenhum evento consolidado disponível ainda. Quando cadastro, PRNT, avaliações, contratos ou integrações gerarem eventos, eles aparecerão aqui em ordem cronológica.
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-muted-foreground">
              Nenhum evento encontrado para este filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => {
                const category = getEventCategory(item.type);
                const details = item.details ? Object.entries(item.details) : [];

                return (
                  <article key={item.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {categoryLabel[category]}
                          </span>
                          <span className="text-xs uppercase text-muted-foreground">
                            {eventTypeLabel[item.type] || item.type}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">{item.title}</h3>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Origem: {sourceTypeLabel[item.source.type] || item.source.type}
                          {item.source.reference ? ` · ref ${item.source.reference}` : ''}
                          {item.source.recordedByUserId ? ` · usuário ${item.source.recordedByUserId}` : ''}
                        </div>
                      </div>
                      <time className="text-xs text-muted-foreground" dateTime={item.occurredAt}>
                        {formatDateBR(item.occurredAt)}
                      </time>
                    </div>

                    {details.length > 0 && (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {details.map(([key, value]) => (
                          <div key={key} className="rounded-md bg-muted px-3 py-2 text-xs text-gray-700">
                            <span className="font-medium">{detailLabel[key] || key}:</span>{' '}
                            {formatDetailValue(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
