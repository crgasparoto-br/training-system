import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { periodizationService, ResistedStimulus, TrainingParameter } from '../../services/periodization.service';
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { Button, buttonClassName } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ExerciseSelectorModal } from '../../components/ExerciseSelectorModal';
import { libraryService, type Exercise } from '../../services/library.service';
import { isDateWithinRange, parseDateOnly } from '../../utils/date';

interface WorkoutBuilderResistanceProps {
  templateData: any;
  resistedSummary: ResistedStimulus | null;
  onChange: (data: any) => void;
  /** Dia (1=Seg ... 7=Dom) exibido; compartilhado entre semanas quando controlado pela página. */
  selectedDay?: number | null;
  onSelectedDayChange?: (dayOfWeek: number) => void;
  planStartDate?: string | Date | null;
  planEndDate?: string | Date | null;
  weekStartDateOverride?: string | null;
  dayEditability?: boolean[];
  weekEditable?: boolean;
}

type SectionKey = 'mobilidade' | 'sessao' | 'resfriamento';

const SECTIONS: Array<{ key: SectionKey; title: string; accent: string }> = [
  { key: 'mobilidade', title: 'Mobilidade | Aquecimento | Ativação | Técnico', accent: 'bg-purple-400' },
  { key: 'sessao', title: 'Sessão', accent: 'bg-emerald-500' },
  { key: 'resfriamento', title: 'Resfriamento | Finalização', accent: 'bg-sky-400' }
];

type NumericField = 'sets' | 'reps' | 'interval' | 'cParam' | 'eParam';

// Coluna única em telas largas; abaixo de xl cada exercício vira um bloco com rótulos visíveis.
const ROW_GRID =
  'xl:grid-cols-[minmax(11rem,1fr)_8.5rem_repeat(5,3.25rem)_3.5rem_4.5rem_8.75rem] xl:items-center xl:gap-x-2';

