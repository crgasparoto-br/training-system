
import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  ListChecks,
  CalendarDays,
  BarChart3,
  CheckCircle2,
  Timer,
  Dumbbell,
  Footprints,
  Activity,
  LayoutGrid,
  List,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { formatDateBR, parseDateOnly, toDateInputValue } from '../utils/date';
import { executionsService, type WorkoutDayDetail } from '../services/executions.service';
import { athleteService, type Athlete } from '../services/athlete.service';
import { useAuthStore } from '../stores/useAuthStore';

type ViewMode = 'resumo' | 'detalhe' | 'diario';
type CalendarView = 'semana' | 'mes' | 'ano';
type ExerciseCategory = 'Todos' | 'Cíclico' | 'Resistido' | 'Mobilidade' | 'Técnico';

type CalendarExercise = {
  id: string;
  date: string;
  name: string;
  title: string;
  duration: string;
  category: Exclude<ExerciseCategory, 'Todos'>;
  status: 'planejado' | 'realizado';
  distanceKm?: number;
  system?: string | null;
};

type DailyExerciseBlock = {
  id: string;
  name: string;
  system?: string;
  sets?: string;
  reps?: string;
  interval?: string;
  load?: string;
  status: 'planejado' | 'realizado';
};

type DailySet = {
  id: string;
  setNumber: number;
  reps: string;
  targetLoad: string;
};

type DailyExercise = {
  id: string;
  section: 'Aquecimento' | 'Sessao' | 'Resfriamento';
  name: string;
  system?: string;
  notes?: string;
  sets: DailySet[];
  intervalSec?: number | null;
  cParam?: number | null;
  eParam?: number | null;
  reps?: number | null;
};

type WeeklyDay = {
  date: string;
  weekdayLabel: string;
  psr?: number;
  pse?: number;
  sessionDurationMin?: number;
  cyclic: {
    volumeMin?: number;
    volumeKm?: number;
    method?: string;
    description?: string;
  };
  resisted: {
    volumeSeries?: number;
    method?: string;
    exercises: DailyExerciseBlock[];
  };
  notes?: string;
};

const categories: ExerciseCategory[] = ['Todos', 'Cíclico', 'Resistido', 'Mobilidade', 'Técnico'];
const dailySections = ['Aquecimento', 'Sessao', 'Resfriamento'] as const;
const sectionMeta: Record<DailyExercise['section'], { label: string; icon: LucideIcon; tone: string }> = {
  Aquecimento: { label: 'Aquecimento', icon: Activity, tone: 'text-emerald-700' },
  Sessao: { label: 'Sessão', icon: Dumbbell, tone: 'text-orange-700' },
  Resfriamento: { label: 'Resfriamento', icon: Timer, tone: 'text-blue-700' },
};

type BiSetPhase = 'idle' | 'first_active' | 'between_exercises' | 'waiting_second' | 'second_active' | 'between_sets' | 'completed';
type BiSetTimerState = {
  phase: BiSetPhase;
  remainingSec: number;
  currentSet: number;
  totalSets: number;
};

const getGroupLabel = (system?: string | null) => {
  if (!system) return null;
  const upper = system.toUpperCase();
  if (upper.includes('BI')) return 'Bi-Set';
  if (upper.includes('TRI')) return 'Tri-Set';
  if (upper.includes('GIANT') || upper.includes('GIGANTE')) return 'Giant Set';
  if (upper.includes('CIRCUIT') || upper.includes('CIRCUITO')) return 'Circuito';
  return null;
};

