import React, { useState, useEffect, useCallback } from 'react';
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
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  // Agrupar dados
  const [resistedMap, setResistedMap] = useState<Map<number, Map<number, ResistedStimulus>>>(new Map());
  const [cyclicMap, setCyclicMap] = useState<Map<number, Map<number, CyclicStimulus>>>(new Map());
  const [nutritionMap, setNutritionMap] = useState<Map<number, Map<number, NutritionWeekly>>>(new Map());

  // Função para verificar se a matriz tem dados lançados
  const hasMatrixData = (matrixData: PeriodizationMatrix): boolean => {
    // Verificar se há dados em resistedStimulus
    const hasResisted = matrixData.resistedStimulus?.some(item => 
      item.loadCycle || item.repZone || item.assembly || 
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    
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
    const start = new Date(startDate);
    // Calcular quantas semanas desde o início
    const totalWeeks = (mesocycleNumber - 1) * matrix!.weeksPerMesocycle + (weekNumber - 1);
    // Adicionar semanas
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + (totalWeeks * 7));
    
    // Formatar como dd/mm
    const day = String(weekStart.getDate()).padStart(2, '0');
    const month = String(weekStart.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  // Função para calcular minutos por zona
  // Fórmula: =IFS(percentZ="", "", percentZ="X", "X", TRUE, volumeTotal * (percentZ / 100))
  const calculateZoneMinutes = (volumeTotal: number | null | undefined, percentZ: number | null | undefined): string => {
    if (!percentZ && percentZ !== 0) return ''; // Se percentZ vazio
    if (percentZ === -1) return 'X'; // Usamos -1 para representar "X"
    if (!volumeTotal) return ''; // Se volumeTotal vazio
    
    const minutes = volumeTotal * (percentZ / 100);
    return Math.round(minutes).toString();
  };

  // Parâmetros por categoria
  const [loadCycleParams, setLoadCycleParams] = useState<TrainingParameter[]>([]);
  const [assemblyParams, setAssemblyParams] = useState<TrainingParameter[]>([]);
  const [methodParams, setMethodParams] = useState<TrainingParameter[]>([]);
  const [divisionParams, setDivisionParams] = useState<TrainingParameter[]>([]);

  // Carregar dados
  useEffect(() => {
    loadData();
  }, [planId, startDate, endDate]); // Recarregar quando datas mudarem

  const loadData = async () => {
    try {
      setLoading(true);

      // Carregar ou criar matriz
      let matrixData = await periodizationService.getMatrixByPlanId(planId);
      const expectedMesocycles = calculateTotalMesocycles();
      
      if (!matrixData) {
        // Criar matriz dinâmica baseada no período do plano
        matrixData = await periodizationService.createMatrix({
          planId,
          totalMesocycles: expectedMesocycles,
          weeksPerMesocycle: 4,
        });
      } else if (matrixData.totalMesocycles !== expectedMesocycles) {
        // Período do plano foi alterado
        const hasData = hasMatrixData(matrixData);
        
        if (!hasData) {
          // Não há dados lançados, pode recriar
          console.log('Período alterado e sem dados. Recriando matriz...');
          await periodizationService.deleteMatrix(matrixData.id);
          matrixData = await periodizationService.createMatrix({
            planId,
            totalMesocycles: expectedMesocycles,
            weeksPerMesocycle: 4,
          });
        } else {
          // Há dados lançados, manter matriz atual
          console.log('Período alterado mas há dados. Mantendo matriz atual.');
        }
      }

      setMatrix(matrixData);

      // Agrupar dados
      setResistedMap(periodizationService.groupResistedByMesocycleAndWeek(matrixData.resistedStimulus || []));
      setCyclicMap(periodizationService.groupCyclicByMesocycleAndWeek(matrixData.cyclicStimulus || []));
      setNutritionMap(periodizationService.groupNutritionByMesocycleAndWeek(matrixData.nutrition || []));

      // Carregar parâmetros
      const allParams = await periodizationService.getAllParameters();
      setParameters(allParams);

      // Filtrar por categoria
      setLoadCycleParams(allParams.filter(p => p.category === 'carga_microciclo'));
      setAssemblyParams(allParams.filter(p => p.category === 'montagem'));
      setMethodParams(allParams.filter(p => p.category === 'metodo'));
      setDivisionParams(allParams.filter(p => p.category === 'divisao_treino'));

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-save com debounce
  const scheduleAutoSave = useCallback((
    type: 'resisted' | 'cyclic' | 'nutrition',
    data: Partial<ResistedStimulus> | Partial<CyclicStimulus> | Partial<NutritionWeekly>
  ) => {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        setSaving(true);
        
        if (type === 'resisted') {
          await periodizationService.upsertResistedStimulus(data as Partial<ResistedStimulus>);
        } else if (type === 'cyclic') {
          await periodizationService.upsertCyclicStimulus(data as Partial<CyclicStimulus>);
        } else if (type === 'nutrition') {
          await periodizationService.upsertNutrition(data as Partial<NutritionWeekly>);
        }

        // Não recarregar dados para manter foco e posição da tela
        // await loadData();
      } catch (error) {
        console.error('Erro ao salvar:', error);
      } finally {
        setSaving(false);
      }
    }, 2000); // 2 segundos de debounce

    setAutoSaveTimeout(timeout);
  }, [autoSaveTimeout]);

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

      {/* Matriz - Estímulo Resistido */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-blue-600 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">Estímulo Resistido</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: '1800px' }}>
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">
                  Parâmetro
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).map((mesocycle) => (
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-header-${mesocycle + 1}`}>
                    <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-orange-600 bg-orange-50">
                      REF
                    </th>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                      <th
                        key={`${mesocycle + 1}-${week + 1}`}
                        className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-600"
                      >
                        S{week + 1}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
                  Data
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'loadCycle', value);
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

              {/* Zona Rep */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Zona Rep.
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <input
                      type="number"
                      placeholder=""
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'repZone', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
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


              {/* Séries Grupo M. Inf. (calculado) */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Séries Grupo M. Inf.
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-green-50">
                        <div className="text-center text-sm font-semibold text-green-700">
                          {data?.seriesLowerBody || '-'}
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-2 bg-yellow-50">
                        <div className="text-center text-sm font-semibold text-yellow-700">
                          {data?.repReserve !== null && data?.repReserve !== undefined ? data.repReserve : '-'}
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'assembly', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'method', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'trainingDivision', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                    <input
                      type="number"
                      placeholder=""
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'weeklyFrequency', value);
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
          <table className="w-full border-collapse" style={{ minWidth: '1800px' }}>
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">
                  Parâmetro
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).map((mesocycle) => (
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-header-${mesocycle + 1}`}>
                    <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-orange-600 bg-orange-50">
                      REF
                    </th>
                    {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => (
                      <th
                        key={`${mesocycle + 1}-${week + 1}`}
                        className="border border-gray-300 px-2 py-1 text-center text-xs font-medium text-gray-600"
                      >
                        S{week + 1}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
                  Data
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'totalVolumeMinutes', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseFloat(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'totalVolumeKm', value);
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

              {/* Volume Corrida (km) */}
              <tr>
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Volume Corrida (km)
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseFloat(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'runningVolumeKm', value);
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
                            value={data?.runningVolumeKm || ''}
                            onChange={(e) => handleCyclicChange(mesocycle + 1, week + 1, 'runningVolumeKm', e.target.value ? parseFloat(e.target.value) : null)}
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'countZ1', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'countZ2', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'countZ3', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'countZ4', value);
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
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <input
                        type="number"
                        placeholder=""
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                            handleCyclicChange(mesocycle + 1, week, 'countZ5', value);
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
                {{Array.from({{ length: matrix.totalMesocycles }}, (_, mesocycle) => (
                  <React.Fragment key={{`meso-${{mesocycle + 1}}`}}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {{Array.from({{ length: matrix.weeksPerMesocycle }}, (_, week) => {{
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ1);
                      return (
                        <td key={{`${{mesocycle + 1}}-${{week + 1}}`}} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {{calculated || '-'}}
                          </div>
                        </td>
                      );
                    }})}}
                  </React.Fragment>
                ))}}
              </tr>

              {/* Z2 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z2 (min)
                </td>
                {{Array.from({{ length: matrix.totalMesocycles }}, (_, mesocycle) => (
                  <React.Fragment key={{`meso-${{mesocycle + 1}}`}}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {{Array.from({{ length: matrix.weeksPerMesocycle }}, (_, week) => {{
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ2);
                      return (
                        <td key={{`${{mesocycle + 1}}-${{week + 1}}`}} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {{calculated || '-'}}
                          </div>
                        </td>
                      );
                    }})}}
                  </React.Fragment>
                ))}}
              </tr>

              {/* Z3 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z3 (min)
                </td>
                {{Array.from({{ length: matrix.totalMesocycles }}, (_, mesocycle) => (
                  <React.Fragment key={{`meso-${{mesocycle + 1}}`}}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {{Array.from({{ length: matrix.weeksPerMesocycle }}, (_, week) => {{
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ3);
                      return (
                        <td key={{`${{mesocycle + 1}}-${{week + 1}}`}} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {{calculated || '-'}}
                          </div>
                        </td>
                      );
                    }})}}
                  </React.Fragment>
                ))}}
              </tr>

              {/* Z4 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z4 (min)
                </td>
                {{Array.from({{ length: matrix.totalMesocycles }}, (_, mesocycle) => (
                  <React.Fragment key={{`meso-${{mesocycle + 1}}`}}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {{Array.from({{ length: matrix.weeksPerMesocycle }}, (_, week) => {{
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ4);
                      return (
                        <td key={{`${{mesocycle + 1}}-${{week + 1}}`}} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {{calculated || '-'}}
                          </div>
                        </td>
                      );
                    }})}}
                  </React.Fragment>
                ))}}
              </tr>

              {/* Z5 (min) - CALCULADO */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Z5 (min)
                </td>
                {{Array.from({{ length: matrix.totalMesocycles }}, (_, mesocycle) => (
                  <React.Fragment key={{`meso-${{mesocycle + 1}}`}}>
                    <td className="border border-gray-300 p-2 bg-orange-50">
                      <div className="text-center text-sm text-gray-400">-</div>
                    </td>
                    {{Array.from({{ length: matrix.weeksPerMesocycle }}, (_, week) => {{
                      const data = cyclicMap.get(mesocycle + 1)?.get(week + 1);
                      const calculated = calculateZoneMinutes(data?.totalVolumeMinutes, data?.countZ5);
                      return (
                        <td key={{`${{mesocycle + 1}}-${{week + 1}}`}} className="border border-gray-300 p-2 bg-green-50">
                          <div className="text-center text-sm font-semibold text-green-700">
                            {{calculated || '-'}}
                          </div>
                        </td>
                      );
                    }})}}
                  </React.Fragment>
                ))}}
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
          <p>Seção de Nutrição (em desenvolvimento)</p>
        </div>
      </div>
    </div>
  );
}
