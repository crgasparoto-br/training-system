import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Copy } from 'lucide-react';
import WorkoutBuilderCyclic from './WorkoutBuilderCyclic';
import WorkoutBuilderResistance from './WorkoutBuilderResistance';
import WeeklySummaryGeneral from './WeeklySummaryGeneral';

export default function WorkoutBuilder2() {
  const { planId, mesocycleNumber, weekNumber } = useParams();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'cyclic' | 'resistance'>('cyclic');
  const [templateData, setTemplateData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Auto-save timer
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadTemplate();
  }, [planId, mesocycleNumber, weekNumber]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      // TODO: Implementar chamada à API
      // const response = await workoutService.getOrCreateTemplate(planId, mesocycleNumber, weekNumber);
      // setTemplateData(response);
      
      // Mock temporário
      setTemplateData({
        id: '1',
        mesocycleNumber: parseInt(mesocycleNumber || '1'),
        weekNumber: parseInt(weekNumber || '1'),
        cyclicFrequency: 4,
        resistanceFrequency: 2,
        totalVolumeMin: 284,
        totalVolumeKm: 0,
        workoutDays: []
      });
    } catch (error) {
      console.error('Erro ao carregar template:', error);
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
                  Meso {mesocycleNumber} - Semana {weekNumber}
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

        {/* Tabs */}
        <div className="px-6">
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
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {/* Resumo Geral */}
        <WeeklySummaryGeneral templateData={templateData} />

        {/* Tab Content */}
        <div className="mt-6">
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
  );
}
