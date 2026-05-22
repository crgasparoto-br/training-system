import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type { StudentSegmentedTimeline } from '../../services/aluno.service';

type AlunoHistoricoTabProps = {
  timeline?: StudentSegmentedTimeline | null;
};

const eventTypeLabel: Record<string, string> = {
  student_created: 'Cadastro criado',
  profile_updated: 'Cadastro atualizado',
  intake_recorded: 'Intake registrado',
  assessment_recorded: 'Avaliação registrada',
  financial_contract_active: 'Contrato ativo',
  integration_connected: 'Integração conectada',
  external_activity_imported: 'Atividade importada',
};

const sourceTypeLabel: Record<string, string> = {
  student: 'Aluno',
  professional: 'Profissional',
  integration: 'Integração',
  system: 'Sistema',
};

export function AlunoHistoricoTab({ timeline }: AlunoHistoricoTabProps) {
  const items = timeline?.items ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            Linha do tempo consolidada com origem dos dados e eventos relevantes do acompanhamento do aluno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-muted-foreground">
              Nenhum evento consolidado disponível ainda para este aluno.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {eventTypeLabel[item.type] || item.type}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">{item.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Origem: {sourceTypeLabel[item.source.type] || item.source.type}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateBR(item.occurredAt)}
                    </div>
                  </div>

                  {item.details && Object.keys(item.details).length > 0 && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {Object.entries(item.details).map(([key, value]) => (
                        <div key={key} className="rounded-md bg-muted px-3 py-2 text-xs text-gray-700">
                          <span className="font-medium">{key}:</span>{' '}
                          {value === null || value === undefined || value === '' ? '—' : String(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
