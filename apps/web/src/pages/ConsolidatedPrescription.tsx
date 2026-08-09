import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  History,
  Info,
  Layers3,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type {
  CapacityPrescriptionView,
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionConflict,
  ConsolidatedPrescriptionConflictReport,
  ConsolidatedPrescriptionHistory,
  ConsolidatedPrescriptionStatus,
  ConsolidatedPrescriptionVersionDetail,
  PhysicalCapacityType,
} from '@corrida/types';
import { canAccessBlock } from '../access/access-control';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { alunoService, type Aluno } from '../services/aluno.service';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';
import { useAuthStore } from '../stores/useAuthStore';

type ApiErrorLike = {
  response?: {
    status?: number;
    data?: {
      error?: string;
      message?: string;
      details?: unknown[];
    };
  };
  message?: string;
};

type RouteState = {
  from?: 'student-central';
};

type MutationAction = 'save' | 'review' | 'approve' | 'recalculate' | 'revision' | null;

const CAPACITY_ORDER: PhysicalCapacityType[] = ['resisted', 'flexibility', 'cyclic', 'balance'];

const capacityLabels: Record<PhysicalCapacityType, string> = {
  resisted: 'Resistido',
  flexibility: 'Flexibilidade',
  cyclic: 'Cíclico',
  balance: 'Equilíbrio',
};

const statusLabels: Record<ConsolidatedPrescriptionStatus, string> = {
  draft: 'Rascunho',
  ready_for_review: 'Pronta para revisão',
  approved: 'Aprovada',
  released: 'Liberada',
  blocked: 'Bloqueada',
  archived: 'Arquivada',
};

const statusBadgeClass: Record<ConsolidatedPrescriptionStatus, string> = {
  draft: 'ts-badge-info',
  ready_for_review: 'ts-badge-warning',
  approved: 'ts-badge-success',
  released: 'ts-badge-success',
  blocked: 'ts-badge-danger',
  archived: 'rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground',
};

const severityMeta = {
  info: {
    label: 'Informativo',
    className: 'border-blue-200 bg-blue-50/60 text-blue-950',
    icon: Info,
  },
  warning: {
    label: 'Atenção',
    className: 'border-amber-200 bg-amber-50/70 text-amber-950',
    icon: AlertTriangle,
  },
  critical: {
    label: 'Bloqueador crítico',
    className: 'border-red-200 bg-red-50/70 text-red-950',
    icon: AlertCircle,
  },
} as const;

function getErrorMessage(error: unknown, fallback: string) {
  const apiError = error as ApiErrorLike;
  return apiError.response?.data?.error || apiError.response?.data?.message || apiError.message || fallback;
}

function isConflictError(error: unknown) {
  return (error as ApiErrorLike).response?.status === 409;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return date.toLocaleString('pt-BR');
}

