import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import type {
  ConsolidatedCombinedHistoryPreview,
  ConsolidatedCombinedReviewSnapshot,
  PhysicalCapacityType,
} from '@corrida/types';
import { Button } from '../components/ui/Button';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';

const severities = {
  info: 'Informativo',
  warning: 'Atenção',
  critical: 'Crítico — revisão profissional',
} as const;

const labels: Record<PhysicalCapacityType, string> = {
  cyclic: 'Cíclico',
  resisted: 'Resistido',
  flexibility: 'Flexibilidade',
  balance: 'Equilíbrio',
};

type Props = {
  alunoId: string;
  contractId: string | null;
  currentVersion: number | null;
  summary: ConsolidatedCombinedReviewSnapshot | null;
  canReadSensitive: boolean;
  authorizationKey: string;
  dirty: boolean;
};

export function CombinedTrainingReviewPanel({
  alunoId, contractId, currentVersion, summary, canReadSensitive, authorizationKey, dirty,
}: Props) {
  const [historyResponse, setHistoryResponse] = useState<{
    alunoId: string;
    contractId: string | null;
    assemblyVersion: number;
    assemblyVersionId: string;
    authorizationKey: string;
    report: ConsolidatedCombinedHistoryPreview;
  } | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const activeAuthorizationKey = useRef(authorizationKey);
  activeAuthorizationKey.current = authorizationKey;
  const currentSummary = summary?.assemblyVersion === currentVersion ? summary : null;
  const history = historyResponse?.alunoId === alunoId &&
    historyResponse.contractId === contractId &&
    historyResponse.assemblyVersion === currentVersion &&
    historyResponse.assemblyVersionId === currentSummary?.assemblyVersionId &&
    historyResponse.authorizationKey === authorizationKey && canReadSensitive
    ? historyResponse.report : null;

  // Any change of actor, permissions, scope or subject invalidates historical evidence.
  useEffect(() => {
    generation.current += 1;
    setHistoryResponse(null);
    setHistoryError(false);
    setLoading(false);
    return () => { generation.current += 1; };
  }, [alunoId, contractId, currentVersion, currentSummary?.assemblyVersionId, canReadSensitive, authorizationKey]);

  const loadHistory = async () => {
    if (!canReadSensitive || !authorizationKey || !currentSummary || dirty || loading) return;
    const requestId = ++generation.current;
    setHistoryResponse(null);
    setHistoryError(false);
    setLoading(true);
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    try {
      const next = await consolidatedPrescriptionService.getCombinedHistory(
        alunoId, start.toISOString(), end.toISOString()
      );
      if (requestId === generation.current && activeAuthorizationKey.current === authorizationKey) {
        setHistoryResponse({
          alunoId, contractId, assemblyVersion: currentSummary.assemblyVersion,
          assemblyVersionId: currentSummary.assemblyVersionId, authorizationKey, report: next,
        });
      }
    } catch {
      if (requestId === generation.current && activeAuthorizationKey.current === authorizationKey) setHistoryError(true);
    } finally {
      if (requestId === generation.current && activeAuthorizationKey.current === authorizationKey) setLoading(false);
    }
  };

  return (
    <section aria-label="Revisão combinada das capacidades" className="mt-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-sm text-foreground">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">Revisão combinada — avaliação clínica ainda indisponível</p>
          {!currentSummary ? (
            <p className="text-sm text-muted-foreground">
              Salve a montagem e consulte sua versão atual para obter o estado técnico combinado.
            </p>
          ) : (
            <>
              <p>
                {currentSummary.state === 'no_active_rules'
                  ? 'Nenhuma regra clínica combinada está homologada e ativa; não é possível afirmar ausência de conflitos.'
                  : 'Existem regras configuradas, mas faltam horários e evidências suficientes para avaliá-las nesta composição.'}
              </p>
              <p className="text-xs text-muted-foreground">
                Protocolo {currentSummary.protocolVersion} • Versão da montagem v{currentSummary.assemblyVersion}
                {' • '}Cobertura parcial • Nenhuma liberação ou mudança automática é autorizada por esta avaliação.
              </p>
              <div className="flex flex-wrap gap-2" aria-label="Capacidades da revisão combinada">
                {currentSummary.capacitySources.map((source) => (
                  <span key={source.capacityPrescriptionVersionId} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                    {labels[source.capacity]} v{source.capacityVersion}
                  </span>
                ))}
              </div>
              {dirty && (
                <p className="text-xs text-amber-900">
                  Existem alterações locais. A revisão refere-se somente à versão salva no servidor.
                </p>
              )}
              {canReadSensitive ? (
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Evidências históricas: sessões já liberadas pela Montagem nos últimos 30 dias.
                    Não representam o planejamento futuro deste rascunho.
                  </p>
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => { void loadHistory(); }}
                    disabled={dirty || loading} isLoading={loading} loadingText="Consultando..."
                  >
                    <RefreshCcw size={15} aria-hidden="true" />
                    {history ? 'Atualizar evidências históricas' : 'Consultar evidências históricas'}
                  </Button>
                  {historyError && (
                    <p role="alert" className="text-xs text-red-800">
                      Não foi possível consultar as evidências históricas. Nenhum resultado anterior foi considerado válido.
                    </p>
                  )}
                  {history && (
                    <div role="status" className="space-y-2 rounded-md border border-border bg-background p-3">
                      <p className="font-medium">
                        {history.state === 'no_active_rules'
                          ? 'Sem regras combinadas ativas — avaliação histórica não realizada'
                          : 'Resultado técnico das regras combinadas ativas'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {history.releasedSessionCount} sessões liberadas • {history.observationCount} observações por capacidade
                        {' • '}{history.sessionSignalCount} sinais gerais • Cobertura parcial.
                      </p>
                      <p className="text-xs text-muted-foreground">{history.coverageReason}</p>
                      {history.evaluations.map((item) => (
                        <div key={item.ruleCode + ':' + item.ruleVersion} className="rounded-md border border-border p-2 text-xs">
                          <p className="font-semibold">
                            {item.ruleCode} v{item.ruleVersion} — {item.status === 'triggered'
                              ? 'Revisão profissional indicada' : item.status === 'insufficient_data'
                                ? 'Dados insuficientes' : item.status === 'not_triggered'
                                  ? 'Não acionada nas evidências disponíveis' : 'Regra inativa'}
                          </p>
                          {item.severity && (
                            <p className="mt-1 font-medium">Severidade: {severities[item.severity]}</p>
                          )}
                          <p className="mt-1 text-muted-foreground">Fonte da regra: {item.ruleSource}</p>
                          {item.professorGuidance && <p className="mt-1">{item.professorGuidance}</p>}
                          {item.evidence.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {item.evidence.map((evidence) => (
                                <li key={evidence.sessionId + ':' + evidence.metric + ':' + evidence.source.recordId}
                                  className="break-all text-muted-foreground">
                                  {labels[evidence.capacity]} • {evidence.metric} •
                                  {' '}{evidence.source.kind}/{evidence.source.recordId} v{evidence.source.version}
                                </li>
                              ))}
                            </ul>
                          )}
                          {item.missingOperands.length > 0 && (
                            <p className="mt-1 text-amber-900">
                              Dados necessários não disponíveis: {item.missingOperands.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                      <p className="text-xs font-medium text-amber-900">
                        Resultado parcial não comprova ausência de riscos e não autoriza liberação automática.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A consulta de sinais históricos exige as permissões de check-in e feedback pós-treino.
                  Nenhum dado clínico adicional foi carregado.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
