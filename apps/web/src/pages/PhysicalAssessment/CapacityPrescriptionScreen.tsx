import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Check,
  ClipboardList,
  Database,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type {
  CapacityPlanningCycleView,
  CapacityPlanningLevel,
  CapacityPrescriptionParameterSetView,
  CapacityPrescriptionStatus,
  CapacityPrescriptionView,
  CapacityTechnicalCatalogItemView,
  CyclicCapacityZone,
  FlexibilityArticulationParameters,
  PhysicalCapacityType,
  ProntuarioGoal,
  ProntuarioGoalCapacityClassificationPayload,
} from "@corrida/types";
import { PHYSICAL_CAPACITY_TYPES } from "@corrida/types";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { canAccessBlock } from "../../access/access-control";
import {
  alunoService,
  type Aluno,
  type StudentSegmentedProfile,
} from "../../services/aluno.service";
import {
  capacityPrescriptionService,
  type CapacityAssessmentSourceOption,
} from "../../services/capacity-prescription.service";
import { prontuarioService } from "../../services/prontuario.service";
import { useAuthStore } from "../../stores/useAuthStore";
import {
  applyParameterSetToDraft,
  buildManualParameters,
  buildSavePayload,
  buildTechnicalSourceSuggestions,
  hydrateDraftsFromPrescriptions,
  hydrateSourceSelections,
  initialDrafts,
  initialSourceSelections,
  mergeTechnicalSourceSuggestions,
  type CapacityDrafts,
  type CapacitySourceSelections,
  type PrescriptionDraft,
  type TechnicalSourceSuggestion,
} from "./capacityPrescriptionScreen.model";

const capacityLabels: Record<PhysicalCapacityType, string> = {
  resisted: "Resistido",
  cyclic: "Cíclico",
  flexibility: "Flexibilidade",
  balance: "Equilíbrio",
};

const statusLabels: Record<CapacityPrescriptionStatus, string> = {
  planned: "Planejado",
  active: "Ativo",
  adjusting: "Em ajuste",
  suspended: "Suspenso",
  finished: "Finalizado",
};

const planningLevelLabels: Record<CapacityPlanningLevel, string> = {
  macro: "Macrociclo",
  meso: "Mesociclo",
  micro: "Microciclo",
};

const technicalSourceLabels: Record<TechnicalSourceSuggestion["kind"], string> =
  {
    prontuario: "Alerta do PRNT",
    preferencia: "Preferência do aluno",
    avaliacao: "Avaliação física",
    atividade: "Histórico de atividade",
  };

type GoalClassificationDraft = ProntuarioGoalCapacityClassificationPayload;

type PlanningDraft = {
  level: CapacityPlanningLevel;
  parentId: string;
  code: string;
  name: string;
  objective: string;
  startDate: string;
  endDate: string;
  loadCode: string;
  volume: string;
  frequency: string;
};

const initialPlanningDraft = (): PlanningDraft => ({
  level: "macro",
  parentId: "",
  code: "",
  name: "",
  objective: "",
  startDate: "",
  endDate: "",
  loadCode: "",
  volume: "",
  frequency: "",
});

