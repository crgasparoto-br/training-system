import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  periodizationService,
  type PeriodizationMatrix,
  type ResistedStimulus,
  type CyclicStimulus,
  type NutritionWeekly,
  type TrainingParameter,
} from '../services/periodization.service';
import { Button } from './ui/Button';
import { Save, Loader2 } from 'lucide-react';
import { parseDateOnly } from '../utils/date';

interface PeriodizationMatrixProps {
  planId: string;
  startDate: string;
  endDate: string;
}

export function PeriodizationMatrixComponent({ planId, startDate, endDate }: PeriodizationMatrixProps) {
  const [matrix, setMatrix] = useState<PeriodizationMatrix | null>(null);
  const [parameters, setParameters] = useState<TrainingParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visibleMesocycles, setVisibleMesocycles] = useState<Set<number>>(new Set());
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingResistedRef = useRef<Map<string, Partial<ResistedStimulus>>>(new Map());
  const pendingCyclicRef = useRef<Map<string, Partial<CyclicStimulus>>>(new Map());
  const pendingNutritionRef = useRef<Map<string, Partial<NutritionWeekly>>>(new Map());

  // Agrupar dados
  const [resistedMap, setResistedMap] = useState<Map<number, Map<number, ResistedStimulus>>>(new Map());
  const [cyclicMap, setCyclicMap] = useState<Map<number, Map<number, CyclicStimulus>>>(new Map());
  const [nutritionMap, setNutritionMap] = useState<Map<number, Map<number, NutritionWeekly>>>(new Map());

  // Função para verificar se a matriz tem dados lançados
  const hasMatrixData = (matrixData: PeriodizationMatrix): boolean => {
    // Verificar se há dados em resistedStimulus
    const hasResisted = matrixData.resistedStimulus?.some(item => 
      item.loadCycle || item.objective || item.repZone || item.assembly || 
      item.method || item.trainingDivision || item.weeklyFrequency
    );

    // Verificar se há dados em cyclicStimulus
    const hasCyclic = matrixData.cyclicStimulus?.some(item => 
      item.totalVolumeMinutes || item.totalVolumeKm || item.runningVolumeKm ||
      item.countZ1 || item.countZ2 || item.countZ3 || item.countZ4 || item.countZ5
    );

    // Verificar se há dados em nutrition
    const hasNutrition = matrixData.nutrition?.some(item => 
      item.totalCalories || item.carbohydratesG || item.proteinsG || item.fatsG
    );

    return !!(hasResisted || hasCyclic || hasNutrition);
  };

  // Função para calcular número de mesociclos necessários
  const calculateTotalMesocycles = (): number => {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return 0;

    // Calcular diferença em dias
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Calcular número de semanas
    const totalWeeks = Math.ceil(diffDays / 7);

    // Calcular número de mesociclos (4 semanas por mesociclo)
    const weeksPerMesocycle = 4;
    const totalMesocycles = Math.ceil(totalWeeks / weeksPerMesocycle);

    return totalMesocycles;
  };

  // Função para calcular data de início da semana (segunda-feira)
  const getWeekStartDate = (mesocycleNumber: number, weekNumber: number): string => {
    const start = parseDateOnly(startDate) ?? new Date();
    const totalWeeks = (mesocycleNumber - 1) * matrix!.weeksPerMesocycle + (weekNumber - 1);
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + totalWeeks * 7);

    const day = String(weekStart.getDate()).padStart(2, '0');
    const month = String(weekStart.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  // Função para calcular minutos por zona
  const calculateZoneMinutes = (volumeTotal: number | null | undefined, percentZ: number | null | undefined): string => {
    if (!percentZ && percentZ !== 0) return '';
    if (percentZ === -1) return 'X';
    if (!volumeTotal) return '';

    const minutes = volumeTotal * (percentZ / 100);
    return Math.round(minutes).toString();
  };

  // Função para calcular séries baseado na carga
  const calculateSeries = (loadCycle: string | null | undefined, seriesRef: number | null | undefined): number | null => {
    if (!seriesRef && seriesRef !== 0) return null;
    if (!loadCycle) return seriesRef;
    if (loadCycle === 'REGENERATIVO' || loadCycle === 'REG') {
      return Math.round(seriesRef / 2);
    }
    return seriesRef;
  };

  // Função para calcular Rep Reserva baseado na carga
  const calculateRepReserve = (loadCycle: string | null | undefined): number | null => {
    if (!loadCycle) return null;
    if (loadCycle === 'CHO') return 0;
    if (loadCycle === 'ADP') return 4;
    return 2; // ORD ou REG
  };

  // Parâmetros por categoria
  const [loadCycleParams, setLoadCycleParams] = useState<TrainingParameter[]>([]);
  const [objectiveParams, setObjectiveParams] = useState<TrainingParameter[]>([]);
  const [assemblyParams, setAssemblyParams] = useState<TrainingParameter[]>([]);
  const [methodParams, setMethodParams] = useState<TrainingParameter[]>([]);
  const [divisionParams, setDivisionParams] = useState<TrainingParameter[]>([]);

  // Carregar dados
  useEffect(() => {
    loadData();
  }, [planId, startDate, endDate]);

  useEffect(() => {
    if (!matrix) return;
    const storageKey = `periodization.visibleMesocycles:${planId}`;
    const allMesocycles = Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1);
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as number[];
        const filtered = parsed.filter((value) => allMesocycles.includes(value));
        setVisibleMesocycles(new Set(filtered.length ? filtered : allMesocycles));
      } catch {
        setVisibleMesocycles(new Set(allMesocycles));
      }
    } else {
      setVisibleMesocycles(new Set(allMesocycles));
    }
    setFiltersLoaded(true);
  }, [matrix?.id, matrix?.totalMesocycles, planId]);

  useEffect(() => {
    if (!matrix || !filtersLoaded) return;
    const storageKey = `periodization.visibleMesocycles:${planId}`;
    const values = Array.from(visibleMesocycles).sort((a, b) => a - b);
    localStorage.setItem(storageKey, JSON.stringify(values));
  }, [filtersLoaded, matrix?.id, planId, visibleMesocycles]);

  const loadData = async () => {
    try {
      setLoading(true);

      let matrixData = await periodizationService.getMatrixByPlanId(planId);
      const expectedMesocycles = calculateTotalMesocycles();

      if (!matrixData) {
        matrixData = await periodizationService.createMatrix({
          planId,
          totalMesocycles: expectedMesocycles,
          weeksPerMesocycle: 4,
        });
      } else if (matrixData.totalMesocycles !== expectedMesocycles) {
        const hasData = hasMatrixData(matrixData);

        if (!hasData) {
          console.log('Período alterado e sem dados. Recriando matriz...');
          await periodizationService.deleteMatrix(matrixData.id);
          matrixData = await periodizationService.createMatrix({
            planId,
            totalMesocycles: expectedMesocycles,
            weeksPerMesocycle: 4,
          });
        } else {
          console.log('Período alterado mas há dados. Mantendo matriz atual.');
        }
      }

      setMatrix(matrixData);

      setResistedMap(periodizationService.groupResistedByMesocycleAndWeek(matrixData.resistedStimulus || []));
      setCyclicMap(periodizationService.groupCyclicByMesocycleAndWeek(matrixData.cyclicStimulus || []));
      setNutritionMap(periodizationService.groupNutritionByMesocycleAndWeek(matrixData.nutrition || []));

      const allParams = await periodizationService.getAllParameters();
      setParameters(allParams);

      setLoadCycleParams(allParams.filter(p => p.category === 'carga_microciclo'));
      setObjectiveParams(allParams.filter(p => p.category === 'objetivo'));
      setAssemblyParams(allParams.filter(p => p.category === 'montagem'));
      setMethodParams(allParams.filter(p => p.category === 'metodo'));
      setDivisionParams(allParams.filter(p => p.category === 'divisao_treino'));
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const scheduleAutoSaveFlush = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      const resistedItems = Array.from(pendingResistedRef.current.values());
      const cyclicItems = Array.from(pendingCyclicRef.current.values());
      const nutritionItems = Array.from(pendingNutritionRef.current.values());

      pendingResistedRef.current.clear();
      pendingCyclicRef.current.clear();
      pendingNutritionRef.current.clear();

      if (resistedItems.length === 0 && cyclicItems.length === 0 && nutritionItems.length === 0) {
        return;
      }

      try {
        setSaving(true);

        if (resistedItems.length) {
          await Promise.all(resistedItems.map((item) => periodizationService.upsertResistedStimulus(item)));
        }
        if (cyclicItems.length) {
          await Promise.all(cyclicItems.map((item) => periodizationService.upsertCyclicStimulus(item)));
        }
        if (nutritionItems.length) {
          await Promise.all(nutritionItems.map((item) => periodizationService.upsertNutrition(item)));
        }
      } catch (error) {
        console.error('Erro ao salvar:', error);
      } finally {
        setSaving(false);
      }
    }, 2000);
  }, []);

  const queueAutoSave = useCallback(
    (
      type: 'resisted' | 'cyclic' | 'nutrition',
      data: Partial<ResistedStimulus> | Partial<CyclicStimulus> | Partial<NutritionWeekly>
    ) => {
      if (!data.matrixId || !data.mesocycleNumber || !data.weekNumber) return;
      const key = `${data.matrixId}:${data.mesocycleNumber}:${data.weekNumber}`;

      if (type === 'resisted') {
        pendingResistedRef.current.set(key, data as Partial<ResistedStimulus>);
      } else if (type === 'cyclic') {
        pendingCyclicRef.current.set(key, data as Partial<CyclicStimulus>);
      } else {
        pendingNutritionRef.current.set(key, data as Partial<NutritionWeekly>);
      }

      scheduleAutoSaveFlush();
    },
    [scheduleAutoSaveFlush]
  );

  const scheduleAutoSave = useCallback(
    (
      type: 'resisted' | 'cyclic' | 'nutrition',
      data: Partial<ResistedStimulus> | Partial<CyclicStimulus> | Partial<NutritionWeekly>
    ) => {
      queueAutoSave(type, data);
    },
    [queueAutoSave]
  );

  const scheduleAutoSaveBatch = useCallback(
    (
      type: 'resisted' | 'cyclic' | 'nutrition',
      dataList: Array<Partial<ResistedStimulus> | Partial<CyclicStimulus> | Partial<NutritionWeekly>>
    ) => {
      dataList.forEach((item) => queueAutoSave(type, item));
    },
    [queueAutoSave]
  );

  const applyToMesocycleWeeks = <T extends { matrixId: string; mesocycleNumber: number; weekNumber: number }>(
    mesocycle: number,
    field: keyof T,
    value: any,
    dataMap: Map<number, Map<number, T>>,
    setMap: React.Dispatch<React.SetStateAction<Map<number, Map<number, T>>>>,
    type: 'resisted' | 'cyclic' | 'nutrition'
  ) => {
    if (!matrix) return;

    const newMap = new Map(dataMap);
    if (!newMap.has(mesocycle)) {
      newMap.set(mesocycle, new Map());
    }

    const mesoMap = newMap.get(mesocycle)!;
    const updates: T[] = [];

    for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
      const current = mesoMap.get(week) || {
        matrixId: matrix.id,
        mesocycleNumber: mesocycle,
        weekNumber: week,
      };

      const updated = { ...current, [field]: value } as T;
      mesoMap.set(week, updated);
      updates.push(updated);
    }

    setMap(newMap);
    scheduleAutoSaveBatch(type, updates);
  };

  const applyResistedToMesocycleWeeks = (
    mesocycle: number,
    field: keyof ResistedStimulus,
    value: any
  ) =>
    applyToMesocycleWeeks<ResistedStimulus>(
      mesocycle,
      field,
      value,
      resistedMap,
      setResistedMap,
      'resisted'
    );

  const applyCyclicToMesocycleWeeks = (
    mesocycle: number,
    field: keyof CyclicStimulus,
    value: any
  ) =>
    applyToMesocycleWeeks<CyclicStimulus>(
      mesocycle,
      field,
      value,
      cyclicMap,
      setCyclicMap,
      'cyclic'
    );

  const applyNutritionToMesocycleWeeks = (
    mesocycle: number,
    field: keyof NutritionWeekly,
    value: any
  ) =>
    applyToMesocycleWeeks<NutritionWeekly>(
      mesocycle,
      field,
      value,
      nutritionMap,
      setNutritionMap,
      'nutrition'
    );

  // Handlers de mudança
  const handleResistedChange = (
    mesocycle: number,
    week: number,
    field: keyof ResistedStimulus,
    value: any
  ) => {
    if (!matrix) return;

    const current = resistedMap.get(mesocycle)?.get(week) || {
      matrixId: matrix.id,
      mesocycleNumber: mesocycle,
      weekNumber: week,
    };

    const updated = { ...current, [field]: value };

    // Atualizar mapa local
    const newMap = new Map(resistedMap);
    if (!newMap.has(mesocycle)) {
      newMap.set(mesocycle, new Map());
    }
    newMap.get(mesocycle)!.set(week, updated as ResistedStimulus);
    setResistedMap(newMap);

    // Agendar auto-save
    scheduleAutoSave('resisted', updated);
  };

  const handleCyclicChange = (
    mesocycle: number,
    week: number,
    field: keyof CyclicStimulus,
    value: any
  ) => {
    if (!matrix) return;

    const current = cyclicMap.get(mesocycle)?.get(week) || {
      matrixId: matrix.id,
      mesocycleNumber: mesocycle,
      weekNumber: week,
    };

    const updated = { ...current, [field]: value };

    // Atualizar mapa local
    const newMap = new Map(cyclicMap);
    if (!newMap.has(mesocycle)) {
      newMap.set(mesocycle, new Map());
    }
    newMap.get(mesocycle)!.set(week, updated as CyclicStimulus);
    setCyclicMap(newMap);

    // Agendar auto-save
    scheduleAutoSave('cyclic', updated);
  };

  const handleNutritionChange = (
    mesocycle: number,
    week: number,
    field: keyof NutritionWeekly,
    value: any
  ) => {
    if (!matrix) return;

    const current = nutritionMap.get(mesocycle)?.get(week) || {
      matrixId: matrix.id,
      mesocycleNumber: mesocycle,
      weekNumber: week,
    };

    const updated = { ...current, [field]: value };

    // Atualizar mapa local
    const newMap = new Map(nutritionMap);
    if (!newMap.has(mesocycle)) {
      newMap.set(mesocycle, new Map());
    }
    newMap.get(mesocycle)!.set(week, updated as NutritionWeekly);
    setNutritionMap(newMap);

    // Agendar auto-save
    scheduleAutoSave('nutrition', updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!matrix) {
    return (
      <div className="text-center p-12">
        <p className="text-gray-600">Erro ao carregar matriz de periodização</p>
      </div>
    );
  }

  const totalWeeks = matrix.totalMesocycles * matrix.weeksPerMesocycle;
  const visibleMesocycleList = Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).filter(
    (mesocycle) => visibleMesocycles.has(mesocycle)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Periodização Macrociclo</h2>
          <p className="text-sm text-gray-600 mt-1">
            {matrix.totalMesocycles} mesociclos × {matrix.weeksPerMesocycle} semanas = {totalWeeks} semanas totais
          </p>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Salvando...</span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-gray-700">Exibir mesociclos</span>
          <div className="flex flex-wrap items-center gap-3">
            {Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).map((mesocycle) => (
              <label key={mesocycle} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={visibleMesocycles.has(mesocycle)}
                  onChange={() => {
                    setVisibleMesocycles((prev) => {
                      const next = new Set(prev);
                      if (next.has(mesocycle)) {
                        next.delete(mesocycle);
                      } else {
                        next.add(mesocycle);
                      }
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Meso {mesocycle}
              </label>
            ))}
          </div>
        </div>
      </div>
      {/* Matriz - Estímulo Resistido */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-blue-600 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">Estímulo Resistido</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 table-fixed" style={{ minWidth: '1200px' }}>
            <colgroup>
              <col style={{ width: '200px' }} />
              {visibleMesocycleList.map((mesocycle) => (
                <React.Fragment key={`resisted-colgroup-${mesocycle}`}>
                  <col style={{ width: '80px' }} />
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                    <col key={`resisted-colgroup-${mesocycle}-${week}`} style={{ width: '80px' }} />
                  ))}
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">
                  Parâmetro
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).map((mesocycle) => visibleMesocycles.has(mesocycle) && (
                  <th
                    key={mesocycle}
                    colSpan={matrix.weeksPerMesocycle + 1}
                    className="border border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-700"
                  >
                    Mesociclo {mesocycle}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
                  Semana
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-header-${mesocycle + 1}`}>
                    <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-orange-600 bg-orange-50">
                      REF
                    </th>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                      // Numeração contínua das semanas no plano
                      // Ex.: M1 S1-4, M2 S5-8, ...
                      <th
                        key={`${mesocycle + 1}-${week + 1}`}
                        className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-600"
                      >
                        S{mesocycle * matrix.weeksPerMesocycle + (week + 1)}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
                  Data
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-date-${mesocycle + 1}`}>
                    <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-orange-600 bg-orange-50">
                      -
                    </th>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                      <th
                        key={`${mesocycle + 1}-${week + 1}`}
                        className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-600"
                      >
                        {getWeekStartDate(mesocycle + 1, week + 1)}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Carga Microciclo */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Carga Microciclo
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'loadCycle', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    >
                      <option value="">-</option>
                      {loadCycleParams.map((param) => (
                        <option key={param.id} value={param.code}>
                          {param.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                        <select
                          value={data?.loadCycle || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'loadCycle', e.target.value || null)}
                          className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded"
                        >
                          <option value="">-</option>
                          {loadCycleParams.map((param) => (
                            <option key={param.id} value={param.code}>
                              {param.code}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Objetivo */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Objetivo
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-objetivo-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <select
                        onChange={(e) => {
                          const value = e.target.value || null;
                          // Aplicar a todas as semanas do mesociclo
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyResistedToMesocycleWeeks(mesocycle + 1, 'objective', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      >
                        <option value="">-</option>
                        {objectiveParams.map((param) => (
                          <option key={param.id} value={param.code}>
                            {param.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`objetivo-${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                          <select
                            value={data?.objective || ''}
                            onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'objective', e.target.value || null)}
                            className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded"
                          >
                            <option value="">-</option>
                            {objectiveParams.map((param) => (
                              <option key={param.id} value={param.code}>
                                {param.code}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Zona Rep */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Zona Rep.
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <input
                      type="number"
                      placeholder=""
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'repZone', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    />
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                        <input
                          type="number"
                          value={data?.repZone || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'repZone', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                          placeholder="-"
                        />
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* % Carga TR (calculado) */}
              <tr className="bg-blue-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-blue-50 z-10">
                  % Carga TR
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-blue-50">
                        <div className="text-center text-sm font-semibold text-blue-700">
                          {data?.loadPercentage ? `${data.loadPercentage}%` : '-'}
                        </div>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>


{/* Séries Grupo M. Inf. - REF editável, semanas calculadas */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Séries Grupo M. Inf.
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'seriesReference', value);
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateSeries(data?.loadCycle, data?.seriesReference);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {calculated !== null ? calculated : '-'}
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Rep Reserva (calculado) */}
              <tr className="bg-yellow-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-yellow-50 z-10">
                  Rep Reserva
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-yellow-50">
                        <div className="text-center text-sm font-semibold text-yellow-700">
                          {(() => {
                            const calculated = calculateRepReserve(data?.loadCycle);
                            if (calculated !== null) return calculated;
                            return data?.repReserve !== null && data?.repReserve !== undefined ? data.repReserve : '-';
                          })()}
                        </div>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Montagem */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Montagem
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'assembly', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    >
                      <option value="">-</option>
                      {assemblyParams.map((param) => (
                        <option key={param.id} value={param.code}>
                          {param.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                        <select
                          value={data?.assembly || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'assembly', e.target.value || null)}
                          className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded"
                        >
                          <option value="">-</option>
                          {assemblyParams.map((param) => (
                            <option key={param.id} value={param.code}>
                              {param.code}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Método */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Método
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'method', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    >
                      <option value="">-</option>
                      {methodParams.map((param) => (
                        <option key={param.id} value={param.code}>
                          {param.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                        <select
                          value={data?.method || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'method', e.target.value || null)}
                          className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded"
                        >
                          <option value="">-</option>
                          {methodParams.map((param) => (
                            <option key={param.id} value={param.code}>
                              {param.code}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Divisão do Treino */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Divisão do Treino
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'trainingDivision', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    >
                      <option value="">-</option>
                      {divisionParams.map((param) => (
                        <option key={param.id} value={param.code}>
                          {param.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                        <select
                          value={data?.trainingDivision || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'trainingDivision', e.target.value || null)}
                          className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded"
                        >
                          <option value="">-</option>
                          {divisionParams.map((param) => (
                            <option key={param.id} value={param.code}>
                              {param.code}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Freq. Semanal */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Freq. Semanal
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <input
                      type="number"
                      placeholder=""
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          applyResistedToMesocycleWeeks(mesocycle + 1, 'weeklyFrequency', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    />
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                        <input
                          type="number"
                          value={data?.weeklyFrequency || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'weeklyFrequency', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                          placeholder="-"
                        />
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Estímulo Cíclico */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-purple-600 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">Estímulo Cíclico</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 table-fixed" style={{ minWidth: '1200px' }}>
            <colgroup>
              <col style={{ width: '200px' }} />
              {visibleMesocycleList.map((mesocycle) => (
                <React.Fragment key={`cyclic-colgroup-${mesocycle}`}>
                  <col style={{ width: '80px' }} />
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                    <col key={`cyclic-colgroup-${mesocycle}-${week}`} style={{ width: '80px' }} />
                  ))}
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">
                  Parâmetro
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).map((mesocycle) => visibleMesocycles.has(mesocycle) && (
                  <th
                    key={mesocycle}
                    colSpan={matrix.weeksPerMesocycle + 1}
                    className="border border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-700"
                  >
                    Mesociclo {mesocycle}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
                  Semana
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-header-${mesocycle + 1}`}>
                    <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-orange-600 bg-orange-50">
                      REF
                    </th>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                      // Numeração contínua das semanas no plano
                      // Ex.: M1 S1-4, M2 S5-8, ...
                      <th
                        key={`${mesocycle + 1}-${week + 1}`}
                        className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-600"
                      >
                        S{mesocycle * matrix.weeksPerMesocycle + (week + 1)}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
                  Data
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-date-${mesocycle + 1}`}>
                    <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-orange-600 bg-orange-50">
                      -
                    </th>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                      <th
                        key={`${mesocycle + 1}-${week + 1}`}
                        className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-600"
                      >
                        {getWeekStartDate(mesocycle + 1, week + 1)}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Volume Total (min) */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Volume Total (min)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'totalVolumeMinutes', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                          <input
                            type="number"
                            value={data?.totalVolumeMinutes || ''}
                            onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'totalVolumeMinutes', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                            placeholder="-"
                          />
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Volume Total (km) */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Volume Total (km)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseFloat(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'totalVolumeKm', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2">
                          <input
                            type="number"
                            step="0.1"
                            value={data?.totalVolumeKm || ''}
                            onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'totalVolumeKm', e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-full px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                            placeholder="-"
                          />
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Qtd Z1 */}
              <tr className="bg-purple-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-purple-50 z-10">
                  % Z1
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'countZ1', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-purple-50">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={data?.countZ1 || ''}
                              onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'countZ1', e.target.value ? parseInt(e.target.value) : null)}
                              className="w-16 px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                              placeholder="-"
                              min="0"
                              max="100"
                            />
                            <span className="text-xs text-gray-600">%</span>
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Qtd Z2 */}
              <tr className="bg-purple-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-purple-50 z-10">
                  % Z2
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'countZ2', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-purple-50">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={data?.countZ2 || ''}
                              onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'countZ2', e.target.value ? parseInt(e.target.value) : null)}
                              className="w-16 px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                              placeholder="-"
                              min="0"
                              max="100"
                            />
                            <span className="text-xs text-gray-600">%</span>
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Qtd Z3 */}
              <tr className="bg-purple-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-purple-50 z-10">
                  % Z3
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'countZ3', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-purple-50">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={data?.countZ3 || ''}
                              onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'countZ3', e.target.value ? parseInt(e.target.value) : null)}
                              className="w-16 px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                              placeholder="-"
                              min="0"
                              max="100"
                            />
                            <span className="text-xs text-gray-600">%</span>
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Qtd Z4 */}
              <tr className="bg-purple-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-purple-50 z-10">
                  % Z4
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'countZ4', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-purple-50">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={data?.countZ4 || ''}
                              onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'countZ4', e.target.value ? parseInt(e.target.value) : null)}
                              className="w-16 px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                              placeholder="-"
                              min="0"
                              max="100"
                            />
                            <span className="text-xs text-gray-600">%</span>
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Qtd Z5 */}
              <tr className="bg-purple-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-purple-50 z-10">
                  % Z5
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            applyCyclicToMesocycleWeeks(mesocycle + 1, 'countZ5', value);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                      />
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-purple-50">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={data?.countZ5 || ''}
                              onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'countZ5', e.target.value ? parseInt(e.target.value) : null)}
                              className="w-16 px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                              placeholder="-"
                              min="0"
                              max="100"
                            />
                            <span className="text-xs text-gray-600">%</span>
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Z1 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z1 (min)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ1);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {calculated || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Z2 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z2 (min)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ2);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {calculated || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Z3 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z3 (min)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ3);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {calculated || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Z4 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z4 (min)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ4);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {calculated || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Z5 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z5 (min)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => visibleMesocycles.has(mesocycle + 1) && (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ5);
                      return (
                        <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {calculated || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>


      {/* Nutrição - Similar structure */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-green-600 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">Nutrição</h3>
        </div>
        <div className="p-4 text-center text-gray-600">
          {/* Quando houver inputs, use applyNutritionToMesocycleWeeks para replicação por mesociclo. */}
          <p>Seção de Nutrição (em desenvolvimento)</p>
        </div>
      </div>
    </div>
  );
}