function normalizeOptional(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sortedBlocks(version?: ConsolidatedPrescriptionVersionDetail | null) {
  return [...(version?.capacityBlocks ?? [])].sort((left, right) => left.position - right.position);
}

function getCapacityCandidateReason(prescription?: CapacityPrescriptionView) {
  if (!prescription) {
    return 'Nenhuma prescrição desta capacidade foi retornada pela API.';
  }
  if (!prescription.latestVersion) {
    return 'A API não retornou uma versão vigente para esta capacidade.';
  }
  if (prescription.status !== 'active' || prescription.latestVersion.status !== 'active') {
    return `Status retornado pela API: ${prescription.latestVersion.status}. A montagem desta fase aceita somente versões ativas e o backend revalida essa condição ao salvar.`;
  }
  if (prescription.latestVersion.version !== prescription.currentVersion) {
    return 'A versão pública carregada não corresponde à versão corrente. Recarregue os dados antes de montar.';
  }
  return null;
}

function conflictActionMessage(conflict: ConsolidatedPrescriptionConflict) {
  if (conflict.severity === 'critical') {
    return 'Revise a capacidade ou origem indicada e reavalie os conflitos antes de tentar aprovar.';
  }
  if (conflict.severity === 'warning') {
    return 'Revise este ponto antes de avançar. Ele não bloqueia sozinho, mas exige decisão profissional.';
  }
  return 'Registro informativo. Nenhuma ação bloqueante é exigida por este item.';
}

function CapacitySourceSummary({ prescription }: { prescription: CapacityPrescriptionView }) {
  const version = prescription.latestVersion;
  if (!version) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Origem técnica da versão atual</p>
      {version.sourceRefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma origem pública retornada para esta versão.</p>
      ) : (
        <ul className="space-y-2">
          {version.sourceRefs.map((source) => (
            <li key={`${source.type}-${source.id}`} className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">{source.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.type}
                {source.assessedAt ? ` • ${formatDateTime(source.assessedAt)}` : ''}
                {source.origin ? ` • ${source.origin}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConflictList({ conflicts }: { conflicts: ConsolidatedPrescriptionConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Nenhum conflito estruturado foi retornado para a versão atual.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conflicts.map((conflict, index) => {
        const meta = severityMeta[conflict.severity];
        const Icon = meta.icon;
        return (
          <div key={`${conflict.code}-${index}`} className={`rounded-lg border p-4 ${meta.className}`}>
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide">{meta.label}</p>
                <p className="mt-1 text-sm font-semibold">{conflict.message}</p>
                {conflict.affectedCapacities.length > 0 && (
                  <p className="mt-2 text-xs">
                    Capacidades: {conflict.affectedCapacities.map((capacity) => capacityLabels[capacity]).join(', ')}
                  </p>
                )}
                <p className="mt-2 text-xs">{conflictActionMessage(conflict)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ConsolidatedPrescription() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const canManage = canAccessBlock(user, 'plans.consolidatedPrescriptions.manage');
  const canApprove = canAccessBlock(user, 'plans.consolidatedPrescriptions.approve');

  const [aluno, setAluno] = useState<Aluno | null>(null);
  const [assembly, setAssembly] = useState<ConsolidatedPrescriptionAssembly | null>(null);
  const [capacityPrescriptions, setCapacityPrescriptions] = useState<CapacityPrescriptionView[]>([]);
  const [conflictReport, setConflictReport] = useState<ConsolidatedPrescriptionConflictReport | null>(null);
  const [history, setHistory] = useState<ConsolidatedPrescriptionHistory | null>(null);
  const [selectedCapacityVersionIds, setSelectedCapacityVersionIds] = useState<string[]>([]);
  const [technicalObservation, setTechnicalObservation] = useState('');
  const [professorJustification, setProfessorJustification] = useState('');
  const [studentInstruction, setStudentInstruction] = useState('');
  const [loading, setLoading] = useState(true);
  const [capacityLoadError, setCapacityLoadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [concurrencyConflict, setConcurrencyConflict] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mutationAction, setMutationAction] = useState<MutationAction>(null);

  const currentVersion = assembly?.latestVersion ?? null;
  const currentStatus = currentVersion?.status ?? null;
  const originLabel = (location.state as RouteState | null)?.from === 'student-central'
    ? 'Central do Aluno'
    : 'Acesso direto protegido';

  const capacityByType = useMemo(() => {
    const map = new Map<PhysicalCapacityType, CapacityPrescriptionView>();
    capacityPrescriptions.forEach((prescription) => map.set(prescription.capacity, prescription));
    return map;
  }, [capacityPrescriptions]);

  const versionIdToCapacity = useMemo(() => {
    const map = new Map<string, PhysicalCapacityType>();
    currentVersion?.capacityBlocks.forEach((block) => map.set(block.capacityPrescriptionVersionId, block.capacity));
    capacityPrescriptions.forEach((prescription) => {
      if (prescription.latestVersion) {
        map.set(prescription.latestVersion.id, prescription.capacity);
      }
    });
    return map;
  }, [capacityPrescriptions, currentVersion]);

  const selectedCapacityTypes = useMemo(
    () => selectedCapacityVersionIds.map((id) => versionIdToCapacity.get(id)).filter(Boolean) as PhysicalCapacityType[],
    [selectedCapacityVersionIds, versionIdToCapacity]
  );

  const canEditComposition =
    canManage && (!currentStatus || currentStatus === 'draft' || currentStatus === 'blocked');
  const hasAllCapacities =
    CAPACITY_ORDER.every((capacity) => selectedCapacityTypes.includes(capacity)) &&
    new Set(selectedCapacityTypes).size === CAPACITY_ORDER.length;
  const hasCriticalConflict = conflictReport?.hasCritical || currentVersion?.conflicts.some((item) => item.severity === 'critical') || false;
  const conflicts = conflictReport?.conflicts ?? currentVersion?.conflicts ?? [];

  const hydrateForm = (nextAssembly: ConsolidatedPrescriptionAssembly | null) => {
    const version = nextAssembly?.latestVersion;
    setSelectedCapacityVersionIds(sortedBlocks(version).map((block) => block.capacityPrescriptionVersionId));
    setTechnicalObservation(version?.technicalObservation ?? '');
    setProfessorJustification(version?.professorJustification ?? '');
    setStudentInstruction(version?.studentInstruction ?? '');
    setDirty(false);
  };

  const initializeFromCapacityCandidates = (prescriptions: CapacityPrescriptionView[]) => {
    const versionIds = CAPACITY_ORDER.map((capacity) => {
      const prescription = prescriptions.find((item) => item.capacity === capacity);
      return getCapacityCandidateReason(prescription) ? null : prescription?.latestVersion?.id ?? null;
    }).filter(Boolean) as string[];
    setSelectedCapacityVersionIds(versionIds);
    setDirty(false);
  };

  const refreshRelatedData = async (studentId: string) => {
    const [conflictResult, historyResult] = await Promise.allSettled([
      consolidatedPrescriptionService.getConflicts(studentId),
      consolidatedPrescriptionService.getHistory(studentId),
    ]);
    setConflictReport(conflictResult.status === 'fulfilled' ? conflictResult.value : null);
    setHistory(historyResult.status === 'fulfilled' ? historyResult.value : null);
  };

  const loadWorkspace = async (replaceLocalEdits = true) => {
    if (!alunoId) return;
    setLoading(true);
    setLoadError(null);
    setCapacityLoadError(null);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const [student, current] = await Promise.all([
        alunoService.getById(alunoId),
        consolidatedPrescriptionService.getCurrent(alunoId),
      ]);
      setAluno(student);
      setAssembly(current);

      let prescriptions: CapacityPrescriptionView[] = [];
      try {
        prescriptions = await consolidatedPrescriptionService.listCapacities(alunoId);
        setCapacityPrescriptions(prescriptions);
      } catch (error) {
        setCapacityPrescriptions([]);
        setCapacityLoadError(
          getErrorMessage(error, 'Não foi possível carregar as prescrições por capacidade. As demais informações continuam disponíveis.')
        );
      }

      if (replaceLocalEdits) {
        if (current) {
          hydrateForm(current);
        } else {
          setTechnicalObservation('');
          setProfessorJustification('');
          setStudentInstruction('');
          initializeFromCapacityCandidates(prescriptions);
        }
      }

      if (current) {
        await refreshRelatedData(alunoId);
      } else {
        setConflictReport(null);
        setHistory(null);
      }
      setConcurrencyConflict(null);
    } catch (error) {
      const status = (error as ApiErrorLike).response?.status;
      setLoadError(
        status === 403 || status === 404
          ? 'Este aluno ou esta montagem não está disponível para o seu acesso atual. Volte à Central do Aluno e escolha um registro autorizado.'
          : getErrorMessage(error, 'Não foi possível carregar a Montagem Consolidada.')
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace(true);
  }, [alunoId]);

  const markDirty = () => {
    setDirty(true);
    setSuccessMessage(null);
    setMutationError(null);
  };

  const replaceCapacityVersion = (capacity: PhysicalCapacityType, versionId: string) => {
    if (!canEditComposition) return;
    const nextIds = [...selectedCapacityVersionIds];
    const existingIndex = nextIds.findIndex((id) => versionIdToCapacity.get(id) === capacity);
    if (existingIndex >= 0) {
      nextIds[existingIndex] = versionId;
    } else {
      nextIds.push(versionId);
    }
    setSelectedCapacityVersionIds(nextIds);
    markDirty();
  };

  const moveSelectedCapacity = (index: number, direction: -1 | 1) => {
    if (!canEditComposition) return;
    const target = index + direction;
    if (target < 0 || target >= selectedCapacityVersionIds.length) return;
    const next = [...selectedCapacityVersionIds];
    [next[index], next[target]] = [next[target], next[index]];
    setSelectedCapacityVersionIds(next);
    markDirty();
  };

  const applyServerAssembly = async (
    nextAssembly: ConsolidatedPrescriptionAssembly,
    message: string
  ) => {
    setAssembly(nextAssembly);
    hydrateForm(nextAssembly);
    setConcurrencyConflict(null);
    setMutationError(null);
    setSuccessMessage(message);
    if (alunoId) await refreshRelatedData(alunoId);
  };

  const handleMutationFailure = (error: unknown, fallback: string) => {
    if (isConflictError(error)) {
      setConcurrencyConflict(
        'Outra versão foi salva no servidor enquanto esta tela estava aberta. Suas alterações locais foram preservadas. Recarregue explicitamente para reconciliar antes de tentar gravar novamente.'
      );
      return;
    }
    setMutationError(getErrorMessage(error, fallback));
  };

  const handleSave = async () => {
    if (!alunoId || !canEditComposition) return;
    if (!hasAllCapacities) {
      setMutationError('A montagem exige uma versão de Resistido, Flexibilidade, Cíclico e Equilíbrio. Corrija as capacidades indisponíveis antes de salvar.');
      return;
    }
    if (!professorJustification.trim()) {
      setMutationError('Informe a justificativa profissional da montagem antes de salvar.');
      return;
    }

    const payload = {
      capacityBlocks: selectedCapacityVersionIds.map((capacityPrescriptionVersionId, position) => ({
        capacityPrescriptionVersionId,
        position,
      })),
      technicalObservation: normalizeOptional(technicalObservation),
      professorJustification: professorJustification.trim(),
      studentInstruction: normalizeOptional(studentInstruction),
    };

    setMutationAction('save');
    setMutationError(null);
    setConcurrencyConflict(null);
    try {
      const saved = assembly
        ? await consolidatedPrescriptionService.updateComposition(alunoId, {
            ...payload,
            expectedCurrentVersion: assembly.currentVersion,
          })
        : await consolidatedPrescriptionService.createDraft(alunoId, payload);
      await applyServerAssembly(saved, assembly ? 'Rascunho atualizado e versionado pelo servidor.' : 'Rascunho criado pelo servidor.');
    } catch (error) {
      handleMutationFailure(error, 'Não foi possível salvar a montagem. As alterações locais foram mantidas.');
    } finally {
      setMutationAction(null);
    }
  };

  const handleSendForReview = async () => {
    if (!alunoId || !assembly || currentStatus !== 'draft' || dirty || !canManage) return;
    setMutationAction('review');
    setMutationError(null);
    try {
      const result = await consolidatedPrescriptionService.sendForReview(alunoId, {
        expectedCurrentVersion: assembly.currentVersion,
      });
      await applyServerAssembly(
        result,
        result.latestVersion.status === 'blocked'
          ? 'A revalidação do servidor encontrou conflito crítico e bloqueou a montagem.'
          : 'Montagem enviada para revisão pelo servidor.'
      );
    } catch (error) {
      handleMutationFailure(error, 'Não foi possível enviar a montagem para revisão.');
    } finally {
      setMutationAction(null);
    }
  };

  const handleApprove = async () => {
    if (!alunoId || !assembly || currentStatus !== 'ready_for_review' || dirty || !canApprove) return;
    setMutationAction('approve');
    setMutationError(null);
    try {
      const result = await consolidatedPrescriptionService.approve(alunoId, {
        expectedCurrentVersion: assembly.currentVersion,
      });
      await applyServerAssembly(
        result,
        result.latestVersion.status === 'approved'
          ? 'Aprovação confirmada pelo servidor.'
          : 'A aprovação não foi concluída; o servidor atualizou o estado após revalidar os conflitos.'
      );
    } catch (error) {
      handleMutationFailure(error, 'Não foi possível aprovar a montagem. Nenhum estado local foi promovido para aprovada.');
    } finally {
      setMutationAction(null);
    }
  };

  const handleRecalculate = async () => {
    if (!alunoId || !assembly || !canManage || dirty) return;
    setMutationAction('recalculate');
    setMutationError(null);
    try {
      const result = await consolidatedPrescriptionService.recalculateConflicts(alunoId, {
        expectedCurrentVersion: assembly.currentVersion,
      });
      setConflictReport(result.report);
      await applyServerAssembly(result.assembly, 'Conflitos reavaliados pelo servidor.');
    } catch (error) {
      handleMutationFailure(error, 'Não foi possível reavaliar os conflitos.');
    } finally {
      setMutationAction(null);
    }
  };

  const handleCreateRevision = async () => {
    if (!alunoId || !assembly || currentStatus !== 'approved' || !canManage) return;
    setMutationAction('revision');
    setMutationError(null);
    try {
      const result = await consolidatedPrescriptionService.createRevision(alunoId, {
        expectedCurrentVersion: assembly.currentVersion,
        reason: 'Nova revisão iniciada pela interface da Montagem Consolidada.',
      });
      await applyServerAssembly(result, 'Nova revisão criada como rascunho pelo servidor.');
    } catch (error) {
      handleMutationFailure(error, 'Não foi possível criar uma nova revisão.');
    } finally {
      setMutationAction(null);
    }
  };

  const handleReloadAfterConflict = async () => {
    const shouldReplace = !dirty || window.confirm(
      'Recarregar substituirá as alterações locais desta tela pela versão atual do servidor. Deseja continuar?'
    );
    if (shouldReplace) await loadWorkspace(true);
  };

  const backToStudent = `/central-do-aluno/${alunoId ?? ''}`;

  if (loading) {
    return (
      <div className="py-16 text-center" role="status" aria-live="polite">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Carregando Montagem Consolidada...</p>
      </div>
    );
  }

  if (loadError || !aluno || !alunoId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Montagem Consolidada indisponível</CardTitle>
          <CardDescription>{loadError || 'Não foi possível identificar o aluno desta montagem.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/central-do-aluno">
            <Button variant="outline">
              <ArrowLeft size={16} />
              Voltar à Central do Aluno
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const alunoName = aluno.user.profile.name || 'Aluno sem nome';
  const responsibleName = aluno.professor?.user?.profile?.name || currentVersion?.responsibleProfessorId || 'Não informado';
  const isReadOnlyState = currentStatus === 'approved' || currentStatus === 'released' || currentStatus === 'archived' || currentStatus === 'ready_for_review';

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <p className="text-sm font-medium text-muted-foreground">Central do Aluno • Planejamento técnico</p>
          <h1 className="ts-page-heading">Montagem Consolidada da Prescrição</h1>
          <p className="ts-page-description">
            Consolide as quatro prescrições por capacidade, revise as origens e os conflitos retornados pela API e avance somente pelas ações permitidas para o estado atual.
          </p>
        </div>
        <Link
          to={backToStudent}
          onClick={(event) => {
            if (dirty && !window.confirm('Há alterações locais não salvas. Deseja voltar mesmo assim?')) {
              event.preventDefault();
            }
          }}
        >
          <Button variant="outline" className="w-full sm:w-auto">
            <ArrowLeft size={16} />
            Voltar à ficha de {alunoName}
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="py-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aluno</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{alunoName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Professor responsável</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{responsibleName}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Versão</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{assembly ? `v${assembly.currentVersion}` : 'Ainda não criada'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado</p>
              <div className="mt-1">
                {currentStatus ? (
                  <span className={statusBadgeClass[currentStatus]}>{statusLabels[currentStatus]}</span>
                ) : (
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Sem montagem</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Origem do acesso</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{originLabel}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>Criada: {formatDateTime(assembly?.createdAt)}</span>
            <span>Atualizada: {formatDateTime(assembly?.updatedAt)}</span>
            <span>{selectedCapacityVersionIds.length}/4 capacidades na composição local</span>
            {dirty && <span className="font-medium text-amber-700">Alterações locais ainda não salvas</span>}
            {isReadOnlyState && <span className="font-medium text-muted-foreground">Composição atual em modo somente leitura</span>}
          </div>
        </CardContent>
      </Card>

      {concurrencyConflict && (
        <Card>
          <CardContent className="py-5" role="alert" aria-live="assertive">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3 text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Conflito de versão detectado</p>
                  <p className="mt-1 text-sm">{concurrencyConflict}</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleReloadAfterConflict} className="w-full lg:w-auto">
                <RefreshCcw size={16} />
                Recarregar do servidor
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mutationError && (
        <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900" role="alert" aria-live="assertive">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Não foi possível concluir a ação</p>
              <p className="mt-1">{mutationError}</p>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{successMessage}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Revisão da montagem</CardTitle>
          <CardDescription>
            As seções abaixo são colapsáveis para manter a tela longa navegável. Regras clínicas, elegibilidade final, transições e aprovação continuam sendo autoridade exclusiva da API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible defaultValue="general">
            <AccordionItem value="general">
              <AccordionTrigger>1. Dados gerais</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aluno selecionado</p>
                    <p className="mt-2 font-semibold text-foreground">{alunoName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">ID: {aluno.id}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Responsabilidade técnica</p>
                    <p className="mt-2 font-semibold text-foreground">{responsibleName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">O backend confirma contrato, ator e escopo de dados em cada operação.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rastreabilidade</p>
                    <p className="mt-2 font-semibold text-foreground">{currentVersion?.traceability.capacityCount ?? selectedCapacityVersionIds.length} capacidade(s)</p>
                    <p className="mt-1 text-xs text-muted-foreground">Versões e origens permanecem vinculadas ao histórico persistido.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="capacities">
              <AccordionTrigger>2. Capacidades recebidas</AccordionTrigger>
              <AccordionContent>
                {capacityLoadError && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900" role="alert">
                    <p className="font-semibold">Falha parcial ao carregar capacidades</p>
                    <p className="mt-1">{capacityLoadError}</p>
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  {CAPACITY_ORDER.map((capacity) => {
                    const prescription = capacityByType.get(capacity);
                    const candidateReason = getCapacityCandidateReason(prescription);
                    const candidate = candidateReason ? null : prescription?.latestVersion ?? null;
                    const selectedId = selectedCapacityVersionIds.find((id) => versionIdToCapacity.get(id) === capacity);
                    const selectedBlock = currentVersion?.capacityBlocks.find((block) => block.capacity === capacity);
                    const selectedIsCandidate = Boolean(candidate && candidate.id === selectedId);
                    return (
                      <div key={capacity} className="rounded-lg border border-border bg-background p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{capacityLabels[capacity]}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {selectedBlock
                                ? `Selecionada na montagem: v${selectedBlock.capacityVersion} • ${selectedBlock.capacityStatus}`
                                : selectedId
                                  ? 'Versão ativa preparada para o novo rascunho.'
                                  : 'Ainda sem versão selecionada.'}
                            </p>
                          </div>
                          <span className={candidateReason ? 'ts-badge-danger' : 'ts-badge-success'}>
                            {candidateReason ? 'Indisponível' : 'Versão ativa disponível'}
                          </span>
                        </div>
                        {candidateReason ? (
                          <div className="mt-3 rounded-md border border-red-200 bg-red-50/60 p-3 text-xs text-red-900">
                            {candidateReason}
                          </div>
                        ) : candidate ? (
                          <>
                            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                              <span>Versão pública: v{candidate.version}</span>
                              <span>Status: {candidate.status}</span>
                              <span className="sm:col-span-2">Resumo: {candidate.professorSummary}</span>
                            </div>
                            {canEditComposition && !selectedIsCandidate && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-3 w-full sm:w-auto"
                                onClick={() => replaceCapacityVersion(capacity, candidate.id)}
                              >
                                <RefreshCcw size={15} />
                                {selectedId ? `Usar versão ativa v${candidate.version}` : `Incluir versão ativa v${candidate.version}`}
                              </Button>
                            )}
                            <CapacitySourceSummary prescription={prescription as CapacityPrescriptionView} />
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Esta tela usa apenas o estado público das prescrições para orientar a seleção. A elegibilidade definitiva é revalidada no backend e pode mudar por versão, status, contrato, aluno ou conflito estruturado.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="sources">
              <AccordionTrigger>3. Dados-base e origem</AccordionTrigger>
              <AccordionContent>
                {!currentVersion || currentVersion.dataRefs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    As origens adicionais da montagem aparecerão aqui após o rascunho ser persistido. As origens das capacidades são derivadas pelo backend.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentVersion.dataRefs.map((source) => (
                      <div key={source.id} className="rounded-lg border border-border bg-muted/20 p-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-semibold text-foreground">{source.label || source.sourceType}</p>
                          <span className="text-xs text-muted-foreground">{source.role}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {source.sourceType} • {source.sourceId}
                          {source.assessedAt ? ` • ${formatDateTime(source.assessedAt)}` : ''}
                          {source.sourceVersion != null ? ` • versão ${source.sourceVersion}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="conflicts">
              <AccordionTrigger>4. Alertas e conflitos</AccordionTrigger>
              <AccordionContent>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {hasCriticalConflict ? 'Existe impedimento crítico' : 'Sem bloqueador crítico carregado'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A severidade vem do motor estruturado da API; texto livre desta tela não recalcula nem altera severidade.
                    </p>
                  </div>
                  {assembly && canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRecalculate}
                      disabled={dirty}
                      isLoading={mutationAction === 'recalculate'}
                      loadingText="Reavaliando..."
                      className="w-full sm:w-auto"
                    >
                      <RefreshCcw size={15} />
                      Reavaliar conflitos
                    </Button>
                  )}
                </div>
                {dirty && assembly && canManage && (
                  <p className="mb-4 text-xs text-amber-700">Salve as alterações locais antes de pedir nova reavaliação ao servidor.</p>
                )}
                <ConflictList conflicts={conflicts} />
                {conflictReport?.unavailableChecks.length ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">Checagens indisponíveis nesta fase</p>
                    {conflictReport.unavailableChecks.map((check) => (
                      <div key={check.code} className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{check.code}:</span> {check.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="composition">
              <AccordionTrigger>5. Composição e ordem técnica</AccordionTrigger>
              <AccordionContent>
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-950">
                  <p className="font-semibold">Limite do contrato atual</p>
                  <p className="mt-1 text-xs">
                    A API da Montagem Consolidada recebe blocos de capacidade, observação, justificativa e orientação ao aluno. Exercícios e itens permanecem dentro das prescrições por capacidade; esta tela não cria um editor paralelo nem duplica regras do Workout Builder.
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedCapacityVersionIds.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nenhuma versão de capacidade está pronta para a composição.
                    </div>
                  ) : (
                    selectedCapacityVersionIds.map((versionId, index) => {
                      const capacity = versionIdToCapacity.get(versionId);
                      return (
                        <div key={versionId} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {index + 1}. {capacity ? capacityLabels[capacity] : 'Capacidade não identificada'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">Versão técnica: {versionId}</p>
                          </div>
                          {canEditComposition && (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`Mover ${capacity ? capacityLabels[capacity] : 'capacidade'} para cima`}
                                disabled={index === 0}
                                onClick={() => moveSelectedCapacity(index, -1)}
                              >
                                <ArrowUp size={16} />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`Mover ${capacity ? capacityLabels[capacity] : 'capacidade'} para baixo`}
                                disabled={index === selectedCapacityVersionIds.length - 1}
                                onClick={() => moveSelectedCapacity(index, 1)}
                              >
                                <ArrowDown size={16} />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-5">
                  <label htmlFor="technical-observation" className="mb-2 block text-sm font-medium text-foreground">
                    Observação técnica interna
                  </label>
                  <textarea
                    id="technical-observation"
                    className="ts-textarea min-h-28"
                    value={technicalObservation}
                    readOnly={!canEditComposition}
                    onChange={(event) => {
                      setTechnicalObservation(event.target.value);
                      markDirty();
                    }}
                    placeholder="Registre contexto técnico útil para a revisão profissional. Este texto não cria conflitos automaticamente."
                  />
                </div>
                <div className="mt-4">
                  <label htmlFor="professor-justification" className="mb-2 block text-sm font-medium text-foreground">
                    Justificativa profissional <span aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="professor-justification"
                    className="ts-textarea min-h-32"
                    value={professorJustification}
                    readOnly={!canEditComposition}
                    onChange={(event) => {
                      setProfessorJustification(event.target.value);
                      markDirty();
                    }}
                    aria-required="true"
                    placeholder="Explique por que esta combinação de capacidades foi escolhida."
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="student-message">
              <AccordionTrigger>6. Mensagem prática ao aluno</AccordionTrigger>
              <AccordionContent>
                <label htmlFor="student-instruction" className="mb-2 block text-sm font-medium text-foreground">
                  Orientação prática
                </label>
                <textarea
                  id="student-instruction"
                  className="ts-textarea min-h-32"
                  value={studentInstruction}
                  readOnly={!canEditComposition}
                  onChange={(event) => {
                    setStudentInstruction(event.target.value);
                    markDirty();
                  }}
                  placeholder="Escreva uma orientação simples e segura para o aluno. A publicação do Treino de hoje não faz parte desta issue."
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Esta mensagem é parte da montagem técnica. Ela não publica treino, não envia WhatsApp e não substitui a liberação operacional futura.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="review">
              <AccordionTrigger>7. Revisão e validação final</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Capacidades</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{hasAllCapacities ? '4 de 4 presentes' : `${new Set(selectedCapacityTypes).size} de 4 presentes`}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Justificativa</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{professorJustification.trim() ? 'Informada' : 'Pendente'}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conflitos críticos</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{hasCriticalConflict ? 'Há impedimento' : 'Nenhum carregado'}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Versão-base</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{assembly ? `v${assembly.currentVersion}` : 'Nova montagem'}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {canEditComposition && (
                    <Button
                      type="button"
                      onClick={handleSave}
                      isLoading={mutationAction === 'save'}
                      loadingText="Salvando..."
                      className="w-full sm:w-auto"
                    >
                      <Save size={16} />
                      Salvar rascunho
                    </Button>
                  )}
                  {canManage && currentStatus === 'draft' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendForReview}
                      disabled={dirty}
                      isLoading={mutationAction === 'review'}
                      loadingText="Enviando..."
                      className="w-full sm:w-auto"
                    >
                      <Send size={16} />
                      Enviar para revisão
                    </Button>
                  )}
                  {canApprove && currentStatus === 'ready_for_review' && (
                    <Button
                      type="button"
                      variant="success"
                      onClick={handleApprove}
                      disabled={dirty || hasCriticalConflict}
                      isLoading={mutationAction === 'approve'}
                      loadingText="Aprovando..."
                      className="w-full sm:w-auto"
                    >
                      <ShieldCheck size={16} />
                      Aprovar montagem
                    </Button>
                  )}
                  {canManage && currentStatus === 'approved' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCreateRevision}
                      isLoading={mutationAction === 'revision'}
                      loadingText="Criando revisão..."
                      className="w-full sm:w-auto"
                    >
                      <RotateCcw size={16} />
                      Criar nova revisão
                    </Button>
                  )}
                </div>

                {dirty && currentStatus === 'draft' && (
                  <p className="mt-3 text-xs text-amber-700">Salve o rascunho antes de enviar para revisão.</p>
                )}
                {currentStatus === 'ready_for_review' && !canApprove && (
                  <p className="mt-3 text-xs text-muted-foreground">Seu perfil pode consultar esta revisão, mas não possui o bloco de aprovação.</p>
                )}
                {currentStatus === 'ready_for_review' && hasCriticalConflict && canApprove && (
                  <p className="mt-3 text-xs text-red-700">A aprovação está indisponível enquanto a API reportar conflito crítico.</p>
                )}
                {currentStatus === 'released' && (
                  <p className="mt-3 text-xs text-muted-foreground">A versão liberada permanece somente leitura nesta fase. A transição de liberação pertence ao fluxo operacional posterior.</p>
                )}
                {!canManage && !canApprove && (
                  <p className="mt-3 text-xs text-muted-foreground">Você possui acesso de consulta. Ações de gestão e aprovação permanecem ocultas conforme seus blocos de permissão.</p>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="history">
              <AccordionTrigger>8. Histórico de versões</AccordionTrigger>
              <AccordionContent>
                {!history || history.versions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    O histórico ficará disponível após a primeira versão persistida.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.versions
                      .slice()
                      .sort((left, right) => right.version - left.version)
                      .map((version) => (
                        <details key={version.id} className="rounded-lg border border-border bg-background p-4">
                          <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                                <History size={16} aria-hidden="true" />
                                <span className="text-sm font-semibold text-foreground">Versão {version.version}</span>
                                <span className={statusBadgeClass[version.status]}>{statusLabels[version.status]}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</span>
                            </div>
                          </summary>
                          <div className="mt-4 border-t border-border pt-4 text-sm">
                            <p className="font-medium text-foreground">Justificativa</p>
                            <p className="mt-1 text-muted-foreground">{version.professorJustification}</p>
                            {version.technicalObservation && (
                              <>
                                <p className="mt-4 font-medium text-foreground">Observação técnica</p>
                                <p className="mt-1 text-muted-foreground">{version.technicalObservation}</p>
                              </>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {sortedBlocks(version).map((block) => (
                                <span key={block.id} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                                  {capacityLabels[block.capacity]} v{block.capacityVersion}
                                </span>
                              ))}
                            </div>
                            <p className="mt-4 text-xs font-medium text-muted-foreground">Somente leitura — versões históricas nunca são editadas nesta tela.</p>
                          </div>
                        </details>
                      ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {!assembly && (
        <Card>
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">Nenhuma montagem persistida para este aluno</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revise as quatro capacidades, informe a justificativa e salve o primeiro rascunho. Se alguma capacidade estiver indisponível, corrija a prescrição de origem antes de continuar.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
