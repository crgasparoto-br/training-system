import { useEffect, useMemo, useRef, useState } from 'react';
import { periodizationService, ResistedStimulus, TrainingParameter } from '../../services/periodization.service';
import { Plus, ChevronUp, ChevronDown, Copy, Trash2 } from 'lucide-react';
import { ExerciseSelectorModal } from '../../components/ExerciseSelectorModal';
import { libraryService, type Exercise } from '../../services/library.service';
import { isDateWithinRange, parseDateOnly } from '../../utils/date';

interface WorkoutBuilderResistanceProps {
  templateData: any;
  resistedSummary: ResistedStimulus | null;
  onChange: (data: any) => void;
  registerScrollContainer?: (el: HTMLDivElement | null) => void;
  onScrollSync?: (source: HTMLDivElement) => void;
  planStartDate?: string | Date | null;
  planEndDate?: string | Date | null;
  weekStartDateOverride?: string | null;
  dayEditability?: boolean[];
  weekEditable?: boolean;
}

type SectionKey = 'mobilidade' | 'sessao' | 'resfriamento';

interface SelectedExercise {
  id: string;
  exerciseId?: string;
  name: string;
  category?: string;
  system?: string;
  sets?: number | null;
  reps?: number | null;
  interval?: number | null;
  cParam?: number | null;
  eParam?: number | null;
  load?: number | null;
  adjustment?: string | null;
}

