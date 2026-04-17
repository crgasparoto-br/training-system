import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, CheckCircle, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import WorkoutBuilderCyclic from './WorkoutBuilderCyclic';
import WorkoutBuilderResistance from './WorkoutBuilderResistance';
import { planService } from '../../services/plan.service';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { assessmentService } from '../../services/assessment.service';
import { periodizationService, ResistedStimulus } from '../../services/periodization.service';
import { workoutService } from '../../services/workout.service';
import { isDateWithinRange, parseDateOnly, toDateInputValue, toIsoDateAtNoonUTC } from '../../utils/date';

type ResistedSectionKey = 'mobilidade' | 'sessao' | 'resfriamento';

export default function WorkoutBuilder2() {
  const { planId, mesocycleNumber: mesoParam, weekNumber: weekParam } = useParams();
  const navigate = useNavigate();

  const normalizeWorkoutDays = (workoutDays: any) => {
    if (Array.isArray(workoutDays)) {
      return workoutDays.reduce<Record<number, any>>((acc, day) => {
        acc[day.dayOfWeek] = day;
        return acc;
      }, {});
    }
    if (workoutDays && typeof workoutDays === 'object') {
      return Object.entries(workoutDays).reduce<Record<number, any>>((acc, [key, day]) => {
        const rawDay = (day ?? {}) as Record<string, any>;
        const dayOfWeek = Number(rawDay.dayOfWeek ?? key);
        acc[dayOfWeek] = { ...rawDay, dayOfWeek };
        return acc;
      }, {});
    }
    return {};
  };

  const buildResistedExercisesFromTemplate = (template: any) => {
    const base: Record<number, Record<ResistedSectionKey, any[]>> = {};
    for (let day = 1; day <= 7; day += 1) {
      base[day] = { mobilidade: [], sessao: [], resfriamento: [] };
    }

    const workoutDays = Array.isArray(template?.workoutDays)
      ? template.workoutDays
      : Object.values(template?.workoutDays || {});

    workoutDays.forEach((day: any) => {
      const dayOfWeek = day?.dayOfWeek;
      if (!dayOfWeek) return;
      const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
      exercises.forEach((exercise: any) => {
        const section = (exercise.section as ResistedSectionKey) || 'sessao';
        if (!base[dayOfWeek]) {
          base[dayOfWeek] = { mobilidade: [], sessao: [], resfriamento: [] };
        }
        base[dayOfWeek][section] = base[dayOfWeek][section] || [];
        base[dayOfWeek][section].push({
          id: exercise.id,
          exerciseId: exercise.exerciseId,
          name: exercise.exercise?.name ?? '',
          category: exercise.exercise?.category ?? exercise.exerciseCategory,
          system: exercise.system ?? null,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          interval: exercise.intervalSec ?? null,
          cParam: exercise.cParam ?? null,
          eParam: exercise.eParam ?? null,
          load: exercise.load ?? null,
          adjustment: exercise.exerciseNotes ?? null,
        });
      });
    });

    return base;
  };

  const [activeTab, setActiveTab] = useState<'cyclic' | 'resistance'>('cyclic');
  const [planData, setPlanData] = useState<any>(null);
  const [resistedSummaryByWeek, setResistedSummaryByWeek] = useState<
    Record<number, ResistedStimulus | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyWeekError, setCopyWeekError] = useState<string | null>(null);
  const [copyModeByWeek, setCopyModeByWeek] = useState<Record<number, { cyclic: boolean; resistance: boolean }>>({});
  const [templateDataByWeek, setTemplateDataByWeek] = useState<Record<number, any>>({});
  const [totalMesocycles, setTotalMesocycles] = useState(12);
  const [weeksPerMesocycle, setWeeksPerMesocycle] = useState(4);
  const [alunoData, setAlunoData] = useState<Aluno | null>(null);
  const [vamValue, setVamValue] = useState<number | null>(null);

  // ParÃ¢metros Ãºnicos compartilhados
  const [mesocycleNumber, setMesocycleNumber] = useState(parseInt(mesoParam || '1'));

  const mesoOptions = useMemo(
    () => Array.from({ length: totalMesocycles }, (_, index) => index + 1),
    [totalMesocycles]
  );
  const weekOptions = useMemo(
    () => Array.from({ length: weeksPerMesocycle }, (_, index) => index + 1),
    [weeksPerMesocycle]
  );
  const summaryVisibilityUserKey =
    planData?.aluno?.user?.id ?? planData?.alunoId ?? 'unknown-user';
  const summaryVisibilityStorageKey = planId
    ? `workoutBuilder2:summaryVisibility:${planId}:${mesocycleNumber}:${summaryVisibilityUserKey}`
    : 'workoutBuilder2:summaryVisibility:unknown';
  const mesocycleFilterStorageKey = planId
    ? `workoutBuilder2:mesocycleFilter:${planId}:${summaryVisibilityUserKey}`
    : 'workoutBuilder2:mesocycleFilter:unknown';


  const [summaryVisibilityByWeek, setSummaryVisibilityByWeek] = useState<
    Record<number, { session: boolean; resistedSummary: boolean }>
  >(() =>
    weekOptions.reduce((acc, week) => {
      acc[week] = { session: true, resistedSummary: true };
      return acc;
    }, {} as Record<number, { session: boolean; resistedSummary: boolean }>)
  );
  const weekFilterStorageKey = planId
    ? `workoutBuilder2:weekFilter:${planId}:${mesocycleNumber}:${summaryVisibilityUserKey}`
    : 'workoutBuilder2:weekFilter:unknown';
  const [visibleWeeks, setVisibleWeeks] = useState<Record<number, boolean>>({});
  const [methodParameters, setMethodParameters] = useState<any[]>([]);
  const [assemblyParameters, setAssemblyParameters] = useState<any[]>([]);
  const [loadCycleParameters, setLoadCycleParameters] = useState<any[]>([]);
  const [objectiveParameters, setObjectiveParameters] = useState<any[]>([]);

  // Auto-save timer
  const [autoSaveTimers, setAutoSaveTimers] = useState<Record<number, NodeJS.Timeout>>({});
  const resistanceScrollContainersRef = useRef(new Map<number, HTMLDivElement>());
  const resistanceIsSyncingRef = useRef(false);

  useEffect(() => {
    loadTemplate();
  }, [planId, mesocycleNumber]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(summaryVisibilityStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<number, { session: boolean; resistedSummary: boolean }>;
        const merged = weekOptions.reduce((acc, week) => {
          acc[week] = parsed[week] ?? { session: true, resistedSummary: true };
          return acc;
        }, {} as Record<number, { session: boolean; resistedSummary: boolean }>);
        setSummaryVisibilityByWeek(merged);
        return;
      }
    } catch (error) {
      // ignore storage errors
    }
    setSummaryVisibilityByWeek(
      weekOptions.reduce((acc, week) => {
        acc[week] = { session: true, resistedSummary: true };
        return acc;
      }, {} as Record<number, { session: boolean; resistedSummary: boolean }> )
    );
  }, [summaryVisibilityStorageKey, weekOptions]);

  const resolveWeekParam = useCallback(() => {
    const parsed = Number(weekParam);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [weekParam]);

  const navigateToMesocycle = useCallback((nextMesocycle: number) => {
    if (!planId) return;
    const weekNumber = resolveWeekParam();
    navigate(`/plans/${planId}/workout-builder/${nextMesocycle}/${weekNumber}`, { replace: true });
  }, [navigate, planId, resolveWeekParam]);

  const hasAppliedStoredMesoRef = useRef(false);

  useEffect(() => {
    if (!planId) return;
    const paramValue = Number(mesoParam);
    const hasParam = Number.isFinite(paramValue) && paramValue > 0;

    if (hasParam && paramValue !== mesocycleNumber) {
      setMesocycleNumber(paramValue);
      return;
    }

    if (hasAppliedStoredMesoRef.current) return;

    try {
      const stored = localStorage.getItem(mesocycleFilterStorageKey);
      if (!stored) return;
      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) return;
      const normalized = Math.min(Math.max(1, parsed), totalMesocycles);
      if (!hasParam && normalized !== mesocycleNumber) {
        hasAppliedStoredMesoRef.current = true;
        setMesocycleNumber(normalized);
        navigateToMesocycle(normalized);
      }
    } catch (error) {
      // ignore storage errors
    }
  }, [planId, mesoParam, mesocycleFilterStorageKey, totalMesocycles, mesocycleNumber, navigateToMesocycle]);

  useEffect(() => {
    try {
      localStorage.setItem(mesocycleFilterStorageKey, String(mesocycleNumber));
    } catch (error) {
      // ignore storage errors
    }
  }, [mesocycleFilterStorageKey, mesocycleNumber]);


  useEffect(() => {
    Object.values(autoSaveTimers).forEach(timer => clearTimeout(timer));
    setAutoSaveTimers({});
  }, [mesocycleNumber]);

  useEffect(() => {
    setCopyModeByWeek((prev) => {
      const updated = { ...prev };
      weekOptions.forEach((week) => {
        if (!updated[week]) {
          updated[week] = { cyclic: true, resistance: true };
        }
      });
      return updated;
    });
  }, [weekOptions]);

  useEffect(() => {
    const loadParameters = async () => {
      try {
        const [methods, assemblies, loadCycles, objectives] = await Promise.all([
          periodizationService.getParametersByCategory('metodo'),
          periodizationService.getParametersByCategory('montagem'),
          periodizationService.getParametersByCategory('carga_microciclo'),
          periodizationService.getParametersByCategory('objetivo')
        ]);
        setMethodParameters(methods);
        setAssemblyParameters(assemblies);
        setLoadCycleParameters(loadCycles);
        setObjectiveParameters(objectives);
      } catch (error) {
        setMethodParameters([]);
        setAssemblyParameters([]);
        setLoadCycleParameters([]);
        setObjectiveParameters([]);
      }
    };

    void loadParameters();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(summaryVisibilityStorageKey, JSON.stringify(summaryVisibilityByWeek));
    } catch (error) {
      // ignore storage errors
    }
  }, [summaryVisibilityByWeek, summaryVisibilityStorageKey]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(weekFilterStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<number, boolean>;
        const merged = weekOptions.reduce((acc, week) => {
          acc[week] = parsed[week] ?? true;
          return acc;
        }, {} as Record<number, boolean>);
        setVisibleWeeks(merged);
        return;
      }
    } catch (error) {
      // ignore storage errors
    }
    setVisibleWeeks(
      weekOptions.reduce((acc, week) => {
        acc[week] = true;
        return acc;
      }, {} as Record<number, boolean>)
    );
  }, [weekFilterStorageKey, weekOptions]);

  useEffect(() => {
    try {
      localStorage.setItem(weekFilterStorageKey, JSON.stringify(visibleWeeks));
    } catch (error) {
      // ignore storage errors
    }
  }, [visibleWeeks, weekFilterStorageKey]);


  const buildCacheKey = (
    planId: string,
    mesocycle: number,
    week: number,
    planUpdatedAt?: string
  ) => {
    if (!planId) return null;
    const version = planUpdatedAt || 'unknown-version';
    return `workoutBuilder2:${planId}:${mesocycle}:${week}:${version}`;
  };

  const resolveWeekStartDate = (mesocycle: number, week: number) => {
    if (!planData?.startDate) return null;
    const start = parseDateOnly(planData.startDate);
    if (!start) return null;
    const weekIndex = (mesocycle - 1) * weeksPerMesocycle + (week - 1);
    const date = new Date(start);
    date.setDate(start.getDate() + weekIndex * 7);
    const dateInput = toDateInputValue(date);
    return toIsoDateAtNoonUTC(dateInput);
  };

  const resolveWeekDayDate = (weekStartDate: string | Date, dayOfWeek: number) => {
    const start = parseDateOnly(weekStartDate) ?? new Date(weekStartDate);
    const startJsDay = start.getDay();
    const startWeekday = startJsDay === 0 ? 7 : startJsDay; // 1=Seg ... 7=Dom
    const offset = dayOfWeek - startWeekday;
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    return date;
  };

  const buildWeekDayEditability = (weekStartDate: string | null) => {
    if (!weekStartDate || !planData?.startDate || !planData?.endDate) {
      return Array.from({ length: 7 }, () => true);
    }
    return Array.from({ length: 7 }, (_, idx) => {
      const dayOfWeek = idx + 1;
      const date = resolveWeekDayDate(weekStartDate, dayOfWeek);
      return isDateWithinRange(date, planData.startDate, planData.endDate);
    });
  };

  const resolveWeekDate = (weekStartDate: string | Date, dayOfWeek: number) => {
    const start = typeof weekStartDate === 'string' ? new Date(weekStartDate) : new Date(weekStartDate);
    const startJsDay = start.getDay();
    const startWeekday = startJsDay === 0 ? 7 : startJsDay; // 1=Seg ... 7=Dom
    const offset = dayOfWeek - startWeekday;
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    return date;
  };

  const loadTemplate = async () => {
    try {
      setLoading(true);
      setTemplateDataByWeek({});
      
      // Carregar dados do plano
      if (planId) {
        const plan = await planService.getById(planId);
        setPlanData(plan);
        if (plan?.alunoId) {
          try {
            const aluno = await alunoService.getById(plan.alunoId);
            setAlunoData(aluno);
          } catch (error) {
            setAlunoData(null);
          }
          try {
            const assessments = await assessmentService.listByAluno(plan.alunoId);
            const latest = assessments
              .filter((assessment) => assessment.assessmentDate)
              .sort(
                (a, b) =>
                  new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime()
              )
              .slice(-1)[0];
            const toNumber = (value: any) => {
              if (value === null || value === undefined) return null;
              if (typeof value === 'number' && Number.isFinite(value)) return value;
              if (typeof value === 'string') {
                let cleaned = value.trim();
                if (cleaned.includes(',')) {
                  cleaned = cleaned.replace(/\./g, '').replace(',', '.');
                }
                cleaned = cleaned.replace(/[^\d.-]/g, '');
                if (!cleaned) return null;
                const parsed = Number(cleaned);
                return Number.isFinite(parsed) ? parsed : null;
              }
              return null;
            };
            const vamCandidate =
              latest?.extractedData?.variables?.['VAM (km/h)'] ??
              latest?.extractedData?.variables?.['VAM'] ??
              latest?.extractedData?.['VAM (km/h)'] ??
              latest?.extractedData?.['VAM'];
            setVamValue(toNumber(vamCandidate));
          } catch (error) {
            setVamValue(null);
          }
        } else {
          setAlunoData(null);
          setVamValue(null);
        }

        const matrix = await periodizationService.getMatrixByPlanId(planId);
        if (matrix) {
          const resistedStimuli = await periodizationService.getResistedStimulusByMatrix(matrix.id);
          const groupedResisted = periodizationService.groupResistedByMesocycleAndWeek(resistedStimuli);
          const resistedByWeek: Record<number, ResistedStimulus | null> = {};
          weekOptions.forEach((week) => {
            resistedByWeek[week] = groupedResisted.get(mesocycleNumber)?.get(week) || null;
          });
          setResistedSummaryByWeek(resistedByWeek);
          setTotalMesocycles(matrix.totalMesocycles);
          setWeeksPerMesocycle(matrix.weeksPerMesocycle ?? 4);
        } else {
          setResistedSummaryByWeek({});
          if (plan.startDate && plan.endDate) {
            const start = parseDateOnly(plan.startDate);
            const end = parseDateOnly(plan.endDate);
            if (start && end) {
              const diffTime = Math.abs(end.getTime() - start.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              const totalWeeks = Math.max(1, Math.ceil(diffDays / 7));
              const computedMesos = Math.max(1, Math.ceil(totalWeeks / 4));
              setTotalMesocycles(computedMesos);
            } else {
              setTotalMesocycles(12);
            }
          }
        }
        
        // TODO: Carregar dados da periodizaÃ§Ã£o via API
        // const periodization = await periodizationService.getCyclicStimulus(planId, mesocycleNumber, weekNumber);
        
        // Mock temporÃ¡rio - simular dados da periodizaÃ§Ã£o
        const mockPeriodization = {
          totalVolumeMinutes: 284,
          totalVolumeKm: 0,
          minutesZ1: 71,  // 25% de 284
          minutesZ2: 114, // 40% de 284
          minutesZ3: 57,  // 20% de 284
          minutesZ4: 28,  // 10% de 284
          minutesZ5: 14   // 5% de 284
        };
        
        // Calcular distribuiÃ§Ã£o percentual
        const distributionZ1 = mockPeriodization.totalVolumeMinutes > 0 
          ? Math.round((mockPeriodization.minutesZ1 / mockPeriodization.totalVolumeMinutes) * 100)
          : 0;
        const distributionZ2 = mockPeriodization.totalVolumeMinutes > 0
          ? Math.round((mockPeriodization.minutesZ2 / mockPeriodization.totalVolumeMinutes) * 100)
          : 0;
        const distributionZ3 = mockPeriodization.totalVolumeMinutes > 0
          ? Math.round((mockPeriodization.minutesZ3 / mockPeriodization.totalVolumeMinutes) * 100)
          : 0;
        const distributionZ4 = mockPeriodization.totalVolumeMinutes > 0
          ? Math.round((mockPeriodization.minutesZ4 / mockPeriodization.totalVolumeMinutes) * 100)
          : 0;
        const distributionZ5 = mockPeriodization.totalVolumeMinutes > 0
          ? Math.round((mockPeriodization.minutesZ5 / mockPeriodization.totalVolumeMinutes) * 100)
          : 0;
        
        const weeksPerMesocycle = matrix?.weeksPerMesocycle ?? 4;
        setWeeksPerMesocycle(weeksPerMesocycle);
        const templates = await Promise.all(
          weekOptions.map(async (weekNumber) => {
            const weekStartDate = (() => {
              const start = parseDateOnly(plan.startDate) ?? new Date();
              const weekIndex = (mesocycleNumber - 1) * weeksPerMesocycle + (weekNumber - 1);
              const date = new Date(start);
              date.setDate(start.getDate() + weekIndex * 7);
              const dateInput = toDateInputValue(date);
              return toIsoDateAtNoonUTC(dateInput);
            })();

            const templateFromApi = await workoutService.getOrCreateTemplate({
              planId,
              mesocycleNumber,
              weekNumber,
              weekStartDate
            });
            const resistedFromApi = buildResistedExercisesFromTemplate(templateFromApi);

            const mergedTemplate = {
              ...templateFromApi,
              alunoId: plan.alunoId,
              totalVolumeMin: mockPeriodization.totalVolumeMinutes,
              totalVolumeKm: mockPeriodization.totalVolumeKm,
              distributionZ1,
              distributionZ2,
              distributionZ3,
              distributionZ4,
              distributionZ5,
              weekStartDate,
              mesocycleNumber,
              weekNumber,
              resistedExercises: resistedFromApi,
            };

            const cachedKey = buildCacheKey(planId, mesocycleNumber, weekNumber, plan.updatedAt);
            const cached = cachedKey ? localStorage.getItem(cachedKey) : null;
            if (cached) {
              try {
                const cachedData = JSON.parse(cached);
                const releasedData = {
                  released: templateFromApi.released,
                  releasedAt: templateFromApi.releasedAt,
                };
                return {
                  ...mergedTemplate,
                  ...cachedData,
                  resistedExercises: cachedData?.resistedExercises ?? resistedFromApi,
                  ...releasedData,
                  id: templateFromApi.id,
                  weekStartDate: mergedTemplate.weekStartDate,
                  mesocycleNumber,
                  weekNumber,
                  planId
                };
              } catch (error) {
                return mergedTemplate;
              }
            }

            return mergedTemplate;
          })
        );

        const templatesByWeek = templates.reduce<Record<number, any>>((acc, template) => {
          acc[template.weekNumber] = template;
          return acc;
        }, {});

        setTemplateDataByWeek(templatesByWeek);
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      alert('Erro ao carregar dados do plano');
      navigate('/plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = (weekNumber: number, newData: any) => {
    const merged = {
      ...(templateDataByWeek[weekNumber] || {}),
      ...newData,
      workoutDays:
        newData?.workoutDays !== undefined
          ? newData.workoutDays
          : templateDataByWeek[weekNumber]?.workoutDays,
      resistedExercises:
        newData?.resistedExercises !== undefined
          ? newData.resistedExercises
          : templateDataByWeek[weekNumber]?.resistedExercises,
    };

    setTemplateDataByWeek((prev) => ({
      ...prev,
      [weekNumber]: merged
    }));
    const resolvedPlanId = merged?.planId ?? planId;
    const resolvedMesocycle = merged?.mesocycleNumber ?? mesocycleNumber;
    const resolvedWeek = merged?.weekNumber ?? weekNumber;
    const key = resolvedPlanId
      ? buildCacheKey(
          resolvedPlanId,
          resolvedMesocycle,
          resolvedWeek,
          planData?.updatedAt
        )
      : null;

    if (key) {
      localStorage.setItem(key, JSON.stringify(merged));
    }
    
    // Auto-save apÃ³s 2 segundos de inatividade
    if (autoSaveTimers[weekNumber]) {
      clearTimeout(autoSaveTimers[weekNumber]);
    }
    
    const timer = setTimeout(() => {
      handleSave(merged);
    }, 2000);
    
    setAutoSaveTimers((prev) => ({
      ...prev,
      [weekNumber]: timer
    }));
  };

  const handleSave = async (data: any) => {
    try {
      setSaving(true);
      if (!data) return;
      if (data?.id) {
        await workoutService.updateTemplate(data.id, {
          cyclicFrequency: data.cyclicFrequency,
          resistanceFrequency: data.resistanceFrequency,
          totalVolumeMin: data.totalVolumeMin,
          totalVolumeKm: data.totalVolumeKm,
          loadPercentage: data.loadPercentage,
          repZone: data.repZone,
          repReserve: data.repReserve,
          trainingMethod: data.trainingMethod,
          trainingDivision: data.trainingDivision,
          alunoGoal: data.alunoGoal,
          coachGoal: data.coachGoal,
          observation1: data.observation1,
          observation2: data.observation2,
        });

        if (data.workoutDays) {
          const daysArray = Array.isArray(data.workoutDays)
            ? data.workoutDays
            : Object.values(data.workoutDays);

          const weekStart = data.weekStartDate ? new Date(data.weekStartDate) : null;

          for (const day of daysArray) {
            if (!day?.dayOfWeek) continue;

            const workoutDate = day.workoutDate
              ? new Date(day.workoutDate)
              : weekStart
                ? resolveWeekDate(weekStart, day.dayOfWeek)
                : new Date();

            const savedDay = await workoutService.getOrCreateDay({
              templateId: data.id,
              dayOfWeek: day.dayOfWeek,
              workoutDate: workoutDate.toISOString(),
            });

            await workoutService.updateDay(savedDay.id, {
              sessionDurationMin: day.sessionDurationMin,
              cyclicTimeMin: day.cyclicTimeMin,
              resistanceTimeMin: day.resistanceTimeMin,
              stimulusDurationMin: day.stimulusDurationMin,
              location: day.location,
              method: day.method,
              intensity1: day.intensity1,
              intensity2: day.intensity2,
              numSessions: day.numSessions,
              numSets: day.numSets,
              sessionTime: day.sessionTime,
              restTime: day.restTime,
              vo2maxIntervalPct: day.vo2maxIntervalPct,
              iextIintTime: day.iextIintTime,
              vo2maxPct: day.vo2maxPct,
              targetHrMin: day.targetHrMin,
              targetHrMax: day.targetHrMax,
              targetSpeedMin: day.targetSpeedMin,
              targetSpeedMax: day.targetSpeedMax,
              detailNotes: day.detailNotes,
              complementNotes: day.complementNotes,
              generalGuidelines: day.generalGuidelines,
            });
          }
        }

        if (data.resistedExercises) {
          const weekStart = data.weekStartDate ? new Date(data.weekStartDate) : null;
          for (const dayOfWeek of dayNumbers) {
            const correctedDate = weekStart
              ? resolveWeekDate(weekStart, dayOfWeek)
              : new Date();
            const targetDay = await workoutService.getOrCreateDay({
              templateId: data.id,
              dayOfWeek,
              workoutDate: correctedDate.toISOString(),
            });

            const existingExercises = await workoutService.getExercises(targetDay.id);
            if (existingExercises.length) {
              await Promise.all(existingExercises.map((exercise) => workoutService.deleteExercise(exercise.id)));
            }

            const daySections = data.resistedExercises?.[dayOfWeek] || {};
            const sectionEntries = Object.entries(daySections) as Array<[string, any[]]>;
            for (const [section, exercises] of sectionEntries) {
              const list = Array.isArray(exercises) ? exercises : [];
              await Promise.all(
                list.map((exercise, index) => {
                  if (!exercise?.exerciseId) return Promise.resolve();
                  return workoutService.addExercise({
                    workoutDayId: targetDay.id,
                    exerciseId: exercise.exerciseId,
                    section,
                    exerciseOrder: index + 1,
                    system: exercise.system ?? undefined,
                    sets: exercise.sets ?? undefined,
                    reps: exercise.reps ?? undefined,
                    intervalSec: exercise.interval ?? undefined,
                    cParam: exercise.cParam ?? undefined,
                    eParam: exercise.eParam ?? undefined,
                    load: exercise.load ?? undefined,
                    exerciseNotes: exercise.adjustment ?? exercise.exerciseNotes ?? undefined,
                  });
                })
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWeek = async (sourceWeekNumber: number) => {
    if (!planId) return;

    const sourceTemplate = templateDataByWeek[sourceWeekNumber];
    if (!sourceTemplate?.id) {
      alert('NÃ£o foi possÃ­vel localizar o template da semana selecionada.');
      return;
    }

    const baseWeekNumber = (mesocycleNumber - 1) * weeksPerMesocycle;
    const absoluteSourceWeek = baseWeekNumber + sourceWeekNumber;
    const absoluteRangeStart = baseWeekNumber + 1;
    const absoluteRangeEnd = baseWeekNumber + weeksPerMesocycle;

    const mode = copyModeByWeek[sourceWeekNumber] ?? { cyclic: true, resistance: true };
    const copyMode = mode.cyclic && mode.resistance ? '1' : mode.cyclic ? '2' : mode.resistance ? '3' : '';
    if (!copyMode) {
      alert('Selecione pelo menos um treinamento para copiar.');
      return;
    }

    const input = prompt(
      `Copiar a semana ${absoluteSourceWeek} para qual semana do mesociclo ${mesocycleNumber}? (${absoluteRangeStart}-${absoluteRangeEnd})`,
      String(absoluteSourceWeek)
    );

    if (input === null) return;

    const absoluteTargetWeek = Number(input);
    const targetWeekNumber = absoluteTargetWeek - baseWeekNumber;
    if (
      !Number.isFinite(absoluteTargetWeek) ||
      targetWeekNumber < 1 ||
      targetWeekNumber > weeksPerMesocycle
    ) {
      alert('Semana de destino invÃ¡lida.');
      return;
    }

    if (targetWeekNumber === sourceWeekNumber) {
      alert('Selecione uma semana de destino diferente da semana origem.');
      return;
    }

    const targetTemplate = templateDataByWeek[targetWeekNumber];
    const confirmMessage = targetTemplate?.id
      ? `Isso irÃ¡ substituir os dados da semana ${absoluteTargetWeek}. Deseja continuar?`
      : `Deseja copiar a semana ${absoluteSourceWeek} para a semana ${absoluteTargetWeek}?`;

    if (!confirm(confirmMessage)) return;

    try {
      setSaving(true);
      setCopyWeekError(null);

      const resolvedStartDate =
        resolveWeekStartDate(mesocycleNumber, targetWeekNumber) ||
        targetTemplate?.weekStartDate ||
        sourceTemplate?.weekStartDate;

      if (!resolvedStartDate) {
        alert('NÃ£o foi possÃ­vel determinar a data de inÃ­cio da semana de destino.');
        return;
      }

      const weekStart = new Date(resolvedStartDate);
      const clearCacheForWeek = () => {
        const cacheKey = buildCacheKey(planId, mesocycleNumber, targetWeekNumber, planData?.updatedAt);
        if (cacheKey) {
          localStorage.removeItem(cacheKey);
        }
      };

      let refreshed: any;

      if (copyMode === '1') {
        if (targetTemplate?.id) {
          await workoutService.deleteTemplate(targetTemplate.id);
          clearCacheForWeek();
        }

        const sourceFromApi = await workoutService.getTemplate(sourceTemplate.id);
        const copied = await workoutService.copyTemplate(
          sourceFromApi.id,
          targetWeekNumber,
          resolvedStartDate
        );

        if (copied?.workoutDays?.length) {
          await Promise.all(
            copied.workoutDays.map((day: any) => {
              if (!day?.id || !day?.dayOfWeek) return Promise.resolve();
              const correctedDate = resolveWeekDate(weekStart, day.dayOfWeek);
              return workoutService.updateDay(day.id, { workoutDate: correctedDate.toISOString() });
            })
          );
        }

        refreshed = await workoutService.getTemplate(copied.id);
      } else {
        const sourceFromApi = await workoutService.getTemplate(sourceTemplate.id);
        const targetTemplateFromApi = await workoutService.getOrCreateTemplate({
          planId,
          mesocycleNumber,
          weekNumber: targetWeekNumber,
          weekStartDate: resolvedStartDate,
        });

        const sourceDays = Array.isArray(sourceFromApi.workoutDays)
          ? sourceFromApi.workoutDays
          : Object.values(sourceFromApi.workoutDays || {});

        const sourceDayMap = sourceDays.reduce<Record<number, any>>((acc, day) => {
          const rawDay = (day ?? {}) as Record<string, any>;
          if (rawDay.dayOfWeek) acc[rawDay.dayOfWeek] = rawDay;
          return acc;
        }, {});

        if (copyMode === '2') {
          await workoutService.updateTemplate(targetTemplateFromApi.id, {
            cyclicFrequency: sourceFromApi.cyclicFrequency ?? null,
            totalVolumeMin: sourceFromApi.totalVolumeMin ?? null,
            totalVolumeKm: sourceFromApi.totalVolumeKm ?? null,
          });

          await Promise.all(
            dayNumbers.map(async (dayOfWeek) => {
              const sourceDay = sourceDayMap[dayOfWeek];
              const correctedDate = resolveWeekDate(weekStart, dayOfWeek);
              const targetDay = await workoutService.getOrCreateDay({
                templateId: targetTemplateFromApi.id,
                dayOfWeek,
                workoutDate: correctedDate.toISOString(),
              });
              if (!sourceDay) return;
              await workoutService.updateDay(targetDay.id, {
                workoutDate: correctedDate.toISOString(),
                sessionDurationMin: sourceDay.sessionDurationMin ?? null,
                cyclicTimeMin: sourceDay.cyclicTimeMin ?? null,
                stimulusDurationMin: sourceDay.stimulusDurationMin ?? null,
                location: sourceDay.location ?? null,
                method: sourceDay.method ?? null,
                intensity1: sourceDay.intensity1 ?? null,
                intensity2: sourceDay.intensity2 ?? null,
                numSessions: sourceDay.numSessions ?? null,
                numSets: sourceDay.numSets ?? null,
                sessionTime: sourceDay.sessionTime ?? null,
                restTime: sourceDay.restTime ?? null,
                vo2maxIntervalPct: sourceDay.vo2maxIntervalPct ?? null,
                iextIintTime: sourceDay.iextIintTime ?? null,
                vo2maxPct: sourceDay.vo2maxPct ?? null,
                targetHrMin: sourceDay.targetHrMin ?? null,
                targetHrMax: sourceDay.targetHrMax ?? null,
                targetSpeedMin: sourceDay.targetSpeedMin ?? null,
                targetSpeedMax: sourceDay.targetSpeedMax ?? null,
                detailNotes: sourceDay.detailNotes ?? null,
                complementNotes: sourceDay.complementNotes ?? null,
                generalGuidelines: sourceDay.generalGuidelines ?? null,
              });
            })
          );
        } else {
          await workoutService.updateTemplate(targetTemplateFromApi.id, {
            resistanceFrequency: sourceFromApi.resistanceFrequency ?? null,
            loadPercentage: sourceFromApi.loadPercentage ?? null,
            repZone: sourceFromApi.repZone ?? null,
            repReserve: sourceFromApi.repReserve ?? null,
            trainingMethod: sourceFromApi.trainingMethod ?? null,
            trainingDivision: sourceFromApi.trainingDivision ?? null,
            alunoGoal: sourceFromApi.alunoGoal ?? null,
            coachGoal: sourceFromApi.coachGoal ?? null,
            observation1: sourceFromApi.observation1 ?? null,
            observation2: sourceFromApi.observation2 ?? null,
          });

          await Promise.all(
            dayNumbers.map(async (dayOfWeek) => {
              const sourceDay = sourceDayMap[dayOfWeek];
              const correctedDate = resolveWeekDate(weekStart, dayOfWeek);
              const targetDay = await workoutService.getOrCreateDay({
                templateId: targetTemplateFromApi.id,
                dayOfWeek,
                workoutDate: correctedDate.toISOString(),
              });

              if (sourceDay?.resistanceTimeMin !== undefined) {
                await workoutService.updateDay(targetDay.id, {
                  resistanceTimeMin: sourceDay.resistanceTimeMin ?? null,
                });
              }

              const targetExercises = Array.isArray(targetDay.exercises) ? targetDay.exercises : [];
              await Promise.all(
                targetExercises.map((exercise: any) => workoutService.deleteExercise(exercise.id))
              );

              const sourceExercises = Array.isArray(sourceDay?.exercises) ? sourceDay.exercises : [];
              await Promise.all(
                sourceExercises.map((exercise: any) =>
                  workoutService.addExercise({
                    workoutDayId: targetDay.id,
                    exerciseId: exercise.exerciseId,
                    section: exercise.section,
                    exerciseOrder: exercise.exerciseOrder,
                    system: exercise.system ?? undefined,
                    sets: exercise.sets ?? undefined,
                    reps: exercise.reps ?? undefined,
                    intervalSec: exercise.intervalSec ?? undefined,
                    cParam: exercise.cParam ?? undefined,
                    eParam: exercise.eParam ?? undefined,
                    load: exercise.load ?? undefined,
                    exerciseNotes: exercise.exerciseNotes ?? undefined,
                  })
                )
              );
            })
          );
        }

        refreshed = await workoutService.getTemplate(targetTemplateFromApi.id);
      }

      const refreshedResisted = buildResistedExercisesFromTemplate(refreshed);
      const mergedTemplate = {
        ...targetTemplate,
        ...refreshed,
        resistedExercises: refreshedResisted,
        alunoId: planData?.alunoId,
        weekStartDate: resolvedStartDate,
        mesocycleNumber,
        weekNumber: targetWeekNumber,
        planId,
        totalVolumeMin: sourceTemplate.totalVolumeMin ?? refreshed.totalVolumeMin,
        totalVolumeKm: sourceTemplate.totalVolumeKm ?? refreshed.totalVolumeKm,
        distributionZ1: sourceTemplate.distributionZ1 ?? targetTemplate?.distributionZ1,
        distributionZ2: sourceTemplate.distributionZ2 ?? targetTemplate?.distributionZ2,
        distributionZ3: sourceTemplate.distributionZ3 ?? targetTemplate?.distributionZ3,
        distributionZ4: sourceTemplate.distributionZ4 ?? targetTemplate?.distributionZ4,
        distributionZ5: sourceTemplate.distributionZ5 ?? targetTemplate?.distributionZ5,
      };

      setTemplateDataByWeek((prev) => ({
        ...prev,
        [targetWeekNumber]: mergedTemplate,
      }));

      const cacheKey = buildCacheKey(planId, mesocycleNumber, targetWeekNumber, planData?.updatedAt);
      if (cacheKey) {
        localStorage.setItem(cacheKey, JSON.stringify(mergedTemplate));
      }

      alert('Semana copiada com sucesso!');
    } catch (error: any) {
      const apiMessage = error?.response?.data?.error;
      const message = apiMessage ? `Erro ao copiar semana: ${apiMessage}` : 'Erro ao copiar semana';
      console.error('Erro ao copiar semana:', error);
      setCopyWeekError(message);
      alert(message);
    } finally {
      setSaving(false);
    }
  };
  const toggleSummaryVisibility = (
    weekNumber: number,
    section: 'session' | 'resistedSummary'
  ) => {
    setSummaryVisibilityByWeek((prev) => {
      const current = prev[weekNumber] ?? { session: true, resistedSummary: true };
      return {
        ...prev,
        [weekNumber]: {
          ...current,
          [section]: !current[section]
        }
      };
    });
  };

  const methodParamMap = useMemo(() => new Map(methodParameters.map((param) => [param.code, param])), [methodParameters]);
  const assemblyParamMap = useMemo(() => new Map(assemblyParameters.map((param) => [param.code, param])), [assemblyParameters]);
  const loadCycleParamMap = useMemo(() => new Map(loadCycleParameters.map((param) => [param.code, param])), [loadCycleParameters]);
  const objectiveParamMap = useMemo(() => new Map(objectiveParameters.map((param) => [param.code, param])), [objectiveParameters]);

  const registerResistanceScrollContainer = (weekNumber: number) => (el: HTMLDivElement | null) => {
    if (el) {
      resistanceScrollContainersRef.current.set(weekNumber, el);
    } else {
      resistanceScrollContainersRef.current.delete(weekNumber);
    }
  };

  const handleResistanceScrollSync = (source: HTMLDivElement) => {
    if (resistanceIsSyncingRef.current) return;
    resistanceIsSyncingRef.current = true;
    try {
      const left = source.scrollLeft;
      resistanceScrollContainersRef.current.forEach((el) => {
        if (el !== source) {
          el.scrollLeft = left;
        }
      });
    } catch (error) {
      // ignore sync errors
    } finally {
      requestAnimationFrame(() => {
        resistanceIsSyncingRef.current = false;
      });
    }
  };

  const handleRelease = async (weekNumber: number) => {
    const weekTemplate = templateDataByWeek[weekNumber];
    if (!weekTemplate?.id) {
      alert('NÃ£o foi possÃ­vel localizar o template da semana.');
      return;
    }

    try {
      setSaving(true);

      const releasedTemplate = await workoutService.releaseTemplate(weekTemplate.id);
      setTemplateDataByWeek((prev) => ({
        ...prev,
        [weekNumber]: {
          ...prev[weekNumber],
          ...releasedTemplate,
        }
      }));

      const cacheKey = buildCacheKey(planId!, mesocycleNumber, weekNumber, planData?.updatedAt);
      if (cacheKey) {
        const cached = {
          ...(templateDataByWeek[weekNumber] || {}),
          ...releasedTemplate,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      }

      alert('Treino liberado com sucesso! O aluno ja pode visualiza-lo.');
    } catch (error) {
      console.error('Erro ao liberar treino:', error);
      alert('Erro ao liberar treino');
    } finally {
      setSaving(false);
    }
  };

 
  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'SÃ¡b', 'Dom'];
  const dayNumbers = [1, 2, 3, 4, 5, 6, 7];
  const sumTimes = (times: number[]) => times.reduce((acc, value) => acc + value, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Montagem de Treinos
                </h1>
                <p className="text-sm text-gray-500">
                  {planData ? `${planData.name} - ${planData.aluno.user.profile.name}` : 'Carregando...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-sm text-gray-500">Salvando...</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {/* ParÃ¢metros Ãšnicos: Meso e Semana (Micro) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 max-w-[1800px]">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ParÃ¢metros do Treino
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setMesocycleNumber((prev) => {
                    const next = Math.max(1, prev - 1);
                    if (next !== prev) {
                      navigateToMesocycle(next);
                    }
                    return next;
                  });
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Mesociclo Anterior
              </button>
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                Mesociclo
                <select
                  value={mesocycleNumber}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!Number.isFinite(value)) {
                      setMesocycleNumber(1);
                      navigateToMesocycle(1);
                      return;
                    }
                    const next = Math.min(Math.max(1, value), totalMesocycles);
                    setMesocycleNumber(next);
                    navigateToMesocycle(next);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {mesoOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setMesocycleNumber((prev) => {
                    const next = Math.min(totalMesocycles, prev + 1);
                    if (next !== prev) {
                      navigateToMesocycle(next);
                    }
                    return next;
                  });
                }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                PrÃ³ximo Mesociclo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                Microciclos exibidos: {(mesocycleNumber - 1) * weeksPerMesocycle + 1} a {mesocycleNumber * weeksPerMesocycle}
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span className="font-medium">Semanas:</span>
            {weekOptions.map((weekNumber) => (
              <label key={weekNumber} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visibleWeeks[weekNumber] ?? true}
                  onChange={(e) =>
                    setVisibleWeeks((prev) => ({
                      ...prev,
                      [weekNumber]: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span>S{(mesocycleNumber - 1) * weeksPerMesocycle + weekNumber}</span>
              </label>
            ))}
          </div>
        </div>

        {weekOptions.filter((weekNumber) => visibleWeeks[weekNumber] ?? true).map((weekNumber) => {
          const visibility = summaryVisibilityByWeek[weekNumber] ?? {
            session: true,
            resistedSummary: true
          };
      const weekTemplateData = templateDataByWeek[weekNumber];
      const weekDayMap = normalizeWorkoutDays(weekTemplateData?.workoutDays);
      const cyclicTimes = dayNumbers.map((day) => {
        const entry = weekDayMap[day];
        const value = entry?.stimulusDurationMin ?? entry?.sessionDurationMin ?? 0;
        return Number(value) || 0;
      });
      const resistanceTimes = dayNumbers.map((day) => {
        const entry = weekDayMap[day];
        const value = entry?.resistanceTimeMin ?? 0;
        return Number(value) || 0;
      });
      const sessionTimes = cyclicTimes.map((value, idx) => value + resistanceTimes[idx]);
      const fallbackWeekStartDate = resolveWeekStartDate(mesocycleNumber, weekNumber);
      const dayEditability = buildWeekDayEditability(fallbackWeekStartDate);
      const weekEditable = dayEditability.some(Boolean);
      return (
        <div
          key={weekNumber}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 max-w-[1800px]"
        >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Semana {(mesocycleNumber - 1) * weeksPerMesocycle + weekNumber}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Resumo e montagem do microciclo {(mesocycleNumber - 1) * weeksPerMesocycle + weekNumber}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={copyModeByWeek[weekNumber]?.cyclic ?? true}
                        onChange={(e) =>
                          setCopyModeByWeek((prev) => ({
                            ...prev,
                            [weekNumber]: {
                              cyclic: e.target.checked,
                              resistance: prev[weekNumber]?.resistance ?? true,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      CÃ­clico
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={copyModeByWeek[weekNumber]?.resistance ?? true}
                        onChange={(e) =>
                          setCopyModeByWeek((prev) => ({
                            ...prev,
                            [weekNumber]: {
                              cyclic: prev[weekNumber]?.cyclic ?? true,
                              resistance: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      Resistido
                    </label>
                  </div>
                  {weekTemplateData && (
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: weekTemplateData.released ? '#f0fdf4' : '#fef2f2',
                        borderColor: weekTemplateData.released ? '#86efac' : '#fecaca'
                      }}
                    >
                      {weekTemplateData.released ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700">Liberado</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium text-red-700">NÃ£o Liberado</span>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleCopyWeek(weekNumber)}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar Semana
                  </button>

                  <button
                    onClick={() => handleRelease(weekNumber)}
                    disabled={saving || weekTemplateData?.released}
                    className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      weekTemplateData?.released
                        ? 'Treino jÃ¡ estÃ¡ liberado'
                        : 'Liberar treino para o aluno'
                    }
                  >
                    <CheckCircle className="w-4 h-4" />
                    Liberar
                  </button>
                  
                </div>
                {copyWeekError && (
                  <div className="mt-3 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {copyWeekError}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSummaryVisibility(weekNumber, 'session')}
                    className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {visibility.session ? 'Ocultar' : 'Exibir'} Tempo da SessÃ£o
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSummaryVisibility(weekNumber, 'resistedSummary')}
                    className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {visibility.resistedSummary ? 'Ocultar' : 'Exibir'} Resumo da Semana
                  </button>
                </div>
                {/* Tempo de SessÃ£o por Dia */}
                <div className={visibility.session ? '' : 'hidden'}>
                  <h3 className="text-base font-semibold text-gray-800 mb-3">Tempo da SessÃ£o</h3>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-sm font-medium text-gray-700 text-left">
                            Treinamentos
                          </th>
                          {dayLabels.map((day) => (
                            <th
                              key={day}
                              className="px-3 py-2 text-sm font-medium text-gray-700 text-center"
                            >
                              {day}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-sm font-medium text-gray-700 text-center">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        <tr>
                          <td className="px-3 py-2 text-sm font-medium text-gray-700">CÃ­clico</td>
                          {cyclicTimes.map((value, idx) => (
                            <td key={idx} className="px-3 py-2 text-sm text-gray-700 text-center">
                              {value}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-sm text-gray-700 text-center font-semibold">
                            {sumTimes(cyclicTimes)}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-sm font-medium text-gray-700">
                            Resistido
                          </td>
                          {resistanceTimes.map((value, idx) => (
                            <td key={idx} className="px-3 py-2 text-sm text-gray-700 text-center">
                              {value}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-sm text-gray-700 text-center font-semibold">
                            {sumTimes(resistanceTimes)}
                          </td>
                        </tr>
                        <tr className="bg-blue-50">
                          <td className="px-3 py-2 text-sm font-medium text-gray-700">
                            Tempo da SessÃ£o
                          </td>
                          {sessionTimes.map((value, idx) => (
                            <td
                              key={idx}
                              className="px-3 py-2 text-sm text-gray-700 text-center font-semibold"
                            >
                              {value}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-sm text-gray-700 text-center font-semibold">
                            {sumTimes(sessionTimes)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={visibility.resistedSummary ? '' : 'hidden'}>
                  <h3 className="text-base font-semibold text-gray-800 mb-3">Resumo da Semana</h3>
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
                    <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">% Carga TR</span>
                        <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-sm font-semibold text-white">
                          {resistedSummaryByWeek[weekNumber]?.loadPercentage ?? '-'}
                          {resistedSummaryByWeek[weekNumber]?.loadPercentage === null ||
                          resistedSummaryByWeek[weekNumber]?.loadPercentage === undefined
                            ? ''
                            : '%'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">SÃ©ries Grandes MÃºsculos</span>
                        <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-sm font-semibold text-white">
                          {resistedSummaryByWeek[weekNumber]?.seriesReference ?? '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">Zona de RepetiÃ§Ãµes</span>
                        <span className="inline-flex max-w-[260px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800">
                          {resistedSummaryByWeek[weekNumber]?.repZone ?? '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">RepetiÃ§Ãµes em Reserva</span>
                        <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-sm font-semibold text-white">
                          {resistedSummaryByWeek[weekNumber]?.repReserve ?? '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">Montagem</span>
                        <span
                          className="inline-flex max-w-[260px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800"
                          title={
                            resistedSummaryByWeek[weekNumber]?.assembly
                              ? `${assemblyParamMap.get(resistedSummaryByWeek[weekNumber]?.assembly)?.description || resistedSummaryByWeek[weekNumber]?.assembly || ''}`.trim()
                              : ''
                          }
                        >
                          {resistedSummaryByWeek[weekNumber]?.assembly
                            ? `${assemblyParamMap.get(resistedSummaryByWeek[weekNumber]?.assembly)?.description || resistedSummaryByWeek[weekNumber]?.assembly || ''}`.trim()
                            : '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">MÃ©todo</span>
                        <span
                          className="inline-flex max-w-[260px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800"
                          title={
                            resistedSummaryByWeek[weekNumber]?.method
                              ? `${methodParamMap.get(resistedSummaryByWeek[weekNumber]?.method)?.description || resistedSummaryByWeek[weekNumber]?.method || ''}`.trim()
                              : ''
                          }
                        >
                          {resistedSummaryByWeek[weekNumber]?.method
                            ? `${methodParamMap.get(resistedSummaryByWeek[weekNumber]?.method)?.description || resistedSummaryByWeek[weekNumber]?.method || ''}`.trim()
                            : '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">Microciclo</span>
                        <span
                          className="inline-flex max-w-[260px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800"
                          title={
                            resistedSummaryByWeek[weekNumber]?.loadCycle
                              ? `${loadCycleParamMap.get(resistedSummaryByWeek[weekNumber]?.loadCycle)?.description || resistedSummaryByWeek[weekNumber]?.loadCycle || ''}`.trim()
                              : ''
                          }
                        >
                          {resistedSummaryByWeek[weekNumber]?.loadCycle
                            ? `${loadCycleParamMap.get(resistedSummaryByWeek[weekNumber]?.loadCycle)?.description || resistedSummaryByWeek[weekNumber]?.loadCycle || ''}`.trim()
                            : '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">DivisÃ£o do Treino</span>
                        <span className="inline-flex max-w-[260px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800">
                          {resistedSummaryByWeek[weekNumber]?.trainingDivision ?? '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">FrequÃªncia Semanal</span>
                        <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-sm font-semibold text-white">
                          {resistedSummaryByWeek[weekNumber]?.weeklyFrequency ?? '-'}
                          {resistedSummaryByWeek[weekNumber]?.weeklyFrequency === null ||
                          resistedSummaryByWeek[weekNumber]?.weeklyFrequency === undefined
                            ? ''
                            : 'x/sem'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-600">Objetivo do Mesociclo</span>
                        <span
                          className="inline-flex max-w-[320px] items-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800"
                          title={
                            resistedSummaryByWeek[weekNumber]?.objective
                              ? `${objectiveParamMap.get(resistedSummaryByWeek[weekNumber]?.objective)?.description || resistedSummaryByWeek[weekNumber]?.objective || ''}`.trim()
                              : ''
                          }
                        >
                          {resistedSummaryByWeek[weekNumber]?.objective
                            ? `${objectiveParamMap.get(resistedSummaryByWeek[weekNumber]?.objective)?.description || resistedSummaryByWeek[weekNumber]?.objective || ''}`.trim()
                            : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
                <div className="px-6 pt-4">
                  <div className="flex gap-2 border-b border-gray-200">
                    <button
                      onClick={() => setActiveTab('cyclic')}
                      className={`px-4 py-3 font-medium transition-colors relative ${
                        activeTab === 'cyclic'
                          ? 'text-blue-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      ðŸ“Š Treinamento CÃ­clico
                      {activeTab === 'cyclic' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab('resistance')}
                      className={`px-4 py-3 font-medium transition-colors relative ${
                        activeTab === 'resistance'
                          ? 'text-blue-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      ðŸ’ª Treinamento Resistido
                      {activeTab === 'resistance' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  {activeTab === 'cyclic' ? (
                    <WorkoutBuilderCyclic
                      key={`cyclic-${weekTemplateData?.id ?? 'new'}-${weekNumber}-${mesocycleNumber}`}
                      templateData={weekTemplateData}
                      weekStartDateOverride={fallbackWeekStartDate}
                      dayEditability={dayEditability}
                      weekEditable={weekEditable}
                      planId={planId}
                      alunoData={alunoData}
                      vamValue={vamValue}
                      planStartDate={planData?.startDate}
                      planEndDate={planData?.endDate}
                      mesocycleNumber={mesocycleNumber}
                      weekNumber={weekNumber}
                      onChange={(data: any) => handleDataChange(weekNumber, data)}
                    />
                  ) : (
                    <WorkoutBuilderResistance
                      templateData={weekTemplateData}
                      weekStartDateOverride={fallbackWeekStartDate}
                      dayEditability={dayEditability}
                      weekEditable={weekEditable}
                      resistedSummary={resistedSummaryByWeek[weekNumber] || null}
                      planStartDate={planData?.startDate}
                      planEndDate={planData?.endDate}
                      onChange={(data: any) => handleDataChange(weekNumber, data)}
                      registerScrollContainer={registerResistanceScrollContainer(weekNumber)}
                      onScrollSync={handleResistanceScrollSync}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



