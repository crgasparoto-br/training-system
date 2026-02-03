import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, CheckCircle, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import WorkoutBuilderCyclic from './WorkoutBuilderCyclic';
import WorkoutBuilderResistance from './WorkoutBuilderResistance';
import { planService } from '../../services/plan.service';
import { periodizationService, ResistedStimulus } from '../../services/periodization.service';
import { workoutService } from '../../services/workout.service';

export default function WorkoutBuilder2() {
  const { planId, mesocycleNumber: mesoParam, weekNumber: weekParam } = useParams();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'cyclic' | 'resistance'>('cyclic');
  const [templateData, setTemplateData] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [resistedSummary, setResistedSummary] = useState<ResistedStimulus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Parâmetros únicos compartilhados
  const [mesocycleNumber, setMesocycleNumber] = useState(parseInt(mesoParam || '1'));
  const [weekNumber, setWeekNumber] = useState(parseInt(weekParam || '1'));

  const mesoOptions = Array.from(
    { length: planData?.stats?.totalMesocycles || 12 },
    (_, index) => index + 1
  );
  const weekOptions = Array.from({ length: 4 }, (_, index) => index + 1);
  const storageKey = useMemo(() => {
    if (!planId) return null;
    return `workoutBuilder2:${planId}:${mesocycleNumber}:${weekNumber}`;
  }, [planId, mesocycleNumber, weekNumber]);

  // Auto-save timer
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadTemplate();
  }, [planId, mesocycleNumber, weekNumber]);

  useEffect(() => {
    if (!storageKey || !templateData) return;
    if (templateData.mesocycleNumber !== mesocycleNumber || templateData.weekNumber !== weekNumber) {
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(templateData));
  }, [storageKey, templateData, mesocycleNumber, weekNumber]);

  useEffect(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      setAutoSaveTimer(null);
    }
  }, [mesocycleNumber, weekNumber]);

  useEffect(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      setAutoSaveTimer(null);
    }
  }, [mesocycleNumber, weekNumber]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      setTemplateData(null);
      
      // Carregar dados do plano
      if (planId) {
        const plan = await planService.getById(planId);
        setPlanData(plan);

        const matrix = await periodizationService.getMatrixByPlanId(planId);
        if (matrix) {
          const resistedStimuli = await periodizationService.getResistedStimulusByMatrix(matrix.id);
          const groupedResisted = periodizationService.groupResistedByMesocycleAndWeek(resistedStimuli);
          setResistedSummary(groupedResisted.get(mesocycleNumber)?.get(weekNumber) || null);
        } else {
          setResistedSummary(null);
        }
        
        // TODO: Carregar dados da periodização via API
        // const periodization = await periodizationService.getCyclicStimulus(planId, mesocycleNumber, weekNumber);
        
        // Mock temporário - simular dados da periodização
        const mockPeriodization = {
          totalVolumeMinutes: 284,
          totalVolumeKm: 0,
          minutesZ1: 71,  // 25% de 284
          minutesZ2: 114, // 40% de 284
          minutesZ3: 57,  // 20% de 284
          minutesZ4: 28,  // 10% de 284
          minutesZ5: 14   // 5% de 284
        };
        
        // Calcular distribuição percentual
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

        const weekStartDate = (() => {
          const start = new Date(plan.startDate);
          const weekIndex = (mesocycleNumber - 1) * weeksPerMesocycle + (weekNumber - 1);
          const date = new Date(start);
          date.setDate(start.getDate() + weekIndex * 7);
          return date.toISOString();
        })();

        const templateFromApi = await workoutService.getOrCreateTemplate({
          planId,
          mesocycleNumber,
          weekNumber,
          weekStartDate
        });

        const mergedTemplate = {
          ...templateFromApi,
          athleteId: plan.athleteId,
          totalVolumeMin: mockPeriodization.totalVolumeMinutes,
          totalVolumeKm: mockPeriodization.totalVolumeKm,
          distributionZ1,
          distributionZ2,
          distributionZ3,
          distributionZ4,
          distributionZ5,
          weekStartDate: templateFromApi.weekStartDate || weekStartDate,
          mesocycleNumber,
          weekNumber,
        };

        const cachedKey = storageKey;
        if (cachedKey) {
          const cached = localStorage.getItem(cachedKey);
          if (cached) {
            try {
              const cachedData = JSON.parse(cached);
              setTemplateData({
                ...mergedTemplate,
                ...cachedData,
                id: templateFromApi.id,
                weekStartDate: mergedTemplate.weekStartDate,
                mesocycleNumber,
                weekNumber,
                planId
              });
            } catch (error) {
              setTemplateData(mergedTemplate);
            }
          } else {
            setTemplateData(mergedTemplate);
          }
        } else {
          setTemplateData(mergedTemplate);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      alert('Erro ao carregar dados do plano');
      navigate('/plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = (newData: any) => {
    setTemplateData(newData);
    const resolvedPlanId = newData?.planId ?? planId;
    const resolvedMesocycle = newData?.mesocycleNumber ?? mesocycleNumber;
    const resolvedWeek = newData?.weekNumber ?? weekNumber;
    const key = resolvedPlanId
      ? `workoutBuilder2:${resolvedPlanId}:${resolvedMesocycle}:${resolvedWeek}`
      : null;

    if (key) {
      localStorage.setItem(key, JSON.stringify(newData));
    }
    
    // Auto-save após 2 segundos de inatividade
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    
    const timer = setTimeout(() => {
      handleSave(newData);
    }, 2000);
    
    setAutoSaveTimer(timer);
  };

  const handleSave = async (data: any = templateData) => {
    try {
      setSaving(true);
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
          studentGoal: data.studentGoal,
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
                ? new Date(new Date(weekStart).setDate(weekStart.getDate() + (day.dayOfWeek - 1)))
                : new Date();

            const savedDay = await workoutService.getOrCreateDay({
              templateId: data.id,
              dayOfWeek: day.dayOfWeek,
              workoutDate: workoutDate.toISOString(),
            });

            await workoutService.updateDay(savedDay.id, {
              sessionDurationMin: day.sessionDurationMin,
              stimulusDurationMin: day.stimulusDurationMin,
              location: day.location,
              method: day.method,
              intensity1: day.intensity1,
              intensity2: day.intensity2,
              numSessions: day.numSessions,
              numSets: day.numSets,
              sessionTime: day.sessionTime,
              restTime: day.restTime,
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
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWeek = async () => {
    // TODO: Implementar funcionalidade de copiar semana
    alert('Funcionalidade de copiar semana será implementada');
  };

  const handleRelease = async () => {
    try {
      setSaving(true);
      // TODO: Implementar chamada à API
      // await workoutService.releaseTemplate(templateData.id);
      
      // Atualizar estado local
      setTemplateData({
        ...templateData,
        released: true,
        releasedAt: new Date().toISOString()
      });
      
      alert('Treino liberado com sucesso! O atleta já pode visualizá-lo.');
    } catch (error) {
      console.error('Erro ao liberar treino:', error);
      alert('Erro ao liberar treino');
    } finally {
      setSaving(false);
    }
  };

  // Calcular tempo de sessão por dia (mock)
  const cyclicTimes = {
    seg: 50,
    ter: 40,
    qua: 10,
    qui: 35,
    sex: 60,
    sab: 10,
    dom: 0
  };
  const resistanceTimes = {
    seg: 24,
    ter: 12,
    qua: 4,
    qui: 15,
    sex: 24,
    sab: 4,
    dom: 0
  };
  const sessionTimes = {
    seg: 74,
    ter: 52,
    qua: 14,
    qui: 50,
    sex: 84,
    sab: 14,
    dom: 0
  };

  const sumTimes = (times: typeof sessionTimes) =>
    Object.values(times).reduce((acc, value) => acc + value, 0);

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
                  {planData ? `${planData.name} - ${planData.athlete.user.profile.name}` : 'Carregando...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Indicador de Status */}
              {templateData && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" 
                     style={{ 
                       backgroundColor: templateData.released ? '#f0fdf4' : '#fef2f2',
                       borderColor: templateData.released ? '#86efac' : '#fecaca'
                     }}>
                  {templateData.released ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Liberado</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700">Não Liberado</span>
                    </>
                  )}
                </div>
              )}
              
              {saving && (
                <span className="text-sm text-gray-500">Salvando...</span>
              )}
              
              <button
                onClick={() => handleCopyWeek()}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copiar Semana
              </button>

              <button
                onClick={() => handleRelease()}
                disabled={saving || templateData?.released}
                className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={templateData?.released ? 'Treino já está liberado' : 'Liberar treino para o atleta'}
              >
                <CheckCircle className="w-4 h-4" />
                Liberar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {/* Parâmetros Únicos: Meso e Semana (Micro) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 max-w-[1800px]">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Parâmetros do Treino
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMesocycleNumber((prev) => Math.max(1, prev - 1))}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Mesociclo Anterior
              </button>
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                Mesociclo
                <select
                  value={mesocycleNumber}
                  onChange={(e) => setMesocycleNumber(parseInt(e.target.value) || 1)}
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
                onClick={() => setMesocycleNumber((prev) => prev + 1)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Próximo Mesociclo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setWeekNumber((prev) => Math.max(1, prev - 1))}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Microciclo Anterior
              </button>
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                Microciclo
                <select
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {weekOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setWeekNumber((prev) => prev + 1)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Próximo Microciclo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Resumo Geral da Semana */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 max-w-[1800px]">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Resumo da Semana
          </h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Frequências */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Frequências</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Frequência Total:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {(templateData.cyclicFrequency || 0) + (templateData.resistanceFrequency || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Frequência Cíclico:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {templateData.cyclicFrequency || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Frequência Resistido:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {templateData.resistanceFrequency || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Volumes */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Volumes</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Volume Total:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {templateData.totalVolumeMin || 0} min
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Volume Km:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {templateData.totalVolumeKm || 0} km
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tempo de Sessão por Dia */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Tempo Sessão Total</h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-xs font-medium text-gray-700 text-left">
                        Treinamentos
                      </th>
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                        <th key={day} className="px-2 py-2 text-xs font-medium text-gray-700 text-center">
                          {day}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-xs font-medium text-gray-700 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-2 py-2 text-xs font-medium text-gray-700">Cíclico</td>
                      {Object.values(cyclicTimes).map((value, idx) => (
                        <td key={idx} className="px-2 py-2 text-xs text-gray-700 text-center">
                          {value}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-xs text-gray-700 text-center font-semibold">
                        {sumTimes(cyclicTimes)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-2 text-xs font-medium text-gray-700">Resistido</td>
                      {Object.values(resistanceTimes).map((value, idx) => (
                        <td key={idx} className="px-2 py-2 text-xs text-gray-700 text-center">
                          {value}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-xs text-gray-700 text-center font-semibold">
                        {sumTimes(resistanceTimes)}
                      </td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-2 py-2 text-xs font-medium text-gray-700">Tempo da Sessão</td>
                      {Object.values(sessionTimes).map((value, idx) => (
                        <td key={idx} className="px-2 py-2 text-xs text-gray-700 text-center font-semibold">
                          {value}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-xs text-gray-700 text-center font-semibold">
                        {sumTimes(sessionTimes)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
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
                📊 Treinamento Cíclico
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
                💪 Treinamento Resistido
                {activeTab === 'resistance' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                )}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'cyclic' ? (
              <WorkoutBuilderCyclic
                templateData={templateData}
                onChange={handleDataChange}
              />
            ) : (
              <WorkoutBuilderResistance
                templateData={templateData}
                resistedSummary={resistedSummary}
                onChange={handleDataChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
