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
}

export function PeriodizationMatrixComponent({ planId }: PeriodizationMatrixProps) {
  const [matrix, setMatrix] = useState<PeriodizationMatrix | null>(null);
  const [parameters, setParameters] = useState<TrainingParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  // Agrupar dados
  const [resistedMap, setResistedMap] = useState<Map<number, Map<number, ResistedStimulus>>>(new Map());
  const [cyclicMap, setCyclicMap] = useState<Map<number, Map<number, CyclicStimulus>>>(new Map());
  const [nutritionMap, setNutritionMap] = useState<Map<number, Map<number, NutritionWeekly>>>(new Map());

  // Parâmetros por categoria
  const [loadCycleParams, setLoadCycleParams] = useState<TrainingParameter[]>([]);
  const [assemblyParams, setAssemblyParams] = useState<TrainingParameter[]>([]);
  const [methodParams, setMethodParams] = useState<TrainingParameter[]>([]);
  const [divisionParams, setDivisionParams] = useState<TrainingParameter[]>([]);

  // Carregar dados
  useEffect(() => {
    loadData();
  }, [planId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Carregar ou criar matriz
      let matrixData = await periodizationService.getMatrixByPlanId(planId);
      
      if (!matrixData) {
        // Criar matriz padrão (5 mesociclos, 4 semanas cada)
        matrixData = await periodizationService.createMatrix({
          planId,
          totalMesocycles: 5,
          weeksPerMesocycle: 4,
        });
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

        // Recarregar dados
        await loadData();
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
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">
                  Parâmetro
                </th>
                {Array.from({ length: matrix.totalMesocycles }, (_, i) => i + 1).map((mesocycle) => (
                  <th
                    key={mesocycle}
                    colSpan={matrix.weeksPerMesocycle + 1}
                    className="border border-gray-300 px-3 py-2 text-center text-sm font-semibold text-gray-700"
                  >
                    Mesociclo {mesocycle}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-600 sticky left-0 bg-gray-100 z-10">
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
            </thead>
            <tbody>
              {/* Carga Microciclo */}
              <tr>
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Carga Microciclo
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'loadCycle', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
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
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <select
                          value={data?.loadCycle || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'loadCycle', e.target.value || null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded"
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Zona Rep.
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <input
                      type="number"
                      placeholder="REF"
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'repZone', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    />
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <input
                          type="number"
                          value={data?.repZone || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'repZone', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-blue-50 z-10">
                  % Carga TR
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1 bg-blue-50">
                        <div className="text-center text-sm font-semibold text-blue-700">
                          {data?.loadPercentage ? `${data.loadPercentage}%` : '-'}
                        </div>
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* REF */}
              <tr>
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  REF
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <input
                      type="number"
                      placeholder="REF"
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        // Aplicar a todas as semanas do mesociclo
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'seriesReference', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    />
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <input
                          type="number"
                          value={data?.seriesReference || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'seriesReference', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
                          placeholder="-"
                        />
                      </td>
                    );
                  })}
                  </React.Fragment>
                ))}
              </tr>

              {/* Séries Grupo M. Inf. (calculado) */}
              <tr className="bg-green-50">
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-green-50 z-10">
                  Séries Grupo M. Inf.
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1 bg-green-50">
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-yellow-50 z-10">
                  Rep Reserva
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <div className="text-center text-sm text-gray-400">-</div>
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1 bg-yellow-50">
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Montagem
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'assembly', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
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
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <select
                          value={data?.assembly || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'assembly', e.target.value || null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded"
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Método
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'method', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
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
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <select
                          value={data?.method || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'method', e.target.value || null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded"
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Divisão do Treino
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <select
                      onChange={(e) => {
                        const value = e.target.value || null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'trainingDivision', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
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
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <select
                          value={data?.trainingDivision || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'trainingDivision', e.target.value || null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded"
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
                <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                  Freq. Semanal
                </td>
                {Array.from({ length: matrix.totalMesocycles }, (_, mesocycle) => (
                  <React.Fragment key={`meso-${mesocycle + 1}`}>
                    <td className="border border-gray-300 p-1 bg-orange-50">
                    <input
                      type="number"
                      placeholder="REF"
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null;
                        for (let week = 1; week <= matrix.weeksPerMesocycle; week++) {
                          handleResistedChange(mesocycle + 1, week, 'weeklyFrequency', value);
                        }
                      }}
                      className="w-full px-2 py-1 text-sm text-center border-0 focus:ring-2 focus:ring-orange-500 rounded bg-transparent font-medium"
                    />
                  </td>
                  {Array.from({ length: matrix.weeksPerMesocycle }, (_, week) => {
                    const data = resistedMap.get(mesocycle + 1)?.get(week + 1);
                    return (
                      <td key={`${mesocycle + 1}-${week + 1}`} className="border border-gray-300 p-1">
                        <input
                          type="number"
                          value={data?.weeklyFrequency || ''}
                          onChange={(e) => handleResistedChange(mesocycle + 1, week + 1, 'weeklyFrequency', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-2 py-1 text-sm border-0 focus:ring-2 focus:ring-blue-500 rounded text-center"
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

      {/* Estímulo Cíclico - Similar structure */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-purple-600 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">Estímulo Cíclico</h3>
        </div>
        <div className="p-4 text-center text-gray-600">
          <p>Seção de Estímulo Cíclico (em desenvolvimento)</p>
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
