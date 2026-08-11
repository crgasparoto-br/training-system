import { useLayoutEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionConflictReport,
  ConsolidatedPrescriptionWorkspaceContext,
  PhysicalCapacityType,
} from '@corrida/types';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import api from '../services/api';
import { ConsolidatedPrescription as ConsolidatedPrescriptionWorkspace } from './ConsolidatedPrescriptionWorkspace';

const capacityLabels: Record<PhysicalCapacityType, string> = {
  resisted: 'Resistido',
  flexibility: 'Flexibilidade',
  cyclic: 'Cíclico',
  balance: 'Equilíbrio',
};

const missingReasonCodes = new Set(['missing_prescription', 'missing_current_version']);
const incompatibleReasonCodes = new Set(['prescription_not_active', 'version_not_active']);

type ApiErrorLike = {
  config?: { url?: string };
  response?: { status?: number };
};

function isWorkspaceContext(value: unknown): value is ConsolidatedPrescriptionWorkspaceContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConsolidatedPrescriptionWorkspaceContext>;
  return Boolean(candidate.aluno && Array.isArray(candidate.capacityCandidates));
}

function isAssembly(value: unknown): value is ConsolidatedPrescriptionAssembly {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConsolidatedPrescriptionAssembly>;
  return typeof candidate.currentVersion === 'number' && Boolean(candidate.latestVersion);
}

function isConflictReport(value: unknown): value is ConsolidatedPrescriptionConflictReport {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConsolidatedPrescriptionConflictReport>;
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.status === 'string' &&
    Array.isArray(candidate.conflicts)
  );
}

function capacityListLabel(capacities: PhysicalCapacityType[]) {
  return capacities.map((capacity) => capacityLabels[capacity]).join(', ');
}