export default function WorkoutBuilderResistance({
  templateData,
  resistedSummary,
  onChange,
  registerScrollContainer,
  onScrollSync,
  planStartDate,
  planEndDate,
  weekStartDateOverride,
  dayEditability,
  weekEditable = true
}: WorkoutBuilderResistanceProps) {
  const lastHydratedKey = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const startWeekday = useMemo(() => {
    const start = parseDateOnly(weekStartDateOverride ?? templateData?.weekStartDate) ?? new Date();
    const startJsDay = start.getDay();
    return startJsDay === 0 ? 7 : startJsDay; // 1=Seg ... 7=Dom
  }, [templateData?.weekStartDate, weekStartDateOverride]);

  const resolveDayDate = (dayOfWeek: number) => {
    const start = parseDateOnly(weekStartDateOverride ?? templateData?.weekStartDate) ?? new Date();
    const offset = dayOfWeek - startWeekday;
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    return date;
  };

  const isDayEditable = (dayOfWeek: number) => {
    if (!weekEditable) return false;
    if (dayEditability && dayEditability[dayOfWeek - 1] !== undefined) {
      return dayEditability[dayOfWeek - 1];
    }
    if (!planStartDate || !planEndDate) return true;
    const start = parseDateOnly(planStartDate);
    const end = parseDateOnly(planEndDate);
    if (!start || !end) return true;
    return isDateWithinRange(resolveDayDate(dayOfWeek), start, end);
  };

  const days = useMemo(() => {
    const labels = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado', 'Domingo'];

    return labels.map((label, index) => {
      const dayOfWeek = index + 1;
      const date = resolveDayDate(dayOfWeek);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');

      return {
        dayOfWeek,
        label,
        date: `${day}/${month}`
      };
    });
  }, [templateData?.weekStartDate, weekStartDateOverride, startWeekday]);


  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null);
  const [exercisesByDay, setExercisesByDay] = useState<Record<number, Record<SectionKey, SelectedExercise[]>>>(() => ({}));
  const [methodParameters, setMethodParameters] = useState<TrainingParameter[]>([]);
  const [maxLoads, setMaxLoads] = useState<Record<string, number | null>>({});
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [quickFillDay, setQuickFillDay] = useState<number | null>(null);
  const [quickFillSection, setQuickFillSection] = useState<SectionKey | null>(null);
  const [quickFillValues, setQuickFillValues] = useState<{
    sets: string;
    intervalBetweenExercises: string;
    intervalBetweenSeries: string;
    cParam: string;
    eParam: string;
  }>({
    sets: '',
    intervalBetweenExercises: '',
    intervalBetweenSeries: '',
    cParam: '',
    eParam: ''
  });

  useEffect(() => {
    if (!templateData) return;
    const templateKey = `${templateData.id || ''}:${templateData.planId || ''}:${templateData.mesocycleNumber || ''}:${templateData.weekNumber || ''}`;
    if (lastHydratedKey.current === templateKey) return;

    if (templateData.resistedExercises) {
      setExercisesByDay(templateData.resistedExercises);
    } else {
      setExercisesByDay({});
    }

    lastHydratedKey.current = templateKey;
  }, [templateData]);

  useEffect(() => {
    const loadMethodParameters = async () => {
      try {
        const data = await periodizationService.getParametersByCategory('metodo');
        setMethodParameters(data);
      } catch (error) {
        setMethodParameters([]);
      }
    };

    loadMethodParameters();
  }, []);

  const methodParamMap = useMemo(() => {
    return new Map(methodParameters.map((param) => [param.code, param]));
  }, [methodParameters]);

  const normalizeSystemText = (value: string) => {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };

  const resolveSystemLabel = (systemCode?: string) => {
    if (!systemCode) return '';
    return methodParamMap.get(systemCode)?.description ?? systemCode;
  };

  const isCyclicCategory = (category?: string) => {
    if (!category) return false;
    return normalizeSystemText(category) === 'ciclico';
  };

  const getSystemGroupSize = (systemCode?: string) => {
    const resolved = resolveSystemLabel(systemCode);
    const text = normalizeSystemText(`${systemCode ?? ''} ${resolved ?? ''}`);
    if (/\bbi\s*set\b/.test(text) || /\bbiset\b/.test(text)) return 2;
    if (/\btri\s*set\b/.test(text) || /\btriset\b/.test(text)) return 3;
    if (/\bquad(?:ri)?\s*set\b/.test(text) || /\bquadset\b/.test(text)) return 4;
    return 1;
  };

  const getGroupLabel = (size: number) => {
    if (size === 2) return 'Par';
    if (size === 3) return 'Trio';
    if (size === 4) return 'Quarteto';
    return 'Grupo';
  };

  const buildSystemGroups = (list: SelectedExercise[], fallbackSystem?: string) => {
    const resolveSystemValue = (system?: string) => {
      const trimmed = (system ?? '').trim();
      if (trimmed) return trimmed;
      return (fallbackSystem ?? '').trim();
    };

    const meta: Array<
      | ({
          size: number;
          indexInGroup: number;
          groupNumber: number;
          isComplete: boolean;
          label: string;
          groupKey: string;
        })
      | null
    > = Array(list.length).fill(null);

    const warnings: Array<{
      startIndex: number;
      endIndex: number;
      missing: number;
      size: number;
      label: string;
      systemKey: string;
    }> = [];

    let i = 0;
    while (i < list.length) {
      const currentSystem = resolveSystemValue(list[i]?.system);
      const size = getSystemGroupSize(currentSystem);
      if (size <= 1) {
        i += 1;
        continue;
      }

      const resolved = resolveSystemLabel(currentSystem);
      const systemKey = normalizeSystemText(`${currentSystem} ${resolved}`);

      let j = i;
      while (j < list.length) {
        const nextSystem = resolveSystemValue(list[j]?.system);
        const nextSize = getSystemGroupSize(nextSystem);
        const nextResolved = resolveSystemLabel(nextSystem);
        const nextKey = normalizeSystemText(`${nextSystem} ${nextResolved}`);
        if (nextSize !== size || nextKey !== systemKey) break;
        j += 1;
      }

      const segmentLength = j - i;
      const label = getGroupLabel(size);
      for (let offset = 0; offset < segmentLength; offset += 1) {
        const groupIndex = Math.floor(offset / size);
        const indexInGroup = offset % size;
        const groupStart = i + groupIndex * size;
        const groupEnd = Math.min(groupStart + size - 1, j - 1);
        const isComplete = groupEnd - groupStart + 1 === size;
        meta[i + offset] = {
          size,
          indexInGroup,
          groupNumber: groupIndex + 1,
          isComplete,
          label,
          groupKey: `${systemKey}-${groupIndex}`
        };
      }

      if (segmentLength % size !== 0) {
        const remainder = segmentLength % size;
        warnings.push({
          startIndex: j - remainder,
          endIndex: j - 1,
          missing: size - remainder,
          size,
          label,
          systemKey
        });
      }

      i = j;
    }

    return { meta, warnings };
  };

  const calculateLoad = (maxLoad: number | null | undefined, reps: number | null | undefined) => {
    if (!maxLoad || !reps) return null;
    const value = maxLoad * Math.pow(1.05, 10 - reps);
    return Math.round(value * 10) / 10;
  };

  const updateExerciseFields = (
    dayOfWeek: number,
    section: SectionKey,
    exerciseId: string,
    updates: Partial<SelectedExercise>
  ) => {
    setExercisesByDay((prev) => {
      const currentDay = prev[dayOfWeek] || {
        mobilidade: [],
        sessao: [],
        resfriamento: []
      };

      const updatedSection = currentDay[section].map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...updates } : exercise
      );

      const updatedDay = { ...currentDay, [section]: updatedSection };
      const updated = { ...prev, [dayOfWeek]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
  };

  const fetchMaxLoad = async (exerciseId: string) => {
    if (!templateData?.alunoId) return;
    if (maxLoads[exerciseId] !== undefined) return;

    try {
      const progress = await libraryService.getAlunoProgress(templateData.alunoId, exerciseId);
      const maxLoad = progress?.maxLoad ?? null;
      setMaxLoads((prev) => ({ ...prev, [exerciseId]: maxLoad }));

      if (maxLoad) {
        setExercisesByDay((prev) => {
          const updated: typeof prev = { ...prev };
          Object.entries(prev).forEach(([dayKey, sections]) => {
            const updatedSections = { ...sections };
            (Object.keys(updatedSections) as SectionKey[]).forEach((sectionKey) => {
              updatedSections[sectionKey] = updatedSections[sectionKey].map((exercise) => {
                const referenceId = exercise.exerciseId ?? exercise.id;
                if (referenceId !== exerciseId) return exercise;
                const computedLoad = calculateLoad(maxLoad, exercise.reps ?? null);
                return { ...exercise, load: computedLoad };
              });
            });
            updated[Number(dayKey)] = updatedSections;
          });

          onChange({ ...templateData, resistedExercises: updated });
          return updated;
        });
      }
    } catch (error) {
      setMaxLoads((prev) => ({ ...prev, [exerciseId]: null }));
    }
  };

  const openExerciseModal = (dayOfWeek: number, section: SectionKey) => {
    setSelectedDay(dayOfWeek);
    setSelectedSection(section);
    setExerciseModalOpen(true);
  };

  const openQuickFillModal = (dayOfWeek: number, section: SectionKey) => {
    setQuickFillDay(dayOfWeek);
    setQuickFillSection(section);
    setQuickFillValues({
      sets: '',
      intervalBetweenExercises: '',
      intervalBetweenSeries: '',
      cParam: '',
      eParam: ''
    });
    setQuickFillOpen(true);
  };

  const applyQuickFill = () => {
    if (!quickFillDay || !quickFillSection) return;
    const sets = quickFillValues.sets ? Number(quickFillValues.sets) : null;
    const intervalBetweenExercises = quickFillValues.intervalBetweenExercises
      ? Number(quickFillValues.intervalBetweenExercises)
      : null;
    const intervalBetweenSeries = quickFillValues.intervalBetweenSeries
      ? Number(quickFillValues.intervalBetweenSeries)
      : null;
    const cParam = quickFillValues.cParam ? Number(quickFillValues.cParam) : null;
    const eParam = quickFillValues.eParam ? Number(quickFillValues.eParam) : null;

    setExercisesByDay((prev) => {
      const currentDay = prev[quickFillDay] || {
        mobilidade: [],
        sessao: [],
        resfriamento: []
      };

      const currentSectionExercises = currentDay[quickFillSection];
      const groupMeta =
        quickFillSection === 'sessao'
          ? buildSystemGroups(currentSectionExercises, resistedSummary?.method ?? '').meta
          : [];

      const updatedSection = currentSectionExercises.map((exercise, index) => {
        if (quickFillSection === 'sessao' && isCyclicCategory(exercise.category)) {
          return exercise;
        }
        const meta = groupMeta[index];
        const hasGroup = meta && meta.size > 1;
        const interval = hasGroup
          ? meta.indexInGroup < meta.size - 1
            ? intervalBetweenExercises
            : intervalBetweenSeries
          : intervalBetweenSeries;
        return {
          ...exercise,
          sets,
          interval,
          cParam,
          eParam
        };
      });

      const updatedDay = { ...currentDay, [quickFillSection]: updatedSection };
      const updated = { ...prev, [quickFillDay]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });

    setQuickFillOpen(false);
  };

  const applyIntervalRulesIfConfigured = (sectionExercises: SelectedExercise[]) => {
    const intervalBetweenExercises = quickFillValues.intervalBetweenExercises
      ? Number(quickFillValues.intervalBetweenExercises)
      : null;
    const intervalBetweenSeries = quickFillValues.intervalBetweenSeries
      ? Number(quickFillValues.intervalBetweenSeries)
      : null;

    if (intervalBetweenExercises === null && intervalBetweenSeries === null) {
      return sectionExercises;
    }

    const groupMeta = buildSystemGroups(sectionExercises, resistedSummary?.method ?? '').meta;
    return sectionExercises.map((exercise, index) => {
      if (isCyclicCategory(exercise.category)) return exercise;
      const meta = groupMeta[index];
      const hasGroup = meta && meta.size > 1;
      const interval = hasGroup
        ? meta.indexInGroup < meta.size - 1
          ? intervalBetweenExercises
          : intervalBetweenSeries
        : intervalBetweenSeries;
      if (interval === null || interval === undefined) return exercise;
      return { ...exercise, interval };
    });
  };

  const applyQuickFillDefaults = (sectionExercises: SelectedExercise[]) => {
    const sets = quickFillValues.sets ? Number(quickFillValues.sets) : null;
    const cParam = quickFillValues.cParam ? Number(quickFillValues.cParam) : null;
    const eParam = quickFillValues.eParam ? Number(quickFillValues.eParam) : null;

    const withBasics = sectionExercises.map((exercise) => {
      if (isCyclicCategory(exercise.category)) return exercise;
      return {
        ...exercise,
        sets: sets ?? exercise.sets ?? null,
        cParam: cParam ?? exercise.cParam ?? null,
        eParam: eParam ?? exercise.eParam ?? null
      };
    });

    return applyIntervalRulesIfConfigured(withBasics);
  };

  const updateExerciseField = (
    dayOfWeek: number,
    section: SectionKey,
    exerciseId: string,
    field: keyof SelectedExercise,
    value: string | number | null
  ) => {
    setExercisesByDay((prev) => {
      const currentDay = prev[dayOfWeek] || {
        mobilidade: [],
        sessao: [],
        resfriamento: []
      };

      const updatedSection = currentDay[section].map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, [field]: value } : exercise
      );

      let finalSection = updatedSection;
      if (section === 'sessao' && field === 'system') {
        const intervalBetweenExercises = quickFillValues.intervalBetweenExercises
          ? Number(quickFillValues.intervalBetweenExercises)
          : null;
        const intervalBetweenSeries = quickFillValues.intervalBetweenSeries
          ? Number(quickFillValues.intervalBetweenSeries)
          : null;

        if (intervalBetweenExercises !== null || intervalBetweenSeries !== null) {
          const groupMeta = buildSystemGroups(updatedSection, resistedSummary?.method ?? '').meta;
          finalSection = updatedSection.map((exercise, index) => {
            if (isCyclicCategory(exercise.category)) return exercise;
            const meta = groupMeta[index];
            const hasGroup = meta && meta.size > 1;
            const interval = hasGroup
              ? meta.indexInGroup < meta.size - 1
                ? intervalBetweenExercises
                : intervalBetweenSeries
              : intervalBetweenSeries;
            if (interval === null || interval === undefined) return exercise;
            return { ...exercise, interval };
          });
        }
      }

      const updatedDay = { ...currentDay, [section]: finalSection };
      const updated = { ...prev, [dayOfWeek]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
  };

  const moveExercise = (dayOfWeek: number, section: SectionKey, index: number, direction: 'up' | 'down') => {
    setExercisesByDay((prev) => {
      const currentDay = prev[dayOfWeek];
      if (!currentDay) return prev;

      const list = [...currentDay[section]];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;

      [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
      const finalList = section === 'sessao' ? applyIntervalRulesIfConfigured(list) : list;
      const updatedDay = { ...currentDay, [section]: finalList };
      const updated = { ...prev, [dayOfWeek]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
  };

  const duplicateExercise = (dayOfWeek: number, section: SectionKey, index: number) => {
    setExercisesByDay((prev) => {
      const currentDay = prev[dayOfWeek];
      if (!currentDay) return prev;

      const list = [...currentDay[section]];
      const original = list[index];
      const copy = { ...original, id: `${original.id}-${Date.now()}` };
      list.splice(index + 1, 0, copy);

      const finalList = section === 'sessao' ? applyIntervalRulesIfConfigured(list) : list;
      const updatedDay = { ...currentDay, [section]: finalList };
      const updated = { ...prev, [dayOfWeek]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
  };

  const deleteExercise = (dayOfWeek: number, section: SectionKey, index: number) => {
    setExercisesByDay((prev) => {
      const currentDay = prev[dayOfWeek];
      if (!currentDay) return prev;

      const list = currentDay[section].filter((_, idx) => idx !== index);
      const finalList = section === 'sessao' ? applyIntervalRulesIfConfigured(list) : list;
      const updatedDay = { ...currentDay, [section]: finalList };
      const updated = { ...prev, [dayOfWeek]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
  };

  const handleSelectExercise = (exercise: Exercise) => {
    if (!selectedDay || !selectedSection) return;
    const rowId = `${exercise.id}-${Date.now()}-${Math.random()}`;
    const isCyclic = isCyclicCategory(exercise.category);

    setExercisesByDay((prev) => {
      const currentDay = prev[selectedDay] || {
        mobilidade: [],
        sessao: [],
        resfriamento: []
      };

      const updatedDay = {
        ...currentDay,
        [selectedSection]: [
          ...currentDay[selectedSection],
          {
            id: rowId,
            exerciseId: exercise.id,
            name: exercise.name,
            category: exercise.category,
            system:
              selectedSection === 'mobilidade'
                ? 'SER'
                : selectedSection === 'sessao'
                  ? (isCyclic ? '-' : (resistedSummary?.method ?? ''))
                  : '',
            sets: null,
            reps:
              selectedSection === 'sessao' && !isCyclic && resistedSummary?.repZone !== null && resistedSummary?.repZone !== undefined
                ? Number(resistedSummary.repZone)
                : null,
            interval: null,
            cParam: null,
            eParam: null,
            load: null,
            adjustment: ''
          }
        ]
      };

      const finalSection =
        selectedSection === 'sessao'
          ? applyQuickFillDefaults(updatedDay[selectedSection])
          : updatedDay[selectedSection];
      const updated = {
        ...prev,
        [selectedDay]: { ...updatedDay, [selectedSection]: finalSection }
      };

      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
    void fetchMaxLoad(exercise.id);
  };

  const handleSelectExercises = (exercises: Exercise[]) => {
    if (!selectedDay || !selectedSection) return;
    if (!exercises.length) return;

    const newEntries = exercises.map((exercise) => {
      const isCyclic = isCyclicCategory(exercise.category);
      return ({
      id: `${exercise.id}-${Date.now()}-${Math.random()}`,
      exerciseId: exercise.id,
      name: exercise.name,
      category: exercise.category,
      system:
        selectedSection === 'mobilidade'
          ? 'SER'
          : selectedSection === 'sessao'
            ? (isCyclic ? '-' : (resistedSummary?.method ?? ''))
            : '',
      sets: null,
      reps:
        selectedSection === 'sessao' && !isCyclic && resistedSummary?.repZone !== null && resistedSummary?.repZone !== undefined
          ? Number(resistedSummary.repZone)
          : null,
      interval: null,
      cParam: null,
      eParam: null,
      load: null,
      adjustment: ''
    });
    });

    setExercisesByDay((prev) => {
      const currentDay = prev[selectedDay] || {
        mobilidade: [],
        sessao: [],
        resfriamento: []
      };

      const updatedDay = {
        ...currentDay,
        [selectedSection]: [...currentDay[selectedSection], ...newEntries]
      };

      const finalSection =
        selectedSection === 'sessao'
          ? applyQuickFillDefaults(updatedDay[selectedSection])
          : updatedDay[selectedSection];
      const updated = {
        ...prev,
        [selectedDay]: { ...updatedDay, [selectedSection]: finalSection }
      };

      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });

    exercises.forEach((exercise) => {
      void fetchMaxLoad(exercise.id);
    });
  };

  const renderDayExerciseCell = (dayOfWeek: number, section: SectionKey, editable: boolean) => {
    const sectionExercises = exercisesByDay[dayOfWeek]?.[section] || [];
    const groupData =
      section === 'sessao'
        ? buildSystemGroups(sectionExercises, resistedSummary?.method ?? '')
        : { meta: [], warnings: [] };
    const getCyclicLocation = () => {
      const workoutDays = templateData?.workoutDays;
      const formatLocation = (entry?: any) => {
        if (!entry?.location) return '';
        const sessions = Number(entry?.numSessions);
        if (Number.isFinite(sessions) && sessions > 0) {
          return `${entry.location} ${sessions}x`;
        }
        return entry.location;
      };
      if (Array.isArray(workoutDays)) {
        const entry = workoutDays.find((day: any) => day.dayOfWeek === dayOfWeek);
        return formatLocation(entry);
      }
      return formatLocation(workoutDays?.[dayOfWeek]);
    };

    return (
    <div className={`rounded-md border border-gray-200 bg-white ${editable ? '' : 'opacity-60 pointer-events-none'}`}>
      {section === 'sessao' && (
        <div className="border-b border-gray-200 px-3 py-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-xs font-medium text-gray-500">Planejamento do Treinamento Cíclico</div>
            <div className="text-base font-semibold text-gray-800">
              {getCyclicLocation() || '-'}
            </div>
          </div>
          {groupData.warnings.length > 0 && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {groupData.warnings.map((warning, idx) => (
                <div key={`${warning.systemKey}-${idx}`}>
                  {`${warning.label} incompleto: faltam ${warning.missing} exercício(s) para fechar o grupo.`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-gray-600">n</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-[180px]">Exercício</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600">Sistema</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">S</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">Rep</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">Int</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">C</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">E</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">Crg</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">Aj</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sectionExercises.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-2 py-4 text-center text-gray-400">
                  Nenhum exercício adicionado
                </td>
              </tr>
            ) : (
              sectionExercises.map((exercise, index) => {
                const groupMeta = groupData.meta[index];
                const hasGroup = (groupMeta?.size ?? 1) > 1;
                const isGroupStart = groupMeta?.indexInGroup === 0;
                const isGroupEnd = groupMeta?.indexInGroup === (groupMeta?.size ?? 0) - 1;
                const groupBorderShared = hasGroup ? 'border-emerald-300/70' : '';
                const groupBorderTop = hasGroup && isGroupStart ? `border-t ${groupBorderShared}`.trim() : '';
                const groupBorderBottom = hasGroup && isGroupEnd ? `border-b ${groupBorderShared}`.trim() : '';
                const groupBorderLeft = hasGroup ? `border-l ${groupBorderShared}`.trim() : '';
                const groupBorderRight = hasGroup ? `border-r ${groupBorderShared}`.trim() : '';
                const groupCornerLeft = hasGroup
                  ? `${isGroupStart ? 'rounded-tl-md' : ''} ${isGroupEnd ? 'rounded-bl-md' : ''} overflow-hidden`
                      .trim()
                  : '';
                const groupCornerRight = hasGroup
                  ? `${isGroupStart ? 'rounded-tr-md' : ''} ${isGroupEnd ? 'rounded-br-md' : ''} overflow-hidden`
                      .trim()
                  : '';
                const isCyclicExercise = isCyclicCategory(exercise.category);
                const rowClassName = isCyclicExercise
                  ? 'bg-blue-50'
                  : groupMeta
                    ? groupMeta.isComplete
                      ? groupMeta.groupNumber % 2 === 0
                        ? 'bg-emerald-50'
                        : 'bg-emerald-100'
                      : 'bg-red-50'
                    : '';
                const inputClassName = `w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center ${
                  isCyclicExercise ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                }`;

                return (
                  <tr key={exercise.id} className={rowClassName}>
                  <td className={`px-2 py-2 text-left text-gray-700 ${groupBorderTop} ${groupBorderBottom} ${groupBorderLeft} ${groupCornerLeft}`}>{index + 1}</td>
                  <td className={`px-2 py-2 text-left text-gray-700 ${groupBorderTop} ${groupBorderBottom}`}>{exercise.name}</td>
                  <td className={`px-2 py-2 text-left ${groupBorderTop} ${groupBorderBottom}`}>
                    {section === 'sessao' && isCyclicExercise ? (
                      <span className="text-sm text-gray-500">-</span>
                    ) : section === 'mobilidade' || section === 'sessao' ? (
                      <div className="space-y-1">
                        <select
                          value={
                            exercise.system || (section === 'sessao' ? (resistedSummary?.method ?? '') : 'SER')
                          }
                          onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'system', e.target.value)}
                          className="w-full min-w-[160px] rounded border border-gray-200 px-2 py-1 text-sm"
                        >
                          {methodParameters.length === 0 ? (
                            <option value="SER">SER - Séries</option>
                          ) : (
                            methodParameters.map((param) => (
                              <option key={param.id} value={param.code}>
                                {param.description}
                              </option>
                            ))
                          )}
                        </select>
                        {section === 'sessao' && groupData.meta[index] && (
                          <div
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              groupData.meta[index]?.isComplete
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {`${groupData.meta[index]?.label} ${groupData.meta[index]?.groupNumber} - ${groupData.meta[index]?.indexInGroup + 1}/${groupData.meta[index]?.size}`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={exercise.system ?? ''}
                        onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'system', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                      />
                    )}
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="number"
                      value={exercise.sets ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'sets', e.target.value ? Number(e.target.value) : null)}
                      disabled={isCyclicExercise}
                      className={inputClassName}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="number"
                      value={
                        exercise.reps ??
                        (!isCyclicExercise &&
                        section === 'sessao' &&
                        resistedSummary?.repZone !== null &&
                        resistedSummary?.repZone !== undefined
                          ? Number(resistedSummary.repZone)
                          : '')
                      }
                      onChange={(e) => {
                        const repsValue = e.target.value ? Number(e.target.value) : null;
                        const referenceId = exercise.exerciseId ?? exercise.id;
                        const maxLoad = maxLoads[referenceId];
                        const computedLoad = calculateLoad(maxLoad, repsValue);
                        updateExerciseFields(dayOfWeek, section, exercise.id, {
                          reps: repsValue,
                          load: computedLoad
                        });
                      }}
                      disabled={isCyclicExercise}
                      className={inputClassName}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="number"
                      value={exercise.interval ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'interval', e.target.value ? Number(e.target.value) : null)}
                      disabled={isCyclicExercise}
                      className={inputClassName}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="number"
                      value={exercise.cParam ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'cParam', e.target.value ? Number(e.target.value) : null)}
                      disabled={isCyclicExercise}
                      className={inputClassName}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="number"
                      value={exercise.eParam ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'eParam', e.target.value ? Number(e.target.value) : null)}
                      disabled={isCyclicExercise}
                      className={inputClassName}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="number"
                      value={exercise.load ?? ''}
                      readOnly
                      className={`w-16 rounded border border-gray-200 bg-gray-100 px-2 py-1 text-sm text-center ${
                        isCyclicExercise ? 'text-gray-400' : ''
                      }`}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom}`}>
                    <input
                      type="text"
                      value={exercise.adjustment ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'adjustment', e.target.value)}
                      disabled={isCyclicExercise}
                      className={inputClassName}
                    />
                  </td>
                  <td className={`px-2 py-2 text-center ${groupBorderTop} ${groupBorderBottom} ${groupBorderRight} ${groupCornerRight}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveExercise(dayOfWeek, section, index, 'up')}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100"
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveExercise(dayOfWeek, section, index, 'down')}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100"
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateExercise(dayOfWeek, section, index)}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100"
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteExercise(dayOfWeek, section, index)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 px-2 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openExerciseModal(dayOfWeek, section)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Exercício
          </button>
          <button
            type="button"
            onClick={() => openQuickFillModal(dayOfWeek, section)}
            className="text-sm text-blue-600 hover:text-blue-700"
            title="Preenchimento rápido de Int, C e E"
          >
            Preenchimento rápido (Int/C/E)
          </button>
        </div>
      </div>
    </div>
  );
  };

  useEffect(() => {
    if (registerScrollContainer) {
      registerScrollContainer(scrollContainerRef.current);
      return () => registerScrollContainer(null);
    }
  }, [registerScrollContainer]);

  return (
    <div className="space-y-6">
      {/* Tabela Semanal - Layout Colunar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Treinamento Resistido - Semana</h3>
        </div>

        <div
          className="overflow-x-auto overflow-y-hidden"
          ref={scrollContainerRef}
          onScroll={(event) => {
            if (onScrollSync) {
              onScrollSync(event.currentTarget);
            }
          }}
        >
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 border-b border-gray-200 min-w-[280px]">
                  Treinamentos
                </th>
                {days.map((day) => (
                  <th
                    key={day.dayOfWeek}
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-700 border-b border-gray-200 min-w-[160px]"
                  >
                    <div className="font-medium text-gray-900">{day.label}</div>
                    <div className="text-[11px] text-gray-500">{day.date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {[
                { key: 'mobilidade', title: 'MOBILIDADE | AQUECIMENTO | ATIVAÇÃO | TÉCNICO', bg: 'bg-purple-50' },
                { key: 'sessao', title: 'SESSÃO', bg: 'bg-green-50' },
                { key: 'resfriamento', title: 'RESFRIAMENTO | FINALIZAÇÃO', bg: 'bg-blue-50' }
              ].map((section) => (
                <tr key={section.key} className="border-b border-gray-200">
                  <td className={`px-4 py-3 text-xs font-semibold text-gray-800 ${section.bg}`}>
                    {section.title}
                  </td>
                  {days.map((day) => (
                    <td key={day.dayOfWeek} className="px-4 py-3 align-top">
                      {renderDayExerciseCell(day.dayOfWeek, section.key as SectionKey, isDayEditable(day.dayOfWeek))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ExerciseSelectorModal
        isOpen={exerciseModalOpen}
        onClose={() => setExerciseModalOpen(false)}
        onSelect={handleSelectExercise}
        onSelectMany={handleSelectExercises}
        section={selectedSection ? selectedSection.toUpperCase() : ''}
      />

      {quickFillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setQuickFillOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h4 className="text-base font-semibold text-gray-900 mb-4">Preenchimento rápido</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">S</label>
                <input
                  type="number"
                  value={quickFillValues.sets}
                  onChange={(e) => setQuickFillValues((prev) => ({ ...prev, sets: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Int Ex</label>
                <input
                  type="number"
                  value={quickFillValues.intervalBetweenExercises}
                  onChange={(e) =>
                    setQuickFillValues((prev) => ({ ...prev, intervalBetweenExercises: e.target.value }))
                  }
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Int Séries</label>
                <input
                  type="number"
                  value={quickFillValues.intervalBetweenSeries}
                  onChange={(e) =>
                    setQuickFillValues((prev) => ({ ...prev, intervalBetweenSeries: e.target.value }))
                  }
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">C</label>
                <input
                  type="number"
                  value={quickFillValues.cParam}
                  onChange={(e) => setQuickFillValues((prev) => ({ ...prev, cParam: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">E</label>
                <input
                  type="number"
                  value={quickFillValues.eParam}
                  onChange={(e) => setQuickFillValues((prev) => ({ ...prev, eParam: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                />
              </div>
              <div className="col-span-1" aria-hidden="true" />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickFillOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyQuickFill}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