function dateToIso(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function catalogByCategory(
  items: CapacityTechnicalCatalogItemView[],
  category: string,
) {
  return items.filter((item) => item.category === category);
}

function LabeledTextarea({
  id,
  label,
  value,
  onChange,
  minHeight = "min-h-[112px]",
  disabled = false,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  disabled?: boolean;
  help?: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <textarea
        id={id}
        className={`${minHeight} w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-65`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      {help ? (
        <div className="mt-1 text-xs text-muted-foreground">{help}</div>
      ) : null}
    </div>
  );
}

function deduplicateSources<T extends { type: string; id: string }>(
  items: T[],
) {
  return Array.from(
    new Map(items.map((item) => [`${item.type}:${item.id}`, item])).values(),
  );
}

function emptyOverview() {
  return {
    currentRecord: null,
    records: [],
    latestParqSubmission: null,
    parqSubmissions: [],
    parqState: "NOT_STARTED",
    parqLegacy: null,
  } as Awaited<ReturnType<typeof prontuarioService.overview>>;
}

export function CapacityPrescriptionScreen() {
  const user = useAuthStore((state) => state.user);
  const canView = canAccessBlock(user, "plans.capacityPrescriptions.view");
  const canManage = canAccessBlock(user, "plans.capacityPrescriptions.manage");
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedAlunoId, setSelectedAlunoId] = useState("");
  const [activeCapacity, setActiveCapacity] =
    useState<PhysicalCapacityType>("resisted");
  const [goals, setGoals] = useState<ProntuarioGoal[]>([]);
  const [classifications, setClassifications] = useState<
    Record<string, GoalClassificationDraft>
  >({});
  const [prescriptions, setPrescriptions] = useState<
    CapacityPrescriptionView[]
  >([]);
  const [parameterSets, setParameterSets] = useState<
    CapacityPrescriptionParameterSetView[]
  >([]);
  const [catalog, setCatalog] = useState<CapacityTechnicalCatalogItemView[]>(
    [],
  );
  const [planning, setPlanning] = useState<CapacityPlanningCycleView[]>([]);
  const [technicalSources, setTechnicalSources] = useState<
    TechnicalSourceSuggestion[]
  >([]);
  const [selectedSourceKeys, setSelectedSourceKeys] =
    useState<CapacitySourceSelections>(initialSourceSelections);
  const [drafts, setDrafts] = useState<CapacityDrafts>(initialDrafts);
  const [planningDraft, setPlanningDraft] =
    useState<PlanningDraft>(initialPlanningDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const workspaceRequestId = useRef(0);

  const currentDraft = drafts[activeCapacity];
  const selectedStudent = students.find(
    (student) => student.id === selectedAlunoId,
  );
  const currentPrescription = prescriptions.find(
    (item) => item.capacity === activeCapacity,
  );
  const activeParameterSets = parameterSets.filter(
    (item) => item.capacity === activeCapacity,
  );
  const selectedParameterSet = activeParameterSets.find(
    (item) => item.id === currentDraft.parameterSetId,
  );
  const usesParameterSet = Boolean(selectedParameterSet);
  const muscleGroups = catalogByCategory(catalog, "muscle_group");
  const methods = catalogByCategory(catalog, "method");
  const splits = catalogByCategory(catalog, "training_split");
  const cyclicStimuli = catalogByCategory(catalog, "cyclic_stimulus");
  const articulations = catalogByCategory(catalog, "articulation");
  const microcycleLoads = catalogByCategory(catalog, "microcycle_load");

  const activeTechnicalSources = useMemo(
    () =>
      mergeTechnicalSourceSuggestions(
        technicalSources,
        currentPrescription?.latestVersion?.sourceRefs ?? [],
      ),
    [technicalSources, currentPrescription],
  );
  const activeSelectedSourceKeys = selectedSourceKeys[activeCapacity];

  const parentOptions = useMemo(() => {
    if (planningDraft.level === "meso")
      return planning.filter((item) => item.level === "macro");
    if (planningDraft.level === "micro")
      return planning.filter((item) => item.level === "meso");
    return [];
  }, [planning, planningDraft.level]);

  const resetWorkspaceState = useCallback(() => {
    setGoals([]);
    setClassifications({});
    setPrescriptions([]);
    setParameterSets([]);
    setCatalog([]);
    setPlanning([]);
    setTechnicalSources([]);
    setSelectedSourceKeys(initialSourceSelections());
    setDrafts(initialDrafts());
    setPlanningDraft(initialPlanningDraft());
    setActiveCapacity("resisted");
    setError(null);
    setSuccess(null);
  }, []);

  const updateCurrentDraft = (patch: Partial<PrescriptionDraft>) => {
    setDrafts((current) => ({
      ...current,
      [activeCapacity]: { ...current[activeCapacity], ...patch },
    }));
  };

  useEffect(() => {
    alunoService
      .list(1, 100, undefined, "active")
      .then((response) => setStudents(response.alunos || []))
      .catch(() => setError("Não foi possível carregar os alunos."));
  }, []);

  const refreshStudentWorkspace = useCallback(
    async (alunoId: string) => {
      const requestId = ++workspaceRequestId.current;
      if (!alunoId) {
        resetWorkspaceState();
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [
          overview,
          nextPrescriptions,
          nextParameters,
          nextCatalog,
          nextPlanning,
          nextClassifications,
          profile,
          assessmentSources,
        ] = await Promise.all([
          prontuarioService.overview(alunoId).catch(() => emptyOverview()),
          capacityPrescriptionService.listByAluno(alunoId),
          capacityPrescriptionService.listParameterSets(undefined, true),
          capacityPrescriptionService.listCatalog(),
          capacityPrescriptionService.listPlanning(alunoId),
          capacityPrescriptionService.listGoalClassifications(alunoId),
          alunoService.getSegmentedProfile(alunoId).catch(() => null),
          capacityPrescriptionService
            .listAssessmentSources(alunoId)
            .catch(() => []),
        ]);

        if (requestId !== workspaceRequestId.current) return;

        const profileWithRecord = profile as
          | (StudentSegmentedProfile & {
              recordId?: string | null;
            })
          | null;
        const suggestions = buildTechnicalSourceSuggestions({
          overview,
          profile,
          profileRecordId: profileWithRecord?.recordId,
          assessmentSources:
            assessmentSources as CapacityAssessmentSourceOption[],
        });
        const hydratedDrafts =
          hydrateDraftsFromPrescriptions(nextPrescriptions);
        for (const capacity of PHYSICAL_CAPACITY_TYPES) {
          const parameterSetId = hydratedDrafts[capacity].parameterSetId;
          if (
            parameterSetId &&
            !nextParameters.some(
              (parameterSet) =>
                parameterSet.id === parameterSetId &&
                parameterSet.capacity === capacity,
            )
          ) {
            hydratedDrafts[capacity] = {
              ...hydratedDrafts[capacity],
              parameterSetId: "",
            };
          }
        }

        setGoals(overview.currentRecord?.goals || []);
        setPrescriptions(nextPrescriptions);
        setParameterSets(nextParameters);
        setCatalog(nextCatalog);
        setPlanning(nextPlanning);
        setDrafts(hydratedDrafts);
        setTechnicalSources(suggestions);
        setSelectedSourceKeys(hydrateSourceSelections(nextPrescriptions));
        setClassifications(
          Object.fromEntries(
            nextClassifications.map((item) => [
              item.goalId,
              {
                capacities: item.capacities,
                relatesToAssessment: item.relatesToAssessment,
                relatesToActionPlan: item.relatesToActionPlan,
              },
            ]),
          ),
        );
      } catch (err: unknown) {
        if (requestId !== workspaceRequestId.current) return;
        const message = (err as { response?: { data?: { error?: string } } })
          ?.response?.data?.error;
        resetWorkspaceState();
        setError(message || "Não foi possível carregar a prescrição do aluno.");
      } finally {
        if (requestId === workspaceRequestId.current) setLoading(false);
      }
    },
    [resetWorkspaceState],
  );

  useEffect(() => {
    resetWorkspaceState();
    void refreshStudentWorkspace(selectedAlunoId);
  }, [selectedAlunoId, refreshStudentWorkspace, resetWorkspaceState]);

  const classificationFor = (goalId: string): GoalClassificationDraft =>
    classifications[goalId] || {
      capacities: [],
      relatesToAssessment: false,
      relatesToActionPlan: false,
    };

  const toggleGoalCapacity = (
    goalId: string,
    capacity: PhysicalCapacityType,
  ) => {
    const current = classificationFor(goalId);
    const capacities = current.capacities.includes(capacity)
      ? current.capacities.filter((item) => item !== capacity)
      : [...current.capacities, capacity];
    setClassifications((items) => ({
      ...items,
      [goalId]: { ...current, capacities },
    }));
  };

  const saveGoalClassification = async (goalId: string) => {
    if (!selectedAlunoId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await capacityPrescriptionService.saveGoalClassification(
        selectedAlunoId,
        goalId,
        classificationFor(goalId),
      );
      setSuccess("Objetivo classificado para a prescrição.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setError(message || "Não foi possível classificar o objetivo.");
    } finally {
      setSaving(false);
    }
  };

  const toggleTechnicalSource = (key: string) => {
    setSelectedSourceKeys((current) => {
      const nextForCapacity = new Set(current[activeCapacity]);
      if (nextForCapacity.has(key)) nextForCapacity.delete(key);
      else nextForCapacity.add(key);
      return { ...current, [activeCapacity]: nextForCapacity };
    });
  };

  const handleParameterSetChange = (parameterSetId: string) => {
    const parameterSet = activeParameterSets.find(
      (item) => item.id === parameterSetId,
    );
    if (!parameterSet) {
      updateCurrentDraft({ parameterSetId: "" });
      return;
    }
    setDrafts((current) => ({
      ...current,
      [activeCapacity]: applyParameterSetToDraft(
        current[activeCapacity],
        parameterSet,
      ),
    }));
  };

  const savePrescription = async () => {
    if (!selectedAlunoId) return;
    if (
      !currentDraft.technicalJustification.trim() ||
      !currentDraft.professorSummary.trim()
    ) {
      setError("Informe justificativa técnica e resumo do professor.");
      return;
    }

    const linkedGoals = goals.filter((goal) =>
      classificationFor(goal.id).capacities.includes(activeCapacity),
    );
    const goalSources = linkedGoals.map((goal) => ({
      type: "prontuario_goal" as const,
      id: goal.id,
      label: goal.title,
      origin: "PRNT",
    }));
    const selectedTechnicalSources = activeTechnicalSources
      .filter((item) => activeSelectedSourceKeys.has(item.key))
      .map((item) => item.ref);
    const sourceRefs = deduplicateSources([
      ...goalSources,
      ...selectedTechnicalSources,
    ]);

    if (!sourceRefs.length) {
      sourceRefs.push({
        type: "professor_note",
        id: `manual-${selectedAlunoId}-${activeCapacity}`,
        label: `Definição técnica de ${capacityLabels[activeCapacity]}`,
        origin: "Tela de prescrição por capacidades",
      });
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await Promise.all(
        goals.map((goal) =>
          capacityPrescriptionService.saveGoalClassification(
            selectedAlunoId,
            goal.id,
            classificationFor(goal.id),
          ),
        ),
      );
      await capacityPrescriptionService.save(
        selectedAlunoId,
        buildSavePayload({
          capacity: activeCapacity,
          draft: currentDraft,
          currentVersion: currentPrescription?.currentVersion ?? 0,
          sourceRefs,
          linkedProntuarioGoalIds: linkedGoals.map((goal) => goal.id),
          parameterSet: selectedParameterSet,
        }),
      );
      setSuccess(`${capacityLabels[activeCapacity]} versionado com sucesso.`);
      await refreshStudentWorkspace(selectedAlunoId);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setError(message || "Não foi possível salvar a capacidade.");
    } finally {
      setSaving(false);
    }
  };

  const savePlanning = async () => {
    if (!selectedAlunoId) return;
    if (!planningDraft.code.trim() || !planningDraft.name.trim()) {
      setError("Informe código e nome do ciclo.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const capacityParameters =
        selectedParameterSet?.parameters ??
        buildManualParameters(activeCapacity, currentDraft);
      await capacityPrescriptionService.savePlanning(selectedAlunoId, {
        level: planningDraft.level,
        parentId: planningDraft.parentId || null,
        code: planningDraft.code,
        name: planningDraft.name,
        objective: planningDraft.objective || null,
        startDate: dateToIso(planningDraft.startDate),
        endDate: dateToIso(planningDraft.endDate),
        loadCode: planningDraft.loadCode || null,
        volume: planningDraft.volume || null,
        frequency: planningDraft.frequency || null,
        capacityParameters: {
          [activeCapacity]: capacityParameters as unknown as Record<
            string,
            unknown
          >,
        },
        status: "planned",
      });
      setSuccess(`${planningLevelLabels[planningDraft.level]} versionado.`);
      setPlanningDraft((current) => ({
        ...current,
        code: "",
        name: "",
        objective: "",
      }));
      await refreshStudentWorkspace(selectedAlunoId);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setError(message || "Não foi possível salvar o ciclo.");
    } finally {
      setSaving(false);
    }
  };

  const toggleMuscleGroup = (code: string) => {
    updateCurrentDraft({
      muscleGroups: currentDraft.muscleGroups.includes(code)
        ? currentDraft.muscleGroups.filter((item) => item !== code)
        : [...currentDraft.muscleGroups, code],
    });
  };

  const toggleArticulation = (name: string) => {
    const current = currentDraft.flexibilityArticulations;
    updateCurrentDraft({
      flexibilityArticulations: current.some((item) => item.name === name)
        ? current.filter((item) => item.name !== name)
        : [...current, { name, priority: "medium" }],
    });
  };

  const updateArticulation = (
    name: string,
    patch: Partial<FlexibilityArticulationParameters>,
  ) => {
    updateCurrentDraft({
      flexibilityArticulations: currentDraft.flexibilityArticulations.map(
        (item) => (item.name === name ? { ...item, ...patch } : item),
      ),
    });
  };

  const addCyclicZone = () => {
    const nextIndex = currentDraft.cyclicZones.length + 1;
    updateCurrentDraft({
      cyclicZones: [...currentDraft.cyclicZones, { name: `Z${nextIndex}` }],
    });
  };

  const updateCyclicZone = (
    index: number,
    patch: Partial<CyclicCapacityZone>,
  ) => {
    updateCurrentDraft({
      cyclicZones: currentDraft.cyclicZones.map((zone, zoneIndex) =>
        zoneIndex === index ? { ...zone, ...patch } : zone,
      ),
    });
  };

  const removeCyclicZone = (index: number) => {
    updateCurrentDraft({
      cyclicZones: currentDraft.cyclicZones.filter(
        (_, zoneIndex) => zoneIndex !== index,
      ),
    });
  };

  const handleCapacityKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    capacity: PhysicalCapacityType,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = PHYSICAL_CAPACITY_TYPES.indexOf(capacity);
    const targetIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? PHYSICAL_CAPACITY_TYPES.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              PHYSICAL_CAPACITY_TYPES.length) %
            PHYSICAL_CAPACITY_TYPES.length;
    const next = PHYSICAL_CAPACITY_TYPES[targetIndex];
    setActiveCapacity(next);
    window.requestAnimationFrame(() =>
      document.getElementById(`capacity-tab-${next}`)?.focus(),
    );
  };

  if (!canView) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Seu perfil não possui acesso à prescrição por capacidades físicas.
      </div>
    );
  }

  return (
    <div className="capacity-prescription-screen space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Prescrição integrada
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Prescrição por capacidades físicas
        </h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Camada técnica do professor anterior à Montagem Consolidada. Nenhuma
          capacidade publica Treino de hoje diretamente.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 lg:grid-cols-[minmax(260px,420px)_1fr] lg:items-end">
          <div>
            <label
              htmlFor="capacity-student"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Aluno
            </label>
            <select
              id="capacity-student"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedAlunoId}
              onChange={(event) => setSelectedAlunoId(event.target.value)}
            >
              <option value="">Selecione um aluno</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.user.profile.name}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-muted-foreground">
            {selectedStudent
              ? `${selectedStudent.user.profile.name} · fontes e rascunhos isolados por capacidade`
              : "Escolha um aluno para carregar objetivos, fontes, ciclos e capacidades."}
          </div>
        </CardContent>
      </Card>

      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            {success}
          </div>
        ) : null}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">
          Carregando área de prescrição...
        </p>
      ) : null}

      {selectedAlunoId && !loading ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList size={18} aria-hidden="true" /> Objetivos do PRNT
              </CardTitle>
              <CardDescription>
                Marque capacidades relacionadas e indique quando o objetivo
                também exige avaliação ou plano de ação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {goals.length ? (
                goals.map((goal) => {
                  const classification = classificationFor(goal.id);
                  return (
                    <div
                      key={goal.id}
                      className="rounded-lg border border-border p-4"
                    >
                      <div className="font-medium text-foreground">
                        {goal.title}
                      </div>
                      {goal.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {goal.description}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-3">
                        {PHYSICAL_CAPACITY_TYPES.map((capacity) => (
                          <label
                            key={capacity}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={classification.capacities.includes(
                                capacity,
                              )}
                              onChange={() =>
                                toggleGoalCapacity(goal.id, capacity)
                              }
                              disabled={!canManage || saving}
                            />
                            {capacityLabels[capacity]}
                          </label>
                        ))}
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={classification.relatesToAssessment}
                            onChange={(event) =>
                              setClassifications((items) => ({
                                ...items,
                                [goal.id]: {
                                  ...classification,
                                  relatesToAssessment: event.target.checked,
                                },
                              }))
                            }
                            disabled={!canManage || saving}
                          />
                          Avaliação
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={classification.relatesToActionPlan}
                            onChange={(event) =>
                              setClassifications((items) => ({
                                ...items,
                                [goal.id]: {
                                  ...classification,
                                  relatesToActionPlan: event.target.checked,
                                },
                              }))
                            }
                            disabled={!canManage || saving}
                          />
                          Plano de ação
                        </label>
                      </div>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3"
                          onClick={() => saveGoalClassification(goal.id)}
                          disabled={saving}
                        >
                          <Check size={16} aria-hidden="true" /> Salvar vínculo
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  O PRNT atual não possui objetivos ativos.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity size={18} aria-hidden="true" /> Camadas de capacidade
              </CardTitle>
              <CardDescription>
                Cada capacidade mantém fontes, justificativa e parâmetros
                próprios. A mensagem do aluno permanece separada da visão
                técnica.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div
                className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
                role="tablist"
                aria-label="Capacidades físicas"
              >
                {PHYSICAL_CAPACITY_TYPES.map((capacity) => {
                  const prescription = prescriptions.find(
                    (item) => item.capacity === capacity,
                  );
                  const active = activeCapacity === capacity;
                  return (
                    <button
                      id={`capacity-tab-${capacity}`}
                      key={capacity}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`capacity-panel-${capacity}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setActiveCapacity(capacity)}
                      onKeyDown={(event) =>
                        handleCapacityKeyDown(event, capacity)
                      }
                      className={
                        active
                          ? "rounded-lg border border-primary bg-primary/10 p-4 text-left text-primary"
                          : "rounded-lg border border-border bg-card p-4 text-left text-foreground hover:bg-muted"
                      }
                    >
                      <span className="block font-semibold">
                        {capacityLabels[capacity]}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {prescription
                          ? `${statusLabels[prescription.status]} · v${prescription.currentVersion}`
                          : "Ainda não versionada"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                id={`capacity-panel-${activeCapacity}`}
                role="tabpanel"
                aria-labelledby={`capacity-tab-${activeCapacity}`}
                className="space-y-5"
              >
                <section
                  className="rounded-lg border border-border p-4"
                  aria-labelledby="capacity-sources-title"
                >
                  <div className="mb-3">
                    <h3
                      id="capacity-sources-title"
                      className="flex items-center gap-2 font-semibold"
                    >
                      <Database size={17} aria-hidden="true" /> Fontes para{" "}
                      {capacityLabels[activeCapacity]}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A seleção é restaurada da última versão desta capacidade.
                      Novas fontes não são marcadas automaticamente.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {activeTechnicalSources.length ? (
                      activeTechnicalSources.map((item) => (
                        <label
                          key={item.key}
                          className="flex items-start gap-3 rounded-lg border border-border p-3"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={activeSelectedSourceKeys.has(item.key)}
                            onChange={() => toggleTechnicalSource(item.key)}
                            disabled={!canManage || saving}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-primary">
                              {technicalSourceLabels[item.kind]}
                            </span>
                            <span className="block font-medium text-foreground">
                              {item.title}
                            </span>
                            {item.description ? (
                              <span className="mt-1 block text-sm text-muted-foreground">
                                {item.description}
                              </span>
                            ) : null}
                            {item.ref.responsibleProfessorId ? (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Responsável técnico preservado na origem
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Não há fontes disponíveis. A versão ainda pode ser
                        registrada com nota técnica do professor.
                      </p>
                    )}
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label
                      htmlFor="capacity-status"
                      className="mb-1 block text-sm font-medium"
                    >
                      Status
                    </label>
                    <select
                      id="capacity-status"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={currentDraft.status}
                      onChange={(event) =>
                        updateCurrentDraft({
                          status: event.target
                            .value as CapacityPrescriptionStatus,
                        })
                      }
                      disabled={!canManage || saving}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="capacity-parameter-set"
                      className="mb-1 block text-sm font-medium"
                    >
                      Parâmetro versionado do contrato
                    </label>
                    <select
                      id="capacity-parameter-set"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={currentDraft.parameterSetId}
                      onChange={(event) =>
                        handleParameterSetChange(event.target.value)
                      }
                      disabled={!canManage || saving}
                    >
                      <option value="">Configuração manual desta versão</option>
                      {activeParameterSets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name} · v{item.version}
                          {item.isCurrent ? "" : " · histórico"}
                        </option>
                      ))}
                    </select>
                    {selectedParameterSet ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Fonte canônica:{" "}
                        {selectedParameterSet.methodologyVersion}. Para
                        personalizar, selecione configuração manual.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <LabeledTextarea
                    id="capacity-technical-justification"
                    label="Justificativa técnica do professor"
                    value={currentDraft.technicalJustification}
                    onChange={(value) =>
                      updateCurrentDraft({ technicalJustification: value })
                    }
                    disabled={!canManage || saving}
                  />
                  <LabeledTextarea
                    id="capacity-professor-summary"
                    label="Resumo técnico para outro profissional"
                    value={currentDraft.professorSummary}
                    onChange={(value) =>
                      updateCurrentDraft({ professorSummary: value })
                    }
                    disabled={!canManage || saving}
                  />
                </div>
                <LabeledTextarea
                  id="capacity-student-message"
                  label="Mensagem simples para o aluno ou WhatsApp"
                  value={currentDraft.studentMessage}
                  onChange={(value) =>
                    updateCurrentDraft({ studentMessage: value })
                  }
                  minHeight="min-h-[88px]"
                  disabled={!canManage || saving}
                  help="Não copie justificativas clínicas ou dados sensíveis para esta mensagem."
                />

                <fieldset
                  disabled={!canManage || saving || usesParameterSet}
                  className="space-y-4 disabled:opacity-75"
                >
                  <legend className="sr-only">
                    Parâmetros técnicos da capacidade
                  </legend>
                  <Input
                    label="PSE esperado (0 a 10)"
                    type="number"
                    min="0"
                    max="10"
                    value={currentDraft.expectedPse}
                    onChange={(event) =>
                      updateCurrentDraft({ expectedPse: event.target.value })
                    }
                  />

                  {activeCapacity === "resisted" ? (
                    <div className="space-y-4 rounded-lg border border-border p-4">
                      <h3 className="font-semibold">Parâmetros resistidos</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="capacity-method"
                            className="mb-1 block text-sm font-medium"
                          >
                            Método
                          </label>
                          <select
                            id="capacity-method"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={currentDraft.method}
                            onChange={(event) =>
                              updateCurrentDraft({ method: event.target.value })
                            }
                          >
                            <option value="">Selecione</option>
                            {methods.map((item) => (
                              <option key={item.id} value={item.code}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="capacity-split"
                            className="mb-1 block text-sm font-medium"
                          >
                            Divisão
                          </label>
                          <select
                            id="capacity-split"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={currentDraft.split}
                            onChange={(event) =>
                              updateCurrentDraft({ split: event.target.value })
                            }
                          >
                            <option value="">Selecione</option>
                            {splits.map((item) => (
                              <option key={item.id} value={item.code}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Input
                          label="Séries"
                          type="number"
                          min="1"
                          value={currentDraft.sets}
                          onChange={(event) =>
                            updateCurrentDraft({ sets: event.target.value })
                          }
                        />
                        <Input
                          label="Repetições / zona"
                          value={currentDraft.repetitions}
                          onChange={(event) =>
                            updateCurrentDraft({
                              repetitions: event.target.value,
                            })
                          }
                        />
                        <Input
                          label="Carga estimada"
                          value={currentDraft.load}
                          onChange={(event) =>
                            updateCurrentDraft({ load: event.target.value })
                          }
                        />
                        <Input
                          label="Reserva de repetições"
                          value={currentDraft.repetitionReserve}
                          onChange={(event) =>
                            updateCurrentDraft({
                              repetitionReserve: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {muscleGroups.map((item) => (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={currentDraft.muscleGroups.includes(
                                item.code,
                              )}
                              onChange={() => toggleMuscleGroup(item.code)}
                            />
                            {item.name}
                          </label>
                        ))}
                      </div>
                      <LabeledTextarea
                        id="capacity-resisted-restrictions"
                        label="Restrições do prontuário ou avaliação"
                        value={currentDraft.resistedRestrictions}
                        onChange={(value) =>
                          updateCurrentDraft({ resistedRestrictions: value })
                        }
                        minHeight="min-h-[72px]"
                        help="Separe restrições objetivas por vírgula. A decisão permanece com o professor."
                      />
                    </div>
                  ) : null}

                  {activeCapacity === "cyclic" ? (
                    <div className="space-y-4 rounded-lg border border-border p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="capacity-cyclic-category"
                            className="mb-1 block text-sm font-medium"
                          >
                            Estímulo cíclico
                          </label>
                          <select
                            id="capacity-cyclic-category"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={currentDraft.cyclicCategory}
                            onChange={(event) =>
                              updateCurrentDraft({
                                cyclicCategory: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {cyclicStimuli.map((item) => (
                              <option key={item.id} value={item.code}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="capacity-zone-basis"
                            className="mb-1 block text-sm font-medium"
                          >
                            Base de zona
                          </label>
                          <select
                            id="capacity-zone-basis"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={currentDraft.zoneBasis}
                            onChange={(event) =>
                              updateCurrentDraft({
                                zoneBasis: event.target
                                  .value as PrescriptionDraft["zoneBasis"],
                              })
                            }
                          >
                            <option value="max_hr">FC máxima</option>
                            <option value="heart_rate_reserve">
                              Reserva de FC
                            </option>
                            <option value="lan">LAn</option>
                            <option value="vo2max">% VO₂max</option>
                            <option value="pse">PSE</option>
                          </select>
                        </div>
                        <Input
                          label="Princípio de reversibilidade"
                          value={currentDraft.reversibilityPrinciple}
                          onChange={(event) =>
                            updateCurrentDraft({
                              reversibilityPrinciple: event.target.value,
                            })
                          }
                        />
                        <Input
                          label="% VO₂max"
                          type="number"
                          value={currentDraft.vo2MaxPercentage}
                          onChange={(event) =>
                            updateCurrentDraft({
                              vo2MaxPercentage: event.target.value,
                            })
                          }
                        />
                        <Input
                          label="Limiar anaeróbico"
                          value={currentDraft.anaerobicThreshold}
                          onChange={(event) =>
                            updateCurrentDraft({
                              anaerobicThreshold: event.target.value,
                            })
                          }
                        />
                        <Input
                          label="Tempo total"
                          value={currentDraft.time}
                          onChange={(event) =>
                            updateCurrentDraft({ time: event.target.value })
                          }
                        />
                        <Input
                          label="Distância total"
                          value={currentDraft.distance}
                          onChange={(event) =>
                            updateCurrentDraft({ distance: event.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-3 border-t border-border pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">
                              Zonas da prescrição
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Registre percentuais, volume, pace e frequência
                              cardíaca por zona.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={addCyclicZone}
                          >
                            <Plus size={16} aria-hidden="true" /> Adicionar zona
                          </Button>
                        </div>
                        {currentDraft.cyclicZones.map((zone, index) => (
                          <div
                            key={`${zone.name}-${index}`}
                            className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-3 xl:grid-cols-4"
                          >
                            <Input
                              label="Nome da zona"
                              value={zone.name}
                              onChange={(event) =>
                                updateCyclicZone(index, {
                                  name: event.target.value,
                                })
                              }
                            />
                            <Input
                              label="Percentual mínimo"
                              type="number"
                              min="0"
                              max="100"
                              value={zone.minPercent ?? ""}
                              onChange={(event) =>
                                updateCyclicZone(index, {
                                  minPercent: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                            <Input
                              label="Percentual máximo"
                              type="number"
                              min="0"
                              max="100"
                              value={zone.maxPercent ?? ""}
                              onChange={(event) =>
                                updateCyclicZone(index, {
                                  maxPercent: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            />
                            <Input
                              label="Volume da zona"
                              value={zone.volume ?? ""}
                              onChange={(event) =>
                                updateCyclicZone(index, {
                                  volume: event.target.value || null,
                                })
                              }
                            />
                            <Input
                              label="Pace alvo"
                              value={zone.pace ?? ""}
                              onChange={(event) =>
                                updateCyclicZone(index, {
                                  pace: event.target.value || null,
                                })
                              }
                            />
                            <Input
                              label="FC alvo"
                              value={zone.targetHeartRate ?? ""}
                              onChange={(event) =>
                                updateCyclicZone(index, {
                                  targetHeartRate: event.target.value || null,
                                })
                              }
                            />
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeCyclicZone(index)}
                              >
                                <Trash2 size={16} aria-hidden="true" /> Remover
                                zona
                              </Button>
                            </div>
                          </div>
                        ))}
                        {!currentDraft.cyclicZones.length ? (
                          <p className="text-sm text-muted-foreground">
                            Nenhuma zona adicionada.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {activeCapacity === "flexibility" ? (
                    <div className="space-y-4 rounded-lg border border-border p-4">
                      <div>
                        <h3 className="font-semibold">Seleção articular</h3>
                        <p className="text-sm text-muted-foreground">
                          Marque uma articulação para abrir seus dados técnicos.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {articulations.map((item) => (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={currentDraft.flexibilityArticulations.some(
                                (entry) => entry.name === item.name,
                              )}
                              onChange={() => toggleArticulation(item.name)}
                            />
                            {item.name}
                          </label>
                        ))}
                      </div>
                      {currentDraft.flexibilityArticulations.map((item) => (
                        <div
                          key={item.name}
                          className="grid gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 md:grid-cols-2"
                        >
                          <div className="font-medium md:col-span-2">
                            {item.name}
                          </div>
                          <Input
                            label="Ângulo avaliado"
                            type="number"
                            value={item.angle ?? ""}
                            onChange={(event) =>
                              updateArticulation(item.name, {
                                angle: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                          />
                          <Input
                            label="Déficit"
                            value={item.deficit || ""}
                            onChange={(event) =>
                              updateArticulation(item.name, {
                                deficit: event.target.value,
                              })
                            }
                          />
                          <div>
                            <label className="mb-1 block text-sm font-medium">
                              Prioridade
                            </label>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={item.priority || "medium"}
                              onChange={(event) =>
                                updateArticulation(item.name, {
                                  priority: event.target
                                    .value as FlexibilityArticulationParameters["priority"],
                                })
                              }
                            >
                              <option value="low">Baixa</option>
                              <option value="medium">Média</option>
                              <option value="high">Alta</option>
                            </select>
                          </div>
                          <Input
                            label="Prescrição sugerida"
                            value={item.suggestedPrescription || ""}
                            onChange={(event) =>
                              updateArticulation(item.name, {
                                suggestedPrescription: event.target.value,
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {activeCapacity === "balance" ? (
                    <div className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2">
                      <Input
                        label="Foco"
                        value={currentDraft.balanceFocus}
                        onChange={(event) =>
                          updateCurrentDraft({
                            balanceFocus: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Apoios, separados por vírgula"
                        value={currentDraft.balanceSupports}
                        onChange={(event) =>
                          updateCurrentDraft({
                            balanceSupports: event.target.value,
                          })
                        }
                      />
                      <div className="md:col-span-2">
                        <LabeledTextarea
                          id="capacity-balance-progression"
                          label="Notas de progressão"
                          value={currentDraft.balanceProgressionNotes}
                          onChange={(value) =>
                            updateCurrentDraft({
                              balanceProgressionNotes: value,
                            })
                          }
                          minHeight="min-h-[72px]"
                        />
                      </div>
                    </div>
                  ) : null}
                </fieldset>

                {canManage ? (
                  <Button
                    type="button"
                    onClick={savePrescription}
                    disabled={saving}
                  >
                    <Save size={16} aria-hidden="true" /> Versionar{" "}
                    {capacityLabels[activeCapacity]}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planejamento macro, meso e micro</CardTitle>
              <CardDescription>
                Registre objetivo do mesociclo, carga do microciclo, volume,
                frequência e parâmetros da capacidade ativa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset
                disabled={!canManage || saving}
                className="space-y-4 disabled:opacity-75"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label
                      htmlFor="planning-level"
                      className="mb-1 block text-sm font-medium"
                    >
                      Nível
                    </label>
                    <select
                      id="planning-level"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={planningDraft.level}
                      onChange={(event) =>
                        setPlanningDraft((current) => ({
                          ...current,
                          level: event.target.value as CapacityPlanningLevel,
                          parentId: "",
                        }))
                      }
                    >
                      {Object.entries(planningLevelLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  {planningDraft.level !== "macro" ? (
                    <div>
                      <label
                        htmlFor="planning-parent"
                        className="mb-1 block text-sm font-medium"
                      >
                        Ciclo pai
                      </label>
                      <select
                        id="planning-parent"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={planningDraft.parentId}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            parentId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione</option>
                        {parentOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <Input
                    label="Código"
                    value={planningDraft.code}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Nome"
                    value={planningDraft.name}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Data inicial"
                    type="date"
                    value={planningDraft.startDate}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Data final"
                    type="date"
                    value={planningDraft.endDate}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                  />
                  {planningDraft.level === "micro" ? (
                    <div>
                      <label
                        htmlFor="planning-load"
                        className="mb-1 block text-sm font-medium"
                      >
                        Carga do microciclo
                      </label>
                      <select
                        id="planning-load"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={planningDraft.loadCode}
                        onChange={(event) =>
                          setPlanningDraft((current) => ({
                            ...current,
                            loadCode: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione</option>
                        {microcycleLoads.map((item) => (
                          <option key={item.id} value={item.code}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <Input
                    label="Volume"
                    value={planningDraft.volume}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({
                        ...current,
                        volume: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Frequência"
                    value={planningDraft.frequency}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({
                        ...current,
                        frequency: event.target.value,
                      }))
                    }
                  />
                </div>
                <LabeledTextarea
                  id="planning-objective"
                  label="Objetivo do ciclo"
                  value={planningDraft.objective}
                  onChange={(value) =>
                    setPlanningDraft((current) => ({
                      ...current,
                      objective: value,
                    }))
                  }
                  minHeight="min-h-[88px]"
                />
                {canManage ? (
                  <Button
                    type="button"
                    onClick={savePlanning}
                    disabled={saving}
                  >
                    <Save size={16} aria-hidden="true" /> Versionar ciclo
                  </Button>
                ) : null}
              </fieldset>

              {planning.length ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Ciclos registrados
                  </h3>
                  {planning.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-border px-4 py-3 text-sm"
                    >
                      <div className="font-medium text-foreground">
                        {planningLevelLabels[item.level]} · {item.code} · v
                        {item.version}
                      </div>
                      <div className="text-muted-foreground">{item.name}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum ciclo registrado para o aluno.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