const parseQuickFillValue = (value: string) => (value.trim() === '' ? undefined : Number(value));

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
  selectedDay: selectedDayProp,
  onSelectedDayChange,
  planStartDate,
  planEndDate,
  weekStartDateOverride,
  dayEditability,
  weekEditable = true
}: WorkoutBuilderResistanceProps) {
  const lastHydratedKey = useRef<string | null>(null);
  const quickFillTriggerRef = useRef<HTMLElement | null>(null);
  const dayTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const idPrefix = useId();
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
    const labels = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    const shortLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    return labels.map((label, index) => {
      const dayOfWeek = index + 1;
      const date = resolveDayDate(dayOfWeek);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');

      return {
        dayOfWeek,
        label,
        shortLabel: shortLabels[index],
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
    quickFillTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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

  const closeQuickFillModal = () => {
    setQuickFillOpen(false);
    quickFillTriggerRef.current?.focus();
  };

  // Campos vazios preservam o valor atual de cada exercício.
  const applyQuickFill = () => {
    if (!quickFillDay || !quickFillSection) return;
    const sets = parseQuickFillValue(quickFillValues.sets);
    const intervalBetweenExercises = parseQuickFillValue(quickFillValues.intervalBetweenExercises);
    const intervalBetweenSeries = parseQuickFillValue(quickFillValues.intervalBetweenSeries);
    const cParam = parseQuickFillValue(quickFillValues.cParam);
    const eParam = parseQuickFillValue(quickFillValues.eParam);

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
          sets: sets ?? exercise.sets,
          interval: interval ?? exercise.interval,
          cParam: cParam ?? exercise.cParam,
          eParam: eParam ?? exercise.eParam
        };
      });

      const updatedDay = { ...currentDay, [quickFillSection]: updatedSection };
      const updated = { ...prev, [quickFillDay]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });

    closeQuickFillModal();
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
    const target = exercisesByDay[dayOfWeek]?.[section]?.[index];
    if (target && !window.confirm(`Excluir "${target.name}" deste dia?`)) return;
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
            reps: null,
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
      reps: null,
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

  const getCyclicLocation = (dayOfWeek: number) => {
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

  const countDayExercises = (dayOfWeek: number) =>
    SECTIONS.reduce((total, section) => total + (exercisesByDay[dayOfWeek]?.[section.key]?.length ?? 0), 0);

  // Sem escolha explícita, abre o primeiro dia com exercícios ou, na falta, o primeiro dia editável.
  const defaultDay =
    days.find((day) => countDayExercises(day.dayOfWeek) > 0)?.dayOfWeek ??
    days.find((day) => isDayEditable(day.dayOfWeek))?.dayOfWeek ??
    1;

  const [internalDay, setInternalDay] = useState<number | null>(null);
  const activeDay = selectedDayProp ?? internalDay ?? defaultDay;
  const activeDayInfo = days[activeDay - 1] ?? days[0];
  const activeDayEditable = isDayEditable(activeDayInfo.dayOfWeek);

  const selectDay = (dayOfWeek: number) => {
    setInternalDay(dayOfWeek);
    onSelectedDayChange?.(dayOfWeek);
  };

  const handleDayTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let nextIndex: number | null = null;
    if (event.key in offsets) nextIndex = (index + offsets[event.key] + days.length) % days.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = days.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectDay(days[nextIndex].dayOfWeek);
    dayTabRefs.current[nextIndex]?.focus();
  };

  const numericInputClassName =
    'h-10 w-full rounded-md border border-input bg-card px-1.5 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-8';
  const fieldLabelClassName = 'mb-1 block text-xs text-muted-foreground xl:sr-only';

  const renderSection = (dayOfWeek: number, section: (typeof SECTIONS)[number]) => {
    const sectionExercises = exercisesByDay[dayOfWeek]?.[section.key] || [];
    const groupData =
      section.key === 'sessao'
        ? buildSystemGroups(sectionExercises, resistedSummary?.method ?? '')
        : { meta: [], warnings: [] };
    const headingId = `${idPrefix}-${dayOfWeek}-${section.key}`;

    const renderNumericField = (
      exercise: SelectedExercise,
      field: NumericField,
      label: string,
      value: number | '' | null | undefined,
      onValueChange: (value: number | null) => void,
      placeholder?: string
    ) => (
      <label>
        <span className={fieldLabelClassName}>{label}</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={value ?? ''}
          placeholder={placeholder}
          aria-label={`${label} de ${exercise.name}`}
          data-field={field}
          onChange={(e) => onValueChange(e.target.value ? Number(e.target.value) : null)}
          className={numericInputClassName}
        />
      </label>
    );

    return (
      <section key={section.key} aria-labelledby={headingId} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span aria-hidden="true" className={`h-4 w-1 rounded-full ${section.accent}`} />
            {section.title}
            <span className="font-normal text-muted-foreground">({sectionExercises.length})</span>
          </h5>
          <div className="flex flex-wrap items-center gap-2">
            {sectionExercises.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => openQuickFillModal(dayOfWeek, section.key)}
              >
                Preenchimento rápido
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExerciseModal(dayOfWeek, section.key)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar exercício
            </Button>
          </div>
        </div>

        {groupData.warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              {groupData.warnings.map((warning, idx) => (
                <p key={`${warning.systemKey}-${idx}`}>
                  {`${warning.label} incompleto: ${
                    warning.missing === 1 ? 'falta 1 exercício' : `faltam ${warning.missing} exercícios`
                  } para fechar o grupo.`}
                </p>
              ))}
            </div>
          </div>
        )}

        {sectionExercises.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            Nenhum exercício nesta seção.
          </p>
        ) : (
          <div className="rounded-md border border-border">
            <div
              aria-hidden="true"
              className={`hidden border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground xl:grid ${ROW_GRID}`}
            >
              <span>Exercício</span>
              <span>Sistema</span>
              <abbr title="Séries" className="text-center no-underline">S</abbr>
              <abbr title="Repetições" className="text-center no-underline">Rep</abbr>
              <abbr title="Intervalo" className="text-center no-underline">Int</abbr>
              <span className="text-center">C</span>
              <span className="text-center">E</span>
              <abbr title="Carga calculada" className="text-center no-underline">Crg</abbr>
              <abbr title="Ajuste" className="text-center no-underline">Aj</abbr>
              <span className="text-right">Ações</span>
            </div>
            <ol className="divide-y divide-border">
              {sectionExercises.map((exercise, index) => {
                const groupMeta = groupData.meta[index];
                const isCyclicExercise = isCyclicCategory(exercise.category);
                const rowClassName = isCyclicExercise
                  ? 'bg-sky-50'
                  : groupMeta
                    ? groupMeta.isComplete
                      ? groupMeta.groupNumber % 2 === 0
                        ? 'bg-emerald-50'
                        : 'bg-emerald-100/70'
                      : 'bg-red-50'
                    : '';
                const repZone =
                  section.key === 'sessao' &&
                  resistedSummary?.repZone !== null &&
                  resistedSummary?.repZone !== undefined
                    ? String(resistedSummary.repZone)
                    : undefined;
                const iconButtonClassName = buttonClassName({
                  variant: 'ghost',
                  size: 'icon',
                  className: 'h-10 w-10 text-muted-foreground xl:h-8 xl:w-8'
                });

                return (
                  <li
                    key={exercise.id}
                    className={`grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 xl:py-2 ${ROW_GRID} ${rowClassName}`}
                  >
                    <div className="col-span-2 min-w-0 xl:col-span-1">
                      <p className="text-sm text-foreground">
                        <span className="mr-1 tabular-nums text-muted-foreground">{index + 1}.</span>
                        {exercise.name}
                      </p>
                      {groupMeta && (
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            groupMeta.isComplete ? 'bg-emerald-200/70 text-emerald-800' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {`${groupMeta.label} ${groupMeta.groupNumber} · ${groupMeta.indexInGroup + 1}/${groupMeta.size}${
                            groupMeta.isComplete ? '' : ' · incompleto'
                          }`}
                        </span>
                      )}
                    </div>

                    {isCyclicExercise ? (
                      <p className="col-span-2 text-sm text-muted-foreground xl:col-span-8">
                        Exercício cíclico: parâmetros definidos no treino cíclico.
                      </p>
                    ) : (
                      <>
                        <div className="col-span-2 xl:col-span-1">
                          {section.key === 'resfriamento' ? (
                            <label>
                              <span className={fieldLabelClassName}>Sistema</span>
                              <input
                                type="text"
                                value={exercise.system ?? ''}
                                aria-label={`Sistema de ${exercise.name}`}
                                onChange={(e) =>
                                  updateExerciseField(dayOfWeek, section.key, exercise.id, 'system', e.target.value)
                                }
                                className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm xl:h-8"
                              />
                            </label>
                          ) : (
                            <label>
                              <span className={fieldLabelClassName}>Sistema</span>
                              <select
                                value={exercise.system || (section.key === 'sessao' ? (resistedSummary?.method ?? '') : 'SER')}
                                aria-label={`Sistema de ${exercise.name}`}
                                onChange={(e) =>
                                  updateExerciseField(dayOfWeek, section.key, exercise.id, 'system', e.target.value)
                                }
                                className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm xl:h-8"
                              >
                                {methodParameters.length === 0 ? (
                                  <option value="SER">Séries</option>
                                ) : (
                                  methodParameters.map((param) => (
                                    <option key={param.id} value={param.code}>
                                      {param.description}
                                    </option>
                                  ))
                                )}
                              </select>
                            </label>
                          )}
                        </div>

                        <div className="col-span-2 grid grid-cols-3 gap-2 sm:grid-cols-7 xl:contents">
                          {renderNumericField(exercise, 'sets', 'Séries', exercise.sets, (value) =>
                            updateExerciseField(dayOfWeek, section.key, exercise.id, 'sets', value)
                          )}
                          {renderNumericField(
                            exercise,
                            'reps',
                            'Repetições',
                            exercise.reps,
                            (repsValue) => {
                              const referenceId = exercise.exerciseId ?? exercise.id;
                              updateExerciseFields(dayOfWeek, section.key, exercise.id, {
                                reps: repsValue,
                                load: calculateLoad(maxLoads[referenceId], repsValue)
                              });
                            },
                            repZone
                          )}
                          {renderNumericField(exercise, 'interval', 'Intervalo', exercise.interval, (value) =>
                            updateExerciseField(dayOfWeek, section.key, exercise.id, 'interval', value)
                          )}
                          {renderNumericField(exercise, 'cParam', 'C', exercise.cParam, (value) =>
                            updateExerciseField(dayOfWeek, section.key, exercise.id, 'cParam', value)
                          )}
                          {renderNumericField(exercise, 'eParam', 'E', exercise.eParam, (value) =>
                            updateExerciseField(dayOfWeek, section.key, exercise.id, 'eParam', value)
                          )}
                          <div>
                            <span className={fieldLabelClassName}>Carga</span>
                            <output
                              aria-label={`Carga calculada de ${exercise.name}`}
                              className="flex h-10 items-center justify-center text-sm tabular-nums text-foreground xl:h-8"
                            >
                              {exercise.load ?? '–'}
                            </output>
                          </div>
                          <label>
                            <span className={fieldLabelClassName}>Ajuste</span>
                            <input
                              type="text"
                              value={exercise.adjustment ?? ''}
                              aria-label={`Ajuste de ${exercise.name}`}
                              onChange={(e) =>
                                updateExerciseField(dayOfWeek, section.key, exercise.id, 'adjustment', e.target.value)
                              }
                              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm xl:h-8"
                            />
                          </label>
                        </div>
                      </>
                    )}

                    <div className="col-span-2 flex items-center justify-end gap-0.5 xl:col-span-1">
                      <button
                        type="button"
                        onClick={() => moveExercise(dayOfWeek, section.key, index, 'up')}
                        disabled={index === 0}
                        className={iconButtonClassName}
                        aria-label={`Mover ${exercise.name} para cima`}
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveExercise(dayOfWeek, section.key, index, 'down')}
                        disabled={index === sectionExercises.length - 1}
                        className={iconButtonClassName}
                        aria-label={`Mover ${exercise.name} para baixo`}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateExercise(dayOfWeek, section.key, index)}
                        className={iconButtonClassName}
                        aria-label={`Duplicar ${exercise.name}`}
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteExercise(dayOfWeek, section.key, index)}
                        className={`${iconButtonClassName} ml-1 !text-destructive hover:!bg-red-50`}
                        aria-label={`Excluir ${exercise.name}`}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
    );
  };

  const quickFillSectionTitle = SECTIONS.find((section) => section.key === quickFillSection)?.title ?? '';
  const quickFillDayLabel = quickFillDay ? days[quickFillDay - 1]?.label : '';
  const cyclicLocation = getCyclicLocation(activeDayInfo.dayOfWeek);
  const panelId = `${idPrefix}-panel`;

  return (
    <div className="space-y-5">
      <div className="relative overflow-x-auto rounded-lg border border-border bg-card px-2 py-1">
        <div role="tablist" aria-label="Dias da semana" data-tabs="resistance-days">
          {days.map((day, index) => {
            const isActive = day.dayOfWeek === activeDayInfo.dayOfWeek;
            const count = countDayExercises(day.dayOfWeek);
            const editable = isDayEditable(day.dayOfWeek);
            return (
              <button
                key={day.dayOfWeek}
                ref={(el) => {
                  dayTabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${day.dayOfWeek}`}
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                title={`${day.label}, ${day.date}`}
                onClick={() => selectDay(day.dayOfWeek)}
                onKeyDown={(event) => handleDayTabKeyDown(event, index)}
              >
                <span>{day.shortLabel}</span>
                <span className="text-xs tabular-nums">{day.date}</span>
                {count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-foreground">
                    {count}
                    <span className="sr-only">{count === 1 ? ' exercício' : ' exercícios'}</span>
                  </span>
                )}
                {!editable && (
                  <>
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">somente leitura</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${idPrefix}-tab-${activeDayInfo.dayOfWeek}`}
        className="space-y-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h4 className="text-base font-semibold text-foreground">
            {activeDayInfo.label}, {activeDayInfo.date}
          </h4>
          <p className="text-sm text-muted-foreground">
            Treino cíclico:{' '}
            <span className="font-medium text-foreground">{cyclicLocation || 'não planejado'}</span>
          </p>
        </div>

        {!activeDayEditable && (
          <p className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Dia fora do período do plano: somente leitura.
          </p>
        )}

        <fieldset
          disabled={!activeDayEditable}
          aria-label={`Exercícios de ${activeDayInfo.label}`}
          className={`m-0 min-w-0 space-y-6 border-0 p-0 ${activeDayEditable ? '' : 'opacity-70'}`}
        >
          {SECTIONS.map((section) => renderSection(activeDayInfo.dayOfWeek, section))}
        </fieldset>
      </div>

      <ExerciseSelectorModal
        isOpen={exerciseModalOpen}
        onClose={() => setExerciseModalOpen(false)}
        onSelect={handleSelectExercise}
        onSelectMany={handleSelectExercises}
        section={selectedSection ? selectedSection.toUpperCase() : ''}
      />

      {quickFillOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeQuickFillModal();
          }}
        >
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeQuickFillModal} />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-quickfill-title`}
            aria-describedby={`${idPrefix}-quickfill-desc`}
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-card p-5 shadow-lg"
            onSubmit={(event) => {
              event.preventDefault();
              applyQuickFill();
            }}
          >
            <h4 id={`${idPrefix}-quickfill-title`} className="text-base font-semibold text-foreground">
              Preenchimento rápido
            </h4>
            <p id={`${idPrefix}-quickfill-desc`} className="mt-1 text-sm text-muted-foreground">
              Aplica os valores a todos os exercícios de {quickFillSectionTitle} em {quickFillDayLabel}. Campos
              vazios mantêm os valores atuais.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Input
                label="Séries"
                type="number"
                min={0}
                autoFocus
                value={quickFillValues.sets}
                onChange={(e) => setQuickFillValues((prev) => ({ ...prev, sets: e.target.value }))}
              />
              <Input
                label="C"
                type="number"
                min={0}
                value={quickFillValues.cParam}
                onChange={(e) => setQuickFillValues((prev) => ({ ...prev, cParam: e.target.value }))}
              />
              <Input
                label="E"
                type="number"
                min={0}
                value={quickFillValues.eParam}
                onChange={(e) => setQuickFillValues((prev) => ({ ...prev, eParam: e.target.value }))}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Input
                label="Intervalo entre séries"
                type="number"
                min={0}
                value={quickFillValues.intervalBetweenSeries}
                onChange={(e) =>
                  setQuickFillValues((prev) => ({ ...prev, intervalBetweenSeries: e.target.value }))
                }
              />
              {quickFillSection === 'sessao' && (
                <Input
                  label="Intervalo dentro do grupo"
                  type="number"
                  min={0}
                  value={quickFillValues.intervalBetweenExercises}
                  onChange={(e) =>
                    setQuickFillValues((prev) => ({ ...prev, intervalBetweenExercises: e.target.value }))
                  }
                />
              )}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeQuickFillModal}>
                Cancelar
              </Button>
              <Button type="submit">Aplicar</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