const getWeekStart = (value: Date) => {
  const date = new Date(value);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const formatShortDate = (value: Date) => {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

const formatMonthLabel = (value: Date) => {
  return value.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
};

const formatDurationFromMinutes = (value?: number | null) => {
  if (value === null || value === undefined) return '--:--';
  const totalSeconds = Math.max(0, Math.round(value * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatSeconds = (value: number) => {
  const safe = Math.max(0, Math.floor(value));
  const min = String(Math.floor(safe / 60)).padStart(2, '0');
  const sec = String(safe % 60).padStart(2, '0');
  return `${min}:${sec}`;
};

const normalizeSection = (value: string) => {
  const upper = value.toUpperCase();
  if (upper.includes('AQUEC') || upper.includes('MOB')) return 'Aquecimento';
  if (upper.includes('RESFR')) return 'Resfriamento';
  return 'Sessao';
};

const formatLoad = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return `${value} kg`;
};

const normalizeCategory = (value?: string | null): Exclude<ExerciseCategory, 'Todos'> => {
  if (!value) return 'Resistido';
  const upper = value.toUpperCase();
  if (upper.includes('CIC')) return 'Cíclico';
  if (upper.includes('RESIST')) return 'Resistido';
  if (upper.includes('MOB')) return 'Mobilidade';
  if (upper.includes('TEC')) return 'Técnico';
  return 'Resistido';
};

const normalizeSystemText = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const resolveGroupLabel = (system?: string | null, text?: string | null) => {
  const systemLabel = getGroupLabel(system);
  if (systemLabel) return systemLabel;
  if (!text && !system) return null;
  const normalized = normalizeSystemText(`${system ?? ''} ${text ?? ''}`);

  if (/\bbs\b/.test(normalized) || normalized === 'b' || normalized === 'bs') {
    return 'Bi-Set';
  }
  if (/\bbi\s*set\b/.test(normalized) || /\bbiset\b/.test(normalized) || normalized === 'bi') {
    return 'Bi-Set';
  }
  if (/\btri\s*set\b/.test(normalized) || /\btriset\b/.test(normalized) || normalized === 'tri') {
    return 'Tri-Set';
  }
  if (/\bgiant\b/.test(normalized) || /\bgigante\b/.test(normalized)) {
    return 'Giant Set';
  }
  if (/\bcircuito\b/.test(normalized) || /\bcircuit\b/.test(normalized)) {
    return 'Circuito';
  }
  return null;
};

const getGroupSizeFromLabel = (label?: string | null) => {
  if (!label) return 1;
  if (label === 'Bi-Set') return 2;
  if (label === 'Tri-Set') return 3;
  if (label === 'Giant Set') return 4;
  return 1;
};

const buildGroupedBlocks = <T,>(
  items: T[],
  resolveLabel: (item: T) => string | null
) => {
  const groups: Array<{ type: 'group' | 'single'; label?: string; items: T[] }> = [];
  let i = 0;

  while (i < items.length) {
    const current = items[i];
    const label = resolveLabel(current);
    const size = getGroupSizeFromLabel(label);
    if (!label || size <= 1) {
      groups.push({ type: 'single', items: [current] });
      i += 1;
      continue;
    }

    const slice = items.slice(i, i + size);
    const isValidGroup =
      slice.length === size && slice.every((item) => resolveLabel(item) === label);

    if (isValidGroup) {
      groups.push({ type: 'group', label, items: slice });
      i += size;
      continue;
    }

    groups.push({ type: 'single', items: [current] });
    i += 1;
  }

  return groups;
};

const groupCalendarExercises = (items: CalendarExercise[]) => {
  return buildGroupedBlocks(items, (item) => resolveGroupLabel(item.system, item.name ?? item.title));
};

const groupResistedExercises = (items: DailyExerciseBlock[]) => {
  return buildGroupedBlocks(items, (item) => resolveGroupLabel(item.system, item.name));
};

const buildGroupWarnings = <T,>(
  items: T[],
  resolveLabel: (item: T) => string | null
) => {
  const warnings: Array<{ label: string; missing: number }> = [];
  let i = 0;
  while (i < items.length) {
    const label = resolveLabel(items[i]);
    const size = getGroupSizeFromLabel(label);
    if (!label || size <= 1) {
      i += 1;
      continue;
    }

    const slice = items.slice(i, i + size);
    const sameLabel = slice.filter((item) => resolveLabel(item) === label).length;
    if (sameLabel < size) {
      warnings.push({ label, missing: size - sameLabel });
      i += 1;
      continue;
    }

    i += size;
  }
  return warnings;
};

const groupToneMap: Record<string, { label: string; className: string; badgeClass: string }> = {
  'Bi-Set': {
    label: 'Bi-Set',
    className: 'border-amber-400 bg-amber-100/70 text-amber-900',
    badgeClass: 'bg-amber-200 text-amber-900',
  },
  'Tri-Set': {
    label: 'Tri-Set',
    className: 'border-sky-400 bg-sky-100/70 text-sky-900',
    badgeClass: 'bg-sky-200 text-sky-900',
  },
  'Giant Set': {
    label: 'Giant Set',
    className: 'border-rose-400 bg-rose-100/70 text-rose-900',
    badgeClass: 'bg-rose-200 text-rose-900',
  },
  Circuito: {
    label: 'Circuito',
    className: 'border-emerald-400 bg-emerald-100/70 text-emerald-900',
    badgeClass: 'bg-emerald-200 text-emerald-900',
  },
};

const getGroupTone = (label?: string) => {
  if (!label) {
    return {
      label: 'Grupo',
      className: 'border-amber-400 bg-amber-100/70 text-amber-900',
      badgeClass: 'bg-amber-200 text-amber-900',
    };
  }
  return (
    groupToneMap[label] ?? {
      label,
      className: 'border-amber-400 bg-amber-100/70 text-amber-900',
      badgeClass: 'bg-amber-200 text-amber-900',
    }
  );
};

const getCategoryColor = (category: Exclude<ExerciseCategory, 'Todos'>) => {
  switch (category) {
    case 'Cíclico':
      return 'border-emerald-500 bg-emerald-50 text-emerald-800';
    case 'Resistido':
      return 'border-orange-500 bg-orange-50 text-orange-800';
    case 'Mobilidade':
      return 'border-purple-500 bg-purple-50 text-purple-800';
    case 'Técnico':
      return 'border-blue-500 bg-blue-50 text-blue-800';
    default:
      return 'border-gray-300 bg-gray-50 text-gray-700';
  }
};

export default function Executions() {
  const { user } = useAuthStore();
  const isEducator = user?.type === 'educator';
  const [viewMode, setViewMode] = useState<ViewMode>('resumo');
  const [calendarView, setCalendarView] = useState<CalendarView>('semana');
  const [categoryFilter, setCategoryFilter] = useState<ExerciseCategory>('Todos');
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [psrInput, setPsrInput] = useState<number | ''>('');
  const [pseInput, setPseInput] = useState<number | ''>('');
  const [performedLoads, setPerformedLoads] = useState<Record<string, string>>({});
  const [confirmedSets, setConfirmedSets] = useState<Set<string>>(new Set());
  const [dailyData, setDailyData] = useState<WorkoutDayDetail | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<WorkoutDayDetail[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(false);
  const [athletesError, setAthletesError] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [compactDaily, setCompactDaily] = useState(true);
  const [biSetTimers, setBiSetTimers] = useState<Record<string, BiSetTimerState>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('executions.daily.compact');
    if (stored === null) return;
    setCompactDaily(stored === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('executions.daily.compact', String(compactDaily));
  }, [compactDaily]);

  useEffect(() => {
    const timer = setInterval(() => {
      setBiSetTimers((prev) => {
        let changed = false;
        const next: Record<string, BiSetTimerState> = { ...prev };
        Object.entries(prev).forEach(([key, state]) => {
          if (state.remainingSec <= 0) {
            if (state.phase === 'between_exercises') {
              next[key] = { ...state, phase: 'waiting_second', remainingSec: 0 };
              changed = true;
            } else if (state.phase === 'between_sets') {
              next[key] = { ...state, phase: 'idle', remainingSec: 0 };
              changed = true;
            }
            return;
          }

          if (state.phase === 'between_exercises' || state.phase === 'between_sets') {
            next[key] = { ...state, remainingSec: state.remainingSec - 1 };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const weekStart = useMemo(() => getWeekStart(baseDate), [baseDate]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return {
        date,
        label: date.toLocaleDateString('pt-BR', { weekday: 'long' }),
        key: toDateInputValue(date),
      };
    });
  }, [weekStart]);

  useEffect(() => {
    if (!isEducator) {
      setAthletes([]);
      setSelectedAthleteId('');
      setAthletesError(null);
      setAthletesLoading(false);
      return;
    }

    let isMounted = true;
    const loadAthletes = async () => {
      try {
        setAthletesLoading(true);
        setAthletesError(null);
        const response = await athleteService.list(1, 200, undefined, 'active');
        if (!isMounted) return;
        const list = response.athletes ?? [];
        setAthletes(list);
        if (!selectedAthleteId && list.length > 0) {
          setSelectedAthleteId(list[0].id);
        }
      } catch (error: any) {
        if (!isMounted) return;
        setAthletes([]);
        setAthletesError(error?.response?.data?.error || 'Erro ao carregar atletas');
      } finally {
        if (isMounted) {
          setAthletesLoading(false);
        }
      }
    };

    loadAthletes();
    return () => {
      isMounted = false;
    };
  }, [isEducator]);

  const rangeBounds = useMemo(() => {
    if (viewMode === 'diario') return null;
    if (viewMode === 'detalhe') return { start: weekStart, end: weekEnd };

    if (calendarView === 'mes') {
      const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      return { start, end };
    }

    if (calendarView === 'ano') {
      const start = new Date(baseDate.getFullYear(), 0, 1);
      const end = new Date(baseDate.getFullYear(), 11, 31);
      return { start, end };
    }

    return { start: weekStart, end: weekEnd };
  }, [viewMode, calendarView, baseDate, weekStart, weekEnd]);

  useEffect(() => {
    if (!rangeBounds) {
      setRangeDays([]);
      setRangeError(null);
      setRangeLoading(false);
      return;
    }
    if (isEducator && !selectedAthleteId) return;

    let isMounted = true;
    const loadRange = async () => {
      try {
        setRangeLoading(true);
        setRangeError(null);
        const startDate = toDateInputValue(rangeBounds.start);
        const endDate = toDateInputValue(rangeBounds.end);
        if (!startDate || !endDate) {
          setRangeDays([]);
          setRangeError('Selecione um periodo valido.');
          return;
        }

        const days = isEducator
          ? await executionsService.listWorkoutDaysForEducator(startDate, endDate, selectedAthleteId)
          : await executionsService.listWorkoutDays(startDate, endDate);

        if (!isMounted) return;
        setRangeDays(days ?? []);
      } catch (error: any) {
        if (!isMounted) return;
        setRangeDays([]);
        setRangeError(error?.response?.data?.error || 'Erro ao carregar treinos');
      } finally {
        if (isMounted) {
          setRangeLoading(false);
        }
      }
    };

    loadRange();
    return () => {
      isMounted = false;
    };
  }, [rangeBounds, isEducator, selectedAthleteId]);

  const calendarExercises = useMemo(() => {
    const items: CalendarExercise[] = [];

    rangeDays.forEach((day) => {
      const dateKey = toDateInputValue(day.workoutDate);
      if (!dateKey) return;
      const duration = formatDurationFromMinutes(day.sessionDurationMin);
      const exercises = Array.isArray(day.exercises) ? day.exercises : [];

      exercises.forEach((exercise) => {
        const category = normalizeCategory(exercise.exercise?.category);
        const prefix = exercise.system ? `[${exercise.system}] ` : '';
        const name = exercise.exercise?.name ?? 'Exercicio';
        items.push({
          id: exercise.id,
          date: dateKey,
          name,
          title: `${prefix}${name}`,
          duration,
          category,
          status: exercise.executions && exercise.executions.length > 0 ? 'realizado' : 'planejado',
          system: exercise.system ?? null,
        });
      });
    });

    return items;
  }, [rangeDays]);

  const filteredExercises = useMemo(() => {
    if (categoryFilter === 'Todos') return calendarExercises;
    return calendarExercises.filter((exercise) => exercise.category === categoryFilter);
  }, [categoryFilter, calendarExercises]);

  const weekExercises = useMemo(() => {
    const startKey = toDateInputValue(weekStart);
    const endKey = toDateInputValue(weekEnd);
    return filteredExercises.filter((exercise) => exercise.date >= startKey && exercise.date <= endKey);
  }, [filteredExercises, weekStart, weekEnd]);

  const totals = useMemo(() => {
    const planned = weekExercises.filter((exercise) => exercise.status === 'planejado').length;
    const completed = weekExercises.filter((exercise) => exercise.status === 'realizado').length;
    const totalKm = weekExercises.reduce((acc, exercise) => acc + (exercise.distanceKm || 0), 0);
    return { planned, completed, totalKm };
  }, [weekExercises]);

  const weekExercisesAll = useMemo(() => {
    const startKey = toDateInputValue(weekStart);
    const endKey = toDateInputValue(weekEnd);
    return calendarExercises.filter((exercise) => exercise.date >= startKey && exercise.date <= endKey);
  }, [calendarExercises, weekStart, weekEnd]);

  const weekTotalsAll = useMemo(() => {
    const planned = weekExercisesAll.filter((exercise) => exercise.status === 'planejado').length;
    const completed = weekExercisesAll.filter((exercise) => exercise.status === 'realizado').length;
    const totalKm = weekExercisesAll.reduce((acc, exercise) => acc + (exercise.distanceKm || 0), 0);
    return { planned, completed, totalKm };
  }, [weekExercisesAll]);

  const weekDetail = useMemo(() => {
    const dayMap = new Map<string, WorkoutDayDetail>();
    rangeDays.forEach((day) => {
      const key = toDateInputValue(day.workoutDate);
      if (key) {
        dayMap.set(key, day);
      }
    });

    const days: WeeklyDay[] = weekDays.map((day) => {
      const data = dayMap.get(day.key);
      const exercises = data?.exercises ?? [];
      const cyclicExercises = exercises.filter(
        (exercise) => normalizeCategory(exercise.exercise?.category) === 'Cíclico'
      );
      const resistedExercises = exercises.filter(
        (exercise) => normalizeCategory(exercise.exercise?.category) !== 'Cíclico'
      );

      const resistedList: DailyExerciseBlock[] = resistedExercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.exercise?.name ?? 'Exercicio',
        system: exercise.system ?? undefined,
        sets: exercise.sets !== null && exercise.sets !== undefined ? String(exercise.sets) : undefined,
        reps: exercise.reps !== null && exercise.reps !== undefined ? String(exercise.reps) : undefined,
        interval: exercise.intervalSec ? `${exercise.intervalSec}s` : undefined,
        load: exercise.load ? `${exercise.load} kg` : undefined,
        status: exercise.executions && exercise.executions.length > 0 ? 'realizado' : 'planejado',
      }));

      const totalSeries = resistedExercises.reduce((acc, exercise) => acc + (exercise.sets ?? 0), 0);
      const cyclicDescription =
        cyclicExercises.length > 0
          ? cyclicExercises[0].exercise?.name ?? 'Sessao ciclica'
          : undefined;

      return {
        date: day.key,
        weekdayLabel: day.label,
        psr: data?.psrResponse ?? undefined,
        pse: data?.pseResponse ?? undefined,
        sessionDurationMin: data?.sessionDurationMin ?? undefined,
        cyclic: {
          volumeMin: data?.stimulusDurationMin ?? data?.sessionDurationMin ?? undefined,
          volumeKm: undefined,
          method: data?.method ?? undefined,
          description: cyclicDescription,
        },
        resisted: {
          volumeSeries: totalSeries || undefined,
          method: data?.method ?? undefined,
          exercises: resistedList,
        },
        notes: data?.detailNotes ?? data?.generalGuidelines ?? data?.complementNotes ?? undefined,
      };
    });

    const template = rangeDays.find((day) => day.template)?.template;
    const mesocycle = template?.mesocycleNumber ?? null;
    const weekNumber = template?.weekNumber ?? null;

    const totalVolumeMin = rangeDays.reduce((acc, day) => acc + (day.sessionDurationMin ?? 0), 0);
    const cyclicVolumeMin = rangeDays.reduce((acc, day) => acc + (day.stimulusDurationMin ?? 0), 0);
    const resistedSeries = rangeDays.reduce((acc, day) => {
      const daySeries = (day.exercises ?? []).reduce((sum, exercise) => sum + (exercise.sets ?? 0), 0);
      return acc + daySeries;
    }, 0);

    return {
      mesocycle,
      microcycle: weekNumber,
      weekNumber,
      sessionsInWeek: rangeDays.length,
      weekStart: toDateInputValue(weekStart),
      weekEnd: toDateInputValue(weekEnd),
      totalVolumeMin,
      totalVolumeKm: 0,
      cyclicVolumeMin,
      cyclicVolumeKm: 0,
      resistedSeries,
      days,
    };
  }, [rangeDays, weekDays, weekStart, weekEnd]);

  const weekGuidance = useMemo(() => {
    const notes = rangeDays
      .map((day) => day.generalGuidelines || day.detailNotes || day.complementNotes)
      .filter((note): note is string => Boolean(note && note.trim()));
    return Array.from(new Set(notes)).slice(0, 2);
  }, [rangeDays]);

  const psrAvg = useMemo(() => {
    const values = rangeDays.map((day) => day.psrResponse).filter((value) => typeof value === 'number') as number[];
    if (values.length === 0) return null;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
  }, [rangeDays]);

  const pseAvg = useMemo(() => {
    const values = rangeDays.map((day) => day.pseResponse).filter((value) => typeof value === 'number') as number[];
    if (values.length === 0) return null;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
  }, [rangeDays]);

  const monthDays = useMemo(() => {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const startWeekday = (start.getDay() + 6) % 7;
    const daysInMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
    const totalSlots = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    return Array.from({ length: totalSlots }, (_, index) => {
      const dayOffset = index - startWeekday;
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1 + dayOffset);
      return {
        date,
        isCurrentMonth: date.getMonth() === baseDate.getMonth(),
        key: toDateInputValue(date),
      };
    });
  }, [baseDate]);

  const yearMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      return new Date(baseDate.getFullYear(), index, 1);
    });
  }, [baseDate]);

  const dailyDateValue = toDateInputValue(baseDate);
  const canEditDaily = !isEducator;

  const dailyExercises = useMemo(() => {
    if (!dailyData) return [];
    const exercises = Array.isArray(dailyData.exercises) ? dailyData.exercises : [];

    return exercises.map((exercise) => {
      const totalSets = exercise.sets ?? 0;
      const sets = Array.from({ length: totalSets }, (_, idx) => {
        const setNumber = idx + 1;
        const id = `${exercise.id}-set-${setNumber}`;
        const existingExecution = exercise.executions?.find((execution) => execution.setNumber === setNumber);
        return {
          id,
          setNumber,
          reps: `${exercise.reps ?? '-'}`,
          targetLoad: formatLoad(exercise.load),
          workoutExerciseId: exercise.id,
          existingExecution,
        };
      });

      return {
        id: exercise.id,
        section: normalizeSection(exercise.section ?? ''),
        name: exercise.exercise?.name ?? 'Exercicio',
        system: exercise.system ?? 'Seriado',
        notes: exercise.exerciseNotes ?? exercise.exercise?.notes ?? 'Sem observacoes',
        reps: exercise.reps ?? null,
        intervalSec: exercise.intervalSec ?? null,
        cParam: exercise.cParam ?? null,
        eParam: exercise.eParam ?? null,
        sets,
      };
    });
  }, [dailyData]);

  const totalDailySets = dailyExercises.reduce((acc, exercise) => acc + exercise.sets.length, 0);
  const confirmedCount = confirmedSets.size;

  const getBiSetState = (key: string, totalSets: number): BiSetTimerState => {
    return (
      biSetTimers[key] ?? {
        phase: 'idle',
        remainingSec: 0,
        currentSet: 1,
        totalSets,
      }
    );
  };

  const updateBiSetState = (key: string, updater: (prev: BiSetTimerState) => BiSetTimerState) => {
    setBiSetTimers((prev) => {
      const existing = prev[key] ?? { phase: 'idle', remainingSec: 0, currentSet: 1, totalSets: 1 };
      return { ...prev, [key]: updater(existing) };
    });
  };

  const toggleSetConfirmation = (setId: string) => {
    setConfirmedSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }
      return next;
    });
  };

  const loadDaily = async (overrideDate?: string) => {
    try {
      setDailyLoading(true);
      setDailyError(null);
      const targetDate = overrideDate ?? dailyDateValue;
      if (!targetDate) {
        setDailyData(null);
        setDailyError('Selecione uma data valida.');
        return;
      }
      if (isEducator) {
        if (!selectedAthleteId) {
          setDailyData(null);
          setDailyError('Selecione um atleta.');
          return;
        }
        const day = await executionsService.getWorkoutDayByDateForEducator(targetDate, selectedAthleteId);
        setDailyData(day);
        setPsrInput(day.psrResponse ?? '');
        setPseInput(day.pseResponse ?? '');
        return;
      }

      const day = await executionsService.getWorkoutDayByDate(targetDate);
      setDailyData(day);
      setPsrInput(day.psrResponse ?? '');
      setPseInput(day.pseResponse ?? '');
    } catch (error: any) {
      setDailyData(null);
      setDailyError(error?.response?.data?.error || 'Sem treino para a data selecionada');
    } finally {
      setDailyLoading(false);
    }
  };

  const handleDailyDateChange = (value: string) => {
    if (!value) {
      setBaseDate(new Date());
      setDailyData(null);
      setDailyError('Selecione uma data valida.');
      return;
    }
    setBaseDate(new Date(`${value}T12:00:00`));
    void loadDaily(value);
  };

  useEffect(() => {
    if (viewMode !== 'diario') return;
    if (isEducator && !selectedAthleteId) return;
    void loadDaily();
  }, [viewMode, dailyDateValue, isEducator, selectedAthleteId]);

  useEffect(() => {
    if (!dailyData) {
      setPerformedLoads({});
      setConfirmedSets(new Set());
      return;
    }

    const nextLoads: Record<string, string> = {};
    const nextConfirmed = new Set<string>();

    dailyExercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        if (set.existingExecution?.loadUsed !== null && set.existingExecution?.loadUsed !== undefined) {
          nextLoads[set.id] = String(set.existingExecution.loadUsed);
        }
        if (set.existingExecution) {
          nextConfirmed.add(set.id);
        }
      });
    });

    setPerformedLoads(nextLoads);
    setConfirmedSets(nextConfirmed);
  }, [dailyData, dailyExercises]);

  const renderExerciseSet = (exercise: DailyExercise, set: DailySet) => {
    const performedValue = performedLoads[set.id] ?? '';
    const isConfirmed = confirmedSets.has(set.id);

    if (compactDaily) {
      return (
        <div
          className={`flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${
            isConfirmed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          <span className="font-semibold">S{set.setNumber}</span>
          <span>{set.reps} reps</span>
          <span className="text-[10px]">Carga: {set.targetLoad}</span>
          <input
            type="text"
            value={performedValue}
            onChange={(e) =>
              setPerformedLoads((prev) => ({
                ...prev,
                [set.id]: e.target.value,
              }))
            }
            className="h-6 w-16 rounded-md border border-gray-200 bg-white px-2 text-[11px]"
            placeholder={set.targetLoad}
            disabled={!canEditDaily}
          />
          <button
            type="button"
            onClick={async () => {
              if (!canEditDaily || isConfirmed) {
                return;
              }
              const loadUsed = performedLoads[set.id]
                ? Number(String(performedLoads[set.id]).replace(',', '.'))
                : null;
              await executionsService.recordExecution(set.workoutExerciseId, {
                setNumber: set.setNumber,
                repsCompleted: exercise.reps ?? null,
                loadUsed: Number.isNaN(loadUsed ?? NaN) ? null : loadUsed,
                setsCompleted: 1,
              });
              toggleSetConfirmation(set.id);
            }}
            disabled={!canEditDaily}
            className={`h-6 rounded-full px-2 text-[10px] font-semibold transition-colors ${
              isConfirmed
                ? 'bg-emerald-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isConfirmed ? 'OK' : 'Confirmar'}
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
        <div className="flex items-center justify-between text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">S{set.setNumber}</span>
          <span>{set.reps} reps</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-gray-600">
          <span>Carga: {set.targetLoad}</span>
          {isConfirmed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckCircle2 size={12} />
              OK
            </span>
          ) : (
            <span className="text-[10px] text-gray-400">Pendente</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={performedValue}
            onChange={(e) =>
              setPerformedLoads((prev) => ({
                ...prev,
                [set.id]: e.target.value,
              }))
            }
            className="h-7 w-20 rounded-md border border-gray-200 bg-white px-2 text-xs"
            placeholder={set.targetLoad}
            disabled={!canEditDaily}
          />
          <button
            type="button"
            onClick={async () => {
              if (!canEditDaily || isConfirmed) {
                return;
              }
              const loadUsed = performedLoads[set.id]
                ? Number(String(performedLoads[set.id]).replace(',', '.'))
                : null;
              await executionsService.recordExecution(set.workoutExerciseId, {
                setNumber: set.setNumber,
                repsCompleted: exercise.reps ?? null,
                loadUsed: Number.isNaN(loadUsed ?? NaN) ? null : loadUsed,
                setsCompleted: 1,
              });
              toggleSetConfirmation(set.id);
            }}
            disabled={!canEditDaily}
            className={`h-7 rounded-md px-2 text-[11px] font-semibold transition-colors ${
              isConfirmed
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isConfirmed ? 'Confirmado' : 'Confirmar'}
          </button>
        </div>
      </div>
    );
  };

  const renderExerciseSetBlock = (exercise: DailyExercise, set: DailySet) => (
    <div className="rounded-md border border-gray-200 bg-white p-2 space-y-2">
      {(() => {
        const performedValue = performedLoads[set.id] ?? '';
        const isConfirmed = confirmedSets.has(set.id);
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span className="font-semibold text-gray-900">
              S{set.setNumber} • {set.reps} reps — {exercise.name}
            </span>
            <span className="text-[10px] text-gray-600">Carga: {set.targetLoad}</span>
            <input
              type="text"
              value={performedValue}
              onChange={(e) =>
                setPerformedLoads((prev) => ({
                  ...prev,
                  [set.id]: e.target.value,
                }))
              }
              className="h-6 w-16 rounded-md border border-gray-200 bg-white px-2 text-[11px]"
              placeholder={set.targetLoad}
              disabled={!canEditDaily}
            />
            <button
              type="button"
              onClick={async () => {
                if (!canEditDaily || isConfirmed) {
                  return;
                }
                const loadUsed = performedLoads[set.id]
                  ? Number(String(performedLoads[set.id]).replace(',', '.'))
                  : null;
                await executionsService.recordExecution(set.workoutExerciseId, {
                  setNumber: set.setNumber,
                  repsCompleted: exercise.reps ?? null,
                  loadUsed: Number.isNaN(loadUsed ?? NaN) ? null : loadUsed,
                  setsCompleted: 1,
                });
                toggleSetConfirmation(set.id);
              }}
              disabled={!canEditDaily}
              className={`h-6 rounded-full px-2 text-[10px] font-semibold transition-colors ${
                isConfirmed
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {isConfirmed ? 'OK' : 'Confirmar'}
            </button>
          </div>
        );
      })()}
    </div>
  );

  const renderExerciseCard = (exercise: DailyExercise) => (
    <div key={exercise.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{exercise.system} • {exercise.notes}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
          {exercise.sets.length} series
        </span>
      </div>

      <div className="space-y-2">
        {exercise.sets.map((set) => (
          <div key={set.id}>{renderExerciseSetBlock(exercise, set)}</div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-2">
          <Timer size={12} />
          Entre exercícios: {formatSeconds(exercise.cParam ?? exercise.eParam ?? 0)}
        </span>
        <span className="inline-flex items-center gap-2">
          <Timer size={12} />
          Entre séries: {formatSeconds(exercise.intervalSec ?? 0)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Execução de Exercícios</h1>
          <p className="text-muted-foreground mt-2">
            Acompanhe o que foi planejado e o que já foi executado pelo atleta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={viewMode === 'resumo' ? 'default' : 'outline'} onClick={() => setViewMode('resumo')}>
            <Calendar size={18} />
            Resumo
          </Button>
          <Button variant={viewMode === 'detalhe' ? 'default' : 'outline'} onClick={() => setViewMode('detalhe')}>
            <ListChecks size={18} />
            Detalhado
          </Button>
          <Button variant={viewMode === 'diario' ? 'default' : 'outline'} onClick={() => setViewMode('diario')}>
            <Dumbbell size={18} />
            Diario
          </Button>
        </div>
      </div>

      {viewMode === 'resumo' ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBaseDate(new Date())}>
                    Hoje
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setBaseDate(addDays(baseDate, -7))}>
                    <ChevronLeft size={18} />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setBaseDate(addDays(baseDate, 7))}>
                    <ChevronRight size={18} />
                  </Button>
                  <span className="text-sm font-semibold text-gray-700">
                    {formatShortDate(weekStart)} - {formatShortDate(weekEnd)} {weekStart.getFullYear()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={calendarView === 'semana' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCalendarView('semana')}
                  >
                    Semana
                  </Button>
                  <Button
                    variant={calendarView === 'mes' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCalendarView('mes')}
                  >
                    Mês
                  </Button>
                  <Button
                    variant={calendarView === 'ano' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCalendarView('ano')}
                  >
                    Ano
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Filter size={16} />
                  Filtrar por categoria
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        categoryFilter === category
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {rangeLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-4 text-muted-foreground">Carregando execuções...</p>
              </CardContent>
            </Card>
          ) : rangeError ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">{rangeError}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {calendarView === 'semana' && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-7 gap-3">
                      {weekDays.map((day) => (
                        <div key={day.key} className="rounded-lg border border-gray-200 bg-white">
                          <div className="border-b px-3 py-2 text-xs font-semibold text-gray-600">
                            {day.label}
                            <div className="text-sm font-bold text-gray-900">
                              {day.date.getDate()}
                            </div>
                          </div>
                    <div className="flex flex-col gap-2 p-2">
                            {(() => {
                              const exercisesInDay = weekExercises.filter((exercise) => exercise.date === day.key);
                              const grouped = groupCalendarExercises(exercisesInDay);
                              if (grouped.length === 0) {
                                return <div className="text-xs text-muted-foreground">Sem atividades</div>;
                              }
                              return grouped.map((group, index) => {
                                if (group.type === 'group') {
                                  const tone = getGroupTone(group.label);
                                  return (
                                    <div
                                      key={`group-${day.key}-${index}`}
                                      className={`rounded-md border-2 border-dashed p-2 shadow-sm space-y-2 ${tone.className}`}
                                    >
                                      <div className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.badgeClass}`}>
                                        {tone.label}
                                      </div>
                                      <div className="grid gap-2">
                                        {group.items.map((exercise) => (
                                          <div
                                            key={exercise.id}
                                            className={`rounded-md border-l-4 px-2 py-2 text-xs ${getCategoryColor(
                                              exercise.category
                                            )}`}
                                          >
                                            <div className="font-semibold text-gray-900 flex items-center justify-between gap-2">
                                              <span className="line-clamp-2">{exercise.title}</span>
                                              {exercise.status === 'realizado' && (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                              )}
                                            </div>
                                            <div className="mt-1 text-[11px] text-gray-600">
                                              {exercise.duration}
                                              {exercise.distanceKm ? ` - ${exercise.distanceKm.toFixed(1)} km` : ''}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }

                                const exercise = group.items[0];
                                return (
                                  <div
                                    key={exercise.id}
                                    className={`rounded-md border-l-4 px-2 py-2 text-xs ${getCategoryColor(
                                      exercise.category
                                    )}`}
                                  >
                                    <div className="font-semibold text-gray-900 flex items-center justify-between gap-2">
                                      <span className="line-clamp-2">{exercise.title}</span>
                                      {exercise.status === 'realizado' && (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                      )}
                                    </div>
                                    <div className="mt-1 text-[11px] text-gray-600">
                                      {exercise.duration}
                                      {exercise.distanceKm ? ` - ${exercise.distanceKm.toFixed(1)} km` : ''}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 border-t pt-4 grid gap-4 md:grid-cols-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                          <CheckCircle2 size={16} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Realizados</p>
                          <p className="text-lg font-bold">{totals.completed}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-orange-100 p-2 text-orange-700">
                          <ListChecks size={16} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Planejados</p>
                          <p className="text-lg font-bold">{totals.planned}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-blue-100 p-2 text-blue-700">
                          <Footprints size={16} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Distância total</p>
                          <p className="text-lg font-bold">{totals.totalKm.toFixed(1)} km</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-gray-100 p-2 text-gray-700">
                          <CalendarDays size={16} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Semana</p>
                          <p className="text-lg font-bold">{formatShortDate(weekStart)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {calendarView === 'mes' && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{formatMonthLabel(baseDate)}</h3>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-xs font-semibold text-gray-500 mb-2">
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((label) => (
                        <div key={label} className="text-center">{label}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {monthDays.map((day) => {
                        const exercisesInDay = filteredExercises.filter((exercise) => exercise.date === day.key);
                        const grouped = groupCalendarExercises(exercisesInDay);
                        return (
                          <div
                            key={day.key}
                            className={`rounded-lg border px-2 py-2 min-h-[90px] ${
                              day.isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'
                            }`}
                          >
                            <div className="text-sm font-semibold">{day.date.getDate()}</div>
                            <div className="mt-2 flex flex-col gap-1">
                              {grouped.slice(0, 2).map((group, index) => {
                                if (group.type === 'group') {
                                  const tone = getGroupTone(group.label);
                                  return (
                                    <div
                                      key={`month-group-${day.key}-${index}`}
                                      className={`rounded border-2 border-dashed px-2 py-1 text-[10px] space-y-1 ${tone.className}`}
                                    >
                                      <div className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${tone.badgeClass}`}>
                                        {tone.label}
                                      </div>
                                      {group.items.map((exercise) => (
                                        <div
                                          key={exercise.id}
                                          className={`rounded border-l-4 px-2 py-1 ${getCategoryColor(
                                            exercise.category
                                          )}`}
                                        >
                                          {exercise.title}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }

                                const exercise = group.items[0];
                                return (
                                  <div
                                    key={exercise.id}
                                    className={`rounded border-l-4 px-2 py-1 text-[10px] ${getCategoryColor(
                                      exercise.category
                                    )}`}
                                  >
                                    {exercise.title}
                                  </div>
                                );
                              })}
                              {grouped.length > 2 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{grouped.length - 2} atividades
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {calendarView === 'ano' && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {yearMonths.map((month) => {
                        const label = month.toLocaleDateString('pt-BR', { month: 'long' });
                        const exercisesInMonth = filteredExercises.filter((exercise) => {
                          const date = parseDateOnly(exercise.date);
                          return date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
                        });
                        const totalMonth = exercisesInMonth.length;
                        const grouped = groupCalendarExercises(exercisesInMonth);
                        return (
                          <div key={label} className="rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold capitalize">{label}</span>
                              <span className="text-xs text-muted-foreground">{month.getFullYear()}</span>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-gray-100">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{ width: `${Math.min(totalMonth * 10, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{totalMonth}</span>
                            </div>
                            {grouped.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {grouped.slice(0, 3).map((group, index) => {
                                  if (group.type === 'group') {
                                    const tone = getGroupTone(group.label);
                                    return (
                                      <div
                                        key={`year-group-${label}-${index}`}
                                        className={`rounded border-2 border-dashed px-2 py-1 text-[10px] space-y-1 ${tone.className}`}
                                      >
                                        <div className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${tone.badgeClass}`}>
                                          {tone.label}
                                        </div>
                                        {group.items.map((exercise) => (
                                          <div
                                            key={exercise.id}
                                            className={`rounded border-l-4 px-2 py-1 ${getCategoryColor(
                                              exercise.category
                                            )}`}
                                          >
                                            {exercise.title}
                                        </div>
                                      ))}
                                      </div>
                                    );
                                  }

                                  const exercise = group.items[0];
                                  return (
                                    <div
                                      key={exercise.id}
                                      className={`rounded border-l-4 px-2 py-1 text-[10px] ${getCategoryColor(
                                        exercise.category
                                      )}`}
                                    >
                                      {exercise.title}
                                    </div>
                                  );
                                })}
                                {grouped.length > 3 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    +{grouped.length - 3} atividades
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      ) : viewMode === 'detalhe' ? (
        <div className="space-y-6">
          {rangeLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-4 text-muted-foreground">Carregando execuções...</p>
              </CardContent>
            </Card>
          ) : rangeError ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">{rangeError}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Semana {weekDetail.weekNumber ?? '-'}</CardTitle>
                  <CardDescription>
                    {weekDetail.weekStart ? formatDateBR(weekDetail.weekStart) : '-'} a {weekDetail.weekEnd ? formatDateBR(weekDetail.weekEnd) : '-'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Mesociclo</p>
                    <p className="text-lg font-bold">{weekDetail.mesocycle ?? '-'}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Microciclo</p>
                    <p className="text-lg font-bold">{weekDetail.microcycle ?? '-'}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Sessões</p>
                    <p className="text-lg font-bold">{weekDetail.sessionsInWeek ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Volume Total (min)</p>
                    <p className="text-lg font-bold">{weekDetail.totalVolumeMin ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Volume Cíclico (km)</p>
                    <p className="text-lg font-bold">{weekDetail.cyclicVolumeKm ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Séries Resistidas</p>
                    <p className="text-lg font-bold">{weekDetail.resistedSeries ?? 0}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 size={18} />
                      Indicadores da Semana
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Volume cíclico (min)</span>
                      <span className="font-semibold">{weekDetail.cyclicVolumeMin ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Volume cíclico (km)</span>
                      <span className="font-semibold">{weekDetail.cyclicVolumeKm ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total de séries</span>
                      <span className="font-semibold">{weekDetail.resistedSeries ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sessões concluídas</span>
                      <span className="font-semibold">{weekTotalsAll.completed}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity size={18} />
                      Orientações Gerais
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    {weekGuidance.length > 0 ? (
                      weekGuidance.map((note) => <p key={note}>{note}</p>)
                    ) : (
                      <p>Sem orientações gerais para esta semana.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Timer size={18} />
                      PSR e PSE (Média)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">PSR</span>
                      <span className="font-semibold">{psrAvg !== null ? psrAvg.toFixed(1) : '-'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">PSE</span>
                      <span className="font-semibold">{pseAvg !== null ? pseAvg.toFixed(1) : '-'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(((psrAvg ?? 0) / 10) * 100, 100)}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar size={18} />
                    Agenda Detalhada da Semana
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {weekDetail.days.map((day) => (
                      <div key={day.date} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">{day.weekdayLabel}</p>
                            <p className="text-lg font-semibold">{formatDateBR(day.date)}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">PSR {day.psr ?? '-'}</span>
                            <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">PSE {day.pse ?? '-'}</span>
                          </div>
                        </div>

                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                            <span className="flex items-center gap-1"><Footprints size={14} /> Treinamento Cíclico</span>
                            <span>{day.cyclic.method ?? '-'}</span>
                          </div>
                          <p className="text-sm text-emerald-900">{day.cyclic.description ?? 'Sem sessão cíclica'}</p>
                          <div className="flex items-center gap-3 text-xs text-emerald-700">
                            <span>{day.cyclic.volumeMin ?? 0} min</span>
                            <span>{day.cyclic.volumeKm ?? 0} km</span>
                            <span>{day.sessionDurationMin ?? 0} min sessão</span>
                          </div>
                        </div>

                        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-orange-800">
                            <span className="flex items-center gap-1"><Dumbbell size={14} /> Treinamento Resistido</span>
                            <span>{day.resisted.method ?? '-'}</span>
                          </div>
                          <div className="text-xs text-orange-700">
                            Séries: {day.resisted.volumeSeries ?? 0}
                          </div>
                          {day.resisted.exercises.length > 0 ? (
                            <div className="space-y-2">
                              {groupResistedExercises(day.resisted.exercises).map((group, index) => {
                                if (group.type === 'group') {
                                  const tone = getGroupTone(group.label);
                                  return (
                                    <div
                                      key={`resisted-group-${day.date}-${index}`}
                                      className={`rounded-md border-2 border-dashed p-2 shadow-sm space-y-2 ${tone.className}`}
                                    >
                                      <div className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.badgeClass}`}>
                                        {tone.label}
                                      </div>
                                      {group.items.map((exercise) => (
                                        <div
                                          key={exercise.id}
                                          className="rounded border border-orange-200 bg-white px-2 py-2 text-xs"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-gray-900">{exercise.name}</span>
                                            {exercise.status === 'realizado' && (
                                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                            )}
                                          </div>
                                          <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-gray-600">
                                            <span>{exercise.sets ?? '-'} séries</span>
                                            <span>{exercise.reps ?? '-'} reps</span>
                                            <span>{exercise.interval ?? '-'} int</span>
                                          </div>
                                          {exercise.load && (
                                            <div className="mt-1 text-[11px] text-gray-600">Carga: {exercise.load}</div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }

                                const exercise = group.items[0];
                                return (
                                  <div key={exercise.id} className="rounded border border-orange-200 bg-white px-2 py-2 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold text-gray-900">{exercise.name}</span>
                                      {exercise.status === 'realizado' && (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                      )}
                                    </div>
                                    <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-gray-600">
                                      <span>{exercise.sets ?? '-'} séries</span>
                                      <span>{exercise.reps ?? '-'} reps</span>
                                      <span>{exercise.interval ?? '-'} int</span>
                                    </div>
                                    {exercise.load && (
                                      <div className="mt-1 text-[11px] text-gray-600">Carga: {exercise.load}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">Sem exercicios resistidos</div>
                          )}
                        </div>

                        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                          <strong>Notas:</strong> {day.notes ?? 'Sem observacoes.'}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
       ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                <span>Treino do Dia</span>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-full border border-gray-200 p-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setCompactDaily(true)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        compactDaily ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      aria-pressed={compactDaily}
                    >
                      <LayoutGrid size={12} />
                      Compacto
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompactDaily(false)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        !compactDaily ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      aria-pressed={!compactDaily}
                    >
                      <List size={12} />
                      Detalhado
                    </button>
                  </div>
                </div>
              </CardTitle>
              <CardDescription>
                {isEducator
                  ? 'Treino do dia liberado pelo educador (visualizacao somente leitura).'
                  : 'Treino do dia liberado pelo educador.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  value={dailyDateValue}
                  onChange={(e) => handleDailyDateChange(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                />
                {isEducator && (
                  <div className="flex flex-col gap-1">
                    <select
                      value={selectedAthleteId}
                      onChange={(e) => setSelectedAthleteId(e.target.value)}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                      disabled={athletesLoading}
                    >
                      <option value="">Selecione o atleta</option>
                      {athletes.map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.user?.profile?.name || 'Sem nome'}
                        </option>
                      ))}
                    </select>
                    {athletesLoading && (
                      <span className="text-xs text-muted-foreground">Carregando atletas...</span>
                    )}
                    {athletesError && (
                      <span className="text-xs text-red-600">{athletesError}</span>
                    )}
                  </div>
                )}
              </div>
              {dailyData && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    dailyData.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : dailyData.status === 'in_progress'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {dailyData.status === 'completed'
                    ? 'Finalizado'
                    : dailyData.status === 'in_progress'
                      ? 'Em andamento'
                      : 'Planejado'}
                </span>
              )}
            </CardContent>
          </Card>

          {dailyLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-4 text-muted-foreground">Carregando treino do dia...</p>
              </CardContent>
            </Card>
          ) : dailyError || !dailyData ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">{dailyError ?? 'Nenhum treino encontrado para esta data.'}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 size={18} />
                    Resumo do Treino
                  </CardTitle>
                  <CardDescription>
                    {dailyData.workoutDate ? formatDateBR(dailyData.workoutDate) : ''} - {dailyData.location ?? 'Local nao informado'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <Activity size={14} />
                        Objetivo da sessao
                      </div>
                      <p className="mt-1 text-sm text-gray-900">{dailyData.generalGuidelines ?? 'Sem orientacoes gerais.'}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <ListChecks size={14} />
                        Observacoes gerais
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{dailyData.detailNotes ?? 'Sem observacoes.'}</p>
                    </div>
                  </div>
                  <div className="lg:col-span-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-600">PSR</p>
                          <p className="text-xs text-muted-foreground">{dailyData.psrQuestion ?? 'Como voce esta se sentindo?'}</p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">Antes</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={psrInput}
                          onChange={(e) => setPsrInput(e.target.value ? Number(e.target.value) : '')}
                          className="h-8 w-20 rounded-md border border-gray-200 bg-white px-2 text-xs"
                          placeholder="0 a 10"
                          disabled={!canEditDaily}
                        />
                        <Button
                          className="h-8 flex-1 text-xs"
                          onClick={async () => {
                            if (!canEditDaily) return;
                            const updated = await executionsService.updateWorkoutDayStatus(dailyData.id, {
                              status: 'in_progress',
                              psrResponse: psrInput === '' ? null : Number(psrInput),
                            });
                            setDailyData(updated);
                          }}
                          disabled={!canEditDaily || dailyData.status === 'completed' || dailyLoading}
                        >
                          Iniciar
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-600">PSE</p>
                          <p className="text-xs text-muted-foreground">{dailyData.pseResponse ? 'Ja informado' : 'Informe ao finalizar o treino'}</p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">Depois</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={pseInput}
                          onChange={(e) => setPseInput(e.target.value ? Number(e.target.value) : '')}
                          className="h-8 w-20 rounded-md border border-gray-200 bg-white px-2 text-xs"
                          placeholder="0 a 10"
                          disabled={!canEditDaily}
                        />
                        <Button
                          variant="outline"
                          className="h-8 flex-1 text-xs"
                          onClick={async () => {
                            if (!canEditDaily) return;
                            const updated = await executionsService.updateWorkoutDayStatus(dailyData.id, {
                              status: 'completed',
                              pseResponse: pseInput === '' ? null : Number(pseInput),
                            });
                            setDailyData(updated);
                          }}
                          disabled={!canEditDaily || dailyData.status === 'completed' || dailyLoading}
                        >
                          Finalizar
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3 sm:col-span-2 lg:col-span-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progresso das series</span>
                        <span className="font-semibold text-gray-700">{confirmedCount}/{totalDailySets}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${totalDailySets ? (confirmedCount / totalDailySets) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {dailySections.map((section) => {
                const sectionExercises = dailyExercises.filter((exercise) => exercise.section === section);
                if (sectionExercises.length === 0) return null;
                const meta = sectionMeta[section];
                const Icon = meta.icon;
                const groupedExercises = buildGroupedBlocks(sectionExercises, (exercise) =>
                  resolveGroupLabel(exercise.system, exercise.name)
                );
                const groupWarnings = buildGroupWarnings(sectionExercises, (exercise) =>
                  resolveGroupLabel(exercise.system, exercise.name)
                );
                return (
                  <Card key={section}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon size={16} className={meta.tone} />
                        {meta.label}
                      </CardTitle>
                      <CardDescription>Confirme a carga utilizada em cada serie.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {isEducator && groupWarnings.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                          <p className="font-semibold">Atenção: grupo incompleto</p>
                          <div className="mt-1 text-[10px] text-amber-800">
                            {groupWarnings.map((warning, idx) => (
                              <span key={`${warning.label}-${idx}`}>
                                {warning.label}: faltam {warning.missing} exercício(s)
                                {idx < groupWarnings.length - 1 ? ' • ' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {groupedExercises.map((item, index) => {
                        if (item.type === 'single') {
                          return renderExerciseCard(item.items[0]);
                        }

                        const tone = getGroupTone(item.label);
                        const isBiSet = item.label === 'Bi-Set' && item.items.length >= 2;
                        const betweenExercisesSec =
                          item.items[0].cParam ??
                          item.items[1]?.cParam ??
                          item.items[0].eParam ??
                          item.items[1]?.eParam ??
                          10;
                        const betweenSetsSec =
                          item.items[0].intervalSec ?? item.items[1]?.intervalSec ?? 60;
                        const totalSets = Math.max(
                          1,
                          Math.min(item.items[0].sets.length, item.items[1]?.sets.length ?? 0)
                        );
                        const groupKey = `${section}-${item.label}-${index}`;
                        const biSetState = isBiSet ? getBiSetState(groupKey, totalSets) : null;

                        return (
                          <div
                            key={`${item.label}-${index}`}
                            className={`rounded-lg border-2 border-dashed p-3 shadow-sm space-y-3 ${tone.className}`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 ${tone.badgeClass}`}>
                                <Layers size={14} />
                                {tone.label}
                              </span>
                              <span>{item.items.length} exercicios</span>
                            </div>
                            {isBiSet && biSetState && (
                              <div className="rounded-lg border border-amber-200 bg-white p-3 text-[11px] text-amber-900">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold">
                                    Série {biSetState.currentSet}/{biSetState.totalSets}
                                  </span>
                                  <span className="text-amber-700">
                                    Entre exercícios: {formatSeconds(betweenExercisesSec)} • Entre séries: {formatSeconds(betweenSetsSec)}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBiSetState(groupKey, (prev) => ({
                                        ...prev,
                                        phase: 'first_active',
                                        remainingSec: 0,
                                        totalSets,
                                        currentSet: prev.currentSet > totalSets ? 1 : prev.currentSet,
                                      }))
                                    }
                                    disabled={!canEditDaily || biSetState.phase !== 'idle'}
                                    className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                                      biSetState.phase === 'idle'
                                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                                        : 'bg-amber-100 text-amber-500'
                                    } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  >
                                    Iniciar 1º
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBiSetState(groupKey, (prev) => ({
                                        ...prev,
                                        phase: 'between_exercises',
                                        remainingSec: betweenExercisesSec,
                                        totalSets,
                                      }))
                                    }
                                    disabled={!canEditDaily || biSetState.phase !== 'first_active'}
                                    className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                                      biSetState.phase === 'first_active'
                                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                        : 'bg-amber-50 text-amber-400'
                                    } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  >
                                    Finalizar 1º
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBiSetState(groupKey, (prev) => ({
                                        ...prev,
                                        phase: 'second_active',
                                        remainingSec: 0,
                                        totalSets,
                                      }))
                                    }
                                    disabled={!canEditDaily || (biSetState.phase !== 'between_exercises' && biSetState.phase !== 'waiting_second')}
                                    className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                                      biSetState.phase === 'between_exercises' || biSetState.phase === 'waiting_second'
                                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                                        : 'bg-amber-100 text-amber-500'
                                    } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  >
                                    Iniciar 2º
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBiSetState(groupKey, (prev) => {
                                        if (prev.currentSet >= totalSets) {
                                          return { ...prev, phase: 'completed', remainingSec: 0, totalSets };
                                        }
                                        return {
                                          ...prev,
                                          phase: 'between_sets',
                                          remainingSec: betweenSetsSec,
                                          totalSets,
                                          currentSet: Math.min(prev.currentSet + 1, totalSets),
                                        };
                                      })
                                    }
                                    disabled={!canEditDaily || biSetState.phase !== 'second_active'}
                                    className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                                      biSetState.phase === 'second_active'
                                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                        : 'bg-amber-50 text-amber-400'
                                    } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  >
                                    Finalizar 2º
                                  </button>
                                  {(biSetState.phase === 'between_exercises' || biSetState.phase === 'between_sets') && (
                                    <div className="w-full flex flex-wrap items-center gap-2 sticky top-12 md:top-16 z-10 rounded-md border border-amber-200 bg-amber-50/95 px-2 py-2 shadow-sm backdrop-blur">
                                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-800">
                                        <Timer size={12} />
                                        {formatSeconds(biSetState.remainingSec)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateBiSetState(groupKey, (prev) => {
                                            if (prev.phase === 'between_exercises') {
                                              return { ...prev, phase: 'waiting_second', remainingSec: 0 };
                                            }
                                            if (prev.phase === 'between_sets') {
                                              return { ...prev, phase: 'idle', remainingSec: 0 };
                                            }
                                            return prev;
                                          })
                                        }
                                        disabled={!canEditDaily}
                                        className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                                          canEditDaily
                                            ? 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                                            : 'bg-amber-50 text-amber-300'
                                        } ${!canEditDaily ? 'opacity-60 cursor-not-allowed' : ''}`}
                                      >
                                        Pular descanso
                                      </button>
                                    </div>
                                  )}
                                  {biSetState.phase === 'completed' && (
                                    <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                                      <CheckCircle2 size={12} />
                                      Concluído
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {item.label && item.items.length >= 2 ? (
                              <div className="space-y-3">
                                {Array.from({ length: totalSets }, (_, idx) => {
                                  const groupExercises = item.items;
                                  return (
                                    <div key={`biset-${index}-${idx}`} className="space-y-2">
                                      {groupExercises.map((exercise, exerciseIndex) => {
                                        const exerciseSet = exercise.sets[idx];
                                        return (
                                          <div key={`${exercise.id}-set-${idx}`} className="space-y-2">
                                            {exerciseSet && renderExerciseSetBlock(exercise, exerciseSet)}
                                            {exerciseIndex < groupExercises.length - 1 && (
                                              <div className="flex items-center gap-2 text-[11px] text-amber-800">
                                                <Timer size={12} />
                                                Entre exercícios: {formatSeconds(betweenExercisesSec)}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      <div className="flex items-center gap-2 text-[11px] text-amber-800">
                                        <Timer size={12} />
                                        Entre séries: {formatSeconds(betweenSetsSec)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="grid gap-2">
                                {item.items.map((exercise) => renderExerciseCard(exercise))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
              {dailyExercises.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">Nenhum exercício cadastrado para este dia.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
