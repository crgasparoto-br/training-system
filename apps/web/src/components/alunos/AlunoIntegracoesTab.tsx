import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type {
  StudentSegmentedActivities,
  StudentSegmentedIntegrations,
} from '../../services/aluno.service';

type AlunoIntegracoesTabProps = {
  integrations?: StudentSegmentedIntegrations | null;
  activities?: StudentSegmentedActivities | null;
};

const connectionStatusLabel: Record<string, string> = {
  connected: 'Conectada',
  pending: 'Pendente',
  disconnected: 'Desconectada',
  expired: 'Expirada',
  failed: 'Falha na conexão',
};

export function AlunoIntegracoesTab({
  integrations,
  activities,
}: AlunoIntegracoesTabProps) {
  const accounts = integrations?.accounts ?? [];
  const importedActivities = activities?.activities ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Integrações e apps</CardTitle>
          <CardDescription>
            Contas conectadas e atividades importadas ficam separadas do cadastro e das avaliações profissionais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Contas conectadas</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {integrations?.total ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Atividades importadas</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {activities?.total ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Última sincronização</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {integrations?.lastSyncAt ? formatDateBR(integrations.lastSyncAt) : 'Sem sincronização'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 text-sm font-semibold text-gray-900">Contas conectadas</div>
            {accounts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma integração conectada para este aluno até o momento.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {account.provider}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {connectionStatusLabel[account.connectionStatus] || account.connectionStatus}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Última sincronização: {account.lastSyncAt ? formatDateBR(account.lastSyncAt) : 'Não registrada'}
                    </div>
                    {account.externalUserId && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Usuário externo: {account.externalUserId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 text-sm font-semibold text-gray-900">Atividades importadas</div>
            {importedActivities.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma atividade sincronizada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted text-left text-xs uppercase text-gray-600">
                      <th className="px-2 py-2">Provedor</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Data</th>
                      <th className="px-2 py-2">Distância</th>
                      <th className="px-2 py-2">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedActivities.map((activity) => (
                      <tr key={activity.id} className="border-b last:border-b-0">
                        <td className="px-2 py-2 font-medium text-gray-900">{activity.provider}</td>
                        <td className="px-2 py-2 text-gray-700">{activity.activityType || 'Não informado'}</td>
                        <td className="px-2 py-2 text-gray-700">
                          {activity.startedAt ? formatDateBR(activity.startedAt) : 'Sem data'}
                        </td>
                        <td className="px-2 py-2 text-gray-700">
                          {activity.distanceMeters != null
                            ? `${(activity.distanceMeters / 1000).toLocaleString('pt-BR', {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 2,
                              })} km`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-gray-700">
                          {activity.durationSeconds != null
                            ? `${Math.floor(activity.durationSeconds / 60)} min`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
