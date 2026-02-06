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
  const [assemblyParameters, setAssemblyParameters] = useState<TrainingParameter[]>([]);
  const [loadCycleParameters, setLoadCycleParameters] = useState<TrainingParameter[]>([]);
  const [maxLoads, setMaxLoads] = useState<Record<string, number | null>>({});

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

    const loadAssemblyParameters = async () => {
      try {
        const data = await periodizationService.getParametersByCategory('montagem');
        setAssemblyParameters(data);
      } catch (error) {
        setAssemblyParameters([]);
      }
    };

    const loadLoadCycleParameters = async () => {
      try {
        const data = await periodizationService.getParametersByCategory('carga_microciclo');
        setLoadCycleParameters(data);
      } catch (error) {
        setLoadCycleParameters([]);
      }
    };

    loadMethodParameters();
    loadAssemblyParameters();
    loadLoadCycleParameters();
  }, []);

  const methodParamMap = useMemo(() => {
    return new Map(methodParameters.map((param) => [param.code, param]));
  }, [methodParameters]);

  const assemblyParamMap = useMemo(() => {
    return new Map(assemblyParameters.map((param) => [param.code, param]));
  }, [assemblyParameters]);

  const loadCycleParamMap = useMemo(() => {
    return new Map(loadCycleParameters.map((param) => [param.code, param]));
  }, [loadCycleParameters]);

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
    if (!templateData?.athleteId) return;
    if (maxLoads[exerciseId] !== undefined) return;

    try {
      const progress = await libraryService.getStudentProgress(templateData.athleteId, exerciseId);
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

      const updatedDay = { ...currentDay, [section]: updatedSection };
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
      const updatedDay = { ...currentDay, [section]: list };
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

      const updatedDay = { ...currentDay, [section]: list };
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
      const updatedDay = { ...currentDay, [section]: list };
      const updated = { ...prev, [dayOfWeek]: updatedDay };
      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
  };

  const handleSelectExercise = (exercise: Exercise) => {
    if (!selectedDay || !selectedSection) return;
    const rowId = `${exercise.id}-${Date.now()}-${Math.random()}`;

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
            system:
              selectedSection === 'mobilidade'
                ? 'SER'
                : selectedSection === 'sessao'
                  ? (resistedSummary?.method ?? '')
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

      const updated = {
        ...prev,
        [selectedDay]: updatedDay
      };

      onChange({ ...templateData, resistedExercises: updated });
      return updated;
    });
    void fetchMaxLoad(exercise.id);
  };

  const handleSelectExercises = (exercises: Exercise[]) => {
    if (!selectedDay || !selectedSection) return;
    if (!exercises.length) return;

    const newEntries = exercises.map((exercise) => ({
      id: `${exercise.id}-${Date.now()}-${Math.random()}`,
      exerciseId: exercise.id,
      name: exercise.name,
      system:
        selectedSection === 'mobilidade'
          ? 'SER'
          : selectedSection === 'sessao'
            ? (resistedSummary?.method ?? '')
            : '',
      sets: null,
      reps: null,
      interval: null,
      cParam: null,
      eParam: null,
      load: null,
      adjustment: ''
    }));

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

      const updated = {
        ...prev,
        [selectedDay]: updatedDay
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
            <div className="text-[11px] font-medium text-gray-500">Planejamento do Treinamento Cíclico</div>
            <div className="text-sm font-semibold text-gray-800">
              {getCyclicLocation() || '-'}
            </div>
          </div>
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
              sectionExercises.map((exercise, index) => (
                <tr key={exercise.id}>
                  <td className="px-2 py-2 text-left text-gray-700">{index + 1}</td>
                  <td className="px-2 py-2 text-left text-gray-700">{exercise.name}</td>
                  <td className="px-2 py-2 text-left">
                    {section === 'mobilidade' || section === 'sessao' ? (
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
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      value={exercise.sets ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'sets', e.target.value ? Number(e.target.value) : null)}
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      value={exercise.reps ?? ''}
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
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      value={exercise.interval ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'interval', e.target.value ? Number(e.target.value) : null)}
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      value={exercise.cParam ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'cParam', e.target.value ? Number(e.target.value) : null)}
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      value={exercise.eParam ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'eParam', e.target.value ? Number(e.target.value) : null)}
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      value={exercise.load ?? ''}
                      readOnly
                      className="w-16 rounded border border-gray-200 bg-gray-100 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="text"
                      value={exercise.adjustment ?? ''}
                      onChange={(e) => updateExerciseField(dayOfWeek, section, exercise.id, 'adjustment', e.target.value)}
                      className="w-14 rounded border border-gray-200 px-2 py-1 text-sm text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
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
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 px-2 py-2">
        <button
          type="button"
          onClick={() => openExerciseModal(dayOfWeek, section)}
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Exercício
        </button>
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
    </div>
  );
}