export function ConsolidatedPrescription() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const [workspaceContext, setWorkspaceContext] = useState<ConsolidatedPrescriptionWorkspaceContext | null>(null);
  const [assembly, setAssembly] = useState<ConsolidatedPrescriptionAssembly | null>(null);
  const [conflictReport, setConflictReport] = useState<ConsolidatedPrescriptionConflictReport | null>(null);
  const [accessLost, setAccessLost] = useState(false);

  useLayoutEffect(() => {
    setWorkspaceContext(null);
    setAssembly(null);
    setConflictReport(null);
    setAccessLost(false);

    if (!alunoId) return undefined;

    const studentBasePath = `/consolidated-prescriptions/alunos/${alunoId}`;
    const isTargetRequest = (url?: string) => Boolean(url?.includes(studentBasePath));

    const interceptorId = api.interceptors.response.use(
      (response) => {
        const requestUrl = response.config?.url || '';
        if (!isTargetRequest(requestUrl)) return response;

        const responseBody = response.data as { data?: unknown } | undefined;
        const payload = responseBody?.data;
        const method = response.config?.method?.toLowerCase();

        if (requestUrl.endsWith('/workspace') && isWorkspaceContext(payload)) {
          setWorkspaceContext(payload);
        } else if (requestUrl.endsWith('/conflicts') && method === 'get' && isConflictReport(payload)) {
          setConflictReport(payload);
        } else if (requestUrl.endsWith(studentBasePath) && method === 'get') {
          setAssembly(isAssembly(payload) ? payload : null);
        } else if (isAssembly(payload)) {
          setAssembly(payload);
        } else if (payload && typeof payload === 'object') {
          const nestedAssembly = (payload as { assembly?: unknown }).assembly;
          if (isAssembly(nestedAssembly)) setAssembly(nestedAssembly);
        }

        return response;
      },
      (error: ApiErrorLike) => {
        const status = error.response?.status;
        if (isTargetRequest(error.config?.url) && (status === 401 || status === 403 || status === 404)) {
          setAccessLost(true);
          setWorkspaceContext(null);
          setAssembly(null);
          setConflictReport(null);
        }
        return Promise.reject(error);
      }
    );

    return () => api.interceptors.response.eject(interceptorId);
  }, [alunoId]);

  const selectedCapacities = useMemo(() => {
    if (assembly?.latestVersion) {
      return [...assembly.latestVersion.capacityBlocks]
        .sort((left, right) => left.position - right.position)
        .map((block) => ({
          capacity: block.capacity,
          version: block.capacityVersion,
        }));
    }

    return (workspaceContext?.capacityCandidates ?? [])
      .filter((candidate) => candidate.eligible && candidate.version != null)
      .map((candidate) => ({
        capacity: candidate.capacity,
        version: candidate.version as number,
      }));
  }, [assembly, workspaceContext]);

  const missingCapacities = useMemo(
    () =>
      (workspaceContext?.capacityCandidates ?? [])
        .filter((candidate) => missingReasonCodes.has(candidate.reasonCode))
        .map((candidate) => candidate.capacity),
    [workspaceContext]
  );

  const incompatibleCapacities = useMemo(
    () =>
      (workspaceContext?.capacityCandidates ?? [])
        .filter((candidate) => incompatibleReasonCodes.has(candidate.reasonCode))
        .map((candidate) => candidate.capacity),
    [workspaceContext]
  );

  const staleCapacities = useMemo(() => {
    const conflicts = conflictReport?.conflicts ?? assembly?.latestVersion.conflicts ?? [];
    return Array.from(
      new Set(
        conflicts
          .filter((conflict) => conflict.code.startsWith('capacity-version-ineligible:'))
          .flatMap((conflict) => conflict.affectedCapacities)
      )
    );
  }, [assembly, conflictReport]);

  if (accessLost) {
    return (
      <Card role="alert" aria-live="assertive">
        <CardHeader>
          <CardTitle>Montagem Consolidada indisponível</CardTitle>
          <CardDescription>
            Seu acesso a esta montagem foi alterado ou o recurso deixou de pertencer ao seu escopo atual.
            Os dados carregados anteriormente foram ocultados e precisam ser consultados novamente a partir de
            uma rota autorizada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to={alunoId ? `/central-do-aluno/${alunoId}` : '/central-do-aluno'}>
            <Button variant="outline">Voltar à Central do Aluno</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const hasContextSummary = Boolean(
    workspaceContext || assembly || conflictReport || selectedCapacities.length > 0
  );

  return (
    <div className="space-y-4">
      {hasContextSummary && (
        <Card data-testid="consolidated-prescription-context-header">
          <CardHeader>
            <CardTitle>Contexto autoritativo da montagem</CardTitle>
            <CardDescription>
              Capacidades, versões e situação das origens abaixo refletem exclusivamente respostas da API da
              Montagem Consolidada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Capacidades selecionadas e versões
              </p>
              {selectedCapacities.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedCapacities.map((item) => (
                    <span
                      key={`${item.capacity}-${item.version}`}
                      className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {capacityLabels[item.capacity]} v{item.version}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhuma capacidade elegível foi selecionada pela API para a montagem atual.
                </p>
              )}
            </div>

            {(missingCapacities.length > 0 ||
              staleCapacities.length > 0 ||
              incompatibleCapacities.length > 0) && (
              <div className="grid gap-3 lg:grid-cols-3" aria-label="Situação dos dados de origem">
                {missingCapacities.length > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-blue-950">
                    <p className="text-xs font-semibold uppercase tracking-wide">Dado ausente</p>
                    <p className="mt-1 text-sm font-semibold">{capacityListLabel(missingCapacities)}</p>
                    <p className="mt-2 text-xs">
                      A API informou ausência da prescrição ou da versão corrente. Retorne à origem correspondente
                      antes de tentar concluir a montagem.
                    </p>
                  </div>
                )}

                {staleCapacities.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-amber-950">
                    <p className="text-xs font-semibold uppercase tracking-wide">Dado desatualizado</p>
                    <p className="mt-1 text-sm font-semibold">{capacityListLabel(staleCapacities)}</p>
                    <p className="mt-2 text-xs">
                      O motor de conflitos informou que a versão selecionada não é mais a versão vigente e ativa.
                      Reavalie as origens e substitua a referência pela versão autorizada pela API.
                    </p>
                  </div>
                )}

                {incompatibleCapacities.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50/60 p-4 text-red-950">
                    <p className="text-xs font-semibold uppercase tracking-wide">Origem incompatível</p>
                    <p className="mt-1 text-sm font-semibold">{capacityListLabel(incompatibleCapacities)}</p>
                    <p className="mt-2 text-xs">
                      A API marcou a prescrição ou sua versão como não ativa. Corrija a origem antes de tentar
                      incluí-la novamente.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConsolidatedPrescriptionWorkspace />
    </div>
  );
}
