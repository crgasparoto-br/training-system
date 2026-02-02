import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Copy } from 'lucide-react';
import WorkoutBuilderCyclic from './WorkoutBuilderCyclic';
import WorkoutBuilderResistance from './WorkoutBuilderResistance';
import { planService } from '../../services/plan.service';

export default function WorkoutBuilder2() {
  const { planId, mesocycleNumber: mesoParam, weekNumber: weekParam } = useParams();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'cyclic' | 'resistance'>('cyclic');
  const [templateData, setTemplateData] = useState<any>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Parâmetros únicos compartilhados
  const [mesocycleNumber, setMesocycleNumber] = useState(parseInt(mesoParam || '1'));
  const [weekNumber, setWeekNumber] = useState(parseInt(weekParam || '1'));

  // Auto-save timer
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadTemplate();
  }, [planId, mesocycleNumber, weekNumber]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      
      // Carregar dados do plano
      if (planId) {
        const plan = await planService.getById(planId);
        setPlanData(plan);
        
        // TODO: Carregar dados da periodização
        // TODO: Implementar chamada à API de workout
        // const response = await workoutService.getOrCreateTemplate(planId, mesocycleNumber, weekNumber);
        // setTemplateData(response);
        
        // Mock temporário
        setTemplateData({
          id: '1',
          planId,
          athleteId: plan.athlete.id,
          mesocycleNumber,
          weekNumber,
          cyclicFrequency: 4,
          resistanceFrequency: 6,
          totalVolumeMin: 284,
          totalVolumeKm: 0,
          workoutDays: []
        });
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
      // TODO: Implementar chamada à API
      // await workoutService.updateTemplate(data);
      console.log('Salvando...', data);
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

  // Calcular tempo de sessão por dia (mock)
  const sessionTimes = {
    seg: 74,
    ter: 52,
    qua: 14,
    qui: 50,
    sex: 84,
    sab: 14,
    dom: 0
  };

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
          <div className="flex items-center justify-between">
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
                onClick={() => handleSave()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Salvar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {/* Parâmetros Únicos: Meso e Semana (Micro) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Parâmetros do Treino
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mesociclo (Meso)
              </label>
              <input
                type="number"
                value={mesocycleNumber}
                onChange={(e) => setMesocycleNumber(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Semana (Microciclo)
              </label>
              <input
                type="number"
                value={weekNumber}
                onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Resumo Geral da Semana */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Resumo da Semana
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Frequências */}
            <div>
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
            <div>
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

            {/* Tempo de Sessão por Dia */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Tempo sessão total</h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                        <th
                          key={day}
                          className="px-2 py-2 text-xs font-medium text-gray-700 text-center"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.seg}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.ter}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.qua}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.qui}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.sex}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.sab}</td>
                      <td className="px-2 py-2 text-xs text-center text-gray-900">{sessionTimes.dom}</td>
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
                onChange={handleDataChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
